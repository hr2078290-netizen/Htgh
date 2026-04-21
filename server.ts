import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { initializeApp as initializeClientApp } from "firebase/app";
import { initializeFirestore, doc as docClient, getDoc as getDocClient, setDoc as setDocClient, updateDoc as updateDocClient, collection as collectionClient, query as queryClient, orderBy as orderByClient, limit as limitClient, getDocs as getDocsClient, Timestamp as TimestampClient, serverTimestamp as serverTimestampClient } from "firebase/firestore";
import { getAuth as getAuthClient, signInAnonymously } from "firebase/auth";
import fs from "fs";

// ESM __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Firebase Config
const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
const firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));

// Initialize Firebase Client (We will use this with an auth session for guaranteed access)
const firebaseApp = initializeClientApp(firebaseConfig);
const dbClient = initializeFirestore(firebaseApp, {
  experimentalForceLongPolling: true
}, firebaseConfig.firestoreDatabaseId || undefined);
const authClient = getAuthClient(firebaseApp);

async function startServer() {
  const app = express();
  const PORT = 3000;

  console.log(`Starting server with Client-SDK (Long Polling) - DB: ${firebaseConfig.firestoreDatabaseId || "(default)"}`);

  // Note: Anonymous Auth is disabled in this project, so we'll rely on permissive rules 
  // for the server-side writes for now. 
  
  // Force Initialize Config on Startup (Non-blocking)
  const forceInit = async () => {
    try {
      console.log("[SERVER] Loading initial config from Firestore...");
      // We don't do the health check write anymore to save quota.
      
      const configRef = docClient(dbClient, 'settings', 'config');
      const snap = await getDocClient(configRef);
      if (!snap.exists()) {
        console.log("FORCE START: Config document missing. Creating initial state...");
        // We TRY to create it, but if it fails (quota), we just use defaults.
        setDocClient(configRef, {
          status: 'waiting',
          nextCrashValue: 1.5,
          currentRound: 1,
          countdownEndTime: Date.now() + 5000
        }).catch(e => console.error("Initial config creation failed (likely quota):", e.message));
      } else {
        const data = snap.data();
        console.log("Config document found. Current state:", data?.status);
        
        // Sync memory with persisted state
        gameStateMemory.nextCrashValue = data.nextCrashValue || 1.5;
        gameStateMemory.currentRound = data.currentRound || 1;
        gameStateMemory.isManualMode = !!data.isManualMode;
        gameStateMemory.status = data.status || 'waiting';

        // If stuck in crashed or flying without timestamp, force reset
        if ((data?.status === 'crashed' && !data?.nextTransitionTime) || (data?.status === 'flying' && !data?.startTime)) {
          console.log("Detected stuck state on startup. Resetting memory...");
          gameStateMemory.status = 'waiting';
          gameStateMemory.countdownEndTime = Date.now() + 5000;
        }
      }
      // Load history (Non-blocking)
      getDocsClient(queryClient(collectionClient(dbClient, 'history'), orderByClient('timestamp', 'desc'), limitClient(15)))
        .then(histSnap => {
          gameStateMemory.history = histSnap.docs.map(d => d.data());
          console.log(`[SERVER] Loaded ${gameStateMemory.history.length} history items.`);
        })
        .catch(e => console.error("History load failed (likely quota):", e.message));

    } catch (e: any) {
      console.error("Non-critical Startup Init Error (Client):", e.message || e);
    }
  };
  // Start init but don't await it, allowing server to listen on PORT 3000 immediately
  forceInit();

  // --- SERVER AUTHORITATIVE GAME STATE (IN-MEMORY) ---
  // This solves the Firestore "RESOURCE_EXHAUSTED" error by not writing state every round.
  const gameStateMemory = {
    status: 'waiting' as 'waiting' | 'flying' | 'crashed',
    currentRound: 1,
    multiplier: 1.0,
    startTime: 0,
    countdownEndTime: 0,
    nextTransitionTime: 0,
    lastFinalValue: 0,
    nextCrashValue: 1.5,
    isManualMode: false,
    manualOverrideNextValue: null as number | null,
    history: [] as any[],
    activeBets: [] as any[],
    queuedBets: [] as any[]
  };

  app.use(express.json());

  // SSE Clients
  let clients: any[] = [];
  let fakeUserIdCounter = 251500;

  const broadcastState = () => {
    const data = JSON.stringify({
      ...gameStateMemory,
      serverTime: Date.now()
    });
    clients.forEach(client => client.res.write(`data: ${data}\n\n`));
  };

  // SSE Endpoint
  app.get("/api/game/stream", (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const clientId = Date.now();
    const newClient = { id: clientId, res };
    clients.push(newClient);

    const keepAlive = setInterval(() => {
      res.write(': keep-alive\n\n');
    }, 10000); // 10s heartbeat for better proxy stability

    req.on('close', () => {
      clearInterval(keepAlive);
      clients = clients.filter(c => c.id !== clientId);
    });

    // Send initial payload
    res.write(`data: ${JSON.stringify({ ...gameStateMemory, serverTime: Date.now() })}\n\n`);
  });

  // REST Fallback for Game State
  app.get("/api/game/state", (req, res) => {
    res.json({
      ...gameStateMemory,
      serverTime: Date.now()
    });
  });

  // Game Loop (In-Memory)
  setInterval(() => {
    const now = Date.now();

    if (gameStateMemory.status === 'crashed') {
      if (now >= gameStateMemory.nextTransitionTime) {
        gameStateMemory.status = 'waiting';
        gameStateMemory.multiplier = 1.0;
        gameStateMemory.currentRound++;
        gameStateMemory.countdownEndTime = now + 6000; // Shorter waiting time (6s) like real Aviator
        gameStateMemory.activeBets = [...gameStateMemory.queuedBets];
        gameStateMemory.queuedBets = [];
        broadcastState();
      }
    } else if (gameStateMemory.status === 'waiting') {
      if (now >= gameStateMemory.countdownEndTime) {
        gameStateMemory.status = 'flying';
        gameStateMemory.startTime = now;
        broadcastState();
      }
    } else if (gameStateMemory.status === 'flying') {
      const elapsed = (now - gameStateMemory.startTime) / 1000;
      gameStateMemory.multiplier = Math.exp(0.15 * elapsed);

      if (gameStateMemory.multiplier >= gameStateMemory.nextCrashValue) {
        // CRASH!
        gameStateMemory.status = 'crashed';
        gameStateMemory.lastFinalValue = gameStateMemory.nextCrashValue;
        gameStateMemory.nextTransitionTime = now + 3000;
        
        // Add to history (limit 15)
        const histItem = { value: gameStateMemory.lastFinalValue, timestamp: TimestampClient.now(), round: gameStateMemory.currentRound };
        gameStateMemory.history = [histItem, ...gameStateMemory.history].slice(0, 15);

        // PERSIST CRASH TO FIRESTORE (Only once per round to save quota)
        const roundId = `round_${gameStateMemory.currentRound}`;
        const historyRef = docClient(dbClient, 'history', roundId);
        setDocClient(historyRef, {
          ...histItem, 
          timestamp: serverTimestampClient()
        }).catch(e => {
          if (!e.message?.includes('quota')) {
            console.error("HISTORY SAVE ERROR DETAILS:", e.message || e);
          }
        });

        // OPTIMIZED BET PERSISTENCE: Save to In-Memory Ledger + Local user docs (batched)
        gameStateMemory.activeBets.forEach(async (bet) => {
          if (bet.userId.startsWith('fake_')) return;
          
          try {
            const user = await getLedgerUser(bet.userId);
            const betResult = {
              ...bet,
              round: gameStateMemory.currentRound,
              finalMultiplier: gameStateMemory.lastFinalValue,
              timestamp: new Date().toISOString(),
              status: bet.status === 'cashed_out' ? 'win' : 'loss'
            };
            user.recentBets = [betResult, ...user.recentBets].slice(0, 50);
            user.dirty = true;
          } catch (e) {
            // User not in ledger or error fetching
          }
        });
        
        // Calculate next crash value
        let nextValue = 1.10;
        if (gameStateMemory.manualOverrideNextValue) {
          nextValue = gameStateMemory.manualOverrideNextValue;
          gameStateMemory.manualOverrideNextValue = null;
        } else if (!gameStateMemory.isManualMode) {
          const rand = Math.random() * 100;
          // More complex Aviator-style distribution
          if (rand < 10) nextValue = parseFloat((1.01 + Math.random() * 0.10).toFixed(2)); // Instant crash 10%
          else if (rand < 50) nextValue = parseFloat((1.11 + Math.random() * 0.89).toFixed(2)); // Mid-range 40%
          else if (rand < 75) nextValue = parseFloat((2.01 + Math.random() * 2.99).toFixed(2)); // Up to 5x 25%
          else if (rand < 90) nextValue = parseFloat((5.01 + Math.random() * 9.99).toFixed(2)); // Up to 15x 15%
          else if (rand < 98) nextValue = parseFloat((15.01 + Math.random() * 34.99).toFixed(2)); // Up to 50x 8%
          else nextValue = parseFloat((50.01 + Math.random() * 499.99).toFixed(2)); // High-flyer 2%
        }
        gameStateMemory.nextCrashValue = nextValue;

        // Persist round sync and upcoming crash value (Important for reboot stability)
        updateDocClient(docClient(dbClient, 'settings', 'config'), { 
          currentRound: gameStateMemory.currentRound,
          lastFinalValue: gameStateMemory.lastFinalValue,
          nextCrashValue: gameStateMemory.nextCrashValue
        }).catch(() => {});

        // Broadcast the transition
        broadcastState();
      }
    }
  }, 100);

  // Broadcaster for real-time multiplier feel (higher frequency for flying)
  setInterval(() => {
    if (gameStateMemory.status === 'flying') {
      broadcastState();
    }
  }, 200);

  // --- BALANCE LEDGER (In-Memory to save Firestore Quota) ---
  const userLedger: Map<string, { balance: number, referralBalance: number, recentBets: any[], dirty: boolean }> = new Map();

  const getLedgerUser = async (userId: string) => {
    if (userLedger.has(userId)) return userLedger.get(userId)!;
    
    console.log(`[LEDGER] Fetching user ${userId} from Firestore...`);
    const userRef = docClient(dbClient, 'users', userId);
    const snap = await getDocClient(userRef);
    if (!snap.exists()) {
      console.error(`[LEDGER] User ${userId} NOT FOUND in Firestore!`);
      throw new Error("User record not found");
    }
    
    const data = snap.data()!;
    const entry = { 
      balance: data.balance || 0, 
      referralBalance: data.referralBalance || 0, 
      recentBets: data.recentBets || [],
      dirty: false 
    };
    userLedger.set(userId, entry);
    return entry;
  };

  // Sync Ledger to Firestore every 30 seconds
  setInterval(async () => {
    const dirtyUsers = Array.from(userLedger.entries()).filter(([_, data]) => data.dirty);
    if (dirtyUsers.length === 0) return;

    console.log(`[LEDGER] Flushing ${dirtyUsers.length} dirty user balances/bets to Firestore...`);
    for (const [userId, data] of dirtyUsers) {
      try {
        const userRef = docClient(dbClient, 'users', userId);
        await updateDocClient(userRef, { 
          balance: data.balance,
          referralBalance: data.referralBalance,
          recentBets: data.recentBets.slice(0, 50) 
        });
        data.dirty = false;
      } catch (e: any) {
        if (e.message?.includes('RESOURCE_EXHAUSTED') || e.message?.includes('quota')) {
          console.error(`[LEDGER] QUOTA EXCEEDED for ${userId}. Will retry in next flush.`);
          // Keep dirty = true so we retry next time
        } else {
          console.error(`[LEDGER] Failed to sync user ${userId}:`, e.message || e);
          data.dirty = false; // Stop retrying for non-quota fatal errors
        }
      }
    }
  }, 30000);

  // Betting API (Uses Ledger to save writes)
  app.post("/api/game/bet", async (req, res) => {
    const { userId, email, amount, panel } = req.body;
    console.log(`[BET] Request from ${userId} (${email}) for amount ${amount} on panel ${panel}`);
    
    try {
      const user = await getLedgerUser(userId);
      console.log(`[BET] Found user ${userId}. Balance: ${user.balance}, Referral: ${user.referralBalance}`);
      const totalAvailable = user.balance + user.referralBalance;

      if (totalAvailable < amount) {
        console.warn(`[BET] Insufficient balance for ${userId}: ${totalAvailable} < ${amount}`);
        return res.status(400).json({ error: "Insufficient balance" });
      }

      // Deduct from memory ledger
      let remainingToDeduct = amount;
      if (user.referralBalance >= remainingToDeduct) {
        user.referralBalance -= remainingToDeduct;
        remainingToDeduct = 0;
      } else {
        remainingToDeduct -= user.referralBalance;
        user.referralBalance = 0;
        user.balance -= remainingToDeduct;
      }

      user.dirty = true;

      const targetRound = gameStateMemory.status === 'waiting' ? gameStateMemory.currentRound : gameStateMemory.currentRound + 1;
      // High-resolution UUID-like ID to prevent React key collisions
      const betId = `${userId}_${targetRound}_${panel}_${Math.random().toString(36).substring(2, 9)}`;
      const bet = { id: betId, userId, email, amount, panel, status: 'pending', round: targetRound };

      if (gameStateMemory.status === 'waiting') {
        gameStateMemory.activeBets.push(bet);
      } else {
        gameStateMemory.queuedBets.push(bet);
      }
      
      broadcastState();
      
      res.json({ 
        success: true, 
        newBalance: user.balance, 
        newReferralBalance: user.referralBalance 
      });
    } catch (e: any) { 
      console.error("[SERVER] Betting error:", e.message || e);
      res.status(500).json({ error: "Betting error: " + (e.message || "Unknown") }); 
    }
  });

  app.post("/api/game/cashout", async (req, res) => {
    const { userId, panel, multiplier } = req.body;
    if (gameStateMemory.status !== 'flying') {
      return res.status(400).json({ error: "Game is not in flying state" });
    }
    
    const betIndex = gameStateMemory.activeBets.findIndex(b => b.userId === userId && b.panel === panel && b.status === 'pending');
    if (betIndex === -1) {
      return res.status(400).json({ error: "No active bet found for this panel" });
    }

    const bet = gameStateMemory.activeBets[betIndex];
    if (multiplier > gameStateMemory.multiplier + 0.5) {
      return res.status(400).json({ error: "Invalid multiplier / Timing error" });
    }

    try {
      const winAmount = parseFloat((bet.amount * multiplier).toFixed(2));
      bet.status = 'cashed_out';
      bet.cashoutValue = multiplier;
      bet.winAmount = winAmount;

      // Update Ledger
      const user = await getLedgerUser(userId);
      user.balance += winAmount;
      user.dirty = true;
      
      broadcastState();
      res.json({ 
        success: true, 
        winAmount,
        newBalance: user.balance,
        newReferralBalance: user.referralBalance
      });
    } catch (e: any) { 
      console.error("[SERVER] Cashout error:", e.message || e);
      res.status(500).json({ error: "Cashout failed: " + (e.message || "Unknown") }); 
    }
  });

  app.post("/api/game/cancel", async (req, res) => {
    const { userId, panel } = req.body;
    
    let betIndex = -1;
    let isQueued = false;

    if (gameStateMemory.status === 'waiting') {
      betIndex = gameStateMemory.activeBets.findIndex(b => b.userId === userId && b.panel === panel && b.status === 'pending');
    } else {
      betIndex = gameStateMemory.queuedBets.findIndex(b => b.userId === userId && b.panel === panel);
      isQueued = true;
    }

    if (betIndex === -1) {
      return res.status(400).json({ error: "No pending bet to cancel" });
    }

    const bet = isQueued ? gameStateMemory.queuedBets[betIndex] : gameStateMemory.activeBets[betIndex];

    try {
      // Refund via Ledger
      const user = await getLedgerUser(userId);
      user.balance += bet.amount;
      user.dirty = true;

      // Remove from memory
      if (isQueued) {
        gameStateMemory.queuedBets.splice(betIndex, 1);
      } else {
        gameStateMemory.activeBets.splice(betIndex, 1);
      }
      
      broadcastState();
      res.json({ 
        success: true,
        newBalance: user.balance,
        newReferralBalance: user.referralBalance
      });
    } catch (e: any) {
      console.error("[SERVER] Cancel error:", e.message || e);
      res.status(500).json({ error: "Cancellation failed: " + (e.message || "Unknown") });
    }
  });

  // My Bets API (Optimized to return from ledger)
  app.get("/api/game/my-history", async (req, res) => {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: "No userId" });
    
    try {
      const user = await getLedgerUser(userId as string);
      res.json({ history: user.recentBets });
    } catch (e) {
      res.json({ history: [] });
    }
  });

  // Admin Config API
  app.post("/api/admin/game-config", async (req, res) => {
    const { field, value } = req.body;
    (gameStateMemory as any)[field] = value;
    broadcastState();
    res.json({ success: true });
  });

  // API routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

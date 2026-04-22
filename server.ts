import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { initializeApp as initializeClientApp } from "firebase/app";
import { initializeFirestore, doc as docClient, getDoc as getDocClient, setDoc as setDocClient, updateDoc as updateDocClient, addDoc as addDocClient, collection as collectionClient, query as queryClient, orderBy as orderByClient, limit as limitClient, getDocs as getDocsClient, Timestamp as TimestampClient, serverTimestamp as serverTimestampClient } from "firebase/firestore";
import { getAuth as getAuthClient, signInAnonymously } from "firebase/auth";
import fs from "fs";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import Razorpay from "razorpay";

// Lazy initialize Razorpay
let razorpayInstance: Razorpay | null = null;
const getRazorpay = () => {
  if (!razorpayInstance && process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
    razorpayInstance = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
  }
  return razorpayInstance;
};

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
  
  // --- GLOBAL STATE ---
  const globalConfig = {
    houseEdge: 3,
    minesDifficultMode: 'normal'
  };

  // Force Initialize Config on Startup (Non-blocking)
  const forceInit = async () => {
    try {
      console.log("[SERVER] Loading initial config from Firestore...");
      const configRef = docClient(dbClient, 'settings', 'config');
      const snap = await getDocClient(configRef);
      if (snap.exists()) {
        const data = snap.data();
        globalConfig.houseEdge = data.houseEdge || 3;
        globalConfig.minesDifficultMode = data.minesDifficultMode || 'normal';
      }
    } catch (e: any) {
      console.error("Non-critical Startup Init Error:", e.message);
    }
  };
  forceInit();

  // --- SERVER AUTHORITATIVE MINES GAME STATE (IN-MEMORY) ---
  const activeMinesGames: Map<string, {
    userId: string;
    bet: number;
    numMines: number;
    mines: number[];
    revealed: number[];
    multiplier: number;
    isGameOver: boolean;
  }> = new Map();

  // Helper to calculate Mines multiplier
  const calculateMinesMultiplier = (numMines: number, revealedCount: number) => {
    let multiplier = 1.0;
    const totalTiles = 25;
    const houseEdge = 0.03; // 3% house edge

    for (let i = 0; i < revealedCount; i++) {
      multiplier *= (totalTiles - i) / (totalTiles - numMines - i);
    }
    
    return parseFloat((multiplier * (1 - houseEdge)).toFixed(2));
  };

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Request logger helper
  app.use((req, res, next) => {
    if (req.url.startsWith('/api')) {
      console.log(`[API_REQ] ${req.method} ${req.url}`);
    }
    next();
  });

  // Mines API
  app.post("/api/mines/start", async (req, res) => {
    const { userId, betAmount, numMines } = req.body;
    
    if (numMines < 1 || numMines > 24) return res.status(400).json({ error: "Invalid mines count" });
    if (betAmount < 1) return res.status(400).json({ error: "Invalid bet amount" });

    try {
      const user = await getLedgerUser(userId);
      if (user.balance < betAmount) return res.status(400).json({ error: "Insufficient balance" });

      // Deduct balance
      user.balance -= betAmount;
      user.dirty = true;

      // Generate mines
      const mines: number[] = [];
      while (mines.length < numMines) {
        const idx = Math.floor(Math.random() * 25);
        if (!mines.includes(idx)) mines.push(idx);
      }

      const gameState = {
        userId,
        bet: betAmount,
        numMines,
        mines,
        revealed: [],
        multiplier: 1.0,
        isGameOver: false
      };

      activeMinesGames.set(userId, gameState);

      res.json({
        success: true,
        newBalance: user.balance,
        gameState: {
          revealed: [],
          multiplier: 1.0,
          isGameOver: false
        }
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/mines/reveal", async (req, res) => {
    const { userId, tileIndex } = req.body;
    const game = activeMinesGames.get(userId);

    if (!game || game.isGameOver) return res.status(400).json({ error: "No active game" });
    if (game.revealed.includes(tileIndex)) return res.status(400).json({ error: "Already revealed" });

    if (game.mines.includes(tileIndex)) {
      // HIT MINE
      const user = await getLedgerUser(userId);
      const historyEntry = {
        game: 'Mines',
        bet: game.bet,
        mines: game.numMines,
        multiplier: 0,
        payout: 0,
        status: 'lost',
        timestamp: Date.now()
      };
      user.recentBets.unshift(historyEntry);
      user.recentBets = user.recentBets.slice(0, 50);
      user.dirty = true;

      game.isGameOver = true;
      activeMinesGames.delete(userId);
      return res.json({
        success: true,
        hitMine: true,
        mines: game.mines,
        isGameOver: true
      });
    } else {
      // DIAMOND
      game.revealed.push(tileIndex);
      game.multiplier = calculateMinesMultiplier(game.numMines, game.revealed.length);

      if (game.revealed.length + game.numMines === 25) {
        // Automatic win if all diamonds revealed
        const winAmount = parseFloat((game.bet * game.multiplier).toFixed(2));
        const user = await getLedgerUser(userId);
        user.balance += winAmount;
        user.dirty = true;

        const historyEntry = {
          game: 'Mines',
          bet: game.bet,
          mines: game.numMines,
          multiplier: game.multiplier,
          payout: winAmount,
          status: 'won',
          timestamp: Date.now()
        };
        user.recentBets.unshift(historyEntry);
        user.recentBets = user.recentBets.slice(0, 50);

        game.isGameOver = true;
        activeMinesGames.delete(userId);

        return res.json({
          success: true,
          hitMine: false,
          revealed: game.revealed,
          multiplier: game.multiplier,
          isGameOver: true,
          winAmount,
          newBalance: user.balance,
          mines: game.mines
        });
      }

      res.json({
        success: true,
        hitMine: false,
        revealed: game.revealed,
        multiplier: game.multiplier,
        isGameOver: false
      });
    }
  });

  app.post("/api/mines/cashout", async (req, res) => {
    const { userId } = req.body;
    const game = activeMinesGames.get(userId);

    if (!game || game.isGameOver || game.revealed.length === 0) {
      return res.status(400).json({ error: "Cannot cash out" });
    }

    try {
      const winAmount = parseFloat((game.bet * game.multiplier).toFixed(2));
      const user = await getLedgerUser(userId);
      
      user.balance += winAmount;
      user.dirty = true;

      const historyEntry = {
        game: 'Mines',
        bet: game.bet,
        mines: game.numMines,
        multiplier: game.multiplier,
        payout: winAmount,
        status: 'won',
        timestamp: Date.now()
      };
      user.recentBets.unshift(historyEntry);
      user.recentBets = user.recentBets.slice(0, 50);

      game.isGameOver = true;
      const finalMines = [...game.mines];
      activeMinesGames.delete(userId);

      res.json({
        success: true,
        winAmount,
        newBalance: user.balance,
        mines: finalMines
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // --- CASHFREE INTEGRATION ---
  app.post("/api/payment/cashfree/create-order", async (req, res) => {
    const { amount, userId, customerEmail, customerPhone } = req.body;

    const clientId = process.env.CASHFREE_CLIENT_ID;
    const clientSecret = process.env.CASHFREE_CLIENT_SECRET;
    const isProd = process.env.NODE_ENV === 'production';

    if (!clientId || !clientSecret) {
      return res.status(500).json({ error: "Cashfree is not configured." });
    }

    try {
      const response = await fetch(
        isProd ? "https://api.cashfree.com/pg/orders" : "https://sandbox.cashfree.com/pg/orders",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-client-id": clientId,
            "x-client-secret": clientSecret,
            "x-api-version": "2023-08-01"
          },
          body: JSON.stringify({
            order_amount: amount,
            order_currency: "INR",
            order_id: `order_${Date.now()}_${userId.substring(0, 5)}`,
            customer_details: {
              customer_id: userId,
              customer_email: customerEmail || "customer@example.com",
              customer_phone: customerPhone || "9999999999"
            },
            order_meta: {
              return_url: `${req.headers.origin}/api/payment/cashfree/verify?order_id={order_id}`
            }
          })
        }
      );

      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Failed to create Cashfree order");

      res.json({
        payment_session_id: data.payment_session_id,
        order_id: data.order_id
      });
    } catch (e: any) {
      console.error("[CASHFREE] Order creation failed:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/payment/cashfree/verify", async (req, res) => {
    const { order_id } = req.query;
    const clientId = process.env.CASHFREE_CLIENT_ID;
    const clientSecret = process.env.CASHFREE_CLIENT_SECRET;
    const isProd = process.env.NODE_ENV === 'production';

    try {
      const response = await fetch(
        isProd ? `https://api.cashfree.com/pg/orders/${order_id}` : `https://sandbox.cashfree.com/pg/orders/${order_id}`,
        {
          headers: {
            "x-client-id": clientId!,
            "x-client-secret": clientSecret!,
            "x-api-version": "2023-08-01"
          }
        }
      );

      const data = await response.json();
      if (data.order_status === 'PAID') {
        const userId = data.customer_details.customer_id;
        const amount = data.order_amount;

        const user = await getLedgerUser(userId);
        user.balance += parseFloat(amount);
        user.dirty = true;

        // Redirect back to profile or success page
        res.redirect("/profile?status=success&amount=" + amount);
      } else {
        res.redirect("/profile?status=failed");
      }
    } catch (e) {
      res.redirect("/profile?status=error");
    }
  });

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

  // Sync Ledger to Firestore every 10 seconds (Reduced from 60s for better responsiveness on refresh)
  setInterval(async () => {
    // 1. Sync User Balances/Bets
    const dirtyUsers = Array.from(userLedger.entries()).filter(([_, data]) => data.dirty);
    if (dirtyUsers.length > 0) {
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
          } else {
            console.error(`[LEDGER] Failed to sync user ${userId}:`, e.message || e);
            data.dirty = false;
          }
        }
      }
    }
  }, 10000);

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
    // Persist to Firestore directly for Mines settings
    const configRef = docClient(dbClient, 'settings', 'config');
    await updateDocClient(configRef, { [field]: value }).catch(() => {});
    res.json({ success: true });
  });

  // --- RAZORPAY INTEGRATION ---
  app.post("/api/payment/razorpay/create-order", async (req, res) => {
    const { amount, userId } = req.body;
    const rzp = getRazorpay();
    
    if (!rzp) {
      return res.status(500).json({ error: "Razorpay is not configured. Please add Key ID and Secret." });
    }

    try {
      const options = {
        amount: Math.round(amount * 100), // amount in the smallest currency unit (paise)
        currency: "INR",
        receipt: `receipt_${Date.now()}_${userId.substring(0, 5)}`,
        notes: {
          userId
        }
      };

      const order = await rzp.orders.create(options);
      res.json({ orderId: order.id, key: process.env.RAZORPAY_KEY_ID });
    } catch (e: any) {
      console.error("[PAYMENT] Order creation failed:", e.message || e);
      res.status(500).json({ error: "Failed to create payment order" });
    }
  });

  app.post("/api/payment/razorpay/verify", async (req, res) => {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, userId, amount } = req.body;
    const rzp = getRazorpay();
    
    if (!rzp) return res.status(500).json({ error: "Razorpay not configured" });

    // Verify signature
    const crypto = await import("crypto");
    const hmac = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET!);
    hmac.update(razorpay_order_id + "|" + razorpay_payment_id);
    const generated_signature = hmac.digest('hex');

    if (generated_signature !== razorpay_signature) {
      console.error("[PAYMENT] Invalid signature from user", userId);
      return res.status(400).json({ error: "Invalid payment signature" });
    }

    try {
      console.log(`[PAYMENT] Payment verified for ${userId}: ₹${amount}`);
      
      // Update balance in ledger
      const user = await getLedgerUser(userId);
      user.balance += parseFloat(amount);
      user.dirty = true;

      // Add to deposits collection (Non-blocking)
      addDocClient(collectionClient(dbClient, 'deposits'), {
        userId,
        amount: parseFloat(amount),
        transactionId: razorpay_payment_id,
        status: 'completed',
        method: 'razorpay',
        timestamp: serverTimestampClient()
      }).catch(e => console.error("[PAYMENT] Failed to log deposit:", e.message));

      res.json({ success: true, newBalance: user.balance });
    } catch (e: any) {
      console.error("[PAYMENT] Verification handling failed:", e.message);
      res.status(500).json({ error: "Failed to process verified payment" });
    }
  });

  // --- CASHFREE INTEGRATION ---
  app.post("/api/payment/cashfree/create-order", async (req, res) => {
    const { amount, userId } = req.body;
    try {
      const { Cashfree } = await import("cashfree-pg");
      (Cashfree as any).XClientId = process.env.CASHFREE_CLIENT_ID || "";
      (Cashfree as any).XClientSecret = process.env.CASHFREE_CLIENT_SECRET || "";
      (Cashfree as any).XEnvironment = (Cashfree as any).Environment?.PRODUCTION || "PRODUCTION";

      const orderRequest = {
        order_amount: amount,
        order_currency: "INR",
        customer_details: {
          customer_id: userId,
          customer_email: "user@example.com",
          customer_phone: "9999999999"
        },
        order_meta: {
          return_url: `${req.protocol}://${req.get('host')}/deposit?order_id={order_id}`
        }
      };

      const response = await (Cashfree as any).PGCreateOrder("2023-08-01", orderRequest);
      res.json(response.data);
    } catch (e: any) {
      console.error("[CASHFREE] Order creation failed:", e.response?.data || e.message);
      res.status(500).json({ error: "Failed to create Cashfree order" });
    }
  });

  app.post("/api/payment/cashfree/verify", async (req, res) => {
    const { order_id, userId } = req.body;
    try {
      const { Cashfree } = await import("cashfree-pg");
      (Cashfree as any).XClientId = process.env.CASHFREE_CLIENT_ID || "";
      (Cashfree as any).XClientSecret = process.env.CASHFREE_CLIENT_SECRET || "";
      (Cashfree as any).XEnvironment = (Cashfree as any).Environment?.PRODUCTION || "PRODUCTION";

      const response = await (Cashfree as any).PGGetOrder("2023-08-01", order_id);
      const order = response.data;

      if (order.order_status === "PAID") {
        const user = await getLedgerUser(userId);
        user.balance += parseFloat(order.order_amount.toString());
        user.dirty = true;

        addDocClient(collectionClient(dbClient, 'deposits'), {
          userId,
          amount: parseFloat(order.order_amount.toString()),
          transactionId: order_id,
          status: 'completed',
          method: 'cashfree',
          timestamp: serverTimestampClient()
        }).catch(() => {});

        return res.json({ success: true, newBalance: user.balance });
      }
      
      res.status(400).json({ error: "Payment not completed" });
    } catch (e: any) {
      console.error("[CASHFREE] Verification failed:", e.response?.data || e.message);
      res.status(500).json({ error: "Verification error" });
    }
  });

  // API routes
  app.get("/api/health", async (req, res) => {
    try {
      const configRef = docClient(dbClient, 'settings', 'config');
      await getDocClient(configRef);
      res.json({ status: "ok", firestore: "connected" });
    } catch (e: any) {
      res.json({ status: "ok", firestore: "error", message: e.message });
    }
  });

  // Explicit 404 for missing API routes to prevent HTML fallback
  app.all("/api/*", (req, res) => {
    console.warn(`[API_404] No route matched for ${req.method} ${req.url}`);
    res.status(404).json({ error: `API route ${req.url} not found` });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, "dist");
    // Serve static files from dist
    app.use(express.static(distPath));
    
    // Fallback all other requests to index.html for React Router
    app.get("*", (req, res) => {
      if (req.url.startsWith('/api')) {
        console.warn(`[API_FALLBACK] API request hit HTML fallback: ${req.method} ${req.url}`);
      }
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();

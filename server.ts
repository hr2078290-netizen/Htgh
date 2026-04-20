import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { initializeApp as initializeClientApp } from "firebase/app";
import { getFirestore as getFirestoreClient, doc as docClient, onSnapshot as onSnapshotClient, updateDoc as updateDocClient, increment as incrementClient, serverTimestamp as serverTimestampClient, getDoc as getDocClient, setDoc as setDocClient, Timestamp as TimestampClient, collection as collectionClient, getDocs as getDocsClient, deleteField } from "firebase/firestore";
import { getAuth as getAuthClient, signInAnonymously } from "firebase/auth";
import { initializeApp as initializeAdminApp, getApps as getAdminApps, getApp as getAdminApp } from 'firebase-admin/app';
import { getFirestore as getFirestoreAdmin, FieldValue, Timestamp } from 'firebase-admin/firestore';
import fs from "fs";

// ESM __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Firebase Config
const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
const firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));

// Initialize Firebase Client (We will use this for the server-side loop to avoid IAM issues)
const firebaseApp = initializeClientApp(firebaseConfig);
const dbClient = getFirestoreClient(firebaseApp, firebaseConfig.firestoreDatabaseId || undefined);
const authClient = getAuthClient(firebaseApp);

// Initialize Firebase Admin (Keep for other potential admin tasks, but loop will use client)
const adminApp = getAdminApps().length === 0 
  ? initializeAdminApp({ projectId: firebaseConfig.projectId })
  : getAdminApp();

const dbAdmin = getFirestoreAdmin(adminApp, firebaseConfig.firestoreDatabaseId || undefined);

async function startServer() {
  const app = express();
  const PORT = 3000;

  console.log("Starting server with Client-SDK-based Game Loop...");

  // Force Initialize Config on Startup
  const forceInit = async () => {
    try {
      const configRef = docClient(dbClient, 'settings', 'config');
      const snap = await getDocClient(configRef);
      if (!snap.exists()) {
        console.log("FORCE START: Config document missing. Creating initial state...");
        await setDocClient(configRef, {
          gameState: 'waiting',
          nextCrashValue: 1.5,
          currentRound: 1,
          countdownEndTime: TimestampClient.fromDate(new Date(Date.now() + 5000))
        });
      } else {
        console.log("Config document found. Current state:", snap.data()?.gameState);
        // If stuck in crashed or flying without timestamp, force reset
        const data = snap.data();
        if ((data?.gameState === 'crashed' && !data?.nextTransitionTime) || (data?.gameState === 'flying' && !data?.startTime)) {
          console.log("Detected stuck state on startup. Resetting to waiting...");
          await updateDocClient(configRef, {
            gameState: 'waiting',
            countdownEndTime: TimestampClient.fromDate(new Date(Date.now() + 5000)),
            startTime: null,
            nextTransitionTime: null
          });
        }
      }
    } catch (e) {
      console.error("Critical Startup Init Error:", e);
    }
  };
  forceInit();

  let settingsRef: any = null;

  try {
    // Background Game Loop for 24/7 Running using Client SDK
    // (Bypasses the "7 PERMISSION_DENIED" seen with Admin SDK in this environment)
    let lastStateChange = Date.now();
    let lastProcessedRound = 0;

    // Sign in the server's client SDK anonymously for rule compliance (if needed)
    try {
      await signInAnonymously(authClient);
      console.log("[SERVER] Signed in anonymously to Firestore Client.");
    } catch (e) {
      console.error("[SERVER] Anonymous sign-in failed:", e);
    }

    console.log("Setting up Firestore Client listener for game config...");
    onSnapshotClient(docClient(dbClient, 'settings', 'config'), (snap) => {
      if (snap.exists()) {
        const newData = snap.data();
        if (newData && newData.gameState !== settingsRef?.gameState) {
          console.log(`[SERVER] State Change: ${settingsRef?.gameState || 'INIT'} -> ${newData.gameState}`);
          lastStateChange = Date.now();
        }
        settingsRef = newData;
      } else {
        console.log("[SERVER] Config document missing. Initializing...");
        setDocClient(docClient(dbClient, 'settings', 'config'), {
          gameState: 'waiting',
          nextCrashValue: 1.5,
          currentRound: 1,
          countdownEndTime: TimestampClient.fromDate(new Date(Date.now() + 5000))
        });
      }
    }, (error) => {
      console.error("[SERVER] Client Firestore Snapshot Error:", error);
    });

    const handleCrash = async (roundNum: number, finalValue: number) => {
      if (lastProcessedRound === roundNum) return;
      lastProcessedRound = roundNum;

      try {
        console.log(`[SERVER] Round ${roundNum} CRASHED at ${finalValue}x. Processing...`);
        const configRef = docClient(dbClient, 'settings', 'config');
        const roundId = `round_${roundNum}`;
        
        await setDocClient(docClient(dbClient, 'history', roundId), {
          value: finalValue,
          timestamp: serverTimestampClient(),
          round: roundNum
        });

        let nextValue = settingsRef?.nextCrashValue || 1.10;
        
        if (settingsRef?.manualOverrideNextValue) {
          nextValue = parseFloat(settingsRef.manualOverrideNextValue);
          console.log(`[SERVER] MANUAL OVERRIDE: ${nextValue}x`);
          await updateDocClient(configRef, { manualOverrideNextValue: deleteField() });
        } else if (!settingsRef?.isManualMode) {
          const rand = Math.random() * 100;
          if (rand < 70) nextValue = parseFloat((1.01 + Math.random() * 3.99).toFixed(2));
          else if (rand < 90) nextValue = parseFloat((5.01 + Math.random() * 14.99).toFixed(2));
          else if (rand < 97) nextValue = parseFloat((20.01 + Math.random() * 79.99).toFixed(2));
          else if (rand < 99) nextValue = parseFloat((100.01 + Math.random() * 399.99).toFixed(2));
          else nextValue = parseFloat((500.01 + Math.random() * 499.99).toFixed(2));
        }

        const transitionSeconds = 3;
        const nextTransitionTime = TimestampClient.fromDate(new Date(Date.now() + transitionSeconds * 1000));

        await updateDocClient(configRef, { 
          gameState: 'crashed',
          nextTransitionTime: nextTransitionTime,
          lastFinalValue: finalValue,
          pendingNextValue: nextValue,
          nextCrashValue: nextValue 
        });
        
        console.log(`[SERVER] Round ${roundNum} transition to CRASHED updated via Client SDK.`);
        
      } catch (e) {
        console.error("[SERVER] Crash Handling Failure:", e);
      }
    };

    const getMillis = (ts: any) => {
      if (!ts) return null;
      if (typeof ts.toMillis === 'function') return ts.toMillis();
      if (typeof ts === 'number') return ts;
      if (ts instanceof Date) return ts.getTime();
      if (ts.seconds) return ts.seconds * 1000;
      return new Date(ts).getTime();
    };

    setInterval(async () => {
      try {
        const now = Date.now();
        
        if (!settingsRef) {
          // Attempt recovery if listener hasn't provided data yet
          const snap = await getDocClient(docClient(dbClient, 'settings', 'config'));
          if (snap.exists()) settingsRef = snap.data();
          return;
        }

        const { gameState, startTime, countdownEndTime, nextCrashValue, currentRound = 1, nextTransitionTime } = settingsRef;

        // Watchdog: If stuck in flying or waiting for 10 mins, reset
        const timeSinceChange = now - lastStateChange;
        if (timeSinceChange > 600000) { 
          console.warn(`[SERVER] Stuck in ${gameState} for ${Math.round(timeSinceChange/1000)}s! Resetting...`);
          await updateDocClient(docClient(dbClient, 'settings', 'config'), {
            gameState: 'waiting',
            countdownEndTime: TimestampClient.fromDate(new Date(now + 5000)),
            startTime: null,
            nextTransitionTime: null
          }).catch(() => {});
          lastStateChange = now;
          return;
        }

        // State Machine
        if (gameState === 'crashed' && nextTransitionTime) {
          const transTime = getMillis(nextTransitionTime);
          if (transTime && now >= transTime) {
            console.log("[SERVER] CRASHED -> WAITING");
            await updateDocClient(docClient(dbClient, 'settings', 'config'), {
              gameState: 'waiting',
              currentRound: incrementClient(1),
              countdownEndTime: TimestampClient.fromDate(new Date(now + 10000)),
              startTime: null,
              nextTransitionTime: null
            });
          }
        }

        if (gameState === 'waiting' && countdownEndTime) {
          const endTime = getMillis(countdownEndTime);
          if (endTime && now >= endTime) {
            console.log("[SERVER] WAITING -> FLYING");
            await updateDocClient(docClient(dbClient, 'settings', 'config'), {
              gameState: 'flying',
              startTime: serverTimestampClient(),
              countdownEndTime: null
            });
          }
        }

        if (gameState === 'flying' && startTime) {
          const start = getMillis(startTime);
          if (start && !isNaN(start)) {
            const elapsed = (now - start) / 1000;
            if (elapsed > 0) {
              const currentMultiplier = Math.exp(0.15 * elapsed);
              const crashThreshold = parseFloat(String(nextCrashValue || 2.0));

              if (!isNaN(currentMultiplier) && currentMultiplier >= crashThreshold) {
                await handleCrash(currentRound, crashThreshold);
              }
            }
          }
        }
      } catch (error) {
        console.error("[SERVER] Game Loop Loop Error:", error);
      }
    }, 1000);

  } catch (error) {
    console.error("Admin initialization error:", error);
  }

  app.use(express.json());

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

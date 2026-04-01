import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import cron from "node-cron";
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import admin from 'firebase-admin';

// Initialize Firebase Admin (using environment variables if available, or just placeholder for now)
// In this environment, we should ideally use the same config as client or service account.
// For the sake of this applet, we'll assume the admin SDK can be initialized.
// Note: In a real app, you'd need a service account key.
if (!admin.apps.length) {
  initializeApp({
    projectId: "gen-lang-client-0020867919",
  });
}

const db = getFirestore();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Cron Job: Runs at 00:00 on the 1st day of every month
  cron.schedule("0 0 1 * *", async () => {
    console.log("Running monthly fixed finance automation...");
    try {
      const fixedFinancesSnapshot = await db.collection('fixedFinances').get();
      const batch = db.batch();
      
      fixedFinancesSnapshot.forEach(doc => {
        const data = doc.data();
        const transactionRef = db.collection('transactions').doc();
        batch.set(transactionRef, {
          userId: data.userId,
          amount: data.amount,
          type: data.type,
          category: data.category,
          date: Timestamp.now(),
          note: `Automated: ${data.description || data.category}`,
          familyMember: 'System',
          isFixed: true,
          createdAt: Timestamp.now(),
        });
      });

      await batch.commit();
      console.log(`Successfully processed ${fixedFinancesSnapshot.size} fixed finances.`);
    } catch (error) {
      console.error("Error in fixed finance cron job:", error);
    }
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

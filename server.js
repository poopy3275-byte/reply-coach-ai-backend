import express from "express";
import Stripe from "stripe";
import fs from "fs";

const app = express();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// IMPORTANT: allow JSON body normally
app.use(express.json());

// ===== DATABASE =====
const DB_FILE = "database.json";

function readDB() {
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ users: {} }, null, 2));
  }
  return JSON.parse(fs.readFileSync(DB_FILE));
}

function writeDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// ===== ENV CHECK =====
console.log("ENV CHECK:", {
  hasStripeKey: !!process.env.STRIPE_SECRET_KEY,
  stripeKeyMode: process.env.STRIPE_SECRET_KEY?.startsWith("sk_live_")
    ? "live"
    : "test",
});

// ===== WEBHOOK (NO SIGNATURE CHECK) =====
app.post("/stripe/webhook", async (req, res) => {
  try {
    console.log("🔥 Webhook hit");

    const event = req.body;

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;

      console.log("👉 Session ID:", session.id);

      // 🔥 VERIFY WITH STRIPE DIRECTLY
      const verifiedSession = await stripe.checkout.sessions.retrieve(
        session.id
      );

      if (verifiedSession.payment_status !== "paid") {
        console.log("❌ Not paid");
        return res.json({ received: true });
      }

      const email = verifiedSession.metadata.email;
      const packId = verifiedSession.metadata.packId;

      console.log("💰 PAYMENT VERIFIED:", email, packId);

      // ===== CREDIT LOGIC =====
      let creditsToAdd = 0;

      if (packId === "pack_50") creditsToAdd = 50;
      if (packId === "pack_150") creditsToAdd = 150;
      if (packId === "pack_500") creditsToAdd = 500;

      const db = readDB();

      if (!db.users[email]) {
        db.users[email] = { credits: 0 };
      }

      db.users[email].credits += creditsToAdd;

      writeDB(db);

      console.log("✅ Credits added:", creditsToAdd);
    }

    res.json({ received: true });
  } catch (err) {
    console.error("❌ Webhook error:", err.message);
    res.status(500).send("Webhook error");
  }
});

// ===== TEST ROUTE =====
app.get("/", (req, res) => {
  res.send("Reply Coach AI backend running");
});

// ===== START SERVER =====
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});

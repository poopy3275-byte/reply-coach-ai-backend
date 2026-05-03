import express from "express";
import cors from "cors";
import fs from "fs";
import Stripe from "stripe";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;

// ⚠️ IMPORTANT: DO NOT use express.json() before webhook
app.use(cors());

// AFTER webhook, we will enable JSON parsing
app.use((req, res, next) => {
  if (req.originalUrl === "/stripe/webhook") {
    next();
  } else {
    express.json()(req, res, next);
  }
});

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// ==========================
// DATABASE (simple JSON)
// ==========================
const DB_FILE = "./database.json";

function readDB() {
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ users: {} }, null, 2));
  }
  return JSON.parse(fs.readFileSync(DB_FILE));
}

function writeDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

function getUser(email) {
  const db = readDB();
  if (!db.users[email]) {
    db.users[email] = {
      email,
      creditsLeft: 3,
      plan: "free",
    };
    writeDB(db);
  }
  return db.users[email];
}

function updateUser(email, updates) {
  const db = readDB();
  db.users[email] = {
    ...db.users[email],
    ...updates,
  };
  writeDB(db);
}

// ==========================
// 🔥 STRIPE WEBHOOK (FIXED)
// ==========================
app.post("/stripe/webhook", (req, res) => {
  const chunks = [];

  req.on("data", (chunk) => {
    chunks.push(chunk);
  });

  req.on("end", async () => {
    const rawBody = Buffer.concat(chunks);

    let event;

    try {
      const signature = req.headers["stripe-signature"];

      event = stripe.webhooks.constructEvent(
        rawBody,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET
      );

      console.log("✅ Webhook verified");
    } catch (err) {
      console.error("❌ Signature verification failed:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    try {
      if (event.type === "checkout.session.completed") {
        const session = event.data.object;

        const email = session.metadata?.email;
        const packId = session.metadata?.packId;

        console.log("💰 PAYMENT RECEIVED:", email, packId);

        const creditsMap = {
          pack_50: 50,
          pack_150: 150,
          pack_500: 500,
        };

        const credits = creditsMap[packId] || 0;

        if (credits > 0 && email) {
          const user = getUser(email);

          updateUser(email, {
            creditsLeft: (user.creditsLeft || 0) + credits,
          });

          console.log(`🎉 Credits added: ${credits} → ${email}`);
        } else {
          console.log("⚠️ Missing email or invalid packId");
        }
      }

      res.json({ received: true });
    } catch (err) {
      console.error("❌ Webhook processing error:", err);
      res.status(500).send("Server error");
    }
  });
});

// ==========================
// CREATE CHECKOUT SESSION
// ==========================
app.post("/create-checkout-session", async (req, res) => {
  try {
    const { packId, email } = req.body;

    const prices = {
      pack_50: 500,
      pack_150: 1000,
      pack_500: 2500,
    };

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: "Reply Coach AI Credits",
            },
            unit_amount: prices[packId],
          },
          quantity: 1,
        },
      ],
      metadata: {
        packId,
        email,
        type: "credit_pack",
      },
      success_url:
        "https://reply-coach-ai-backend.onrender.com/stripe/success",
      cancel_url:
        "https://reply-coach-ai-backend.onrender.com/stripe/cancel",
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error(err);
    res.status(500).send("Stripe session error");
  }
});

// ==========================
// SUCCESS / CANCEL
// ==========================
app.get("/stripe/success", (req, res) => {
  res.send("Payment successful. You can close this window.");
});

app.get("/stripe/cancel", (req, res) => {
  res.send("Payment canceled.");
});

// ==========================
app.get("/", (req, res) => {
  res.send("Reply Coach AI backend running 🚀");
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

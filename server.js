import express from "express";
import cors from "cors";
import fs from "fs";
import Stripe from "stripe";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;

// 🔥 CRITICAL: Stripe webhook must use RAW body
app.post(
"/stripe/webhook",
express.raw({ type: "application/json" }),
(req, res) => {
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

```
let event;

try {
  const sig = req.headers["stripe-signature"];

  event = stripe.webhooks.constructEvent(
    req.body, // RAW buffer (correct)
    sig,
    process.env.STRIPE_WEBHOOK_SECRET
  );

  console.log("✅ Webhook verified");
} catch (err) {
  console.error("❌ Signature error:", err.message);
  return res.status(400).send(`Webhook Error: ${err.message}`);
}

// ✅ HANDLE PAYMENT
if (event.type === "checkout.session.completed") {
  const session = event.data.object;

  const email = session.metadata?.email;
  const packId = session.metadata?.packId;

  console.log("💰 PAYMENT:", email, packId);

  const creditsMap = {
    pack_50: 50,
    pack_150: 150,
    pack_500: 500,
  };

  const credits = creditsMap[packId] || 0;

  if (email && credits > 0) {
    const db = JSON.parse(fs.readFileSync("./database.json"));

    if (!db.users[email]) {
      db.users[email] = {
        email,
        creditsLeft: 0,
        plan: "free",
      };
    }

    db.users[email].creditsLeft += credits;

    fs.writeFileSync("./database.json", JSON.stringify(db, null, 2));

    console.log(`🎉 Added ${credits} credits to ${email}`);
  }
}

res.json({ received: true });
```

}
);

// ✅ EVERYTHING ELSE USES JSON
app.use(express.json());
app.use(cors());

// ==========================
// CREATE CHECKOUT
// ==========================
app.post("/create-checkout-session", async (req, res) => {
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

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
product_data: { name: "Reply Coach AI Credits" },
unit_amount: prices[packId],
},
quantity: 1,
},
],
metadata: {
email,
packId,
},
success_url:
"https://reply-coach-ai-backend.onrender.com/stripe/success",
cancel_url:
"https://reply-coach-ai-backend.onrender.com/stripe/cancel",
});

res.json({ url: session.url });
});

// ==========================
app.get("/", (req, res) => {
res.send("Backend running 🚀");
});

app.listen(PORT, () => {
console.log(`Server running on port ${PORT}`);
});

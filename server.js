import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";
import fs from "fs";
import Stripe from "stripe";

dotenv.config();

const app = express();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const stripe = new Stripe("sk_test_51TRTvcAZVnMl0sf8ruhmtAPY0h9gxAlcRoa00D7PwhV4tuTaTMinmEsLCKKP9EQJHcw99WvryNNjZVOCLCVYbLUE00DiVe7EUB");

const DATABASE_FILE = "./database.json";
const DAILY_FREE_CREDITS = 3;
const APP_URL = "https://reply-coach-ai-backend.onrender.com";

const STRIPE_WEBHOOK_SECRET = "whsec_508087f90923dbe109ae0b16b4e75be3b2fd599094a08fd699109f88d42998b0";

const CREDIT_COSTS = {
  reply: 1,
  template: 2,
  coach: 3,
};

const CREDIT_PACKS = {
  pack_50: { name: "50 Credits", credits: 50, priceInCents: 500 },
  pack_150: { name: "150 Credits", credits: 150, priceInCents: 1000 },
  pack_500: { name: "500 Credits", credits: 500, priceInCents: 2500 },
};

const PRO_PLAN = {
  name: "Reply Coach AI Pro",
  credits: 500,
  priceInCents: 2000,
};

function loadDatabase() {
  if (!fs.existsSync(DATABASE_FILE)) {
    fs.writeFileSync(DATABASE_FILE, JSON.stringify({ users: {}, payments: {} }, null, 2));
  }

  const database = JSON.parse(fs.readFileSync(DATABASE_FILE, "utf8"));

  if (!database.users) database.users = {};
  if (!database.payments) database.payments = {};

  return database;
}

function saveDatabase(database) {
  fs.writeFileSync(DATABASE_FILE, JSON.stringify(database, null, 2));
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function getTodayKey() {
  return new Date().toISOString().split("T")[0];
}

function getUser(email) {
  const database = loadDatabase();
  const normalizedEmail = normalizeEmail(email);
  const today = getTodayKey();

  if (!database.users[normalizedEmail]) {
    database.users[normalizedEmail] = {
      email: normalizedEmail,
      creditsLeft: DAILY_FREE_CREDITS,
      creditDate: today,
      plan: "free",
      totalGenerations: 0,
      createdAt: new Date().toISOString(),
    };

    saveDatabase(database);
  }

  const user = database.users[normalizedEmail];

  if (user.creditDate !== today && user.plan === "free") {
    user.creditsLeft = Math.max(user.creditsLeft || 0, DAILY_FREE_CREDITS);
    user.creditDate = today;
    saveDatabase(database);
  }

  return user;
}

function updateUser(email, updates) {
  const database = loadDatabase();
  const normalizedEmail = normalizeEmail(email);

  database.users[normalizedEmail] = {
    ...database.users[normalizedEmail],
    ...updates,
  };

  saveDatabase(database);
  return database.users[normalizedEmail];
}

function hasEnoughCredits(user, cost) {
  return (user.creditsLeft || 0) >= cost;
}

function chargeCredits(email, cost, featureName) {
  const user = getUser(email);

  if (!hasEnoughCredits(user, cost)) {
    return {
      success: false,
      user,
      error: `Not enough credits. ${featureName} costs ${cost} credits.`,
    };
  }

  const updatedUser = updateUser(email, {
    creditsLeft: user.creditsLeft - cost,
    totalGenerations: (user.totalGenerations || 0) + 1,
    lastUsedAt: new Date().toISOString(),
    lastFeatureUsed: featureName,
  });

  return {
    success: true,
    user: updatedUser,
  };
}

function paymentAlreadyProcessed(id) {
  const database = loadDatabase();
  return Boolean(database.payments[id]);
}

function savePayment(id, paymentData) {
  const database = loadDatabase();
  database.payments[id] = paymentData;
  saveDatabase(database);
}

function addCredits(email, credits, reason, paymentId) {
  if (paymentAlreadyProcessed(paymentId)) {
    return getUser(email);
  }

  const user = getUser(email);

  const updatedUser = updateUser(email, {
    creditsLeft: (user.creditsLeft || 0) + credits,
    lastCreditAddedAt: new Date().toISOString(),
    lastCreditReason: reason,
  });

  savePayment(paymentId, {
    id: paymentId,
    email,
    creditsAdded: credits,
    reason,
    status: "processed",
    processedAt: new Date().toISOString(),
  });

  return updatedUser;
}

function getTemplateLabel(type) {
  const labels = {
    two_week_resignation: "Two-week resignation",
    thirty_day_moving_notice: "30-day moving notice",
    landlord_complaint: "Formal complaint to landlord",
    refund_request: "Refund request",
    follow_up_email: "Follow-up email",
    apology_message: "Apology message",
    boundary_setting: "Boundary-setting message",
    payment_request: "Ask for payment owed",
  };

  return labels[type] || "Professional message";
}

app.post("/stripe/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  let event;

  try {
    const signature = req.headers["stripe-signature"];

    event = stripe.webhooks.constructEvent(
      req.body,
      signature,
      STRIPE_WEBHOOK_SECRET
    );
  } catch (error) {
    console.error("Webhook signature verification failed:", error.message);
    return res.status(400).send(`Webhook Error: ${error.message}`);
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;

      if (paymentAlreadyProcessed(session.id)) {
        return res.json({ received: true, duplicate: true });
      }

      const email = normalizeEmail(session.metadata?.email);
      const type = session.metadata?.type;

      if (!email || !email.includes("@")) {
        console.error("Missing email in Stripe metadata");
        return res.json({ received: true });
      }

      if (type === "credit_pack") {
        const packId = session.metadata?.packId;
        const pack = CREDIT_PACKS[packId];

        if (!pack) {
          console.error("Invalid pack ID:", packId);
          return res.json({ received: true });
        }

        const updatedUser = addCredits(email, pack.credits, `Stripe credit pack: ${packId}`, session.id);
        console.log(`Credits added: ${pack.credits} to ${updatedUser.email}. New balance: ${updatedUser.creditsLeft}`);
      }

      if (type === "subscription") {
        getUser(email);

        const updatedUser = updateUser(email, {
          plan: "pro",
          creditsLeft: PRO_PLAN.credits,
          proCreditsPerMonth: PRO_PLAN.credits,
          stripeCustomerId: session.customer,
          stripeSubscriptionId: session.subscription,
          proStartedAt: new Date().toISOString(),
          lastSubscriptionCreditAt: new Date().toISOString(),
        });

        savePayment(session.id, {
          id: session.id,
          email,
          creditsAdded: PRO_PLAN.credits,
          reason: "Stripe Pro subscription started",
          status: "processed",
          processedAt: new Date().toISOString(),
        });

        console.log("Pro subscription activated:", updatedUser.email);
      }
    }

    if (event.type === "invoice.paid") {
      const invoice = event.data.object;

      if (invoice.billing_reason !== "subscription_cycle") {
        return res.json({ received: true });
      }

      if (paymentAlreadyProcessed(invoice.id)) {
        return res.json({ received: true, duplicate: true });
      }

      const subscriptionId = invoice.subscription;
      const database = loadDatabase();

      const user = Object.values(database.users).find(
        (u) => u.stripeSubscriptionId === subscriptionId
      );

      if (!user) {
        console.error("No user found for subscription renewal:", subscriptionId);
        return res.json({ received: true });
      }

      updateUser(user.email, {
        plan: "pro",
        creditsLeft: PRO_PLAN.credits,
        lastSubscriptionCreditAt: new Date().toISOString(),
      });

      savePayment(invoice.id, {
        id: invoice.id,
        email: user.email,
        creditsAdded: PRO_PLAN.credits,
        reason: "Stripe Pro monthly renewal",
        status: "processed",
        processedAt: new Date().toISOString(),
      });

      console.log("Monthly Pro credits reset for:", user.email);
    }

    res.json({ received: true });
  } catch (error) {
    console.error("Stripe webhook handling error:", error);
    res.status(500).json({ error: "Webhook handling failed" });
  }
});

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Reply Coach AI backend is running.");
});

app.post("/login", (req, res) => {
  const email = normalizeEmail(req.body.email);

  if (!email || !email.includes("@")) {
    return res.status(400).json({ error: "Valid email is required" });
  }

  const user = getUser(email);

  res.json({
    email: user.email,
    creditsLeft: user.creditsLeft,
    plan: user.plan,
  });
});

app.post("/credits", (req, res) => {
  const email = normalizeEmail(req.body.email);

  if (!email || !email.includes("@")) {
    return res.status(400).json({ error: "Valid email is required" });
  }

  const user = getUser(email);

  res.json({
    email: user.email,
    creditsLeft: user.creditsLeft,
    plan: user.plan,
    costs: CREDIT_COSTS,
  });
});

app.post("/stripe/create-checkout-session", async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const { packId } = req.body;

    if (!email || !email.includes("@")) {
      return res.status(400).json({ error: "Valid email is required" });
    }

    const pack = CREDIT_PACKS[packId];

    if (!pack) {
      return res.status(400).json({ error: "Invalid credit pack" });
    }

    getUser(email);

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: email,
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `Reply Coach AI - ${pack.name}`,
            },
            unit_amount: pack.priceInCents,
          },
          quantity: 1,
        },
      ],
      metadata: {
        type: "credit_pack",
        email,
        packId,
      },
      success_url: `${APP_URL}/stripe/success`,
      cancel_url: `${APP_URL}/stripe/cancel`,
    });

    res.json({ checkoutUrl: session.url });
  } catch (error) {
    console.error("Stripe checkout error:", error);
    res.status(500).json({ error: "Could not start Stripe checkout" });
  }
});

app.post("/stripe/create-subscription-session", async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);

    if (!email || !email.includes("@")) {
      return res.status(400).json({ error: "Valid email is required" });
    }

    getUser(email);

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer_email: email,
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: PRO_PLAN.name,
            },
            unit_amount: PRO_PLAN.priceInCents,
            recurring: {
              interval: "month",
            },
          },
          quantity: 1,
        },
      ],
      metadata: {
        type: "subscription",
        email,
      },
      subscription_data: {
        metadata: {
          email,
          plan: "pro",
        },
      },
      success_url: `${APP_URL}/stripe/success`,
      cancel_url: `${APP_URL}/stripe/cancel`,
    });

    res.json({ checkoutUrl: session.url });
  } catch (error) {
    console.error("Stripe subscription error:", error);
    res.status(500).json({ error: "Could not start subscription checkout" });
  }
});

app.get("/stripe/success", (req, res) => {
  res.send(`
    <html>
      <body style="font-family: Arial; background:#111827; color:white; text-align:center; padding:40px;">
        <h1>Payment Successful</h1>
        <p>Your credits will update automatically.</p>
        <p>You can close this tab and reopen Reply Coach AI.</p>
      </body>
    </html>
  `);
});

app.get("/stripe/cancel", (req, res) => {
  res.send(`
    <html>
      <body style="font-family: Arial; background:#111827; color:white; text-align:center; padding:40px;">
        <h1>Payment Cancelled</h1>
        <p>No credits were added.</p>
      </body>
    </html>
  `);
});

app.post("/generate", async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const { message } = req.body;
    const cost = CREDIT_COSTS.reply;

    if (!email || !email.includes("@")) {
      return res.status(400).json({
        error: "Please log in with your email first.",
      });
    }

    if (!message) {
      return res.status(400).json({
        error: "Message is required",
      });
    }

    const user = getUser(email);

    if (!hasEnoughCredits(user, cost)) {
      return res.status(402).json({
        error: `Not enough credits. Reply Coach costs ${cost} credit.`,
        creditsLeft: user.creditsLeft,
      });
    }

    const response = await openai.responses.create({
      model: "gpt-5.4-mini",
      input: `
You are Reply Coach AI, an expert communication coach.

Create exactly 4 different improved replies.

Return ONLY valid JSON in this exact format:

{
  "replies": [
    {
      "style": "Confident & Direct",
      "reply": "The actual message the user can copy and send.",
      "why": "Short explanation of why this works."
    },
    {
      "style": "Warm & Friendly",
      "reply": "The actual message the user can copy and send.",
      "why": "Short explanation of why this works."
    },
    {
      "style": "Calm & Professional",
      "reply": "The actual message the user can copy and send.",
      "why": "Short explanation of why this works."
    },
    {
      "style": "Flirty & Playful",
      "reply": "The actual message the user can copy and send.",
      "why": "Short explanation of why this works."
    }
  ]
}

Rules:
- Keep the same core meaning
- Do not add fake details
- Do not sound robotic
- Do not be cheesy
- Keep flirty tasteful, not sexual or creepy
- The "reply" field should contain ONLY what the user would actually say
- No markdown
- No extra text outside the JSON

Original message:
"${message}"
`,
    });

    const parsed = JSON.parse(response.output_text);
    const charge = chargeCredits(email, cost, "reply");

    if (!charge.success) {
      return res.status(402).json({
        error: charge.error,
        creditsLeft: charge.user.creditsLeft,
      });
    }

    res.json({
      replies: parsed.replies,
      creditsLeft: charge.user.creditsLeft,
      plan: charge.user.plan,
      email: charge.user.email,
      cost,
    });
  } catch (error) {
    console.error("Error generating replies:", error);

    res.status(500).json({
      error: "Something went wrong generating the replies.",
    });
  }
});

app.post("/generate-template", async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const { type, details } = req.body;
    const cost = CREDIT_COSTS.template;

    if (!email || !email.includes("@")) {
      return res.status(400).json({
        error: "Please log in with your email first.",
      });
    }

    if (!details) {
      return res.status(400).json({
        error: "Template details are required.",
      });
    }

    const user = getUser(email);

    if (!hasEnoughCredits(user, cost)) {
      return res.status(402).json({
        error: `Not enough credits. Templates cost ${cost} credits.`,
        creditsLeft: user.creditsLeft,
      });
    }

    const templateLabel = getTemplateLabel(type);

    const response = await openai.responses.create({
      model: "gpt-5.4-mini",
      input: `
You are Reply Coach AI.

Write a polished professional message for this template type:
${templateLabel}

User details:
${details}

Rules:
- Make it clear, professional, and human.
- Do not add fake facts.
- Keep it realistic and usable.
- Include only the final message the user can copy/send.
- No markdown headings.
- No explanation.
`,
    });

    const charge = chargeCredits(email, cost, "template");

    if (!charge.success) {
      return res.status(402).json({
        error: charge.error,
        creditsLeft: charge.user.creditsLeft,
      });
    }

    res.json({
      output: response.output_text,
      creditsLeft: charge.user.creditsLeft,
      plan: charge.user.plan,
      email: charge.user.email,
      cost,
    });
  } catch (error) {
    console.error("Error generating template:", error);

    res.status(500).json({
      error: "Something went wrong generating the template.",
    });
  }
});

app.post("/coach-chat", async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const { messages } = req.body;
    const cost = CREDIT_COSTS.coach;

    if (!email || !email.includes("@")) {
      return res.status(400).json({
        error: "Please log in with your email first.",
      });
    }

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({
        error: "Coach messages are required.",
      });
    }

    const user = getUser(email);

    if (!hasEnoughCredits(user, cost)) {
      return res.status(402).json({
        error: `Not enough credits. Live Coach costs ${cost} credits per response.`,
        creditsLeft: user.creditsLeft,
      });
    }

    const conversationText = messages
      .map((message) => {
        const role = message.role === "assistant" ? "Coach" : "User";
        return `${role}: ${message.content}`;
      })
      .join("\n");

    const response = await openai.responses.create({
      model: "gpt-5.4-mini",
      input: `
You are Reply Coach AI Live Coach.

You are an interactive communication coach. The user is struggling with what to say or how to handle a conversation.

Your job:
- Listen carefully.
- Give practical communication advice.
- Help the user understand the best tone and strategy.
- When useful, give them exact wording they can copy.
- Keep your answer helpful, direct, and human.
- Do not be robotic.
- Do not write huge essays.
- Do not encourage insults, threats, harassment, or manipulation.
- If the situation involves safety, legal, housing, workplace, or money issues, suggest documenting facts and staying calm.

Conversation so far:
${conversationText}

Reply as the coach:
`,
    });

    const charge = chargeCredits(email, cost, "coach");

    if (!charge.success) {
      return res.status(402).json({
        error: charge.error,
        creditsLeft: charge.user.creditsLeft,
      });
    }

    res.json({
      reply: response.output_text,
      creditsLeft: charge.user.creditsLeft,
      plan: charge.user.plan,
      email: charge.user.email,
      cost,
    });
  } catch (error) {
    console.error("Error in coach chat:", error);

    res.status(500).json({
      error: "Something went wrong with Live Coach.",
    });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

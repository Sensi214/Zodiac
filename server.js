import "dotenv/config";
import express from "express";
import cors from "cors";
import Stripe from "stripe";

import { auraMap, tarotMap, getZodiac, getYearAnimal, getArrival } from "./lib/flameData.js";
import { generateArtifactCopy } from "./lib/openaiClient.js";
import {
  markSessionPaid,
  isSessionPaid,
  isSessionUsed,
  markSessionUsed
} from "./lib/tokenStore.js";

const app = express();

if (!process.env.STRIPE_SECRET_KEY) {
  console.error("Missing STRIPE_SECRET_KEY");
  process.exit(1);
}

if (!process.env.OPENAI_API_KEY) {
  console.error("Missing OPENAI_API_KEY");
  process.exit(1);
}

if (!process.env.WORDPRESS_URL) {
  console.error("Missing WORDPRESS_URL");
  process.exit(1);
}

if (!process.env.BASE_URL) {
  console.error("Missing BASE_URL");
  process.exit(1);
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const allowedOrigin = process.env.WORDPRESS_URL;

app.use("/webhook", express.raw({ type: "application/json" }));
app.use(express.json());
app.use(cors({
  origin: allowedOrigin,
  methods: ["GET", "POST"]
}));
app.use(express.static("public"));
app.use("/mockups", express.static("mockups"));

function validatePayload(body) {
  const { name, birthMonth, birthDay, birthYear, experience, tarotCard } = body;

  if (!name || typeof name !== "string") return "Invalid name.";
  if (!Number.isInteger(birthMonth) || birthMonth < 1 || birthMonth > 12) return "Invalid month.";
  if (!Number.isInteger(birthDay) || birthDay < 1 || birthDay > 31) return "Invalid day.";
  if (!Number.isInteger(birthYear) || birthYear < 1900 || birthYear > 2099) return "Invalid year.";
  if (!["aura", "zodiac", "tarot", "full_artifact"].includes(experience)) return "Invalid experience.";
  if (!tarotMap[tarotCard]) return "Invalid tarot card.";

  const d = new Date(birthYear, birthMonth - 1, birthDay);
  if (
    d.getFullYear() !== birthYear ||
    d.getMonth() !== birthMonth - 1 ||
    d.getDate() !== birthDay
  ) return "Invalid date.";

  return null;
}

function getMockup(experience, aura, zodiac) {
  if (experience === "aura") return `${process.env.BASE_URL}/mockups/aura-emerald.jpg`;
  if (experience === "zodiac") return `${process.env.BASE_URL}/mockups/zodiac-taurus.jpg`;
  if (experience === "tarot") return `${process.env.BASE_URL}/mockups/tarot-default.jpg`;
  return `${process.env.BASE_URL}/mockups/full-artifact.jpg`;
}

app.post("/api/create-checkout", async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: process.env.CURRENCY || "usd",
            product_data: {
              name: "Aura & Ember Full Flame Artifact"
            },
            unit_amount: Number(process.env.PRICE_CENTS || 1900)
          },
          quantity: 1
        }
      ],
      success_url: `${process.env.BASE_URL}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.WORDPRESS_URL}/your-artifact-page`
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not create checkout session." });
  }
});

app.post("/webhook", (req, res) => {
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      req.headers["stripe-signature"],
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("Webhook signature verification failed:", err.message);
    return res.sendStatus(400);
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    markSessionPaid(session.id);
  }

  res.sendStatus(200);
});

app.post("/api/render-flame", async (req, res) => {
  try {
    const validationError = validatePayload(req.body);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const sessionId = req.headers["x-flame-session-id"];
    if (!sessionId || !isSessionPaid(sessionId)) {
      return res.status(403).json({ error: "Payment required." });
    }

    if (isSessionUsed(sessionId)) {
      return res.status(403).json({ error: "This paid render has already been used." });
    }

    markSessionUsed(sessionId);

    const { name, birthMonth, birthDay, birthYear, experience, tarotCard } = req.body;

    const aura = auraMap[birthMonth];
    const zodiac = getZodiac(birthMonth, birthDay);
    const animal = getYearAnimal(birthYear);
    const tarot = tarotMap[tarotCard];

    const scentProfile =
      experience === "aura" ? aura.scent :
      experience === "zodiac" ? zodiac.scent :
      experience === "tarot" ? tarot.scent :
      [aura.scent[0], zodiac.scent[1], tarot.scent[2]];

    const copy = await generateArtifactCopy({
      name,
      birthMonth,
      birthDay,
      birthYear,
      experience,
      aura,
      zodiac,
      animal,
      tarot,
      scentProfile
    });

    res.json({
      mockupImage: getMockup(experience, aura, zodiac),
      arrival: getArrival(birthMonth, birthDay, birthYear),
      artifactTitle: copy.artifactTitle,
      identityLine: copy.identityLine,
      poeticReading: copy.poeticReading,
      scentProfile,
      aura: {
        title: aura.title,
        body: copy.auraBody
      },
      ember: {
        title: copy.emberTitle || `Year of the ${animal}`,
        body: copy.emberBody
      },
      arcana: {
        title: copy.arcanaTitle || tarot.title,
        body: copy.arcanaBody
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Render failed." });
  }
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  console.log(`Running on ${port}`);
});

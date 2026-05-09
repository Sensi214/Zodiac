import "dotenv/config";
import express from "express";
import cors from "cors";
import Stripe from "stripe";

import { generateArtifactCopy } from "./lib/openaiClient.js";
import { markSessionPaid, isSessionPaid, isSessionUsed, markSessionUsed } from "./lib/tokenStore.js";
import { auraMap, tarotMap, getZodiac, getYearAnimal, getArrival } from "./lib/flameData.js";

const app = express();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const allowedOrigin = process.env.WORDPRESS_URL;

const requestBuckets = new Map();

function rateLimit(req, res, next) {
  const ip = req.ip || req.headers["x-forwarded-for"] || "unknown";
  const now = Date.now();
  const windowMs = 60 * 1000;
  const limit = 30;

  const bucket = requestBuckets.get(ip) || { count: 0, start: now };
  if (now - bucket.start > windowMs) {
    bucket.count = 0;
    bucket.start = now;
  }

  bucket.count += 1;
  requestBuckets.set(ip, bucket);

  if (bucket.count > limit) {
    return res.status(429).json({ error: "Too many requests. Please wait a minute and try again." });
  }

  return next();
}

app.use("/webhook", express.raw({ type: "application/json" }));
app.use(express.json());
app.use(cors({ origin: allowedOrigin, methods: ["GET", "POST"] }));
app.use(express.static("public"));
app.use("/mockups", express.static("mockups"));
app.use(rateLimit);

function validatePayload(body) {
  const { name, birthMonth, birthDay, birthYear, experience, tarotCard } = body;
  if (!name || typeof name !== "string") return "Invalid name.";
  if (!Number.isInteger(birthMonth) || birthMonth < 1 || birthMonth > 12) return "Invalid month.";
  if (!Number.isInteger(birthDay) || birthDay < 1 || birthDay > 31) return "Invalid day.";
  if (!Number.isInteger(birthYear) || birthYear < 1900 || birthYear > 2099) return "Invalid year.";
  if (!["aura", "zodiac", "tarot", "full_artifact"].includes(experience)) return "Invalid experience.";
  if (!tarotMap[tarotCard]) return "Invalid tarot card.";
  const d = new Date(birthYear, birthMonth - 1, birthDay);
  if (d.getFullYear() !== birthYear || d.getMonth() !== birthMonth - 1 || d.getDate() !== birthDay) return "Invalid date.";
  return null;
}

function buildPositiveCardReading({ name, birthMonth, birthDay, birthYear, tarotCard }) {
  const aura = auraMap[birthMonth];
  const zodiac = getZodiac(birthMonth, birthDay);
  const animal = getYearAnimal(birthYear);
  const tarot = tarotMap[tarotCard];
  return {
    title: `${name}'s Affirmation Card`,
    tarotCard,
    identity: `${aura.title} • ${zodiac.sign} • ${animal}`,
    strengths: [
      `You naturally carry the ${aura.title} energy: ${aura.body}`,
      `Your ${zodiac.sign} nature supports your growth through ${zodiac.scent.join(", ")}.`,
      `As a ${animal}, your path is guided by resilience, momentum, and loyal instinct.`,
      `${tarot.title} reflects your positive direction: ${tarot.body}`
    ],
    affirmation: "You are aligned, evolving, and worthy of beautiful outcomes."
  };
}

function buildBirthdayGiftOptions({ recipientName, birthMonth, birthDay, birthYear }) {
  const aura = auraMap[birthMonth];
  const zodiac = getZodiac(birthMonth, birthDay);
  const animal = getYearAnimal(birthYear);
  return {
    recipientName,
    birthday: getArrival(birthMonth, birthDay, birthYear),
    options: [
      { code: "horoscope_glow", label: `${zodiac.sign} Horoscope Glow`, vibe: `A bright horoscope-led candle centered on ${zodiac.sign} harmony and confidence.`, scentProfile: zodiac.scent, positiveWords: ["Radiant", "Balanced", "Magnetic"] },
      { code: "birth_year_essence", label: `Year of the ${animal} Essence`, vibe: `A birth-year tribute candle inspired by ${animal} momentum and personal power.`, scentProfile: [aura.scent[0], "Amber", "Cedar"], positiveWords: ["Resilient", "Focused", "Evolving"] },
      { code: "star_alignment", label: `${aura.title} Star Alignment`, vibe: "An aura-and-stars alignment candle that celebrates their natural signature energy.", scentProfile: [aura.scent[0], zodiac.scent[1], "Soft Musk"], positiveWords: ["Grounded", "Luminous", "Loved"] }
    ]
  };
}

function buildMockupPreview({ name, birthMonth, birthDay, birthYear, tarotCard }) {
  const aura = auraMap[birthMonth];
  const zodiac = getZodiac(birthMonth, birthDay);
  const animal = getYearAnimal(birthYear);
  const tarot = tarotMap[tarotCard];
  return { name, mockupImage: `${process.env.BASE_URL}/mockups/full-artifact.jpg`, previewTitle: `${aura.title} Preview Candle`, previewLine: `${zodiac.sign} alignment with ${tarot.title}`, scentProfile: [aura.scent[0], zodiac.scent[1], tarot.scent[2]], upgradeMessage: "Buy now and unlock your upgraded personal card-selected reading tomorrow at no extra cost.", vibeTags: [zodiac.sign, animal, tarotCard] };
}

function getMockup(experience) {
  if (experience === "aura") return `${process.env.BASE_URL}/mockups/aura-emerald.jpg`;
  if (experience === "zodiac") return `${process.env.BASE_URL}/mockups/zodiac-taurus.jpg`;
  if (experience === "tarot") return `${process.env.BASE_URL}/mockups/tarot-default.jpg`;
  return `${process.env.BASE_URL}/mockups/full-artifact.jpg`;
}

app.get("/api/meta", (_req, res) => res.json({ experiences: ["aura", "zodiac", "tarot", "full_artifact"], tarotCards: Object.keys(tarotMap) }));
app.get("/health", (_req, res) => res.json({ ok: true }));
app.post("/api/mockup-preview", (req, res) => res.json(buildMockupPreview(req.body || {})));
app.post("/api/birthday-gift-options", (req, res) => res.json(buildBirthdayGiftOptions(req.body || {})));
app.post("/api/card-reading", (req, res) => res.json(buildPositiveCardReading(req.body || {})));

app.post("/api/create-checkout", async (_req, res) => {
  try {
    const session = await stripe.checkout.sessions.create({ mode: "payment", line_items: [{ price_data: { currency: process.env.CURRENCY || "usd", product_data: { name: "Aura & Ember Full Flame Artifact" }, unit_amount: Number(process.env.PRICE_CENTS || 1900) }, quantity: 1 }], success_url: `${process.env.BASE_URL}/success.html?session_id={CHECKOUT_SESSION_ID}`, cancel_url: `${process.env.WORDPRESS_URL}/your-artifact-page` });
    res.json({ url: session.url });
  } catch {
    res.status(500).json({ error: "Could not create checkout session." });
  }
});

app.post("/webhook", (req, res) => {
  try {
    const event = stripe.webhooks.constructEvent(req.body, req.headers["stripe-signature"], process.env.STRIPE_WEBHOOK_SECRET);
    if (event.type === "checkout.session.completed") markSessionPaid(event.data.object.id);
    res.sendStatus(200);
  } catch {
    res.sendStatus(400);
  }
});

app.post("/api/render-flame", async (req, res) => {
  try {
    const validationError = validatePayload(req.body);
    if (validationError) return res.status(400).json({ error: validationError });
    const sessionId = req.headers["x-flame-session-id"];
    if (!sessionId || !isSessionPaid(sessionId) || isSessionUsed(sessionId)) return res.status(403).json({ error: "Payment required or already used." });
    markSessionUsed(sessionId);
    const { name, birthMonth, birthDay, birthYear, experience, tarotCard } = req.body;
    const aura = auraMap[birthMonth]; const zodiac = getZodiac(birthMonth, birthDay); const animal = getYearAnimal(birthYear); const tarot = tarotMap[tarotCard];
    const scentProfile = experience === "aura" ? aura.scent : experience === "zodiac" ? zodiac.scent : experience === "tarot" ? tarot.scent : [aura.scent[0], zodiac.scent[1], tarot.scent[2]];
    const copy = await generateArtifactCopy({ name, birthMonth, birthDay, birthYear, experience, aura, zodiac, animal, tarot, scentProfile });
    res.json({ mockupImage: getMockup(experience), arrival: getArrival(birthMonth, birthDay, birthYear), artifactTitle: copy.artifactTitle, identityLine: copy.identityLine, poeticReading: copy.poeticReading, scentProfile });
  } catch {
    res.status(500).json({ error: "Render failed." });
  }
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log(`Running on ${port}`));

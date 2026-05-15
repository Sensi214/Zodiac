import "dotenv/config";
import express from "express";
import cors from "cors";
import Stripe from "stripe";

import { generateArtifactCopy } from "./lib/openaiClient.js";
import { markSessionPaid, isSessionPaid, isSessionUsed, markSessionUsed } from "./lib/tokenStore.js";
import { auraMap, tarotMap, getZodiac, getYearAnimal, getArrival } from "./lib/flameData.js";

const requiredEnv = ["STRIPE_SECRET_KEY", "OPENAI_API_KEY", "WORDPRESS_URL"];
const missingEnv = requiredEnv.filter((key) => !process.env[key]);
if (missingEnv.length) {
  console.error(`Missing required environment variables: ${missingEnv.join(", ")}`);
  process.exit(1);
}

const app = express();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const allowedOrigin = process.env.WORDPRESS_URL;
const configuredBaseUrl = process.env.BASE_URL || null;
const requestBuckets = new Map();
const analytics = {
  miniReadingRequests: 0,
  birthdayOfferRequests: 0,
  renderFlameRequests: 0,
  renderFlamePaid: 0,
  checkoutByType: { full_artifact: 0, mini_reading: 0 }
};

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

function validateDate(birthMonth, birthDay, birthYear) {
  const d = new Date(birthYear, birthMonth - 1, birthDay);
  return d.getFullYear() === birthYear && d.getMonth() === birthMonth - 1 && d.getDate() === birthDay;
}

function validatePayload(body) {
  const { name, birthMonth, birthDay, birthYear, experience, tarotCard } = body;
  if (!name || typeof name !== "string") return "Invalid name.";
  if (!Number.isInteger(birthMonth) || birthMonth < 1 || birthMonth > 12) return "Invalid month.";
  if (!Number.isInteger(birthDay) || birthDay < 1 || birthDay > 31) return "Invalid day.";
  if (!Number.isInteger(birthYear) || birthYear < 1900 || birthYear > 2099) return "Invalid year.";
  if (!["aura", "zodiac", "tarot", "full_artifact"].includes(experience)) return "Invalid experience.";
  if (!tarotMap[tarotCard]) return "Invalid tarot card.";
  if (!validateDate(birthMonth, birthDay, birthYear)) return "Invalid date.";

  return null;
}

function getBaseUrl(req) {
  return configuredBaseUrl || `${req.protocol}://${req.get("host")}`;
}

function getMockup(experience, req) {
  const base = getBaseUrl(req);
  if (experience === "aura") return `${base}/mockups/aura-emerald.jpg`;
  if (experience === "zodiac") return `${base}/mockups/zodiac-taurus.jpg`;
  if (experience === "tarot") return `${base}/mockups/tarot-default.jpg`;
  return `${base}/mockups/full-artifact.jpg`;
}

app.get("/api/meta", (_req, res) => {
  return res.json({ experiences: ["aura", "zodiac", "tarot", "full_artifact"], tarotCards: Object.keys(tarotMap) });
});

app.get("/health", (_req, res) => res.json({ ok: true }));

app.get("/api/admin/analytics", (req, res) => {
  if (req.query.key !== process.env.ADMIN_ANALYTICS_KEY) {
    return res.status(403).json({ error: "Forbidden" });
  }
  return res.json({ ...analytics, timestamp: new Date().toISOString() });
});

app.post("/api/mockup-preview", (req, res) => {
  const validationError = validatePayload({ ...req.body, experience: "full_artifact" });
  if (validationError) return res.status(400).json({ error: validationError });

  const { name, birthMonth, birthDay, birthYear, tarotCard } = req.body;
  const aura = auraMap[birthMonth];
  const zodiac = getZodiac(birthMonth, birthDay);
  const animal = getYearAnimal(birthYear);
  const tarot = tarotMap[tarotCard];

  return res.json({
    name,
    mockupImage: `${getBaseUrl(req)}/mockups/full-artifact.jpg`,
    previewTitle: `${aura.title} Preview Candle`,
    previewLine: `${zodiac.sign} alignment with ${tarot.title}`,
    scentProfile: [aura.scent[0], zodiac.scent[1], tarot.scent[2]],
    upgradeMessage: "Buy now and unlock your upgraded personal card-selected reading tomorrow at no extra cost.",
    vibeTags: [zodiac.sign, animal, tarotCard]
  });
});

app.post("/api/birthday-candle-offer", (req, res) => {
  analytics.birthdayOfferRequests += 1;
  const { recipientName, birthMonth, birthDay, birthYear, tarotCard } = req.body || {};
  const validationError = validatePayload({ name: recipientName, birthMonth, birthDay, birthYear, experience: "full_artifact", tarotCard });
  if (validationError) return res.status(400).json({ error: validationError });

  const aura = auraMap[birthMonth];
  const zodiac = getZodiac(birthMonth, birthDay);
  const animal = getYearAnimal(birthYear);

  return res.json({
    product: "birthday_candle",
    includedInMainFlow: true,
    recipientName,
    birthday: getArrival(birthMonth, birthDay, birthYear),
    candle: {
      title: `${zodiac.sign} Birthday Candle`,
      identity: `${aura.title} • ${zodiac.sign} • ${animal}`,
      scentProfile: [aura.scent[0], zodiac.scent[1], "Vanilla"]
    }
  });
});

app.post("/api/mini-reading-sale", async (req, res) => {
  analytics.miniReadingRequests += 1;
  const { name, birthMonth, birthDay, birthYear, tarotCard } = req.body || {};
  const validationError = validatePayload({ name, birthMonth, birthDay, birthYear, experience: "tarot", tarotCard });
  if (validationError) return res.status(400).json({ error: validationError });

  const aura = auraMap[birthMonth];
  const zodiac = getZodiac(birthMonth, birthDay);
  const animal = getYearAnimal(birthYear);
  const tarot = tarotMap[tarotCard];
  const scentProfile = [aura.scent[0], zodiac.scent[1], tarot.scent[2]];

  try {
    const copy = await generateArtifactCopy({ name, birthMonth, birthDay, birthYear, experience: "tarot", aura, zodiac, animal, tarot, scentProfile });

    return res.json({
      product: "mini_card_reading_sale",
      priceSuggestionCents: Number(process.env.MINI_READING_PRICE_CENTS || 700),
      reading: { card: tarot.title, summary: copy.poeticReading, identityLine: copy.identityLine },
      suggestedCandle: { title: copy.artifactTitle, scentProfile, aura: copy.auraBody, ember: copy.emberBody, arcana: copy.arcanaBody }
    });
  } catch (err) {
    console.error("mini-reading-sale error:", err);
    return res.status(500).json({ error: "Mini reading generation failed." });
  }
});

app.post("/api/create-checkout", async (req, res) => {
  const productType = req.body?.productType || "full_artifact";
  const fullPriceId = process.env.STRIPE_FULL_ARTIFACT_PRICE_ID;
  const miniPriceId = process.env.STRIPE_MINI_READING_PRICE_ID;

  try {
    const lineItems =
      productType === "mini_reading"
        ? [{ price: miniPriceId, quantity: 1 }]
        : [{ price: fullPriceId, quantity: 1 }];

    if (!lineItems[0].price) {
      return res.status(400).json({ error: `Missing Stripe price ID for ${productType}.` });
    }

    analytics.checkoutByType[productType] = (analytics.checkoutByType[productType] || 0) + 1;

const session = await stripe.checkout.sessions.create({
  mode: "payment",
  line_items: lineItems,
  allow_promotion_codes: true,
  success_url: `${process.env.WORDPRESS_URL}/aura-ember-artifact/?session_id={CHECKOUT_SESSION_ID}`,
  cancel_url: `${process.env.WORDPRESS_URL}/aura-ember-artifact/`,
  metadata: { productType }
});
  

    return res.json({ url: session.url });
  } catch (err) {
    console.error("create-checkout error:", err);
    return res.status(500).json({ error: "Could not create checkout session." });
  }
  return res.json({ ...analytics, timestamp: new Date().toISOString() });
});

app.post("/webhook", (req, res) => {
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    return res.status(503).json({ error: "Webhook secret not configured." });
  }
  try {
    const event = stripe.webhooks.constructEvent(req.body, req.headers["stripe-signature"], process.env.STRIPE_WEBHOOK_SECRET);
    if (event.type === "checkout.session.completed") markSessionPaid(event.data.object.id);
    return res.sendStatus(200);
  } catch (err) {
    console.error("webhook verification error:", err);
    return res.sendStatus(400);
  }
});

app.post("/api/render-flame", async (req, res) => {
  analytics.renderFlameRequests += 1;
  try {
    const validationError = validatePayload(req.body);
    if (validationError) return res.status(400).json({ error: validationError });

    const sessionId = req.headers["x-flame-session-id"];
    if (!sessionId || !isSessionPaid(sessionId)) return res.status(403).json({ error: "Payment required." });
    if (isSessionUsed(sessionId)) return res.status(403).json({ error: "This paid render has already been used." });

    analytics.renderFlamePaid += 1;
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

    const copy = await generateArtifactCopy({ name, birthMonth, birthDay, birthYear, experience, aura, zodiac, animal, tarot, scentProfile });

    return res.json({
      mockupImage: getMockup(experience, req),
      arrival: getArrival(birthMonth, birthDay, birthYear),
      artifactTitle: copy.artifactTitle,
      identityLine: copy.identityLine,
      poeticReading: copy.poeticReading,
      scentProfile,
      aura: { title: aura.title, body: copy.auraBody },
      ember: { title: copy.emberTitle || `Year of the ${animal}`, body: copy.emberBody },
      arcana: { title: copy.arcanaTitle || tarot.title, body: copy.arcanaBody }
    });
  } catch (err) {
    console.error("render-flame error:", err);
    return res.status(500).json({ error: "Render failed." });
  }
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log(`Running on ${port}`));

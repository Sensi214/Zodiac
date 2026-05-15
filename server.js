import "dotenv/config";
import express from "express";
import cors from "cors";
import Stripe from "stripe";
import OpenAI from "openai";

import {
  markSessionPaid,
  isSessionPaid,
  isSessionUsed,
  markSessionUsed
} from "./lib/tokenStore.js";

const requiredEnv = [
  "STRIPE_SECRET_KEY",
  "STRIPE_AURA_EMBER_PRICE_ID",
  "OPENAI_API_KEY",
  "WORDPRESS_URL"
];

const missingEnv = requiredEnv.filter((key) => !process.env[key]);

if (missingEnv.length) {
  console.error(`Missing required environment variables: ${missingEnv.join(", ")}`);
  process.exit(1);
}

const app = express();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const allowedOrigin = process.env.WORDPRESS_URL;
const baseUrl = process.env.BASE_URL || "";
const port = Number(process.env.PORT || 10000);

app.use("/webhook", express.raw({ type: "application/json" }));
app.use(express.json({ limit: "25mb" }));
app.use(cors({ origin: allowedOrigin, methods: ["GET", "POST"] }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "Aura & Ember Backend" });
});

function getZodiac(month, day) {
  const m = Number(month);
  const d = Number(day);

  if ((m === 1 && d >= 20) || (m === 2 && d <= 18)) return "Aquarius";
  if ((m === 2 && d >= 19) || (m === 3 && d <= 20)) return "Pisces";
  if ((m === 3 && d >= 21) || (m === 4 && d <= 19)) return "Aries";
  if ((m === 4 && d >= 20) || (m === 5 && d <= 20)) return "Taurus";
  if ((m === 5 && d >= 21) || (m === 6 && d <= 20)) return "Gemini";
  if ((m === 6 && d >= 21) || (m === 7 && d <= 22)) return "Cancer";
  if ((m === 7 && d >= 23) || (m === 8 && d <= 22)) return "Leo";
  if ((m === 8 && d >= 23) || (m === 9 && d <= 22)) return "Virgo";
  if ((m === 9 && d >= 23) || (m === 10 && d <= 22)) return "Libra";
  if ((m === 10 && d >= 23) || (m === 11 && d <= 21)) return "Scorpio";
  if ((m === 11 && d >= 22) || (m === 12 && d <= 21)) return "Sagittarius";
  if ((m === 12 && d >= 22) || (m === 1 && d <= 19)) return "Capricorn";

  return "Aries";
}

function validateManifestPayload(body) {
  const { ritualType, userProfile, tarotSelected } = body || {};

  if (!["standard", "birthday"].includes(ritualType)) {
    return "Invalid ritual type.";
  }

  if (!userProfile || typeof userProfile !== "object") {
    return "Missing user profile.";
  }

  const month = Number(userProfile.month);
  const day = Number(userProfile.day);
  const year = Number(userProfile.year);

  if (!month || month < 1 || month > 12) return "Invalid birth month.";
  if (!day || day < 1 || day > 31) return "Invalid birth day.";
  if (!year || year < 1900 || year > 2099) return "Invalid birth year.";
  if (!Array.isArray(tarotSelected) || tarotSelected.length < 1) return "Missing tarot cards.";

  return null;
}

function buildPrompts({ ritualType, userProfile, tarotSelected }) {
  const zodiac = userProfile.zodiac || getZodiac(userProfile.month, userProfile.day);

  const imagePrompt =
    ritualType === "birthday"
      ? `Luxury product photography of a premium matte black glass candle jar with no lid. White soy wax and one cotton wick. A single elegant gold-leaf label on the front reads "SOLAR RETURN: ${zodiac}". The label includes a radiant sunburst mandala. Dark obsidian background, warm golden glow, celestial birthday ritual aesthetic, high-end ecommerce candle photography, realistic, sharp focus.`
      : `Luxury product photography of a premium matte black glass candle jar with no lid. White soy wax and one cotton wick. Dual gold labels: front label reads "AURA: ${zodiac}" with small gold stars, secondary reflected label shows a gold mandala sigil with the year "${userProfile.year}". Dark marble background, warm golden glow, celestial manifestation aesthetic, high-end ecommerce candle photography, realistic, sharp focus.`;

 const prompt = `
Create a luxury spiritual candle reading.

Allowed fragrance notes ONLY:
Mango, Cinnamon, Lavender, Eucalyptus, Lemon, Grapefruit, Orange, Vanilla, Sandalwood.

Choose EXACTLY 3 fragrance notes from that list.

Return JSON:
{
  "candle_name": "",
  "meaning": "",
  "signature": "",
  "aura_desc": "",
  "ember_desc": "",
  "fragrance_notes": "",
  "horoscope": "",
  "insight": ""
}
`;

Ritual type: ${ritualType}
Birth date: ${userProfile.month}/${userProfile.day}/${userProfile.year}
Zodiac: ${zodiac}
Tarot cards drawn: ${tarotSelected.join(", ")}

Return valid JSON only. No markdown.

Schema:
{
  "candle_name": "Unique luxury candle name",
  "meaning": "A 3 sentence mystical reading blending birth energy and tarot guidance.",
  "signature": "A short poetic signature line.",
  "aura_desc": "A short explanation of the customer's zodiac/birth energy.",
  "ember_desc": "A short explanation of the birth year, rebirth theme, or ritual theme.",
  "fragrance_notes": "NOTE 1, NOTE 2, NOTE 3",
  "horoscope": "A mystical personal horoscope for this ritual moment.",
  "insight": "One short cosmic advice line.",
  "product_summary": "A short ecommerce-friendly summary of what this candle represents."
}
`;

  return { imagePrompt, textPrompt, zodiac };
}

app.post("/api/create-checkout", async (req, res) => {
  try {
    const validationError = validateManifestPayload(req.body);

    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const { ritualType, userProfile, tarotSelected } = req.body;
    const zodiac = userProfile.zodiac || getZodiac(userProfile.month, userProfile.day);

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price: process.env.STRIPE_AURA_EMBER_PRICE_ID,
          quantity: 1
        }
      ],
      success_url: `${process.env.WORDPRESS_URL}/aura-ember-artifact/?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.WORDPRESS_URL}/aura-ember-artifact/`,
      allow_promotion_codes: true,
      metadata: {
        ritualType,
        zodiac,
        birthMonth: String(userProfile.month),
        birthDay: String(userProfile.day),
        birthYear: String(userProfile.year),
        tarotCards: tarotSelected.join(", ")
      }
    });

    return res.json({ url: session.url });
  } catch (error) {
    console.error("create-checkout error:", error);
    return res.status(500).json({ error: "Could not create checkout session." });
  }
});

app.post("/api/manifest-final", async (req, res) => {
  try {
    const sessionId = req.headers["x-aura-session-id"] || req.body?.sessionId;

    if (!sessionId) {
      return res.status(403).json({ error: "Missing paid session." });
    }

    if (!isSessionPaid(sessionId)) {
      return res.status(403).json({ error: "Payment required." });
    }

    if (isSessionUsed(sessionId)) {
      return res.status(403).json({ error: "This paid manifestation has already been used." });
    }

    const validationError = validateManifestPayload(req.body);

    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    markSessionUsed(sessionId);

    const { ritualType, userProfile, tarotSelected } = req.body;
    const { imagePrompt, textPrompt, zodiac } = buildPrompts({
      ritualType,
      userProfile,
      tarotSelected
    });

    const textResult = await openai.responses.create({
      model: "gpt-4.1-mini",
      input: textPrompt
    });

    let info;

    try {
      info = JSON.parse(textResult.output_text);
    } catch {
      info = {
        candle_name: "The Celestial Ember Candle",
        meaning: textResult.output_text || "Your candle has been revealed through your birth energy and chosen cards.",
        signature: "A flame written in your stars.",
        aura_desc: `${zodiac} carries the aura of this ritual.`,
        ember_desc: `Your year ${userProfile.year} anchors the ember of your path.`,
        fragrance_notes: "VANILLA, SANDALWOOD, AMBER",
        horoscope: "Your energy is entering a moment of alignment, release, and renewed intention.",
        insight: "Trust the flame that keeps returning.",
        product_summary: "A personalized ritual candle created from your birth energy and tarot path."
      };
    }

    const imageResult = await openai.images.generate({
      model: "gpt-image-1",
      prompt: imagePrompt,
      size: "1024x1024"
    });

    const imageBase64 = imageResult?.data?.[0]?.b64_json;

    if (!imageBase64) {
      return res.status(500).json({ error: "Image generation failed." });
    }

    return res.json({
      paid: true,
      sessionId,
      zodiac,
      ritualType,
      imageUrl: `data:image/png;base64,${imageBase64}`,
      info
    });
  } catch (error) {
    console.error("manifest-final error:", error);
    return res.status(500).json({ error: "Manifestation failed." });
  }
});

app.post("/webhook", (req, res) => {
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    return res.sendStatus(200);
  }

  try {
    const event = stripe.webhooks.constructEvent(
      req.body,
      req.headers["stripe-signature"],
      process.env.STRIPE_WEBHOOK_SECRET
    );

    if (event.type === "checkout.session.completed") {
      markSessionPaid(event.data.object.id);
    }

    return res.sendStatus(200);
  } catch (error) {
    console.error("webhook error:", error.message);
    return res.sendStatus(400);
  }
});

app.listen(port, () => {
  console.log(`Aura & Ember backend running on ${port}`);
  console.log(`Base URL: ${baseUrl}`);
});

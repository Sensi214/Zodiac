import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function generateArtifactCopy({
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
}) {
  const prompt = `
You are writing a premium candle artifact profile for Aura & Ember.

User:
- Name: ${name}
- Birth date: ${birthMonth}/${birthDay}/${birthYear}
- Experience: ${experience}

Locked material:
- Aura title: ${aura.title}
- Aura body: ${aura.body}
- Zodiac sign: ${zodiac.sign}
- Year animal: ${animal}
- Tarot title: ${tarot.title}
- Tarot body: ${tarot.body}
- Final scent profile: ${scentProfile.join(", ")}

Rules:
- Elegant, restrained, premium
- No slang
- No cheesy fantasy language
- Artifact title should feel like: The Verdant Monolith, The Velvet Convergence, The Luminous Axis
- Identity line = exactly 3 short words separated by bullets
- Poetic reading = 2 to 4 sentences
- Aura body = 2 premium sentences
- Ember body = 2 premium sentences
- Arcana body = 2 premium sentences
`;

  const response = await client.responses.create({
    model: "gpt-4.1-mini",
    input: prompt,
    text: {
      format: {
        type: "json_schema",
        name: "flame_artifact",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            artifactTitle: { type: "string" },
            identityLine: { type: "string" },
            poeticReading: { type: "string" },
            auraBody: { type: "string" },
            emberTitle: { type: "string" },
            emberBody: { type: "string" },
            arcanaTitle: { type: "string" },
            arcanaBody: { type: "string" }
          },
          required: ["artifactTitle", "identityLine", "poeticReading", "auraBody", "emberTitle", "emberBody", "arcanaTitle", "arcanaBody"]
        }
      }
    }
  });

  return JSON.parse(response.output_text);
}

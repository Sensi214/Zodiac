import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function generateArtifactCopy(input) {
  const prompt = `Name: ${input.name}`;
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
            poeticReading: { type: "string" }
          },
          required: ["artifactTitle", "identityLine", "poeticReading"]
        }
      }
    }
  });

  return JSON.parse(response.output_text);
}

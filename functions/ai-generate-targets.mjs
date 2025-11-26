import OpenAI from "openai";

export const config = { path: "/.netlify/functions/ai-generate-targets" };

export async function handler(event) {
  try {
    const { age, interests } = JSON.parse(event.body || "{}");
    if (!age || !Array.isArray(interests)) {
      return { statusCode: 400, body: JSON.stringify({ error: "age (number) and interests (string[]) required" }) };
    }
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const prompt = `
You are a child development and educational expert. Generate a list of 5-7 appropriate, positive, and engaging tasks or challenges for a child of ${age} years old. The child's interests are: ${interests.join(", ")}.
Categorize them into: "Daily Chores", "Learning Goals", "Creative Challenges", and "Acts of Kindness".
For each task, provide: { category, title, description }.
Return strict JSON: { tasks: Array<{category:string,title:string,description:string}> }.
    `;

    const resp = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.7,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" }
    });

    return { statusCode: 200, body: resp.choices[0].message.content };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: String(e) }) };
  }
}

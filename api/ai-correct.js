export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    // Read env vars (set in Vercel)
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    const ADMIN_CODE = process.env.ADMIN_CODE; // your secret code
    const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

    if (!OPENAI_API_KEY) return res.status(500).json({ error: "Missing OPENAI_API_KEY" });
    if (!ADMIN_CODE) return res.status(500).json({ error: "Missing ADMIN_CODE" });

    const { text, languageHint, code } = req.body || {};

    // Check secret code
    if (!code || code !== ADMIN_CODE) {
      return res.status(401).json({ error: "Invalid access code" });
    }

    if (typeof text !== "string" || text.trim().length === 0) {
      return res.status(400).json({ error: "Missing text" });
    }

    // Keep cost under control (optional safety)
    if (text.length > 12000) {
      return res.status(400).json({ error: "Text too long (max 12,000 characters)" });
    }

    const system = `
You are a professional proofreader.
Correct spelling, grammar, punctuation, and word choices.
Keep the original meaning. Preserve line breaks and bullet points.
Do not add new information.
Return ONLY JSON like:
{"correctedText":"..."}
`.trim();

    const user = `LANGUAGE_HINT: ${languageHint || "auto"}\nTEXT:\n${text}`;

    // OpenAI Responses API
    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: MODEL,
        input: [
          { role: "system", content: system },
          { role: "user", content: user }
        ],
        temperature: 0.2
      })
    });

    if (!r.ok) {
      const errText = await r.text().catch(() => "");
      return res.status(500).json({ error: `OpenAI error ${r.status}: ${errText}` });
    }

    const data = await r.json();

    // Try to get text out in a tolerant way:
    const outputText =
      data.output_text ||
      (Array.isArray(data.output)
        ? data.output.flatMap(o => o.content || []).map(c => c.text).filter(Boolean).join("\n")
        : "");

    let parsed;
    try {
      parsed = JSON.parse(outputText);
    } catch {
      // fallback: try to find JSON block
      const m = outputText.match(/\{[\s\S]*\}/);
      if (!m) return res.status(500).json({ error: "Model did not return JSON", raw: outputText });
      parsed = JSON.parse(m[0]);
    }

    if (!parsed.correctedText) {
      return res.status(500).json({ error: "Missing correctedText", raw: parsed });
    }

    return res.status(200).json({ correctedText: parsed.correctedText });

  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
}

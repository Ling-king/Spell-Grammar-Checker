export default async function handler(req, res) {
  // CORS (valfritt men bra)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    const ADMIN_CODE = process.env.ADMIN_CODE;

    // Byt modell här om du vill (gpt-4o-mini brukar funka)
    const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

    if (!OPENAI_API_KEY) {
      console.error("Missing OPENAI_API_KEY in env");
      return res.status(500).json({ error: "Missing OPENAI_API_KEY in Vercel env" });
    }
    if (!ADMIN_CODE) {
      console.error("Missing ADMIN_CODE in env");
      return res.status(500).json({ error: "Missing ADMIN_CODE in Vercel env" });
    }

    const { text, languageHint, code } = req.body || {};

    if (!code || code !== ADMIN_CODE) {
      return res.status(401).json({ error: "Invalid access code" });
    }

    if (typeof text !== "string" || text.trim().length === 0) {
      return res.status(400).json({ error: "Missing text" });
    }

    if (text.length > 12000) {
      return res.status(400).json({ error: "Text too long (max 12,000 characters)" });
    }

    const system =
      "You are a professional proofreader. Correct spelling, grammar, punctuation, and word choices. " +
      "Keep the original meaning. Preserve line breaks and bullet points. Do not add new information. " +
      'Return ONLY a JSON object like: {"correctedText":"..."}';

    const payload = {
      model: MODEL,
      input: [
        { role: "system", content: system },
        { role: "user", content: `Language hint: ${languageHint || "auto"}\n\nTEXT:\n${text}` }
      ],
      temperature: 0.2
    };

    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const raw = await r.text();

    // Försök tolka JSON, annars behåll råtext
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      data = { raw };
    }

    if (!r.ok) {
      // ✅ Här får du EXAKT varför (quota/invalid key/model etc)
      console.error("OpenAI error:", r.status, data);
      return res.status(r.status).json({
        error: "OpenAI request failed",
        status: r.status,
        details: data
      });
    }

    const out =
      data?.output_text ||
      data?.output?.[0]?.content?.[0]?.text ||
      "";

    return res.status(200).json({ correctedText: out });

  } catch (e) {
    console.error("Server crash:", e);
    return res.status(500).json({
      error: "Server crash",
      message: String(e?.message || e)
    });
  }
}

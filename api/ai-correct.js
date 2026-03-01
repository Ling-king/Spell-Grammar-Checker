export default async function handler(req, res) {
  // CORS (safe)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;     // can be sk-proj-...
    const OPENAI_PROJECT_ID = process.env.OPENAI_PROJECT_ID; // proj_...
    const ADMIN_CODE = process.env.ADMIN_CODE;             // your secret code
    const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

    if (!OPENAI_API_KEY) {
      console.error("Missing OPENAI_API_KEY in Vercel env");
      return res.status(500).json({ error: "Missing OPENAI_API_KEY in Vercel env" });
    }
    if (!ADMIN_CODE) {
      console.error("Missing ADMIN_CODE in Vercel env");
      return res.status(500).json({ error: "Missing ADMIN_CODE in Vercel env" });
    }

    // If you have sk-proj key, you should also set OPENAI_PROJECT_ID
    if (String(OPENAI_API_KEY).startsWith("sk-proj-") && !OPENAI_PROJECT_ID) {
      console.error("Using sk-proj key but missing OPENAI_PROJECT_ID");
      return res.status(500).json({
        error: "Missing OPENAI_PROJECT_ID in Vercel env (required for sk-proj keys)"
      });
    }

    const { text, languageHint, code } = req.body || {};

    // Make debugging visible in Runtime Logs (errors tab)
    console.error("Incoming code:", JSON.stringify(code));
    console.error("Env ADMIN_CODE:", JSON.stringify(ADMIN_CODE));

    if (!code || String(code) !== String(ADMIN_CODE)) {
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

    const headers = {
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    };

    // ✅ IMPORTANT for sk-proj keys:
    if (OPENAI_PROJECT_ID) headers["OpenAI-Project"] = OPENAI_PROJECT_ID;

    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers,
      body: JSON.stringify(payload)
    });

    const raw = await r.text();
    let data;
    try { data = JSON.parse(raw); } catch { data = { raw }; }

    if (!r.ok) {
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
    return res.status(500).json({ error: "Server crash", message: String(e?.message || e) });
  }
}

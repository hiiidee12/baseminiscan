export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ ok: false, error: "Missing GEMINI_API_KEY" });
  }

  try {
    const body = req.body || {};
    const message = String(body.message || "").trim();
    const context = body.context ?? null;
    const history = Array.isArray(body.history) ? body.history : [];

    if (!message) {
      return res.status(400).json({ ok: false, error: "Missing message" });
    }

    const safeMessage = message.slice(0, 3000);

    let safeContext = null;
    try {
      const raw = JSON.stringify(context ?? null);
      safeContext =
        raw.length <= 30000
          ? context ?? null
          : { note: "context too large", address: context?.address || null };
    } catch {
      safeContext = null;
    }

    const trimmedHistory = history.slice(-8).map((m) => ({
      role: m?.role === "assistant" ? "model" : "user",
      parts: [{ text: String(m?.text || "").slice(0, 2000) }],
    }));

    const systemText =
      "You are an assistant for a Base chain explorer mini app. " +
      "Answer in English. Be factual, concise, and cautious. " +
      "If data is limited, say 'limited data'. " +
      "Do not invent transactions or labels. Use only the provided context.";

    const userPrompt =
      `User message:\n${safeMessage}\n\n` +
      `Explorer context:\n${JSON.stringify(safeContext)}\n\n` +
      "Output rules:\n- 4–8 bullet points\n- If an address is present, include it in the first bullet\n- No hype";

    const contents = [
      ...trimmedHistory,
      { role: "user", parts: [{ text: `${systemText}\n\n${userPrompt}` }] },
    ];

    const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";

    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents,
          generationConfig: { temperature: 0.2, maxOutputTokens: 400 },
        }),
      }
    );

    const j = await r.json().catch(() => null);

    if (!r.ok) {
      return res.status(r.status).json({ ok: false, error: "Gemini error", detail: j });
    }

    const reply =
      j?.candidates?.[0]?.content?.parts?.map((p) => p?.text || "").join("").trim() ||
      "";

    return res.status(200).json({ ok: true, reply });
  } catch {
    return res.status(500).json({ ok: false, error: "Server error" });
  }
}

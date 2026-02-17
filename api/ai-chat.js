const GEMINI_KEYS = [
  process.env.GEMINI_API_KEY,
  process.env.GEMINI_API_KEY_2,
].filter(Boolean);

function getAvailableKeys() {
  return [...GEMINI_KEYS].sort(() => Math.random() - 0.5);
}

async function callGeminiWithRotation({ model, contents, temperature, maxOutputTokens }) {
  if (!GEMINI_KEYS.length) return { ok: false, status: 0, json: null };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const keysToTry = getAvailableKeys();
  let lastError = { ok: false, status: 0, json: null };

  for (const apiKey of keysToTry) {
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents,
          generationConfig: { temperature, maxOutputTokens },
        }),
      });

      const j = await r.json().catch(() => null);

      if (r.ok) return { ok: true, status: r.status, json: j };

      if (r.status === 429 || r.status === 503 || r.status === 500) {
        lastError = { ok: false, status: r.status, json: j };
        continue;
      }

      return { ok: false, status: r.status, json: j };
    } catch (e) {
      lastError = { ok: false, status: 0, json: { error: e.message } };
      continue;
    }
  }

  return lastError;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, max-age=0");

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const body = req.body || {};
    const message = String(body.message || "").trim();
    const context = body.context ?? null;
    const history = Array.isArray(body.history) ? body.history : [];

    if (!message) {
      return res.status(400).json({ ok: false, error: "Missing message" });
    }

    const address = (context && typeof context === "object" && context.address) || null;

    if (address && /^0x[a-fA-F0-9]{40}$/.test(String(address))) {
      const farcasterUsername = (context && context.farcasterUsername) || null;
      const neynarScoreRaw = context?.neynarScore !== undefined ? context.neynarScore : null;
      const balanceEthRaw = context?.balanceEth !== undefined ? context.balanceEth : null;
      const balanceWeiRaw = context?.balanceWei !== undefined ? context.balanceWei : null;

      const safeFarcaster = farcasterUsername ? String(farcasterUsername) : "Data not available";

      const safeNeynar = (neynarScoreRaw === null || neynarScoreRaw === "")
        ? "Data not available"
        : String(neynarScoreRaw);

      let safeBalance = "Data not available";
      if (balanceEthRaw !== null && balanceEthRaw !== undefined && balanceEthRaw !== "") {
        safeBalance = `${String(balanceEthRaw)} ETH`;
      } else if (balanceWeiRaw !== null && balanceWeiRaw !== undefined && balanceWeiRaw !== "") {
        try {
          const w = BigInt(String(balanceWeiRaw));
          const base = 10n ** 18n;
          const intPart = w / base;
          const fracPart = w % base;
          const frac6 = (fracPart / 10n ** 12n).toString().padStart(6, "0");
          safeBalance = `${intPart.toString()}.${frac6} ETH`;
        } catch (e) {
          console.error("Wei conversion error:", e);
        }
      }

      const lines = [
        `💳 Farcaster: ${safeFarcaster}`,
        `🧬 Neynar Score: ${safeNeynar}`,
        `💰 Balance: ${safeBalance}`,
      ];

      const toNum = (v) => {
        if (v === null || v === undefined || v === "") return null;
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
      };

      const neynarScoreNum = toNum(neynarScoreRaw);

      let balanceEthNum = toNum(balanceEthRaw);
      if ((balanceEthNum === null) && balanceWeiRaw) {
        try {
          const w = BigInt(String(balanceWeiRaw));
          const base = 10n ** 18n;
          const intPart = Number(w / base);
          const fracPart = Number(w % base);
          balanceEthNum = intPart + (fracPart / Number(base));
        } catch {}
      }

      const summary = [];

      if (balanceEthNum !== null) {
        if (balanceEthNum < 0.001) summary.push("Low retained balance");
        else if (balanceEthNum < 0.01) summary.push("Modest retained balance");
        else summary.push("Meaningful retained balance");
      }

      if (neynarScoreNum !== null) {
        if (neynarScoreNum >= 0.75) summary.push("Strong social signal");
        else if (neynarScoreNum >= 0.5) summary.push("Average social signal");
        else summary.push("Weak social signal");
      }

      if (summary.length) {
        lines.push("", "🧠 Analysis Summary");
        summary.forEach(s => lines.push(`• ${s}`));
      }

      return res.status(200).json({ ok: true, reply: lines.join("\n"), type: "scan_result" });
    }

    if (!GEMINI_KEYS.length) {
      return res.status(200).json({ ok: true, reply: "AI service currently unavailable.", type: "error" });
    }

    const safeMessage = message.slice(0, 3000);

    const trimmedHistory = history.slice(-8).map((m) => ({
      role: m?.role === "assistant" ? "model" : "user",
      parts: [{ text: String(m?.text || "").slice(0, 2000) }],
    }));

    const systemInstruction =
      "You are an assistant for a Base Mini Scan. " +
      "Respond in the same language as the user (English or Indonesian). " +
      "You are a crypto expert. If price/data is provided in context, use it strictly. " +
      "Do not mention 'Coingecko' or 'cached' explicitly unless asked. " +
      "Keep answers concise and factual.";

    const contents = [
      ...trimmedHistory,
      { role: "user", parts: [{ text: `${systemInstruction}\n\nUser Question: ${safeMessage}` }] },
    ];

    const model = process.env.GEMINI_MODEL || "gemini-1.5-flash-exp";

    const out = await callGeminiWithRotation({
      model,
      contents,
      temperature: 0.2,
      maxOutputTokens: 750,
    });

    if (!out.ok) {
      console.warn(`Gemini API failed: ${out.status}`);
      return res.status(200).json({ ok: true, reply: "Unable to process AI request at this moment.", type: "error" });
    }

    const reply =
      out.json?.candidates?.[0]?.content?.parts?.map((p) => p?.text || "").join("").trim() ||
      "No response generated.";

    return res.status(200).json({ ok: true, reply, type: "ai_response" });
  } catch (err) {
    console.error("Handler error:", err);
    return res.status(500).json({ ok: false, error: "Internal server error" });
  }
}

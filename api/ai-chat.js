const GEMINI_KEYS = [
  process.env.GEMINI_API_KEY,
  process.env.GEMINI_API_KEY_2,
].filter(Boolean);

let __geminiKeyIndex = 0;

function pickGeminiKey() {
  if (!GEMINI_KEYS.length) return null;
  const k = GEMINI_KEYS[__geminiKeyIndex % GEMINI_KEYS.length];
  __geminiKeyIndex = (__geminiKeyIndex + 1) % GEMINI_KEYS.length;
  return k;
}

async function callGeminiWithRotation({ model, contents, temperature, maxOutputTokens }) {
  if (!GEMINI_KEYS.length) return { ok: false, status: 0, json: null };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  let last = { ok: false, status: 0, json: null };

  for (let attempt = 0; attempt < GEMINI_KEYS.length; attempt++) {
    const apiKey = pickGeminiKey();

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

    if (r.status === 429 || r.status === 503) {
      last = { ok: false, status: r.status, json: j };
      continue;
    }

    return { ok: false, status: r.status, json: j };
  }

  return last;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

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

    // ===== deterministic scan output =====
    const address = (context && typeof context === "object" && context.address) || null;

    if (address && /^0x[a-fA-F0-9]{40}$/.test(String(address))) {
      const farcasterUsername = (context && context.farcasterUsername) || null;

      const neynarScoreRaw =
        context && context.neynarScore !== undefined ? context.neynarScore : null;

      const balanceEthRaw =
        context && context.balanceEth !== undefined ? context.balanceEth : null;

      const balanceWeiRaw =
        context && context.balanceWei !== undefined ? context.balanceWei : null;

      const txCountRaw =
        context && context.txCount !== undefined ? context.txCount : null;

      const safeFarcaster = farcasterUsername ? String(farcasterUsername) : "Data not available";

      const safeNeynar =
        neynarScoreRaw === null || neynarScoreRaw === undefined || neynarScoreRaw === ""
          ? "Data not available"
          : String(neynarScoreRaw);

      let safeBalance = "Data not available";
      if (balanceEthRaw !== null && balanceEthRaw !== undefined && balanceEthRaw !== "") {
        safeBalance = `${String(balanceEthRaw)} ETH`;
      } else if (balanceWeiRaw !== null && balanceWeiRaw !== undefined) {
        try {
          const w = BigInt(String(balanceWeiRaw));
          const base = 10n ** 18n;
          const intPart = w / base;
          const fracPart = w % base;
          const frac6 = (fracPart / 10n ** 12n).toString().padStart(6, "0");
          safeBalance = `${intPart.toString()}.${frac6} ETH`;
        } catch {}
      }

      const safeTx =
        txCountRaw === null || txCountRaw === undefined || txCountRaw === ""
          ? "Data not available"
          : String(txCountRaw);

      const lines = [
        `💳 Farcaster: ${safeFarcaster}`,
        `🧬 Neynar: ${safeNeynar}`,
        `💰 Balance: ${safeBalance}`,
        `📑 Total TX: ${safeTx}`,
      ];

      // ===== summary (deterministic) =====
      const toNum = (v) => {
        if (v === null || v === undefined || v === "") return null;
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
      };

      const neynarScoreNum = toNum(neynarScoreRaw);
      const balanceEthNum = toNum(balanceEthRaw);
      const txCountNum = toNum(txCountRaw);

      // parse balance from wei if balanceEth missing
      let balanceEthParsed = balanceEthNum;
      if (
        (balanceEthParsed === null || balanceEthParsed === undefined) &&
        balanceWeiRaw !== null &&
        balanceWeiRaw !== undefined &&
        balanceWeiRaw !== ""
      ) {
        try {
          const w = BigInt(String(balanceWeiRaw));
          const base = 10n ** 18n;
          const intPart = w / base;
          const fracPart = w % base;
          // keep 6 decimals for numeric comparison
          const frac6 = Number(fracPart / 10n ** 12n) / 1e6; // 0..0.999999
          balanceEthParsed = Number(intPart) + frac6;
        } catch {}
      }

      const summary = [];

      // Activity level (TX)
      if (txCountNum !== null) {
        if (txCountNum >= 1000) summary.push("High transaction activity");
        else if (txCountNum >= 200) summary.push("Moderate transaction activity");
        else summary.push("Low transaction activity");
      }

      // Balance level
      if (balanceEthParsed !== null && balanceEthParsed !== undefined) {
        if (balanceEthParsed < 0.01) summary.push("Low retained balance");
        else if (balanceEthParsed < 0.1) summary.push("Modest retained balance");
        else summary.push("Meaningful retained balance");
      }

      // Social (Neynar) as soft signal
      if (neynarScoreNum !== null) {
        if (neynarScoreNum >= 0.7) summary.push("Strong social signal");
        else if (neynarScoreNum >= 0.4) summary.push("Average social signal");
        else summary.push("Weak social signal");
      }

      if (summary.length) {
        lines.push("");
        lines.push("🧠 Summary");
        for (const s of summary) {
          lines.push(`• ${s}`);
        }
      }
      // ===== END summary =====

      return res.status(200).json({ ok: true, reply: lines.join("\n") });
    }

    // ===== Gemini for non-scan questions (ROTATING KEYS) =====
    if (!GEMINI_KEYS.length) {
      return res.status(200).json({ ok: true, reply: "Data not available." });
    }

    const safeMessage = message.slice(0, 3000);

    const trimmedHistory = history.slice(-8).map((m) => ({
      role: m?.role === "assistant" ? "model" : "user",
      parts: [{ text: String(m?.text || "").slice(0, 2000) }],
    }));

    const systemText =
      "You are an assistant for a Base Mini Scan. " +
      "Respond in clean, simple English. " +
      "Do not invent data. If data is missing, say: Data not available.";

    const userPrompt = `User message:\n${safeMessage}\n\nRules:\n- Short answer\n- No hype`;

    const contents = [
      ...trimmedHistory,
      { role: "user", parts: [{ text: `${systemText}\n\n${userPrompt}` }] },
    ];

    const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";

    const out = await callGeminiWithRotation({
      model,
      contents,
      temperature: 0.2,
      maxOutputTokens: 250,
    });

    if (!out.ok) {
      return res.status(200).json({ ok: true, reply: "Data not available." });
    }

    const j = out.json;

    const reply =
      j?.candidates?.[0]?.content?.parts?.map((p) => p?.text || "").join("").trim() ||
      "Data not available.";

    return res.status(200).json({ ok: true, reply });
  } catch {
    return res.status(200).json({ ok: true, reply: "Data not available." });
  }
}

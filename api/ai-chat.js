export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const apiKey = process.env.GEMINI_API_KEY;

  try {
    const body = req.body || {};
    const message = String(body.message || "").trim();
    const context = body.context ?? null;
    const history = Array.isArray(body.history) ? body.history : [];

    if (!message) {
      return res.status(400).json({ ok: false, error: "Missing message" });
    }

    // ===== deterministic scan output =====
    const address =
      (context && typeof context === "object" && context.address) || null;

    if (address && /^0x[a-fA-F0-9]{40}$/.test(String(address))) {
      const farcasterUsername =
        (context && context.farcasterUsername) || null;

      const neynarScoreRaw =
        context && context.neynarScore !== undefined ? context.neynarScore : null;

      const balanceEthRaw =
        context && context.balanceEth !== undefined ? context.balanceEth : null;

      const balanceWeiRaw =
        context && context.balanceWei !== undefined ? context.balanceWei : null;

      const txCountRaw =
        context && context.txCount !== undefined ? context.txCount : null;

      const safeFarcaster =
        farcasterUsername ? String(farcasterUsername) : "Data not available";

      const safeNeynar =
        neynarScoreRaw === null || neynarScoreRaw === undefined || neynarScoreRaw === ""
          ? "Data not available"
          : String(neynarScoreRaw);

      // balance priority: balanceEth -> convert from balanceWei
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
        } catch {
          // ignore
        }
      }

      const safeTx =
        txCountRaw === null || txCountRaw === undefined || txCountRaw === ""
          ? "Data not available"
          : String(txCountRaw);

      const lines = [
        `🧐 Farcaster: ${safeFarcaster}`,
        `🥳 Neynar: ${safeNeynar}`,
        `🤑 Balance: ${safeBalance}`,
        `🤯 Total TX: ${safeTx}`,
      ];

      return res.status(200).json({ ok: true, reply: lines.join("\n") });
    }

    // ===== fallback Gemini for non-scan questions =====
    if (!apiKey) {
      return res.status(200).json({ ok: true, reply: "Data not available." });
    }

    const safeMessage = message.slice(0, 3000);

    const trimmedHistory = history.slice(-8).map((m) => ({
      role: m?.role === "assistant" ? "model" : "user",
      parts: [{ text: String(m?.text || "").slice(0, 2000) }],
    }));

    const systemText =
      "You are an assistant for a Base blockchain explorer mini app. " +
      "Respond in clean, simple English. " +
      "Do not invent data. If data is missing, say: Data not available.";

    const userPrompt = `User message:\n${safeMessage}\n\nRules:\n- Short answer\n- No hype`;

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
          generationConfig: { temperature: 0.2, maxOutputTokens: 250 },
        }),
      }
    );

    const j = await r.json().catch(() => null);

    if (!r.ok) {
      return res
        .status(r.status)
        .json({ ok: false, error: "Gemini error", detail: j });
    }

    const reply =
      j?.candidates?.[0]?.content?.parts
        ?.map((p) => p?.text || "")
        .join("")
        .trim() || "Data not available.";

    return res.status(200).json({ ok: true, reply });
  } catch {
    return res.status(500).json({ ok: false, error: "Server error" });
  }
}

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

    // ===== scan trigger: ONLY if message contains an ETH address =====
    const m = message.match(/0x[a-fA-F0-9]{40}/);
    const scanAddress = m ? m[0] : null;

    if (scanAddress) {
      const farcasterUsername = (context && context.farcasterUsername) || null;

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
        `🧐 Farcaster: ${safeFarcaster}`,
        `🥳 Neynar: ${safeNeynar}`,
        `🤑 Balance: ${safeBalance}`,
        `🤯 Total TX: ${safeTx}`,
      ];

      return res.status(200).json({ ok: true, reply: lines.join("\n") });
    }

    // ===== chat: ALWAYS through Gemini =====
    if (!apiKey) {
      return res.status(200).json({ ok: true, reply: "Chat service unavailable." });
    }

    const systemText =
      "You are an assistant inside a Base blockchain explorer mini app. " +
      "Chat normally (casual conversation allowed). " +
      "Reply in the user's language (Indonesian or English). " +
      "Do not invent on-chain data. If on-chain data is missing, say: Data not available.";

    const mappedHistory = history.map((m) => ({
      role: m?.role === "assistant" || m?.role === "model" ? "model" : "user",
      parts: [{ text: String(m?.text || "") }],
    }));

    const contents = [
      ...mappedHistory,
      { role: "user", parts: [{ text: `${systemText}\n\n${message}` }] },
    ];

    const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

    async function callGemini() {
      const r = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents,
          generationConfig: { temperature: 0.6, maxOutputTokens: 350 },
        }),
      });

      const j = await r.json().catch(() => null);
      return { r, j };
    }

    // 1x retry on failure
    let { r, j } = await callGemini();
    if (!r.ok) {
      ({ r, j } = await callGemini());
    }

    if (!r.ok) {
      return res.status(200).json({ ok: true, reply: "Chat service unavailable." });
    }

    const reply =
      j?.candidates?.[0]?.content?.parts?.map((p) => p?.text || "").join("").trim() ||
      "Chat service unavailable.";

    return res.status(200).json({ ok: true, reply });
  } catch {
    return res.status(200).json({ ok: true, reply: "Chat service unavailable." });
  }
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ ok: false, error: "Missing GEMINI_API_KEY" });
  }

  try {
    let body = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        body = {};
      }
    }
    if (!body || typeof body !== "object") body = {};

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

    // ===== Deterministic header (exact format) =====
    const fcUsername =
      safeContext?.farcaster?.username ??
      safeContext?.farcaster?.farcasterUsername ??
      safeContext?.farcaster?.user ??
      null;

    const neynarScore =
      safeContext?.neynarScore ??
      safeContext?.farcaster?.neynarScore ??
      safeContext?.farcaster?.score ??
      null;

    const balanceWei = safeContext?.balanceWei ?? null;
    const txCount = safeContext?.txCount ?? safeContext?.totalTx ?? null;

    const formatEth = (wei) => {
      if (wei === null || wei === undefined) return null;
      const s = String(wei).trim();
      if (!/^\d+$/.test(s)) return null;
      if (s === "0") return "0";

      const pad = s.padStart(19, "0");
      const intPart = pad.slice(0, -18).replace(/^0+/, "") || "0";
      let frac = pad.slice(-18).replace(/0+$/, "");

      // 3 decimals max (trim trailing)
      frac = frac.slice(0, 3).replace(/0+$/, "");
      return frac ? `${intPart}.${frac}` : intPart;
    };

    const headerLines = [];
    headerLines.push(`🧐 Farcaster: ${fcUsername ? fcUsername : "-"}`);
    headerLines.push(`🥳 Neynar: ${neynarScore !== null && neynarScore !== undefined ? String(neynarScore) : "-"}`);

    const eth = formatEth(balanceWei);
    headerLines.push(`🤑 Balance: ${eth ? `${eth} ETH` : "-"}`);

    headerLines.push(`🤯 Total TX: ${txCount !== null && txCount !== undefined ? String(txCount) : "-"}`);

    if (fcUsername) {
      headerLines.push("");
      headerLines.push("🔗 Open Farcaster Profile");
      headerLines.push("🌐 Open in Browser");
    }

    // If we have enough context to show the summary card, return it (exact format)
    // This guarantees the output looks exactly like you want.
    if (safeContext && (fcUsername || balanceWei !== null || txCount !== null || neynarScore !== null)) {
      return res.status(200).json({ ok: true, reply: headerLines.join("\n") });
    }

    // ===== Fallback to Gemini if context is empty =====
    const trimmedHistory = history
      .slice(-8)
      .map((m) => {
        const role = m?.role === "assistant" ? "model" : "user";
        const text = String(m?.text || "").slice(0, 2000).trim();
        if (!text) return null;
        return { role, parts: [{ text }] };
      })
      .filter(Boolean);

    const systemText =
      "You are an assistant for a Base blockchain explorer mini app. " +
      "Respond in clean, simple English. " +
      "Do not use markdown, asterisks, bullets, numbering, or quotation marks. " +
      "Use short lines, one sentence per line. " +
      "Use only the provided context. Do not invent transactions, labels, or identities. " +
      "If data is missing, say: Data not available.";

    const userPrompt =
      `User message:\n${safeMessage}\n\n` +
      `Explorer context (may be null):\n${JSON.stringify(safeContext)}\n\n` +
      "Output rules:\n" +
      "- 4 to 8 short lines\n" +
      "- No hype";

    const contents = [
      ...trimmedHistory,
      { role: "user", parts: [{ text: `${systemText}\n\n${userPrompt}` }] },
    ];

    const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    let r;
    try {
      r = await fetch(
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
          signal: controller.signal,
        }
      );
    } finally {
      clearTimeout(timeout);
    }

    const j = await r.json().catch(() => null);

    if (!r.ok) {
      return res.status(r.status).json({ ok: false, error: "Gemini error", detail: j || null });
    }

    const reply = (
      j?.candidates?.[0]?.content?.parts?.map((p) => p?.text || "").join("") || ""
    ).trim();

    return res.status(200).json({ ok: true, reply: reply || "Data not available." });
  } catch (e) {
    const isAbort =
      e && typeof e === "object" && (e.name === "AbortError" || e.code === "ABORT_ERR");
    return res
      .status(500)
      .json({ ok: false, error: isAbort ? "Upstream timeout" : "Server error" });
  }
}

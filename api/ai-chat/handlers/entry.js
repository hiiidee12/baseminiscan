import { buildCoinGeckoText } from "../services/coinGecko.js";
import { hasApiKeys, callGeminiWithRotation, extractOpenAIText } from "../services/llmClient.js";
import { handleScanCommand, handleSearchCommand } from "../handlers/commandHandlers.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const body = req.body || {};
    const message = String(body.message || "").trim();
    const context = body.context ?? null;
    const coingecko = body.coingecko ?? null;
    const history = Array.isArray(body.history) ? body.history : [];

    if (!message) {
      return res.status(400).json({ ok: false, error: "Missing message" });
    }

    const msgLower = message.toLowerCase();
    const scanMatch = msgLower.match(/\bscan\s+(0x[a-fA-F0-9]{40})\b/);
    const scanAddress = scanMatch ? scanMatch[1] : null;
    const isScanCommand = Boolean(scanAddress);

    const searchMatch = msgLower.match(/\bsearch\s+(0x[a-fA-F0-9]{40})\b/);
    const searchAddress = searchMatch ? searchMatch[1] : null;
    const isSearchCommand = Boolean(searchAddress);

    const address = (context && typeof context === "object" && context.address) || null;

    // Handle Scan Command
    if (isScanCommand) {
      const reply = await handleScanCommand({
        address: scanAddress,
        farcasterUsername: context?.farcasterUsername,
        neynarScore: context?.neynarScore,
        balanceEth: context?.balanceEth,
        balanceWei: context?.balanceWei,
        txCount: context?.txCount,
      });
      return res.status(200).json({ ok: true, reply });
    }

    // Handle Search Command
    if (isSearchCommand) {
      const reply = await handleSearchCommand(req, searchAddress);
      return res.status(200).json({ ok: true, reply });
    }

    // Context hint for raw address
    if (address && /^0x[a-fA-F0-9]{40}$/.test(String(address))) {
      if (/^0x[a-fA-F0-9]{40}$/.test(message)) {
        return res.status(200).json({
          ok: true,
          reply: "Type: `scan 0x...` to see wallet summary.",
        });
      }
    }

    // Fallback to LLM
    if (!hasApiKeys()) {
      return res.status(200).json({ ok: true, reply: "Data not available." });
    }

    const safeMessage = message.slice(0, 3000);

    const trimmedHistory = history.slice(-8).map((m) => ({
      role: m?.role === "assistant" ? "assistant" : "user",
      content: String(m?.text || "").slice(0, 2000),
    }));

    const cgText = buildCoinGeckoText(coingecko);

    const systemText =
      "You are an assistant for a Base Mini Scan. " +
      "respond to questions according to the language used. " +
      "You are a crypto assistant. " +
      "If price data is provided below, you MUST use it and treat it as the source of truth for prices. " +
      "Never say you cannot provide real-time data if price data exists. " +
      "Keep answers short. No hype. " +
      "Do not mention the data provider name.";

    const userPrompt =
      `User message:\n${safeMessage}\n\n` +
      (cgText ? `Price/market data:\n${cgText}\n\n` : "") +
      `Rules:\n- Short answer\n- No hype`;

    const input = [
      ...trimmedHistory,
      { role: "user", content: userPrompt },
    ];

    const model = process.env.OPENAI_MODEL || "GPT-4o-mini";

    const out = await callGeminiWithRotation({
      model,
      input,
      instructions: systemText,
      temperature: 0.2,
      maxOutputTokens: 500,
    });

    if (!out.ok) {
      return res.status(200).json({ ok: true, reply: "Data not available." });
    }

    const j = out.json;
    const reply = extractOpenAIText(j) || "Data not available.";

    return res.status(200).json({ ok: true, reply });
  } catch {
    return res.status(200).json({ ok: true, reply: "Data not available." });
  }
}

const GEMINI_KEYS = [
  process.env.OPENAI_API_KEY,
].filter(Boolean);

let __geminiKeyIndex = 0;

function pickGeminiKey() {
  if (!GEMINI_KEYS.length) return null;
  const k = GEMINI_KEYS[__geminiKeyIndex % GEMINI_KEYS.length];
  __geminiKeyIndex = (__geminiKeyIndex + 1) % GEMINI_KEYS.length;
  return k;
}

async function callGeminiWithRotation({ model, input, instructions, temperature, maxOutputTokens }) {
  if (!GEMINI_KEYS.length) return { ok: false, status: 0, json: null };

  const url = "https://openrouter.ai/api/v1/chat/completions";

  let last = { ok: false, status: 0, json: null };

  for (let attempt = 0; attempt < GEMINI_KEYS.length; attempt++) {
    const apiKey = pickGeminiKey();

    const messages = [
      ...(instructions ? [{ role: "system", content: String(instructions) }] : []),
      ...(Array.isArray(input) ? input : []),
    ];

    const r = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens: maxOutputTokens,
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

function __fmtNum(v, digits) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  if (typeof digits === "number") return n.toFixed(digits);
  return String(n);
}

function __buildCoinGeckoText(coingecko) {
  try {
    if (!coingecko || typeof coingecko !== "object") return "";

    const price = coingecko.price && typeof coingecko.price === "object" ? coingecko.price : null;
    const global = coingecko.global && typeof coingecko.global === "object" ? coingecko.global : null;

    const lines = [];

    if (price && typeof price === "object") {
      const eth = price.ethereum && typeof price.ethereum === "object" ? price.ethereum : null;
      const btc = price.bitcoin && typeof price.bitcoin === "object" ? price.bitcoin : null;

      if (eth) {
        const ethUsd = __fmtNum(eth.usd, 2);
        const ethIdr = __fmtNum(eth.idr, 0);
        const ethCh = __fmtNum(eth.usd_24h_change, 2);
        const ethMc = __fmtNum(eth.usd_market_cap, 0);
        const ethVol = __fmtNum(eth.usd_24h_vol, 0);

        const parts = [];
        if (ethUsd !== null) parts.push(`ETH_USD=${ethUsd}`);
        if (ethIdr !== null) parts.push(`ETH_IDR=${ethIdr}`);
        if (ethCh !== null) parts.push(`ETH_24H_CHANGE_PCT=${ethCh}`);
        if (ethMc !== null) parts.push(`ETH_MKTCAP_USD=${ethMc}`);
        if (ethVol !== null) parts.push(`ETH_VOL_24H_USD=${ethVol}`);

        if (parts.length) {
          lines.push("PRICE_DATA");
          lines.push(parts.join(" | "));
        }
      }

      if (btc) {
        const btcUsd = __fmtNum(btc.usd, 2);
        const btcIdr = __fmtNum(btc.idr, 0);
        const btcCh = __fmtNum(btc.usd_24h_change, 2);
        const btcMc = __fmtNum(btc.usd_market_cap, 0);
        const btcVol = __fmtNum(btc.usd_24h_vol, 0);

        const parts = [];
        if (btcUsd !== null) parts.push(`BTC_USD=${btcUsd}`);
        if (btcIdr !== null) parts.push(`BTC_IDR=${btcIdr}`);
        if (btcCh !== null) parts.push(`BTC_24H_CHANGE_PCT=${btcCh}`);
        if (btcMc !== null) parts.push(`BTC_MKTCAP_USD=${btcMc}`);
        if (btcVol !== null) parts.push(`BTC_VOL_24H_USD=${btcVol}`);

        if (parts.length) {
          if (!lines.length) lines.push("PRICE_DATA");
          lines.push(parts.join(" | "));
        }
      }
    }

    if (global && typeof global === "object") {
      const data = global.data && typeof global.data === "object" ? global.data : null;

      if (data) {
        const tmc = data.total_market_cap && typeof data.total_market_cap === "object" ? data.total_market_cap : null;
        const tv = data.total_volume && typeof data.total_volume === "object" ? data.total_volume : null;
        const mpp = data.market_cap_percentage && typeof data.market_cap_percentage === "object" ? data.market_cap_percentage : null;

        const parts = [];

        if (tmc) {
          const tmcUsd = __fmtNum(tmc.usd, 0);
          if (tmcUsd !== null) parts.push(`TOTAL_MKTCAP_USD=${tmcUsd}`);
        }

        if (tv) {
          const tvUsd = __fmtNum(tv.usd, 0);
          if (tvUsd !== null) parts.push(`TOTAL_VOL_24H_USD=${tvUsd}`);
        }

        if (mpp) {
          const btcDom = __fmtNum(mpp.btc, 2);
          const ethDom = __fmtNum(mpp.eth, 2);
          if (btcDom !== null) parts.push(`BTC_DOMINANCE_PCT=${btcDom}`);
          if (ethDom !== null) parts.push(`ETH_DOMINANCE_PCT=${ethDom}`);
        }

        if (parts.length) {
          lines.push("GLOBAL_DATA");
          lines.push(parts.join(" | "));
        }
      }
    }

    if (!lines.length) return "";
    return lines.join("\n");
  } catch {
    return "";
  }
}

function __extractOpenAIText(j) {
  try {
    if (!j || typeof j !== "object") return "";

    const choices = Array.isArray(j.choices) ? j.choices : [];
    if (choices.length) {
      const c0 = choices[0] && typeof choices[0] === "object" ? choices[0] : null;
      const msg = c0 && c0.message && typeof c0.message === "object" ? c0.message : null;
      if (msg && typeof msg.content === "string" && msg.content.trim()) return msg.content.trim();

      const delta = c0 && c0.delta && typeof c0.delta === "object" ? c0.delta : null;
      if (delta && typeof delta.content === "string" && delta.content.trim()) return delta.content.trim();
    }

    if (typeof j.output_text === "string" && j.output_text.trim()) return j.output_text.trim();

    const out = Array.isArray(j.output) ? j.output : [];
    const chunks = [];

    for (const item of out) {
      if (!item || typeof item !== "object") continue;

      if (item.type === "message" && item.role === "assistant") {
        const content = Array.isArray(item.content) ? item.content : [];
        for (const c of content) {
          if (!c || typeof c !== "object") continue;
          if (c.type === "output_text" && typeof c.text === "string") chunks.push(c.text);
          if (c.type === "text" && typeof c.text === "string") chunks.push(c.text);
        }
      }

      if (item.type === "output_text" && typeof item.text === "string") {
        chunks.push(item.text);
      }
    }

    return chunks.join("").trim();
  } catch {
    return "";
  }
}

async function fetchLocalGeckoTerminalToken(req, tokenAddress) {
  const proto =
    (req.headers["x-forwarded-proto"] || "https").toString().split(",")[0].trim();
  const host =
    (req.headers["x-forwarded-host"] || req.headers.host || "").toString().split(",")[0].trim();
  const origin = host ? `${proto}://${host}` : "";

  const url = `${origin}/api/geckoterminal?mode=token&network=base&address=${encodeURIComponent(tokenAddress)}`;

  const r = await fetch(url, { headers: { accept: "application/json" } });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j || !j.ok) return null;
  return j.data || null;
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

    if (isScanCommand) {
      const address = scanAddress;

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
      ];

      const toNum = (v) => {
        if (v === null || v === undefined || v === "") return null;
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
      };

      const neynarScoreNum = toNum(neynarScoreRaw);
      const balanceEthNum = toNum(balanceEthRaw);
      const txCountNum = toNum(txCountRaw);

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
          const frac6 = Number(fracPart / 10n ** 12n) / 1e6;
          balanceEthParsed = Number(intPart) + frac6;
        } catch {}
      }

      const summary = [];

      if (txCountNum !== null) {
        if (txCountNum >= 500) summary.push("High transaction activity");
        else if (txCountNum >= 100) summary.push("Moderate transaction activity");
        else summary.push("Low transaction activity");
      }

      if (balanceEthParsed !== null && balanceEthParsed !== undefined) {
        if (balanceEthParsed < 0.001) summary.push("Low retained balance");
        else if (balanceEthParsed < 0.01) summary.push("Modest retained balance");
        else summary.push("Meaningful retained balance");
      }

      if (neynarScoreNum !== null) {
        if (neynarScoreNum >= 0.75) summary.push("Strong social signal");
        else if (neynarScoreNum >= 0.5) summary.push("Average social signal");
        else summary.push("Weak social signal");
      }

      if (summary.length) {
        lines.push("");
        lines.push("🧠 Summary");
        for (const s of summary) {
          lines.push(`• ${s}`);
        }
      }

      return res.status(200).json({ ok: true, reply: lines.join("\n") });
    }

    if (isSearchCommand) {
      const gt = await fetchLocalGeckoTerminalToken(req, searchAddress);

      if (!gt) {
        return res.status(200).json({ ok: true, reply: "Data not available." });
      }

      const token = gt.token || {};
      const bestPool = gt.bestPool || null;
      const p = bestPool && bestPool.attributes ? bestPool.attributes : {};

      const lines = [];

      const name = token.name ? String(token.name) : "Data not available";
      const symbol = token.symbol ? String(token.symbol) : "Data not available";

      function formatNumber(n, decimals = 2) {
  const x = Number(n);
  if (!Number.isFinite(x)) return null;

  const abs = Math.abs(x);
  if (abs >= 1e9) return (x / 1e9).toFixed(decimals).replace(/\.0+$/, "") + "B";
  if (abs >= 1e6) return (x / 1e6).toFixed(decimals).replace(/\.0+$/, "") + "M";
  if (abs >= 1e3) return (x / 1e3).toFixed(decimals).replace(/\.0+$/, "") + "K";
  return x.toLocaleString("en-US");
}

function formatPrice(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return n;

  if (x >= 1) return x.toFixed(4).replace(/\.?0+$/, "");
  if (x >= 0.1) return x.toFixed(4).replace(/\.?0+$/, "");
  if (x >= 0.01) return x.toFixed(5).replace(/\.?0+$/, "");
  if (x >= 0.001) return x.toFixed(6).replace(/\.?0+$/, "");
  return x.toPrecision(4);
}

function hasValue(v) {
  return v !== null && v !== undefined && String(v).trim() !== "";
}

const colorizePct = (x) => {
  const v = Number(x);
  if (!Number.isFinite(v)) return String(x);

  const s = v.toFixed(2).replace(/\.0+$/, "");
  if (v > 0) return ` +${s}%`;
  if (v < 0) return ` ${s}%`;
  return `⚪ ${s}%`;
};

lines.push(`🪙 Token: ${name} (${symbol})`);

if (hasValue(token.price_usd)) {
  lines.push(`💵 Price : $${formatPrice(token.price_usd)}`);
}

const ch1 = token.price_change_1h_pct ?? null;
const ch6 = token.price_change_6h_pct ?? null;
const ch12 = token.price_change_12h_pct ?? null;
const ch24 = token.price_change_24h_pct ?? null;

if (hasValue(ch1) || hasValue(ch6) || hasValue(ch12) || hasValue(ch24)) {
  const parts = [];
  if (hasValue(ch1)) parts.push(`1h: ${colorizePct(ch1)}`);
  if (hasValue(ch6)) parts.push(`6h: ${colorizePct(ch6)}`);
  if (hasValue(ch12)) parts.push(`12h: ${colorizePct(ch12)}`);
  if (hasValue(ch24)) parts.push(`24h: ${colorizePct(ch24)}`);

  lines.push(`${parts.join(" | ")}`);
}

if (hasValue(token.market_cap_usd)) {
  const s = formatNumber(token.market_cap_usd, 2);
  lines.push(`🏦 MCap : $${s ?? String(token.market_cap_usd)}`);
}

if (hasValue(token.fdv_usd)) {
  const s = formatNumber(token.fdv_usd, 2);
  lines.push(`📊 FDV : $${s ?? String(token.fdv_usd)}`);
}

if (bestPool && bestPool.id) {
  lines.push("");
  lines.push("🔁 Best Pool");

  if (hasValue(p.reserve_in_usd)) {
    const s = formatNumber(p.reserve_in_usd, 2);
    lines.push(`• Liquidity : $${s ?? String(p.reserve_in_usd)}`);
  }

  const v24 = p.volume_usd && typeof p.volume_usd === "object" ? p.volume_usd.h24 : null;
  if (hasValue(v24)) {
    const s = formatNumber(v24, 2);
    lines.push(`• Volume 24h : $${s ?? String(v24)}`);
  }
}
      return res.status(200).json({ ok: true, reply: lines.join("\n") });
    }

    if (address && /^0x[a-fA-F0-9]{40}$/.test(String(address))) {
      if (/^0x[a-fA-F0-9]{40}$/.test(message)) {
        return res.status(200).json({
          ok: true,
          reply: "Type: `scan 0x...` to see wallet summary.",
        });
      }
    }

    if (!GEMINI_KEYS.length) {
      return res.status(200).json({ ok: true, reply: "Data not available." });
    }

    const safeMessage = message.slice(0, 3000);

    const trimmedHistory = history.slice(-8).map((m) => ({
      role: m?.role === "assistant" ? "assistant" : "user",
      content: String(m?.text || "").slice(0, 2000),
    }));

    const cgText = __buildCoinGeckoText(coingecko);

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

    const reply = __extractOpenAIText(j) || "Data not available.";

    return res.status(200).json({ ok: true, reply });
  } catch {
    return res.status(200).json({ ok: true, reply: "Data not available." });
  }
}

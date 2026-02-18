import { fmtNum, toNum } from "../utils/formatting.js";
import { fetchLocalGeckoTerminalToken } from "../services/geckoTerminal.js";

export async function handleScanCommand(context) {
  const address = context.address; // Diambil dari match regex di handler utama
  const farcasterUsername = (context && context.farcasterUsername) || null;
  const neynarScoreRaw = context && context.neynarScore !== undefined ? context.neynarScore : null;
  const balanceEthRaw = context && context.balanceEth !== undefined ? context.balanceEth : null;
  const balanceWeiRaw = context && context.balanceWei !== undefined ? context.balanceWei : null;
  const txCountRaw = context && context.txCount !== undefined ? context.txCount : null;

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

  return lines.join("\n");
}

export async function handleSearchCommand(req, address) {
  const gt = await fetchLocalGeckoTerminalToken(req, address);

  if (!gt) {
    return "Data not available.";
  }

  const token = gt.token || {};
  const bestPool = gt.bestPool || null;
  const p = bestPool && bestPool.attributes ? bestPool.attributes : {};

  const lines = [];

  const name = token.name ? String(token.name) : "Data not available";
  const symbol = token.symbol ? String(token.symbol) : "Data not available";

  lines.push(`🪙 Token: ${name} (${symbol})`);
  if (token.price_usd !== null && token.price_usd !== undefined && String(token.price_usd).trim() !== "") {
    lines.push(`💵 Price (USD): ${String(token.price_usd)}`);
  }

  const ch24 =
    token.price_change_percentage && typeof token.price_change_percentage === "object"
      ? token.price_change_percentage.h24
      : null;

  if (ch24 !== null && ch24 !== undefined && String(ch24).trim() !== "") {
    lines.push(`📈 24h Change (%): ${String(ch24)}`);
  }

  if (token.market_cap_usd !== null && token.market_cap_usd !== undefined && String(token.market_cap_usd).trim() !== "") {
    lines.push(`🏦 MCap (USD): ${String(token.market_cap_usd)}`);
  }

  if (token.fdv_usd !== null && token.fdv_usd !== undefined && String(token.fdv_usd).trim() !== "") {
    lines.push(`📊 FDV (USD): ${String(token.fdv_usd)}`);
  }

  if (bestPool && bestPool.id) {
    lines.push("");
    lines.push("🔁 Best Pool");

    if (p.reserve_in_usd !== null && p.reserve_in_usd !== undefined && String(p.reserve_in_usd).trim() !== "") {
      lines.push(`• Liquidity (USD): ${String(p.reserve_in_usd)}`);
    }

    const v24 = p.volume_usd && typeof p.volume_usd === "object" ? p.volume_usd.h24 : null;
    if (v24 !== null && v24 !== undefined && String(v24).trim() !== "") {
      lines.push(`• Volume 24h (USD): ${String(v24)}`);
    }
  }

  return lines.join("\n");
}

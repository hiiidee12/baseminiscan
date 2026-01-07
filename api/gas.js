const BASE_CHAIN_ID = 8453;

async function fetchWithTimeout(url, opts = {}, ms = 10000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

function getKeys() {
  const k1 = process.env.ETHERSCAN_KEY || process.env.ETHERSCAN_API_KEY || "";
  const k2 = process.env.ETHERSCAN_KEY_2 || "";
  return [k1, k2].filter(Boolean);
}

function pickKey(keys) {
  if (!keys.length) return "";
  const i = Math.floor(Date.now() / 1000) % keys.length;
  return keys[i];
}

function isRateLimitError(text = "") {
  const s = String(text).toLowerCase();
  return (
    s.includes("rate limit") ||
    s.includes("too many requests") ||
    s.includes("max rate limit") ||
    s.includes("limit reached") ||
    s.includes("throttle")
  );
}

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function round(n, d = 3) {
  const x = Number(n);
  if (!Number.isFinite(x)) return null;
  const p = Math.pow(10, d);
  return Math.round(x * p) / p;
}

function gweiToEth(gwei) {
  const n = Number(gwei);
  return Number.isFinite(n) ? n * 1e-9 : null;
}

function gasUsd(gwei, gasUnits, ethUsd) {
  const g = gweiToEth(gwei);
  const e = Number(ethUsd);
  const u = Number(gasUnits);
  if (!Number.isFinite(g) || !Number.isFinite(e) || !Number.isFinite(u)) return null;
  return g * u * e;
}

function parseGasUsedRatio(str) {
  if (!str) return null;
  try {
    return String(str)
      .split(',')
      .map(x => parseFloat(x.trim()))
      .filter(x => !isNaN(x));
  } catch {
    return null;
  }
}

function buildFeaturedActions(gwei, ethUsd) {
  const GAS_UNITS = { erc20: 65000, swap: 150000, lp: 200000 };
  const mk = (units) => {
    const low = gasUsd(gwei.standard, units, ethUsd);
    const avg = gasUsd(gwei.fast, units, ethUsd);
    const high = gasUsd(gwei.rapid, units, ethUsd);
    return {
      gasUnits: units,
      lowUsd: low,
      avgUsd: avg,
      highUsd: high,
      lowUsdText: low == null ? "-" : `$${round(low, 3).toFixed(3)}`,
      avgUsdText: avg == null ? "-" : `$${round(avg, 3).toFixed(3)}`,
      highUsdText: high == null ? "-" : `$${round(high, 3).toFixed(3)}`,
    };
  };
  return {
    erc20: mk(GAS_UNITS.erc20),
    swap: mk(GAS_UNITS.swap),
    lp: mk(GAS_UNITS.lp),
  };
}

async function etherscanV2(pathAndQuery) {
  const keys = getKeys();
  if (!keys.length) {
    return { ok: false, error: "Missing ETHERSCAN_KEY env var." };
  }

  const order = [];
  const first = pickKey(keys);
  order.push(first);
  for (const k of keys) if (k !== first) order.push(k);

  let lastErr = null;

  for (const key of order) {
    const url = `https://api.etherscan.io/v2/api?${pathAndQuery}&apikey=${encodeURIComponent(key)}`;

    try {
      const res = await fetchWithTimeout(url, { headers: { accept: "application/json" } }, 12000);
      const text = await res.text();

      let json = null;
      try {
        json = JSON.parse(text);
      } catch {}

      if (!res.ok) {
        lastErr = json || { status: "0", message: "HTTP_ERROR", result: text };
        continue;
      }

      const { status, message, result } = json || {};
      if (status === "0") {
        const combined = `${message || ""} ${typeof result === "string" ? result : ""}`.trim();
        lastErr = json;
        if (isRateLimitError(combined) || combined.toLowerCase().includes("invalid api key")) continue;
        continue;
      }

      return { ok: true, json };
    } catch (e) {
      lastErr = { status: "0", message: "FETCH_ERROR", result: String(e) };
    }
  }

  return { ok: false, error: lastErr || "Unknown error" };
}

async function getEthUsd() {
  const r = await etherscanV2(`module=stats&action=ethprice`);
  if (!r.ok) return null;
  const result = r.json?.result;
  return toNum(result?.ethusd ?? result?.ethusd_price ?? result?.ethUsd);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const q = `chainid=${BASE_CHAIN_ID}&module=gastracker&action=gasoracle`;
    const r = await etherscanV2(q);

    if (!r.ok) {
      res.status(500).json({ error: r.error });
      return;
    }

    const raw = r.json?.result || {};

    const safe = toNum(raw.SafeGasPrice ?? raw.safeGasPrice ?? raw.safe);
    const propose = toNum(raw.ProposeGasPrice ?? raw.proposeGasPrice ?? raw.fast);
    const fast = toNum(raw.FastGasPrice ?? raw.fastGasPrice);

    const standardGwei = safe ?? propose ?? fast ?? null;
    const fastGwei = propose ?? fast ?? safe ?? null;
    const baseForRapid = fast ?? fastGwei;
    const rapidGwei = baseForRapid != null ? baseForRapid * 1.25 : null;

    const lastBlock = raw.LastBlock ?? raw.lastBlock ?? null;
    const gasUsedRatio = parseGasUsedRatio(raw.gasUsedRatio ?? raw.GasUsedRatio);

    let ethUsd =
      toNum(raw.UsdPrice ?? raw.usdPrice ?? raw.ethUsd ?? raw.ethusd) ??
      (await getEthUsd());

    const gwei = { standard: standardGwei, fast: fastGwei, rapid: rapidGwei };
    const featuredActions = buildFeaturedActions(gwei, ethUsd);

    res.setHeader("Cache-Control", "s-maxage=5, stale-while-revalidate=20");
    res.status(200).json({
      chain: "base",
      gwei,
      additional: { lastBlock, gasUsedRatio },
      featuredActions,
      pricing: { ethUsd: ethUsd ?? null, currency: "USD" },
      meta: { source: "Etherscan V2 Gas Oracle", refreshedAt: new Date().toISOString() },
      raw,
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
}

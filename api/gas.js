// /api/gas.js
// Base Gas Tracker API (Etherscan V2 Gas Oracle for Base)
// Returns: standard/fast/rapid (gwei) + additional info + featured action $ estimates
//
// Env needed on Vercel:
// - ETHERSCAN_KEY
// - ETHERSCAN_KEY_2 (optional)

const BASE_CHAIN_ID = 8453;

// Simple timeout wrapper
async function fetchWithTimeout(url, opts = {}, ms = 10000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    return res;
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
  // cheap rotation (stateless): alternate by current second
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
  if (!Number.isFinite(n)) return null;
  return n * 1e-9;
}

function gasUsd(gwei, gasUnits, ethUsd) {
  const g = gweiToEth(gwei);
  const e = Number(ethUsd);
  const u = Number(gasUnits);
  if (!Number.isFinite(g) || !Number.isFinite(e) || !Number.isFinite(u)) return null;
  const costEth = g * u;
  return costEth * e;
}

function buildFeaturedActions(gwei, ethUsd) {
  // You can tweak these gas units later to match BaseScan look closer
  const GAS_UNITS = {
    erc20: 65000,
    swap: 150000,
    lp: 200000, // Add/Remove LP
  };

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

// Etherscan V2 fetch with fallback key
async function etherscanV2(pathAndQuery) {
  const keys = getKeys();
  if (!keys.length) {
    return { ok: false, error: "Missing ETHERSCAN_KEY env var." };
  }

  // Try selected key first, then others
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
      } catch {
        // sometimes etherscan returns plain text
      }

      // If HTTP error
      if (!res.ok) {
        lastErr = json || { status: "0", message: "HTTP_ERROR", result: text };
        // try next key
        continue;
      }

      // Etherscan style error
      const status = json?.status;
      const msg = json?.message;
      const result = json?.result;

      if (status === "0") {
        const combined = `${msg || ""} ${typeof result === "string" ? result : ""}`.trim();
        lastErr = json;

        // If rate limit, try next key
        if (isRateLimitError(combined)) continue;

        // If key issue, try next key
        if (combined.toLowerCase().includes("invalid api key")) continue;

        // Other errors: still try next key, but keep last
        continue;
      }

      return { ok: true, json };
    } catch (e) {
      lastErr = { status: "0", message: "FETCH_ERROR", result: String(e) };
      // try next key
    }
  }

  return { ok: false, error: lastErr || "Unknown error" };
}

// Try to get ETH/USD from Etherscan too (fallback if gas oracle doesn't include)
async function getEthUsd() {
  // module=stats&action=ethprice (v1 style) still works for Etherscan family in many cases
  // We call V2 endpoint, but the module/action is the same query pattern.
  const r = await etherscanV2(`module=stats&action=ethprice`);
  if (!r.ok) return null;

  const result = r.json?.result;
  const usd = toNum(result?.ethusd ?? result?.ethusd_price ?? result?.ethUsd);
  return usd;
}

export default async function handler(req, res) {
  try {
    // Gas Oracle (Base)
    const q = `chainid=${BASE_CHAIN_ID}&module=gastracker&action=gasoracle`;
    const r = await etherscanV2(q);

    if (!r.ok) {
      res.status(500).json({ error: r.error });
      return;
    }

    const raw = r.json?.result || {};

    // Normalize fields (Etherscan can vary a bit)
    const safe = toNum(raw.SafeGasPrice ?? raw.safeGasPrice ?? raw.safe);
    const propose = toNum(raw.ProposeGasPrice ?? raw.proposeGasPrice ?? raw.fast);
    const fast = toNum(raw.FastGasPrice ?? raw.fastGasPrice);

    // We'll map:
    // standard = safe (or propose fallback)
    // fast = propose (or fast fallback)
    // rapid = fast (or propose fallback) * 1.25
    const standardGwei = safe ?? propose ?? fast ?? null;
    const fastGwei = propose ?? fast ?? safe ?? null;
    const rapidGwei =
      fast != null ? fast : (fastGwei != null ? fastGwei * 1.25 : null);

    // Extra info
    const lastBlock = raw.LastBlock ?? raw.lastBlock ?? null;
    const gasUsedRatio = raw.gasUsedRatio ?? raw.GasUsedRatio ?? null;

    // ETH/USD price
    let ethUsd =
      toNum(raw.UsdPrice ?? raw.usdPrice ?? raw.ethUsd ?? raw.ethusd) ??
      (await getEthUsd());

    // If still missing, keep null (front-end can hide $ section)
    const gwei = {
      standard: standardGwei,
      fast: fastGwei,
      rapid: rapidGwei,
    };

    const featuredActions = buildFeaturedActions(gwei, ethUsd);

    res.setHeader("Cache-Control", "s-maxage=5, stale-while-revalidate=20");

    res.status(200).json({
      chain: "base",
      gwei,
      additional: {
        lastBlock,
        gasUsedRatio,
      },
      featuredActions,
      pricing: {
        ethUsd: ethUsd ?? null,
        currency: "USD",
      },
      meta: {
        source: "Etherscan V2 Gas Oracle",
        refreshedAt: new Date().toISOString(),
      },
      raw, // keep raw for debugging; you can remove later if you want
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
}
```0

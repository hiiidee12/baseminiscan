// api/gas.js

const RPC_URLS = [
  "https://mainnet.base.org",
  "https://base.llamarpc.com",
];

const PRICE_URLS = [
  "https://api.coinbase.com/v2/prices/ETH-USD/spot",
  "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd",
];

const RPC_TIMEOUT_MS = 8000;
const PRICE_TIMEOUT_MS = 6000;

function withTimeout(ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return { signal: ctrl.signal, cancel: () => clearTimeout(t) };
}

function hexToBigInt(hex) {
  if (!hex || typeof hex !== "string") return 0n;
  // hex from RPC is like "0x12ab..."
  try {
    return BigInt(hex);
  } catch {
    return 0n;
  }
}

function weiToGwei(weiBig) {
  // Keep as Number for UI; gasPrice on Base is small enough to safely fit Number.
  const n = Number(weiBig);
  if (!Number.isFinite(n) || n < 0) return null;
  const gwei = n / 1e9;
  return Number.isFinite(gwei) ? gwei : null;
}

function round(n, d = 3) {
  if (!Number.isFinite(n)) return null;
  const p = 10 ** d;
  return Math.round(n * p) / p;
}

function ratioToPctString(ratio01, digits = 2) {
  if (!Number.isFinite(ratio01)) return null;
  return (ratio01 * 100).toFixed(digits);
}

async function rpcCall(url, method, params = []) {
  const { signal, cancel } = withTimeout(RPC_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal,
    });

    let json = null;
    try {
      json = await res.json();
    } catch {
      throw new Error(`RPC non-JSON response (${res.status})`);
    }

    if (!res.ok) throw new Error(`RPC HTTP ${res.status}`);
    if (json?.error) throw new Error(json.error.message || "RPC error");
    return json?.result;
  } finally {
    cancel();
  }
}

async function rpcTry(method, params = []) {
  let lastErr = null;
  for (const url of RPC_URLS) {
    try {
      const result = await rpcCall(url, method, params);
      return { url, result };
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("All RPC endpoints failed");
}

async function fetchJson(url, timeoutMs) {
  const { signal, cancel } = withTimeout(timeoutMs);
  try {
    const r = await fetch(url, { headers: { accept: "application/json" }, signal });
    const j = await r.json();
    return { ok: r.ok, json: j };
  } finally {
    cancel();
  }
}

async function fetchEthUsd() {
  for (const u of PRICE_URLS) {
    try {
      const { ok, json } = await fetchJson(u, PRICE_TIMEOUT_MS);
      if (!ok) continue;

      const coinbase = Number(json?.data?.amount);
      if (Number.isFinite(coinbase) && coinbase > 0) return coinbase;

      const cg = Number(json?.ethereum?.usd);
      if (Number.isFinite(cg) && cg > 0) return cg;
    } catch {}
  }
  return null;
}

module.exports = async (req, res) => {
  // Only GET
  if (req.method !== "GET") {
    res.statusCode = 405;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ error: { message: "Method not allowed" } }));
    return;
  }

  try {
    // 1) Gas price
    const { url: rpcUrl, result: gasPriceHex } = await rpcTry("eth_gasPrice");
    const gasWei = hexToBigInt(gasPriceHex);
    const gasGwei = weiToGwei(gasWei);
    if (!Number.isFinite(gasGwei) || gasGwei <= 0) {
      throw new Error(`Invalid gas price from RPC: ${String(gasPriceHex)}`);
    }

    // 2) Latest block for utilization
    const { result: block } = await rpcTry("eth_getBlockByNumber", ["latest", false]);

    const lastBlock =
      block?.number && typeof block.number === "string"
        ? Number(hexToBigInt(block.number))
        : null;

    const gasUsed = block?.gasUsed ? hexToBigInt(block.gasUsed) : null;
    const gasLimit = block?.gasLimit ? hexToBigInt(block.gasLimit) : null;

    let gasUsedRatio = null; // 0..1 (number)
    let gasUsedPct = null;   // "19.58" (string) for easy UI
    if (gasUsed !== null && gasLimit !== null && gasLimit > 0n) {
      // Convert safely (values are ~tens of millions, safe for Number)
      const usedN = Number(gasUsed);
      const limitN = Number(gasLimit);
      if (Number.isFinite(usedN) && Number.isFinite(limitN) && limitN > 0) {
        gasUsedRatio = usedN / limitN;
        gasUsedPct = ratioToPctString(gasUsedRatio, 2);
      }
    }

    // 3) Tiers (simple multipliers)
    const safe = round(gasGwei, 3);
    const fast = round(gasGwei * 1.15, 3);
    const rapid = round(gasGwei * 1.25, 3);

    // 4) ETH/USD (optional)
    const ethUsd = await fetchEthUsd();

    // Caching: keep short (gas changes fast)
    res.setHeader("Cache-Control", "s-maxage=5, stale-while-revalidate=30");
    res.setHeader("content-type", "application/json");
    res.statusCode = 200;
    res.end(
      JSON.stringify({
        chain: "base",
        safe,   // number
        fast,   // number
        rapid,  // number
        lastBlock,
        gasUsedRatio, // number 0..1
        gasUsedPct,   // string like "19.58"
        ethUsd,       // number|null
        source: "base-rpc",
        rpcUrl,       // which RPC succeeded (debug)
      })
    );
  } catch (e) {
    res.statusCode = 500;
    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify({
        error: { message: e?.message || String(e) },
      })
    );
  }
};

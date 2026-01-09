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
  try {
    return BigInt(hex);
  } catch {
    return 0n;
  }
}

function weiToGwei(wei) {
  const n = Number(wei);
  if (!Number.isFinite(n)) return null;
  return n / 1e9;
}

function round(n, d = 3) {
  if (!Number.isFinite(n)) return null;
  const p = 10 ** d;
  return Math.round(n * p) / p;
}

function ratioToPctString(r, d = 2) {
  if (!Number.isFinite(r)) return null;
  return (r * 100).toFixed(d);
}

async function rpcCall(url, method, params = []) {
  const { signal, cancel } = withTimeout(RPC_TIMEOUT_MS);
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal,
    });
    const j = await r.json();
    if (!r.ok || j?.error) throw new Error("RPC error");
    return j.result;
  } finally {
    cancel();
  }
}

async function rpcTry(method, params = []) {
  let last;
  for (const url of RPC_URLS) {
    try {
      return { url, result: await rpcCall(url, method, params) };
    } catch (e) {
      last = e;
    }
  }
  throw last;
}

async function fetchJson(url, timeout) {
  const { signal, cancel } = withTimeout(timeout);
  try {
    const r = await fetch(url, { signal });
    const j = await r.json();
    return j;
  } finally {
    cancel();
  }
}

async function fetchEthUsd() {
  for (const u of PRICE_URLS) {
    try {
      const j = await fetchJson(u, PRICE_TIMEOUT_MS);
      if (j?.data?.amount) return Number(j.data.amount);
      if (j?.ethereum?.usd) return Number(j.ethereum.usd);
    } catch {}
  }
  return null;
}

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    // Gas price
    const { url: rpcUrl, result: gasHex } = await rpcTry("eth_gasPrice");
    const gasGwei = weiToGwei(hexToBigInt(gasHex));
    if (!gasGwei) throw new Error("Invalid gas");

    // Block utilization
    const { result: block } = await rpcTry("eth_getBlockByNumber", ["latest", false]);

    const gasUsed = hexToBigInt(block.gasUsed);
    const gasLimit = hexToBigInt(block.gasLimit);
    const gasUsedRatio =
      gasLimit > 0n ? Number(gasUsed) / Number(gasLimit) : null;

    // Tiers
    const safe = round(gasGwei);
    const fast = round(gasGwei * 1.15);
    const rapid = round(gasGwei * 1.25);

    // Featured actions (FIXED)
    const ethUsd = await fetchEthUsd();
    const gweiToUsd = ethUsd ? (gwei) => (gwei * 21000 * ethUsd) / 1e9 : null;

    const featuredActions = ethUsd
      ? {
          erc20Transfer: {
            low: `$${gweiToUsd(safe).toFixed(6)}`,
            avg: `$${gweiToUsd(fast).toFixed(6)}`,
            high: `$${gweiToUsd(rapid).toFixed(6)}`,
          },
          swap: {
            low: `$${(gweiToUsd(safe) * 3).toFixed(3)}`,
            avg: `$${(gweiToUsd(fast) * 3).toFixed(3)}`,
            high: `$${(gweiToUsd(rapid) * 3).toFixed(3)}`,
          },
          addRemoveLP: {
            low: `$${(gweiToUsd(safe) * 3).toFixed(3)}`,
            avg: `$${(gweiToUsd(fast) * 3).toFixed(3)}`,
            high: `$${(gweiToUsd(rapid) * 3).toFixed(3)}`,
          },
        }
      : null;

    res.setHeader("Cache-Control", "s-maxage=5, stale-while-revalidate=30");
    res.status(200).json({
      chain: "base",
      safe,
      fast,
      rapid,
      gasUsedPct: ratioToPctString(gasUsedRatio),
      ethUsd,
      featuredActions,
      source: "base-rpc",
      rpcUrl,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

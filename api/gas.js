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
  try {
    return BigInt(hex);
  } catch {
    return 0n;
  }
}

function weiToGwei(weiBig) {
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

/* =========================
   Featured Actions (NEW)
========================= */
// Estimasi gas limit (perkiraan umum EVM/Base, mirip yang explorer tampilkan)
const ACTION_GAS_LIMITS = {
  erc20Transfer: 65000, // ERC-20 transfer
  swap: 150000,         // swap (DEX)
  addRemoveLP: 200000,  // add/remove liquidity
};

// gwei * gasLimit -> ETH
function feeEthFromGwei(gwei, gasLimit) {
  if (!Number.isFinite(gwei) || !Number.isFinite(gasLimit) || gasLimit <= 0) return null;
  return (gwei * gasLimit) / 1e9;
}

// ETH -> USD
function feeUsdFromEth(feeEth, ethUsd) {
  if (!Number.isFinite(feeEth) || !Number.isFinite(ethUsd) || ethUsd <= 0) return null;
  return feeEth * ethUsd;
}

// format USD kecil biar mirip explorer (mis. $0.000349)
function formatUsdSmall(n) {
  if (!Number.isFinite(n)) return null;
  // tampilkan 6 desimal untuk nilai kecil, tapi tetap rapih
  if (n < 1) return `$${n.toFixed(6).replace(/0+$/, "").replace(/\.$/, "")}`;
  return `$${n.toFixed(3).replace(/0+$/, "").replace(/\.$/, "")}`;
}

// Buat tabel featuredActions pakai 3 tier: low/avg/high
function buildFeaturedActions({ safeGwei, fastGwei, rapidGwei, ethUsd }) {
  const tiers = {
    low: safeGwei,
    avg: fastGwei,
    high: rapidGwei,
  };

  const makeRow = (gasLimit) => {
    const lowEth = feeEthFromGwei(tiers.low, gasLimit);
    const avgEth = feeEthFromGwei(tiers.avg, gasLimit);
    const highEth = feeEthFromGwei(tiers.high, gasLimit);

    const lowUsd = feeUsdFromEth(lowEth, ethUsd);
    const avgUsd = feeUsdFromEth(avgEth, ethUsd);
    const highUsd = feeUsdFromEth(highEth, ethUsd);

    return {
      gasLimit,
      low: {
        gwei: round(tiers.low, 3),
        eth: lowEth,
        usd: lowUsd,
        usdText: formatUsdSmall(lowUsd),
      },
      avg: {
        gwei: round(tiers.avg, 3),
        eth: avgEth,
        usd: avgUsd,
        usdText: formatUsdSmall(avgUsd),
      },
      high: {
        gwei: round(tiers.high, 3),
        eth: highEth,
        usd: highUsd,
        usdText: formatUsdSmall(highUsd),
      },
    };
  };

  return {
    // format ringkas untuk UI (langsung string $...)
    simple: {
      erc20Transfer: {
        low: formatUsdSmall(feeUsdFromEth(feeEthFromGwei(tiers.low, ACTION_GAS_LIMITS.erc20Transfer), ethUsd)),
        avg: formatUsdSmall(feeUsdFromEth(feeEthFromGwei(tiers.avg, ACTION_GAS_LIMITS.erc20Transfer), ethUsd)),
        high: formatUsdSmall(feeUsdFromEth(feeEthFromGwei(tiers.high, ACTION_GAS_LIMITS.erc20Transfer), ethUsd)),
      },
      swap: {
        low: formatUsdSmall(feeUsdFromEth(feeEthFromGwei(tiers.low, ACTION_GAS_LIMITS.swap), ethUsd)),
        avg: formatUsdSmall(feeUsdFromEth(feeEthFromGwei(tiers.avg, ACTION_GAS_LIMITS.swap), ethUsd)),
        high: formatUsdSmall(feeUsdFromEth(feeEthFromGwei(tiers.high, ACTION_GAS_LIMITS.swap), ethUsd)),
      },
      addRemoveLP: {
        low: formatUsdSmall(feeUsdFromEth(feeEthFromGwei(tiers.low, ACTION_GAS_LIMITS.addRemoveLP), ethUsd)),
        avg: formatUsdSmall(feeUsdFromEth(feeEthFromGwei(tiers.avg, ACTION_GAS_LIMITS.addRemoveLP), ethUsd)),
        high: formatUsdSmall(feeUsdFromEth(feeEthFromGwei(tiers.high, ACTION_GAS_LIMITS.addRemoveLP), ethUsd)),
      },
    },

    // format lengkap (kalau mau tampil detail atau debug)
    detailed: {
      erc20Transfer: makeRow(ACTION_GAS_LIMITS.erc20Transfer),
      swap: makeRow(ACTION_GAS_LIMITS.swap),
      addRemoveLP: makeRow(ACTION_GAS_LIMITS.addRemoveLP),
    },

    // biar gampang dipakai render tabel
    rows: [
      { key: "erc20Transfer", label: "ERC-20 Transfer", ...makeRow(ACTION_GAS_LIMITS.erc20Transfer) },
      { key: "swap", label: "Swap", ...makeRow(ACTION_GAS_LIMITS.swap) },
      { key: "addRemoveLP", label: "Add/Remove LP", ...makeRow(ACTION_GAS_LIMITS.addRemoveLP) },
    ],
  };
}
/* =========================
   End Featured Actions
========================= */

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

    let gasUsedRatio = null;
    let gasUsedPct = null;
    if (gasUsed !== null && gasLimit !== null && gasLimit > 0n) {
      const usedN = Number(gasUsed);
      const limitN = Number(gasLimit);
      if (Number.isFinite(usedN) && Number.isFinite(limitN) && limitN > 0) {
        gasUsedRatio = usedN / limitN;
        gasUsedPct = ratioToPctString(gasUsedRatio, 2);
      }
    }

    // 3) Tiers
    const safe = round(gasGwei, 3);
    const fast = round(gasGwei * 1.15, 3);
    const rapid = round(gasGwei * 1.25, 3);

    // 4) ETH/USD (optional)
    const ethUsd = await fetchEthUsd();

    // 5) Featured Actions (NEW)
    const featuredActions = buildFeaturedActions({
      safeGwei: safe,
      fastGwei: fast,
      rapidGwei: rapid,
      ethUsd,
    });

    res.setHeader("Cache-Control", "s-maxage=5, stale-while-revalidate=30");
    res.setHeader("content-type", "application/json");
    res.statusCode = 200;
    res.end(
      JSON.stringify({
        chain: "base",
        safe,
        fast,
        rapid,
        lastBlock,
        gasUsedRatio,
        gasUsedPct,
        ethUsd,
        featuredActions, // ✅ NEW
        source: "base-rpc",
        rpcUrl,
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
```0

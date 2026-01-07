// /api/gas.js
// Base RPC Gas Tracker (no Etherscan key needed)

const RPC_URLS = [
  "https://mainnet.base.org",
  "https://base.llamarpc.com",
];

const PRICE_URLS = [
  "https://api.coinbase.com/v2/prices/ETH-USD/spot",
  "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd",
];

function hexToBigInt(hex) {
  if (!hex) return 0n;
  return BigInt(hex);
}

function weiToGweiNumber(weiBig) {
  const gwei = Number(weiBig) / 1e9;
  return Number.isFinite(gwei) ? gwei : null;
}

async function rpcCall(url, method, params = [], id = 1) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`RPC HTTP ${res.status}`);
  if (json.error) throw new Error(json.error.message || "RPC error");
  return json.result;
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

async function fetchEthUsd() {
  for (const u of PRICE_URLS) {
    try {
      const r = await fetch(u, { headers: { accept: "application/json" } });
      const j = await r.json();

      const coinbase = Number(j?.data?.amount);
      if (Number.isFinite(coinbase) && coinbase > 0) return coinbase;

      const cg = Number(j?.ethereum?.usd);
      if (Number.isFinite(cg) && cg > 0) return cg;
    } catch (_) {}
  }
  return null;
}

function gasUsd(gwei, gasLimit, ethUsd) {
  if (!ethUsd) return null;
  const eth = (gwei * 1e-9) * gasLimit;
  const usd = eth * ethUsd;
  return Number.isFinite(usd) ? usd : null;
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).end();
    return;
  }

  try {
    const { result: gasPriceHex } = await rpcTry("eth_gasPrice");
    const gasWei = hexToBigInt(gasPriceHex);
    const gasGwei = weiToGweiNumber(gasWei);
    if (!Number.isFinite(gasGwei)) {
      throw new Error("Invalid gas price from RPC");
    }

    const { result: block } = await rpcTry("eth_getBlockByNumber", ["latest", false]);

    const lastBlock = block?.number ? Number(hexToBigInt(block.number)) : null;
    const gasUsed = block?.gasUsed ? hexToBigInt(block.gasUsed) : null;
    const gasLimit = block?.gasLimit ? hexToBigInt(block.gasLimit) : null;

    let gasUsedRatio = null;
    if (gasUsed && gasLimit && gasLimit > 0n) {
      const ratio = Number(gasUsed) / Number(gasLimit);
      if (Number.isFinite(ratio)) gasUsedRatio = ratio.toFixed(6);
    }

    const safe = gasGwei;
    const fast = gasGwei * 1.15;
    const rapid = gasGwei * 1.25;

    const ethUsd = await fetchEthUsd();

    const estimates = {
      erc20: {
        gasLimit: 50000,
        safeUsd: gasUsd(safe, 50000, ethUsd),
        fastUsd: gasUsd(fast, 50000, ethUsd),
        rapidUsd: gasUsd(rapid, 50000, ethUsd),
      },
      swap: {
        gasLimit: 120000,
        safeUsd: gasUsd(safe, 120000, ethUsd),
        fastUsd: gasUsd(fast, 120000, ethUsd),
        rapidUsd: gasUsd(rapid, 120000, ethUsd),
      },
    };

    res.setHeader("Cache-Control", "s-maxage=5, stale-while-revalidate=30");
    res.status(200).json({
      chain: "base",
      safe,
      fast,
      rapid,
      lastBlock,
      gasUsedRatio,
      ethUsd,
      estimates,
      source: "base-rpc",
    });
  } catch (e) {
    res.status(500).json({
      error: { message: e?.message || String(e) },
    });
  }
}

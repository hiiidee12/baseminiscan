// /api/gas.js
// Base RPC Gas Tracker (NO Etherscan key required)

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

function weiToGwei(weiBig) {
  const gwei = Number(weiBig) / 1e9;
  return Number.isFinite(gwei) ? gwei : null;
}

async function rpcCall(url, method, params = []) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method,
      params,
    }),
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

      const cb = Number(j?.data?.amount);
      if (Number.isFinite(cb) && cb > 0) return cb;

      const cg = Number(j?.ethereum?.usd);
      if (Number.isFinite(cg) && cg > 0) return cg;
    } catch (_) {}
  }
  return null;
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).end();
    return;
  }

  try {
    // gas price
    const { result: gasHex } = await rpcTry("eth_gasPrice");
    const gasWei = hexToBigInt(gasHex);
    const baseGwei = weiToGwei(gasWei);
    if (!Number.isFinite(baseGwei)) {
      throw new Error("Invalid gas price from RPC");
    }

    // latest block
    const { result: block } = await rpcTry("eth_getBlockByNumber", [
      "latest",
      false,
    ]);

    const lastBlock = block?.number
      ? Number(hexToBigInt(block.number))
      : null;

    const gasUsed = block?.gasUsed ? hexToBigInt(block.gasUsed) : null;
    const gasLimit = block?.gasLimit ? hexToBigInt(block.gasLimit) : null;

    let gasUsedRatio = null;
    if (gasUsed && gasLimit && gasLimit > 0n) {
      const ratio = Number(gasUsed) / Number(gasLimit);
      if (Number.isFinite(ratio)) gasUsedRatio = ratio;
    }

    // tiers (mirip BaseScan)
    const safe = baseGwei;
    const fast = baseGwei * 1.15;
    const rapid = baseGwei * 1.25;

    // ETH price
    const ethUsd = await fetchEthUsd();

    res.setHeader(
      "Cache-Control",
      "s-maxage=5, stale-while-revalidate=30"
    );

    res.status(200).json({
      chain: "base",
      safe,
      fast,
      rapid,
      lastBlock,
      gasUsedRatio,
      ethUsd,
      source: "base-rpc",
    });
  } catch (e) {
    res.status(500).json({
      error: {
        message: e?.message || String(e),
      },
    });
  }
}

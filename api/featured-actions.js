export default async function handler(req, res) {
  try {
    // Cache agak lama (aman)
    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");
    res.setHeader("Vary", "Accept-Encoding");

    const RPC_URLS = [
      "https://mainnet.base.org",
      "https://base.llamarpc.com",
    ];

    const PRICE_URLS = [
      "https://api.coinbase.com/v2/prices/ETH-USD/spot",
      "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd",
    ];

    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    // ---------- helpers ----------
    const tryWithFallback = async (urls, fn) => {
      let last;
      for (const u of urls) {
        try {
          return await fn(u);
        } catch (e) {
          last = e;
          await sleep(200);
        }
      }
      throw last || new Error("ALL_SOURCES_FAILED");
    };

    const fetchJson = async (url, options = {}) => {
      const r = await fetch(url, options);
      if (!r.ok) throw new Error("FETCH_FAILED");
      return r.json();
    };

    // ---------- 1) Gas price (wei) ----------
    const gasPriceWei = await tryWithFallback(RPC_URLS, async (rpc) => {
      const j = await fetchJson(rpc, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "eth_gasPrice",
          params: [],
        }),
      });
      return Number(BigInt(j.result)); // wei
    });

    const gasPriceGwei = gasPriceWei / 1e9;

    // Simple multipliers (tanpa oracle)
    const gasGwei = {
      low: gasPriceGwei * 0.9,
      average: gasPriceGwei,
      high: gasPriceGwei * 1.2,
    };

    // ---------- 2) ETH price ----------
    const ethUsd = await tryWithFallback(PRICE_URLS, async (url) => {
      const j = await fetchJson(url);
      if (j?.data?.amount) return Number(j.data.amount); // Coinbase
      if (j?.ethereum?.usd) return Number(j.ethereum.usd); // CoinGecko
      throw new Error("PRICE_PARSE_FAILED");
    });

    // ---------- 3) Featured actions ----------
    const actions = [
      { key: "erc20", label: "ERC-20 Transfer", gasUsed: 65000 },
      { key: "swap", label: "Swap", gasUsed: 150000 },
      { key: "lp", label: "Add/Remove LP", gasUsed: 220000 },
    ];

    const costUsd = (gasUsed, gwei) => {
      const wei = gwei * 1e9;
      const eth = (gasUsed * wei) / 1e18;
      return eth * ethUsd;
    };

    const featuredActions = actions.map((a) => ({
      key: a.key,
      label: a.label,
      low: costUsd(a.gasUsed, gasGwei.low),
      average: costUsd(a.gasUsed, gasGwei.average),
      high: costUsd(a.gasUsed, gasGwei.high),
      gasUsed: a.gasUsed,
    }));

    return res.status(200).json({
      chain: "base",
      ethUsd,
      gasGwei,
      featuredActions,
      updatedAt: Date.now(),
      source: "rpc+public-price",
    });
  } catch {
    return res.status(500).json({ error: "Internal server error" });
  }
}

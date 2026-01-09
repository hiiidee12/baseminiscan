export default async function handler(req, res) {
  try {
    const address = (req.query.address || "").toString().trim();

    // Tab selection logic
    const tabRaw = (req.query.tab || "tx").toString().trim().toLowerCase();
    const tab =
      tabRaw === "erc20" ? "erc20" :
      tabRaw === "internal" ? "internal" :
      "tx";

    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const offset = Math.min(25, Math.max(1, parseInt(req.query.offset || "25", 10)));
    const wantCount = (req.query.count ?? "1").toString() !== "0";

    // Validate Ethereum address format
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return res.status(400).json({ error: "Invalid address" });
    }

    // API key pools
    const BALANCE_KEYS = [
      process.env.ETHERSCAN_API_KEY,
      process.env.ETHERSCAN_API_KEY_2,
      process.env.ETHERSCAN_API_KEY_3,
      process.env.ETHERSCAN_API_KEY_4,
    ].filter(Boolean);

    const TX_KEYS = [
      process.env.ETHERSCAN_API_KEY_5,
      process.env.ETHERSCAN_API_KEY_6,
      process.env.ETHERSCAN_API_KEY_7,
      process.env.ETHERSCAN_API_KEY_8,
    ].filter(Boolean);

    const ERC20_KEYS = [
      process.env.ETHERSCAN_API_KEY_9,
      process.env.ETHERSCAN_API_KEY_10,
      process.env.ETHERSCAN_API_KEY_11,
      process.env.ETHERSCAN_API_KEY_12,
    ].filter(Boolean);

    const INTERNAL_KEYS = [
      process.env.ETHERSCAN_API_KEY_21,
      process.env.ETHERSCAN_API_KEY_22,
      process.env.ETHERSCAN_API_KEY_23,
      process.env.ETHERSCAN_API_KEY_24,
    ].filter(Boolean);

    const COUNT_KEYS = [
      process.env.ETHERSCAN_API_KEY_13,
      process.env.ETHERSCAN_API_KEY_14,
      process.env.ETHERSCAN_API_KEY_15,
      process.env.ETHERSCAN_API_KEY_16,
      process.env.ETHERSCAN_API_KEY_17,
      process.env.ETHERSCAN_API_KEY_18,
      process.env.ETHERSCAN_API_KEY_19,
      process.env.ETHERSCAN_API_KEY_20,
    ].filter(Boolean);

    const API = "https://api.etherscan.io/v2/api";

    // Utility functions
    const qs = (p) =>
      Object.entries(p)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join("&");

    const isOkOrEmpty = (j) => j?.status === "1" || j?.message === "No transactions found";

    const isRateLimited = (j) => {
      const m = (j?.result || j?.message || "").toString().toLowerCase();
      return m.includes("rate limit") || m.includes("max rate") || m.includes("too many");
    };

    const fetchJson = async (url) => {
      const r = await fetch(url);
      const j = await r.json().catch(() => ({}));
      return { json: j };
    };

    const tryWithPool = async (pool, fn) => {
      let last;
      for (const k of pool) {
        try {
          return await fn(k);
        } catch (e) {
          last = e;
        }
      }
      throw last;
    };

    // Fetch balance
    const balance = await tryWithPool(BALANCE_KEYS, async (apikey) => {
      const url = `${API}?${qs({
        chainid: 8453,
        module: "account",
        action: "balance",
        address,
        tag: "latest",
        apikey,
      })}`;
      const { json } = await fetchJson(url);
      if (json?.status !== "1") {
        if (isRateLimited(json)) throw new Error();
        throw new Error();
      }
      return json.result;
    });

    // Determine action and key pool based on tab
    const listAction =
      tab === "erc20" ? "tokentx" :
      tab === "internal" ? "txlistinternal" :
      "txlist";

    const listPool =
      tab === "erc20" ? ERC20_KEYS :
      tab === "internal" ? (INTERNAL_KEYS.length ? INTERNAL_KEYS : TX_KEYS) :
      TX_KEYS;

    // Fetch transaction list
    const list = await tryWithPool(listPool, async (apikey) => {
      const url = `${API}?${qs({
        chainid: 8453,
        module: "account",
        action: listAction,
        address,
        page,
        offset,
        sort: "desc",
        apikey,
      })}`;
      const { json } = await fetchJson(url);
      if (!isOkOrEmpty(json)) {
        if (isRateLimited(json)) throw new Error();
        throw new Error();
      }
      return Array.isArray(json.result) ? json.result : [];
    });

    // Optional: fetch approximate transaction count
    let txCount = null;
    if (wantCount && COUNT_KEYS.length) {
      const PAGE = 1000;
      const CAP = 1000;

      const pageLen = async (apikey, p) => {
        const url = `${API}?${qs({
          chainid: 8453,
          module: "account",
          action: "txlist",
          address,
          page: p,
          offset: PAGE,
          sort: "desc",
          apikey,
        })}`;
        const { json } = await fetchJson(url);
        if (!isOkOrEmpty(json)) {
          if (isRateLimited(json)) throw new Error();
          throw new Error();
        }
        return Array.isArray(json.result) ? json.result.length : 0;
      };

      try {
        txCount = await tryWithPool(COUNT_KEYS, async (apikey) => {
          const l1 = await pageLen(apikey, 1);

          if (l1 === 0) return 0;
          if (l1 < PAGE) return l1;

          return "1K+";
        });
      } catch {
        txCount = null;
      }
    }

    // Set caching headers and return response
    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=120");

    return res.status(200).json({
      address,
      chain: "base",
      tab,
      balanceWei: balance,
      totalTxCount: txCount,
      txCount,
      list,
    });
  } catch (e) {
    return res.status(500).json({ error: "Internal server error" });
  }
}

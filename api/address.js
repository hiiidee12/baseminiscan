export default async function handler(req, res) {
  try {
    const address = (req.query.address || "").toString().trim();
    const tab = (req.query.tab || "tx").toString().trim().toLowerCase() === "erc20" ? "erc20" : "tx";
    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const offset = Math.min(25, Math.max(1, parseInt(req.query.offset || "25", 10)));
    const wantCount = (req.query.count ?? "1").toString() !== "0";

    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return res.status(400).json({ error: "Invalid address" });
    }

    const BALANCE_KEYS = [
      process.env.ETHERSCAN_API_KEY,
      process.env.ETHERSCAN_API_KEY_2,
      process.env.ETHERSCAN_API_KEY_3,
    ].filter(Boolean);

    const TX_KEYS = [
      process.env.ETHERSCAN_API_KEY_4,
      process.env.ETHERSCAN_API_KEY_5,
      process.env.ETHERSCAN_API_KEY_6,
    ].filter(Boolean);

    const ERC20_KEYS = [
      process.env.ETHERSCAN_API_KEY_7,
      process.env.ETHERSCAN_API_KEY_8,
      process.env.ETHERSCAN_API_KEY_9,
    ].filter(Boolean);

    const COUNT_KEYS = [
      process.env.ETHERSCAN_API_KEY_10,
      process.env.ETHERSCAN_API_KEY_11,
      process.env.ETHERSCAN_API_KEY_12,
      process.env.ETHERSCAN_API_KEY_13,
      process.env.ETHERSCAN_API_KEY_14,
      process.env.ETHERSCAN_API_KEY_15,
    ].filter(Boolean);

    const API = "https://api.etherscan.io/v2/api";

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

    const listAction = tab === "erc20" ? "tokentx" : "txlist";
    const listPool = tab === "erc20" ? ERC20_KEYS : TX_KEYS;

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

    let txCount = null;

    if (wantCount && COUNT_KEYS.length) {
      const PAGE = 1000;
      const CAP = 200000;
      const MAX = Math.ceil(CAP / PAGE);

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
          if (l1 < PAGE) return l1;

          let lo = 1,
            hi = 2;
          while (hi <= MAX && (await pageLen(apikey, hi)) > 0) {
            lo = hi;
            hi *= 2;
          }
          if (hi > MAX) return `${CAP}+`;

          while (lo + 1 < hi) {
            const mid = Math.floor((lo + hi) / 2);
            if ((await pageLen(apikey, mid)) === 0) hi = mid;
            else lo = mid;
          }

          const last = await pageLen(apikey, lo);
          const total = (lo - 1) * PAGE + last;
          return total >= CAP ? `${CAP}+` : total;
        });
      } catch {
        txCount = null;
      }
    }

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

export default async function handler(req, res) {
  try {
    const address = (req.query.address || "").toString().trim();

    // Tab selection logic
    const tabRaw = (req.query.tab || "tx").toString().trim().toLowerCase();
    const tab =
      tabRaw === "erc20" ? "erc20" :
      tabRaw === "internal" ? "internal" :
      tabRaw === "nft" ? "nft" :
      "tx";

    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const offset = Math.min(25, Math.max(1, parseInt(req.query.offset || "25", 10)));
    const wantCount = (req.query.count ?? "1").toString() !== "0";

    // Validate Ethereum address format
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return res.status(400).json({ error: "Invalid address" });
    }

    // CDN caches full URL incl. query
    const cacheByTab = {
      tx: "s-maxage=30, stale-while-revalidate=120",
      erc20: "s-maxage=30, stale-while-revalidate=180",
      internal: "s-maxage=60, stale-while-revalidate=300",
      nft: "s-maxage=120, stale-while-revalidate=900",
    };
    res.setHeader("Cache-Control", cacheByTab[tab] || cacheByTab.tx);
    res.setHeader("Vary", "Accept-Encoding");

    // API key pools
    const BALANCE_KEYS = [
      process.env.ETHERSCAN_API_KEY,
      process.env.ETHERSCAN_API_KEY_2,
      process.env.ETHERSCAN_API_KEY_3,
      process.env.ETHERSCAN_API_KEY_4,
      process.env.ETHERSCAN_API_KEY_21,
      process.env.ETHERSCAN_API_KEY_22,
      process.env.ETHERSCAN_API_KEY_23,
      process.env.ETHERSCAN_API_KEY_24,
    ].filter(Boolean);

    const TX_KEYS = [
      process.env.ETHERSCAN_API_KEY_5,
      process.env.ETHERSCAN_API_KEY_6,
      process.env.ETHERSCAN_API_KEY_7,
      process.env.ETHERSCAN_API_KEY_8,
      process.env.ETHERSCAN_API_KEY_33,
      process.env.ETHERSCAN_API_KEY_34,
      process.env.ETHERSCAN_API_KEY_25,
      process.env.ETHERSCAN_API_KEY_26,
      process.env.ETHERSCAN_API_KEY_27,
      process.env.ETHERSCAN_API_KEY_28,
      process.env.ETHERSCAN_API_KEY_29,
      process.env.ETHERSCAN_API_KEY_30,
      process.env.ETHERSCAN_API_KEY_31,
      process.env.ETHERSCAN_API_KEY_32,
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

    const NFT_KEYS = [
      process.env.ETHERSCAN_API_KEY_25,
      process.env.ETHERSCAN_API_KEY_26,
      process.env.ETHERSCAN_API_KEY_27,
      process.env.ETHERSCAN_API_KEY_28,
      process.env.ETHERSCAN_API_KEY_29,
      process.env.ETHERSCAN_API_KEY_30,
      process.env.ETHERSCAN_API_KEY_31,
      process.env.ETHERSCAN_API_KEY_32,
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

    const isRateLimited = (j, httpStatus) => {
      if (httpStatus === 429) return true;
      const m = (j?.result || j?.message || j?.error || "").toString().toLowerCase();
      return (
        m.includes("rate limit") ||
        m.includes("max rate") ||
        m.includes("too many") ||
        m.includes("throttle") ||
        m.includes("throttled") ||
        m.includes("busy") ||
        m.includes("temporarily")
      );
    };

    const fetchJson = async (url, { timeoutMs = 10_000 } = {}) => {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), timeoutMs);
      try {
        const r = await fetch(url, { signal: ctl.signal });
        const text = await r.text();
        let json = {};
        try {
          json = JSON.parse(text);
        } catch {
          json = { message: text?.slice(0, 200) || "" };
        }
        return { json, httpStatus: r.status, ok: r.ok };
      } finally {
        clearTimeout(t);
      }
    };

    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    const tryWithPool = async (pool, fn, { retryDelayMs = 250 } = {}) => {
      if (!pool || pool.length === 0) throw new Error("NO_API_KEYS");
      let lastErr;
      for (let i = 0; i < pool.length; i++) {
        const k = pool[i];
        try {
          return await fn(k);
        } catch (e) {
          lastErr = e;
          await sleep(retryDelayMs + Math.floor(Math.random() * 200));
        }
      }
      throw lastErr || new Error("ALL_KEYS_FAILED");
    };

    const isTransientHttp = (s) => [502, 503, 504].includes(s);

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

      const { json, httpStatus, ok } = await fetchJson(url);

      if (!ok || json?.status !== "1") {
        // rotate key only for throttling/transient
        if (isRateLimited(json, httpStatus) || isTransientHttp(httpStatus)) {
          throw new Error("RETRY_KEY");
        }
        throw new Error(json?.message || "BALANCE_FAILED");
      }

      return json.result;
    });

    // NFT tab
    if (tab === "nft") {
      if (!NFT_KEYS.length) {
        return res.status(200).json({
          address,
          chain: "base",
          tab,
          balanceWei: balance,
          list: [],
        });
      }

      const take = Math.min(200, page * offset);

      const fetchNFT = async (action, apikey) => {
        const url = `${API}?${qs({
          chainid: 8453,
          module: "account",
          action,
          address,
          page: 1,
          offset: take,
          sort: "desc",
          apikey,
        })}`;

        const { json, httpStatus, ok } = await fetchJson(url);

        if (!ok || !isOkOrEmpty(json)) {
          if (isRateLimited(json, httpStatus) || isTransientHttp(httpStatus)) {
            throw new Error("RETRY_KEY");
          }
          throw new Error(json?.message || "NFT_FAILED");
        }

        return Array.isArray(json.result) ? json.result : [];
      };

      const list = await tryWithPool(NFT_KEYS, async (apikey) => {
        const [n721, n1155] = await Promise.all([
          fetchNFT("tokennfttx", apikey),
          fetchNFT("token1155tx", apikey),
        ]);

        const merged = [
          ...n721.map((x) => ({ ...x, nftStd: "ERC-721" })),
          ...n1155.map((x) => ({ ...x, nftStd: "ERC-1155" })),
        ];

        merged.sort((a, b) => Number(b.timeStamp) - Number(a.timeStamp));

        const start = (page - 1) * offset;
        return merged.slice(start, start + offset);
      });

      return res.status(200).json({
        address,
        chain: "base",
        tab,
        balanceWei: balance,
        list,
      });
    }

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

      const { json, httpStatus, ok } = await fetchJson(url);

      if (!ok || !isOkOrEmpty(json)) {
        if (isRateLimited(json, httpStatus) || isTransientHttp(httpStatus)) {
          throw new Error("RETRY_KEY");
        }
        throw new Error(json?.message || "LIST_FAILED");
      }

      return Array.isArray(json.result) ? json.result : [];
    });

    // Optional: fetch approximate transaction count
    let txCount = null;
    if (wantCount && COUNT_KEYS.length) {
      const PAGE = 1000;

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

        const { json, httpStatus, ok } = await fetchJson(url);

        if (!ok || !isOkOrEmpty(json)) {
          if (isRateLimited(json, httpStatus) || isTransientHttp(httpStatus)) {
            throw new Error("RETRY_KEY");
          }
          throw new Error(json?.message || "COUNT_FAILED");
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
    // Optional: expose minimal signal for debugging without leaking internals
    // const msg = (e && e.message) ? e.message : "";
    return res.status(500).json({ error: "Internal server error" });
  }
}

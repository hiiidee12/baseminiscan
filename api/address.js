export default async function handler(req, res) {
  try {
    const address = (req.query.address || "").toString().trim();
    const tab = (req.query.tab || "tx").toString().trim(); // tx | erc20
    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const offset = Math.min(25, Math.max(1, parseInt(req.query.offset || "25", 10)));

    // Validate address
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return res.status(400).json({ error: "Invalid address" });
    }

    // === MULTI API KEY (ROTATE / FALLBACK) ===
    const API_KEYS = [
      process.env.ETHERSCAN_API_KEY,
      process.env.ETHERSCAN_KEY_2,
    ].filter(Boolean);

    if (API_KEYS.length === 0) {
      return res.status(500).json({ error: "Missing Etherscan API key(s)" });
    }

    const API = "https://api.etherscan.io/v2/api";

    const qs = (params) =>
      Object.entries(params)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join("&");

    const listAction = tab === "erc20" ? "tokentx" : "txlist";

    const isOkOrEmpty = (j) =>
      j?.status === "1" || j?.message === "No transactions found";

    const isRateLimited = (j) => {
      const msg = (j?.result || j?.message || "").toString().toLowerCase();
      // Etherscan biasanya balikin "Max rate limit reached" di result/message
      return msg.includes("rate limit") || msg.includes("max rate") || msg.includes("too many");
    };

    const fetchJson = async (url) => {
      const r = await fetch(url);
      const j = await r.json().catch(() => ({}));
      return { ok: r.ok, status: r.status, json: j };
    };

    const buildBalanceUrl = (apikey) =>
      `${API}?` +
      qs({
        chainid: 8453,
        module: "account",
        action: "balance",
        address,
        tag: "latest",
        apikey,
      });

    const buildListUrl = (apikey, action, p, off) =>
      `${API}?` +
      qs({
        chainid: 8453,
        module: "account",
        action,
        address,
        page: p,
        offset: off,
        sort: "desc",
        apikey,
      });

    // Try each key in order; if rate-limited / error -> next key
    const tryWithKeys = async (fnPerKey) => {
      let last = null;
      for (const apikey of API_KEYS) {
        try {
          const out = await fnPerKey(apikey);
          return out;
        } catch (e) {
          last = e;
        }
      }
      throw last || new Error("All API keys failed");
    };

    // --- Fetch balance + tab list (25 items default) ---
    const { balanceJson, listJson, usedKey } = await tryWithKeys(async (apikey) => {
      const balanceUrl = buildBalanceUrl(apikey);
      const listUrl = buildListUrl(apikey, listAction, page, offset);

      const [b, l] = await Promise.all([fetchJson(balanceUrl), fetchJson(listUrl)]);

      const bj = b.json;
      const lj = l.json;

      // balance MUST be status=1
      if (bj?.status !== "1") {
        if (isRateLimited(bj)) throw new Error("Rate limited (balance)");
        throw new Error("Balance API error");
      }

      // list can be status=1 OR "No transactions found"
      if (!isOkOrEmpty(lj)) {
        if (isRateLimited(lj)) throw new Error("Rate limited (list)");
        throw new Error("List API error");
      }

      return { balanceJson: bj, listJson: lj, usedKey: apikey };
    });

    // --- Compute TOTAL txCount (for normal txlist only) ---
    // We only compute total normal tx count (not erc20 transfers count)
    // Best-effort with a cap to avoid hammering API.
    const MAX_PAGES = 10; // 10*1000 = 10k tx max counted; if more => "10000+"
    const COUNT_PAGE_SIZE = 1000;

    const countAllTx = async () => {
      return await tryWithKeys(async (apikey) => {
        let total = 0;

        for (let p = 1; p <= MAX_PAGES; p++) {
          const url = buildListUrl(apikey, "txlist", p, COUNT_PAGE_SIZE);
          const { json } = await fetchJson(url);

          if (!isOkOrEmpty(json)) {
            if (isRateLimited(json)) throw new Error("Rate limited (count)");
            throw new Error("Count API error");
          }

          const arr = Array.isArray(json.result) ? json.result : [];
          total += arr.length;

          // last page
          if (arr.length < COUNT_PAGE_SIZE) return total;
        }

        // hit cap
        return `${MAX_PAGES * COUNT_PAGE_SIZE}+`;
      });
    };

    let txCount = null;
    try {
      txCount = await countAllTx();
    } catch {
      // If counting fails (rate limit), still return list+balance
      txCount = null;
    }

    // Cache (penting buat limit)
    res.setHeader("Cache-Control", "s-maxage=15, stale-while-revalidate=60");

    return res.status(200).json({
      address,
      chain: "base",
      tab,
      balanceWei: balanceJson.result,
      txCount, // ✅ total normal tx count (best-effort). could be number, "10000+", or null
      list: Array.isArray(listJson.result) ? listJson.result : [],
      meta: {
        page,
        offset,
        keyUsed: usedKey ? "rotated" : "unknown",
      },
    });
  } catch (err) {
    return res.status(500).json({
      error: "Internal server error",
      detail: String(err?.message || err),
    });
  }
}

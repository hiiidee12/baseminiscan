export default async function handler(req, res) {
  try {
    const address = (req.query.address || "").toString().trim();
    const tab = (req.query.tab || "tx").toString().trim().toLowerCase(); // tx | erc20
    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const offset = Math.min(25, Math.max(1, parseInt(req.query.offset || "25", 10)));
    const wantCount = (req.query.count ?? "1").toString() !== "0"; // default: hitung

    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return res.status(400).json({ error: "Invalid address" });
    }

    // 2 API KEYS ONLY
    const API_KEYS = [
      process.env.ETHERSCAN_API_KEY,
      process.env.ETHERSCAN_API_KEY_2,
      process.env.ETHERSCAN_API_KEY_3,
      process.env.ETHERSCAN_API_KEY_4,
    ].filter(Boolean);

    if (API_KEYS.length === 0) {
      return res.status(500).json({ error: "Missing Etherscan API key(s)" });
    }

    const API = "https://api.etherscan.io/v2/api";

    const qs = (params) =>
      Object.entries(params)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join("&");

    const isOkOrEmpty = (j) =>
      j?.status === "1" || j?.message === "No transactions found";

    const isRateLimited = (j) => {
      const msg = (j?.result || j?.message || "").toString().toLowerCase();
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

    const listAction = tab === "erc20" ? "tokentx" : "txlist";

    // Try each key in order; only fall back on error / rate limit
    const tryWithKeys = async (fnPerKey) => {
      let lastErr = null;
      for (const apikey of API_KEYS) {
        try {
          return await fnPerKey(apikey);
        } catch (e) {
          lastErr = e;
        }
      }
      throw lastErr || new Error("All API keys failed");
    };

    // --- Fetch balance + tab list (utama, wajib) ---
    const { balanceJson, listJson, usedKey } = await tryWithKeys(async (apikey) => {
      const balanceUrl = buildBalanceUrl(apikey);
      const listUrl = buildListUrl(apikey, listAction, page, offset);

      const [b, l] = await Promise.all([fetchJson(balanceUrl), fetchJson(listUrl)]);

      const bj = b.json;
      const lj = l.json;

      if (bj?.status !== "1") {
        if (isRateLimited(bj)) throw new Error("Rate limited (balance)");
        throw new Error("Balance API error");
      }

      if (!isOkOrEmpty(lj)) {
        if (isRateLimited(lj)) throw new Error("Rate limited (list)");
        throw new Error("List API error");
      }

      return { balanceJson: bj, listJson: lj, usedKey: apikey };
    });

    // --- Compute TOTAL txCount (normal txlist) dengan lebih hemat request ---
    // Catatan: Etherscan/Basescan API gak ngasih "total" langsung, jadi kita cari page terakhir.
    const COUNT_PAGE_SIZE = 1000;
    const MAX_TOTAL_CAP = 200000; // safety cap; jika lebih => "200000+"
    const MAX_PAGE_CAP = Math.ceil(MAX_TOTAL_CAP / COUNT_PAGE_SIZE);

    const fetchTxPageLen = async (apikey, p) => {
      const url = buildListUrl(apikey, "txlist", p, COUNT_PAGE_SIZE);
      const { json } = await fetchJson(url);

      if (!isOkOrEmpty(json)) {
        if (isRateLimited(json)) throw new Error("Rate limited (count)");
        throw new Error("Count API error");
      }

      const arr = Array.isArray(json.result) ? json.result : [];
      return arr.length;
    };

    const countAllTx = async () => {
      return await tryWithKeys(async (apikey) => {
        // 1) quick check page 1
        const len1 = await fetchTxPageLen(apikey, 1);
        if (len1 === 0) return 0;
        if (len1 < COUNT_PAGE_SIZE) return len1;

        // 2) exponential search untuk cari upper bound (page terakhir)
        let lo = 1;
        let hi = 2;

        while (hi <= MAX_PAGE_CAP) {
          const len = await fetchTxPageLen(apikey, hi);
          if (len === 0) break;
          lo = hi;
          hi *= 2;
        }

        if (hi > MAX_PAGE_CAP) {
          // melewati cap
          return `${MAX_TOTAL_CAP}+`;
        }

        // 3) binary search: cari last page yang masih ada isinya
        let left = lo;
        let right = hi;
        while (left + 1 < right) {
          const mid = Math.floor((left + right) / 2);
          const len = await fetchTxPageLen(apikey, mid);
          if (len === 0) right = mid;
          else left = mid;
        }

        const lastPage = left;
        const lastLen = await fetchTxPageLen(apikey, lastPage);

        // total = full pages sebelum last + lastLen
        const total = (lastPage - 1) * COUNT_PAGE_SIZE + lastLen;

        if (total >= MAX_TOTAL_CAP) return `${MAX_TOTAL_CAP}+`;
        return total;
      });
    };

    let txCount = null;
    if (wantCount) {
      try {
        txCount = await countAllTx();
      } catch {
        txCount = null;
      }
    }

    // Cache (penting buat limit)
    // Kamu bisa naikin s-maxage kalau masih sering kena limit
    res.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=180");

    return res.status(200).json({
      address,
      chain: "base",
      tab,
      balanceWei: balanceJson.result,

      // dua nama biar kompatibel
      totalTxCount: txCount,
      txCount: txCount,

      list: Array.isArray(listJson.result) ? listJson.result : [],
      meta: {
        page,
        offset,
        keyUsed: usedKey ? "rotated" : "unknown",
        wantCount,
      },
    });
  } catch (err) {
    return res.status(500).json({
      error: "Internal server error",
      detail: String(err?.message || err),
    });
  }
}

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

    // === MULTI API KEY (ROUND / FALLBACK) ===
    const API_KEYS = [
      process.env.ETHERSCAN_API_KEY,
      process.env.ETHERSCAN_KEY_2,
    ].filter(Boolean);

    if (API_KEYS.length === 0) {
      return res.status(500).json({ error: "Missing Etherscan API key(s)" });
    }

    // Simple random pick (good enough for load spreading)
    const pickKey = () =>
      API_KEYS[Math.floor(Math.random() * API_KEYS.length)];

    const API = "https://api.etherscan.io/v2/api";

    const qs = (params) =>
      Object.entries(params)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join("&");

    const listAction = tab === "erc20" ? "tokentx" : "txlist";

    const fetchWithKey = async () => {
      const apikey = pickKey();

      const balanceUrl =
        `${API}?` +
        qs({
          chainid: 8453,
          module: "account",
          action: "balance",
          address,
          tag: "latest",
          apikey,
        });

      const listUrl =
        `${API}?` +
        qs({
          chainid: 8453,
          module: "account",
          action: listAction,
          address,
          page,
          offset,
          sort: "desc",
          apikey,
        });

      const [balanceRes, listRes] = await Promise.all([
        fetch(balanceUrl),
        fetch(listUrl),
      ]);

      const balanceJson = await balanceRes.json();
      const listJson = await listRes.json();

      return { balanceJson, listJson };
    };

    // === TRY 2x (kalau key pertama kena limit) ===
    let balanceJson, listJson;
    for (let i = 0; i < API_KEYS.length; i++) {
      const r = await fetchWithKey();
      if (r.balanceJson?.status === "1") {
        balanceJson = r.balanceJson;
        listJson = r.listJson;
        break;
      }
    }

    if (!balanceJson || balanceJson.status !== "1") {
      return res.status(502).json({
        error: "Balance API error",
        raw: balanceJson,
      });
    }

    if (
      listJson?.status !== "1" &&
      listJson?.message !== "No transactions found"
    ) {
      return res.status(502).json({
        error: "List API error",
        raw: listJson,
      });
    }

    // Cache (PENTING buat limit)
    res.setHeader("Cache-Control", "s-maxage=15, stale-while-revalidate=60");

    return res.status(200).json({
      address,
      chain: "base",
      tab,
      balanceWei: balanceJson.result,
      list: Array.isArray(listJson.result) ? listJson.result : [],
    });
  } catch (err) {
    return res.status(500).json({
      error: "Internal server error",
      detail: String(err),
    });
  }
}

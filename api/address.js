export default async function handler(req, res) {
  try {
    const address = (req.query.address || "").toString().trim();
    const tab = (req.query.tab || "tx").toString().trim(); // "tx" | "erc20"
    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const offset = Math.min(25, Math.max(1, parseInt(req.query.offset || "25", 10)));

    // Validate address
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return res.status(400).json({ error: "Invalid address" });
    }

    const apiKey = process.env.BASESCAN_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Missing BASESCAN_API_KEY" });
    }

    // Etherscan API V2 (Multichain)
    // Base chainId = 8453
    const API = "https://api.etherscan.io/v2/api";

    const qs = (params) =>
      Object.entries(params)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join("&");

    // --- Balance ---
    const balanceUrl =
      `${API}?` +
      qs({
        chainid: 8453,
        module: "account",
        action: "balance",
        address,
        tag: "latest",
        apikey: apiKey,
      });

    // --- Transactions or ERC20 Transfers ---
    const listAction = tab === "erc20" ? "tokentx" : "txlist";

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
        apikey: apiKey,
      });

    // Fetch both in parallel
    const [balanceRes, listRes] = await Promise.all([
      fetch(balanceUrl),
      fetch(listUrl),
    ]);

    const balanceJson = await balanceRes.json();
    const listJson = await listRes.json();

    // Handle API errors
    if (balanceJson?.status !== "1") {
      return res.status(502).json({
        error: "Balance API error",
        message: balanceJson?.message,
        raw: balanceJson,
      });
    }

    if (listJson?.status !== "1" && listJson?.message !== "No transactions found") {
      return res.status(502).json({
        error: "List API error",
        message: listJson?.message,
        raw: listJson,
      });
    }

    // Cache for performance (Vercel edge-friendly)
    res.setHeader("Cache-Control", "s-maxage=10, stale-while-revalidate=60");

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

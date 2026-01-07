export default async function handler(req, res) {
  try {
    const q = (req.query.q || "").toString().trim();
    if (!q) return res.status(400).json({ error: "Missing q" });

    // 🔑 POOL API KEYS (2 key)
    const API_KEYS = [
      process.env.BASESCAN_API_KEY,
      process.env.BASESCAN_API_KEY_2,
    ].filter(Boolean);

    if (!API_KEYS.length) {
      return res.status(500).json({ error: "Missing BASESCAN_API_KEY(s)" });
    }

    // simple random pick (load spreading)
    const pickKey = () =>
      API_KEYS[Math.floor(Math.random() * API_KEYS.length)];

    const isAddress = /^0x[a-fA-F0-9]{40}$/.test(q);
    const isTx = /^0x[a-fA-F0-9]{64}$/.test(q);
    const isBlock = /^[0-9]{1,20}$/.test(q);

    // 🔵 Etherscan API V2 (Multichain)
    // Base chain ID = 8453
    const base = "https://api.etherscan.io/v2/api";
    let url = "";

    const apikey = pickKey();

    if (isAddress) {
      url =
        `${base}?chainid=8453` +
        `&module=account` +
        `&action=balance` +
        `&address=${q}` +
        `&tag=latest` +
        `&apikey=${apikey}`;
    } else if (isTx) {
      url =
        `${base}?chainid=8453` +
        `&module=transaction` +
        `&action=gettxreceiptstatus` +
        `&txhash=${q}` +
        `&apikey=${apikey}`;
    } else if (isBlock) {
      url =
        `${base}?chainid=8453` +
        `&module=block` +
        `&action=getblockreward` +
        `&blockno=${q}` +
        `&apikey=${apikey}`;
    } else {
      return res.status(400).json({ error: "Invalid query" });
    }

    const r = await fetch(url, {
      headers: { accept: "application/json" },
    });
    const data = await r.json();

    // 🧠 CACHE (penting buat limit)
    res.setHeader("Cache-Control", "s-maxage=10, stale-while-revalidate=60");

    return res.status(200).json({
      q,
      chain: "base",
      data,
    });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
}

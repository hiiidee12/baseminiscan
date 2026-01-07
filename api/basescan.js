export default async function handler(req, res) {
  try {
    const q = (req.query.q || "").toString().trim();
    if (!q) return res.status(400).json({ error: "Missing q" });

    const apiKey = process.env.BASESCAN_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "Missing BASESCAN_API_KEY" });

    const isAddress = /^0x[a-fA-F0-9]{40}$/.test(q);
    const isTx = /^0x[a-fA-F0-9]{64}$/.test(q);
    const isBlock = /^[0-9]{1,20}$/.test(q);

    const base = "https://api.basescan.org/api";
    let url;

    if (isAddress) {
      url = `${base}?module=account&action=balance&address=${q}&tag=latest&apikey=${apiKey}`;
    } else if (isTx) {
      url = `${base}?module=transaction&action=gettxreceiptstatus&txhash=${q}&apikey=${apiKey}`;
    } else if (isBlock) {
      url = `${base}?module=block&action=getblockreward&blockno=${q}&apikey=${apiKey}`;
    } else {
      url = `${base}?module=proxy&action=eth_blockNumber&apikey=${apiKey}`;
    }

    const r = await fetch(url);
    const data = await r.json();

    res.setHeader("Cache-Control", "s-maxage=10, stale-while-revalidate=60");
    return res.status(200).json({ q, data });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
}

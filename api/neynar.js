export default async function handler(req, res) {
  try {
    const fid = String(req.query.fid || "").trim();
    if (!fid) return res.status(400).json({ error: "Missing fid" });

    const apiKey = process.env.NEYNAR_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "Missing NEYNAR_API_KEY" });

    // Neynar v2 bulk user
    const url = `https://api.neynar.com/v2/farcaster/user/bulk?fids=${encodeURIComponent(fid)}`;

    const r = await fetch(url, {
      headers: {
        accept: "application/json",
        api_key: apiKey, // Neynar expects "api_key"
      },
    });

    const data = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: "Neynar API error", data });

    const user = data?.users?.[0];
    const score = user?.experimental?.neynar_user_score ?? null;

    res.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=300");
    return res.status(200).json({ fid: Number(fid), score });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
}

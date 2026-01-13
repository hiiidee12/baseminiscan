const apiKey = [
  process.env.NEYNAR_API_KEY,
  process.env.NEYNAR_API_KEY_2,
].filter(Boolean);

let __keyIdx = 0;
function nextApiKey() {
  const k = apiKey[__keyIdx];
  __keyIdx = (__keyIdx + 1) % apiKey.length;
  return k;
}

export default async function handler(req, res) {
  try {
    const fid = String(req.query.fid || "").trim();
    if (!fid) return res.status(400).json({ error: "Missing fid" });
    if (!apiKey.length) return res.status(500).json({ error: "Missing NEYNAR_API_KEYs" });

    const url = `https://api.neynar.com/v2/farcaster/user/bulk?fids=${encodeURIComponent(fid)}`;

    let lastErr = null;
    for (let i = 0; i < apiKey.length; i++) {
      const key = nextApiKey();
      const r = await fetch(url, {
        headers: {
          accept: "application/json",
          api_key: key,
        },
      });

      const data = await r.json();
      if (r.ok) {
        const user = data?.users?.[0];
        const score = user?.experimental?.neynar_user_score ?? null;
        res.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=300");
        return res.status(200).json({ fid: Number(fid), score });
      }
      lastErr = { status: r.status, data };
    }

    return res.status(lastErr?.status || 500).json({ error: "Neynar API error", ...lastErr });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
}

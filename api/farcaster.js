const KEYS = [
  process.env.N_API_KEY_1,
  process.env.N_API_KEY_2,
].filter(Boolean);

// cache: address -> { ts, username, neynarScore, via }
const CACHE = new Map();
const TTL = 60 * 1000; // 1 menit

async function fetchWithKey(address, key) {
  const url =
    "https://api.neynar.com/v2/farcaster/user/bulk-by-address" +
    `?addresses=${encodeURIComponent(address)}`;

  return fetch(url, {
    headers: {
      accept: "application/json",
      api_key: key,
    },
  });
}

function pickFirstUser(payload, address) {
  const users =
    payload?.users?.[address] ||
    payload?.users?.[address?.toLowerCase?.()] ||
    payload?.users?.[address?.toUpperCase?.()] ||
    null;

  const u = Array.isArray(users) ? (users[0] || null) : (users || null);
  if (!u) return null;

  const username = u?.username || null;

  // coba beberapa kemungkinan field score
  const neynarScore =
    (typeof u?.neynar_score === "number" ? u.neynar_score : null) ??
    (typeof u?.score === "number" ? u.score : null) ??
    (typeof u?.scores?.neynar === "number" ? u.scores.neynar : null) ??
    (typeof u?.experimental?.neynar_score === "number" ? u.experimental.neynar_score : null) ??
    null;

  return { username, neynarScore };
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  const address = String(req.query.address || "").trim().toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(address)) {
    return res.status(400).json({ ok: false, error: "Invalid address" });
  }

  // CACHE HIT
  const cached = CACHE.get(address);
  if (cached && Date.now() - cached.ts < TTL) {
    return res.status(200).json({
      ok: true,
      cached: true,
      username: cached.username ?? null,
      neynarScore: cached.neynarScore ?? null,
      via: cached.via,
    });
  }

  // FETCH WITH FALLBACK KEYS
  for (let i = 0; i < KEYS.length; i++) {
    const key = KEYS[i];
    if (!key) continue;

    try {
      const r = await fetchWithKey(address, key);
      if (!r.ok) continue;

      const j = await r.json().catch(() => null);
      const picked = pickFirstUser(j, address);

      const via = i === 0 ? "primary" : "backup";
      const username = picked?.username ?? null;
      const neynarScore = picked?.neynarScore ?? null;

      CACHE.set(address, { ts: Date.now(), username, neynarScore, via });

      return res.status(200).json({
        ok: true,
        cached: false,
        username,
        neynarScore,
        via,
      });
    } catch {
      // coba key berikutnya
    }
  }

  // kalau gagal semua
  CACHE.set(address, { ts: Date.now(), username: null, neynarScore: null, via: "none" });
  return res.status(200).json({ ok: true, cached: false, username: null, neynarScore: null, via: "none" });
}

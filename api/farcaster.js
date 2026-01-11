const KEYS = [
  process.env.N_API_KEY_1,
  process.env.N_API_KEY_2,
].filter(Boolean);

// cache: address -> { ts, username }
const CACHE = new Map();
const TTL = 60 * 1000; // 1 menit

async function fetchWithKey(address, key) {
  const url =
    `https://api.neynar.com/v2/farcaster/user/bulk-by-address` +
    `?addresses=${encodeURIComponent(address)}`;

  return fetch(url, {
    headers: {
      accept: "application/json",
      api_key: key,
    },
  });
}

function pickFirstUser(payload, address) {
  const users = payload?.[address] || payload?.users?.[address] || [];
  const u = Array.isArray(users) ? users[0] : users;
  return u || null;
}

export default async function handler(req, res) {
  const address = String(req.query.address || "").toLowerCase();

  if (!/^0x[a-f0-9]{40}$/.test(address)) {
    return res.status(400).json({ ok: false });
  }

  // ===== CACHE HIT =====
  const cached = CACHE.get(address);
  if (cached && Date.now() - cached.ts < TTL) {
    return res.status(200).json({
      ok: true,
      cached: true,
      username: cached.username,
      via: cached.via,
    });
  }

  // ===== FETCH WITH FALLBACK =====
  for (let i = 0; i < KEYS.length; i++) {
    const key = KEYS[i];
    try {
      const r = await fetchWithKey(address, key);

      // kalau rate limit / error, coba key berikutnya
      if (!r.ok) continue;

      const j = await r.json();
      const u = pickFirstUser(j, address);
      const username = u?.username;

      if (!username) continue;

      const via = i === 0 ? "primary" : "backup";
      CACHE.set(address, { ts: Date.now(), username, via });

      return res.status(200).json({
        ok: true,
        cached: false,
        username,
        via,
      });
    } catch (e) {
      // coba key berikutnya
    }
  }

  return res.status(200).json({ ok: false });
}

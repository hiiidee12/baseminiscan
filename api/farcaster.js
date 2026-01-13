const KEYS = [
  process.env.N_API_KEY_1,
  process.env.N_API_KEY_2,

  // fallback kalau env kamu pakai nama lain
  process.env.NEYNAR_API_KEY,
  process.env.NEYNAR_API_KEY_1,
  process.env.NEYNAR_API_KEY_2,
].filter(Boolean);

// Cache: address -> { ts, username, neynarScore, via }
const CACHE = new Map();
const TTL = 60 * 1000; // 1 menit

// In-flight requests: address -> Promise
const IN_FLIGHT = new Map();

// Bersihkan entri cache yang kadaluarsa setiap 2 menit
setInterval(() => {
  const now = Date.now();
  for (const [addr, entry] of CACHE.entries()) {
    if (now - entry.ts > TTL * 5) CACHE.delete(addr);
  }
}, 2 * 60 * 1000).unref?.();

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

  const u = Array.isArray(users) ? users[0] || null : users;

  const username =
    (u && typeof u.username === "string" && u.username.trim()
      ? u.username.trim()
      : null) || null;

  const neynarScoreRaw =
    u?.user?.viewer_context?.score ??
    u?.viewer_context?.score ??
    u?.score ??
    null;

  const neynarScore =
    typeof neynarScoreRaw === "number"
      ? neynarScoreRaw
      : typeof neynarScoreRaw === "string"
      ? Number(neynarScoreRaw)
      : null;

  return { username, neynarScore };
}

async function lookupAddress(address) {
  // Cek cache dulu
  const cached = CACHE.get(address);
  if (cached && Date.now() - cached.ts < TTL) {
    return {
      ok: true,
      cached: true,
      username: cached.username ?? null,
      neynarScore: cached.neynarScore ?? null,
      via: cached.via || "cache",
    };
  }

  if (!KEYS.length) {
    return { ok: false, error: "Missing Neynar API key(s)" };
  }

  let lastErr = null;

  // coba semua key sampai dapat hasil (atau semua gagal)
  for (const key of KEYS) {
    try {
      const r = await fetchWithKey(address, key);

      if (r.status === 429) {
        lastErr = "Rate limited";
        continue;
      }

      if (!r.ok) {
        lastErr = `HTTP ${r.status}`;
        continue;
      }

      const j = await r.json();
      const { username, neynarScore } = pickFirstUser(j, address);

      // simpan ke cache meskipun username null (biar ga spam request)
      CACHE.set(address, {
        ts: Date.now(),
        username: username ?? null,
        neynarScore: Number.isFinite(neynarScore) ? neynarScore : null,
        via: "neynar",
      });

      return {
        ok: true,
        cached: false,
        username: username ?? null,
        neynarScore: Number.isFinite(neynarScore) ? neynarScore : null,
        via: "neynar",
      };
    } catch (e) {
      lastErr = e?.message || "Fetch failed";
    }
  }

  return { ok: false, error: lastErr || "All keys failed" };
}

export default async function handler(req, res) {
  const address = (req.query?.address || "").toString().trim();

  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    res.status(400).json({ ok: false, error: "Invalid address" });
    return;
  }

  // dedupe in-flight
  if (IN_FLIGHT.has(address)) {
    try {
      const result = await IN_FLIGHT.get(address);
      res.status(200).json(result);
    } catch (err) {
      res.status(500).json({ ok: false, error: "Internal server error" });
    }
    return;
  }

  const fetchPromise = lookupAddress(address);
  IN_FLIGHT.set(address, fetchPromise);

  try {
    const result = await fetchPromise;
    res.status(200).json(result);
  } catch (err) {
    console.error("Unexpected error in handler:", err);
    res.status(500).json({ ok: false, error: "Internal server error" });
  } finally {
    IN_FLIGHT.delete(address);
  }
}

const KEYS = [
  process.env.N_API_KEY_1,
  process.env.N_API_KEY_2,
].filter(Boolean);

// Cache: address -> { ts, username, neynarScore, via }
const CACHE = new Map();
const TTL = 60 * 1000; // 1 menit

// In-flight requests: address -> Promise
const IN_FLIGHT = new Map();

// Bersihkan cache tiap 2 menit
setInterval(() => {
  const now = Date.now();
  for (const [addr, entry] of CACHE.entries()) {
    if (now - entry.ts >= TTL) CACHE.delete(addr);
  }
}, 120_000);

async function fetchWithKey(address, key) {
  const url =
    "https://api.neynar.com/v2/farcaster/user/bulk-by-address" +
    `?addresses=${encodeURIComponent(address)}`;

  const res = await fetch(url, {
    headers: {
      accept: "application/json",
      api_key: key,
    },
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  return res.json();
}

function pickFirstUser(payload, address) {
  const usersMap = payload?.users;
  if (!usersMap) return null;

  const users = usersMap[address];
  if (!users) return null;

  const item = Array.isArray(users) ? users[0] : users;
  const u = item?.user || item;
  if (!u) return null;

  return {
    username: u.username || null,
    neynarScore:
      u.neynar_score ??
      u.score ??
      u.scores?.neynar ??
      u.experimental?.neynar_score ??
      null,
  };
}

async function lookupAddress(address) {
  const keysCount = KEYS.length;

  // cache hit
  const cached = CACHE.get(address);
  if (cached && Date.now() - cached.ts < TTL) {
    return {
      ok: true,
      cached: true,
      username: cached.username,
      neynarScore: cached.neynarScore,
      via: cached.via,
      keysCount,
    };
  }

  for (let i = 0; i < KEYS.length; i++) {
    const key = KEYS[i];
    if (!key) continue;

    try {
      const data = await fetchWithKey(address, key);
      const picked = pickFirstUser(data, address);

      // ❗ jangan cache hasil kosong
      if (!picked || !picked.username) continue;

      const via = i === 0 ? "primary" : "backup";

      const result = {
        ok: true,
        cached: false,
        username: picked.username,
        neynarScore: picked.neynarScore,
        via,
        keysCount,
      };

      CACHE.set(address, {
        ts: Date.now(),
        username: picked.username,
        neynarScore: picked.neynarScore,
        via,
      });

      return result;
    } catch (err) {
      console.warn(`API key ${i + 1} failed:`, err.message);
    }
  }

  // ❗ fallback TANPA cache
  return {
    ok: true,
    cached: false,
    username: null,
    neynarScore: null,
    via: "none",
    keysCount,
  };
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  const rawAddress = String(req.query.address || "").trim();
  const address = rawAddress.toLowerCase();

  if (!/^0x[a-f0-9]{40}$/.test(address)) {
    return res.status(400).json({
      ok: false,
      error: "Invalid address",
      keysCount: KEYS.length,
    });
  }

  if (IN_FLIGHT.has(address)) {
    try {
      const result = await IN_FLIGHT.get(address);
      return res.status(200).json(result);
    } finally {
      IN_FLIGHT.delete(address);
    }
  }

  const p = lookupAddress(address);
  IN_FLIGHT.set(address, p);

  try {
    const result = await p;
    return res.status(200).json(result);
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      ok: false,
      error: "Internal server error",
      keysCount: KEYS.length,
    });
  } finally {
    IN_FLIGHT.delete(address);
  }
}

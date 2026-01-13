const KEYS = [
  process.env.N_API_KEY_1,
  process.env.N_API_KEY_2,
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
    if (now - entry.ts >= TTL) {
      CACHE.delete(addr);
    }
  }
}, 120_000);

async function fetchWithKey(address, key) {
  const url = `https://api.neynar.com/v2/farcaster/user/bulk-by-address?addresses=${encodeURIComponent(address)}`;

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
  if (!payload || typeof payload !== 'object') return null;

  const usersMap = payload.users;
  if (!usersMap || typeof usersMap !== 'object') return null;

  // Alamat sudah dinormalisasi ke lowercase
  const users = usersMap[address];
  const u = Array.isArray(users) ? users[0] : users;
  if (!u || typeof u !== 'object') return null;

  const username = u.username || null;

  // Coba beberapa lokasi kemungkinan neynar_score
  const neynarScore =
    (typeof u.neynar_score === "number" ? u.neynar_score : null) ||
    (typeof u.score === "number" ? u.score : null) ||
    (u.scores && typeof u.scores.neynar === "number" ? u.scores.neynar : null) ||
    (u.experimental && typeof u.experimental.neynar_score === "number"
      ? u.experimental.neynar_score
      : null) ||
    null;

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
      via: cached.via,
    };
  }

  // Coba tiap API key
  for (let i = 0; i < KEYS.length; i++) {
    const key = KEYS[i];
    if (!key) continue;

    try {
      const data = await fetchWithKey(address, key);
      const picked = pickFirstUser(data, address);

      if (!picked) continue; // Tidak ada user ditemukan — coba key berikutnya?

      const via = i === 0 ? "primary" : "backup";
      const result = {
        ok: true,
        cached: false,
        username: picked.username,
        neynarScore: picked.neynarScore,
        via,
      };

      // Simpan ke cache
      CACHE.set(address, {
        ts: Date.now(),
        username: picked.username,
        neynarScore: picked.neynarScore,
        via,
      });

      return result;
    } catch (err) {
      // Abaikan error dan coba key berikutnya
      console.warn(`API key ${i + 1} failed for ${address}:`, err.message);
    }
  }

  // Semua key gagal atau tidak mengembalikan data
  const fallbackResult = {
    ok: true,
    cached: false,
    username: null,
    neynarScore: null,
    via: "none",
  };

  CACHE.set(address, {
    ts: Date.now(),
    username: null,
    neynarScore: null,
    via: "none",
  });

  return fallbackResult;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  const rawAddress = String(req.query.address || "").trim();
  const address = rawAddress.toLowerCase();

  // Validasi format alamat Ethereum
  if (!/^0x[a-f0-9]{40}$/.test(address)) {
    return res.status(400).json({ ok: false, error: "Invalid address" });
  }

  // Deduplikasi permintaan sedang berjalan
  if (IN_FLIGHT.has(address)) {
    try {
      const result = await IN_FLIGHT.get(address);
      return res.status(200).json(result);
    } catch {
      // Jika in-flight gagal, lanjutkan fetch baru
    } finally {
      IN_FLIGHT.delete(address);
    }
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

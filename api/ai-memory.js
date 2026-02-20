// /api/ai-memory.js
import { kv } from "@vercel/kv";

const PREFIX = "bms:aimemory:v1:";

const MAX_RECENT = 20;
const MAX_FAVORITE = 10;

function memKey(userId) {
  return PREFIX + String(userId);
}

function isHexAddr(a) {
  return /^0x[a-fA-F0-9]{40}$/.test(String(a || "").trim());
}

function normAddr(a) {
  const s = String(a || "").trim();
  return isHexAddr(s) ? s.toLowerCase() : null;
}

function uniqAddrs(list) {
  const out = [];
  const seen = new Set();
  for (const x of Array.isArray(list) ? list : []) {
    const a = normAddr(x);
    if (!a) continue;
    if (seen.has(a)) continue;
    seen.add(a);
    out.push(a);
  }
  return out;
}

function clampInt(v, min, max, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  const x = Math.floor(n);
  return Math.min(Math.max(x, min), max);
}

function clampAmountEth(v, fallback) {
  const s = String(v ?? "").trim();
  if (!s) return fallback;
  if (!/^[0-9]*\.?[0-9]+$/.test(s)) return fallback;
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return s;
}

function safeString(v, maxLen) {
  const s = String(v ?? "").trim();
  if (!s) return null;
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

function ensureShape(mem) {
  const m = mem && typeof mem === "object" ? mem : {};
  if (!Array.isArray(m.recentRecipients)) m.recentRecipients = [];
  if (!Array.isArray(m.favoriteRecipients)) m.favoriteRecipients = [];
  if (!m.stats || typeof m.stats !== "object") m.stats = {};
  return m;
}

function applyPatch(mem, patch) {
  const next = ensureShape({ ...(mem || {}) });

  const allow = patch && typeof patch === "object" ? patch : {};

  if (allow.defaultDelayMs !== undefined) {
    next.defaultDelayMs = clampInt(allow.defaultDelayMs, 0, 10_000, next.defaultDelayMs ?? 1500);
  }

  if (allow.defaultAmountEth !== undefined) {
    next.defaultAmountEth = clampAmountEth(allow.defaultAmountEth, next.defaultAmountEth ?? null);
  }

  if (allow.lastAmountEth !== undefined) {
    next.lastAmountEth = clampAmountEth(allow.lastAmountEth, next.lastAmountEth ?? null);
  }

  if (allow.lastUsedAt !== undefined) {
    const t = Number(allow.lastUsedAt);
    if (Number.isFinite(t) && t > 0) next.lastUsedAt = Math.floor(t);
  }

  if (allow.recentRecipients !== undefined) {
    const addrs = uniqAddrs(allow.recentRecipients);
    next.recentRecipients = addrs.slice(0, MAX_RECENT);
  }

  if (allow.favoriteRecipients !== undefined) {
    const fav = Array.isArray(allow.favoriteRecipients) ? allow.favoriteRecipients : [];
    const out = [];
    const seen = new Set();

    for (const it of fav) {
      if (out.length >= MAX_FAVORITE) break;

      const a = normAddr(it?.address ?? it);
      if (!a || seen.has(a)) continue;

      seen.add(a);
      out.push({
        address: a,
        label: safeString(it?.label, 40) || null,
        addedAt: Number.isFinite(Number(it?.addedAt)) ? Math.floor(Number(it.addedAt)) : Date.now(),
      });
    }

    next.favoriteRecipients = out;
  }

  return next;
}

function addToRecent(mem, addrs) {
  const m = ensureShape({ ...(mem || {}) });
  const list = uniqAddrs(addrs);

  const existing = uniqAddrs(m.recentRecipients);
  const merged = [];
  const seen = new Set();

  // new first
  for (const a of list) {
    if (seen.has(a)) continue;
    seen.add(a);
    merged.push(a);
  }
  for (const a of existing) {
    if (seen.has(a)) continue;
    seen.add(a);
    merged.push(a);
  }

  m.recentRecipients = merged.slice(0, MAX_RECENT);
  return m;
}

function addToFavorite(mem, addrs) {
  const m = ensureShape({ ...(mem || {}) });
  const list = uniqAddrs(addrs);

  const existing = Array.isArray(m.favoriteRecipients) ? m.favoriteRecipients : [];
  const out = [];
  const seen = new Set();

  for (const it of existing) {
    const a = normAddr(it?.address);
    if (!a) continue;
    if (seen.has(a)) continue;
    seen.add(a);
    out.push({
      address: a,
      label: safeString(it?.label, 40) || null,
      addedAt: Number.isFinite(Number(it?.addedAt)) ? Math.floor(Number(it.addedAt)) : Date.now(),
    });
    if (out.length >= MAX_FAVORITE) break;
  }

  for (const a of list) {
    if (out.length >= MAX_FAVORITE) break;
    if (seen.has(a)) continue;
    seen.add(a);
    out.push({ address: a, label: null, addedAt: Date.now() });
  }

  m.favoriteRecipients = out;
  return m;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  try {
    const userId = String(req.query.userId || req.body?.userId || "").trim();
    if (!userId) return res.status(400).json({ ok: false, error: "userId required" });

    const k = memKey(userId);

    if (req.method === "GET") {
      const mem = ensureShape((await kv.get(k)) || {});
      return res.status(200).json({ ok: true, memory: mem });
    }

    if (req.method === "DELETE") {
      await kv.delete(k);
      return res.status(200).json({ ok: true, deleted: true });
    }

    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Method not allowed" });
    }

    const prev = ensureShape((await kv.get(k)) || {});

    const action = safeString(req.body?.action, 32);
    const addresses = uniqAddrs(req.body?.addresses);

    let next = ensureShape({ ...prev });

    // actions
    if (action === "save_recent") {
      next = addToRecent(next, addresses);
    } else if (action === "save_favorite") {
      next = addToFavorite(next, addresses);
    } else if (action === "skip") {
      // no-op
    }

    // patch (optional)
    if (req.body?.memory && typeof req.body.memory === "object") {
      next = applyPatch(next, req.body.memory);
    }

    next.updatedAt = Date.now();
    next.createdAt = prev.createdAt || Date.now();

    await kv.set(k, next);

    return res.status(200).json({ ok: true, memory: next });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
}

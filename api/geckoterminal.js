const __memCache = new Map();

function getFromCache(key) {
  const hit = __memCache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    __memCache.delete(key);
    return null;
  }
  return hit.data;
}

function setToCache(key, data, ttlMs) {
  __memCache.set(key, { data, expiresAt: Date.now() + ttlMs });
}

function normalizeStr(v) {
  return (v ?? "").toString().trim();
}

function isEvmAddress(v) {
  return /^0x[a-fA-F0-9]{40}$/.test(String(v || ""));
}

function ok(res, data) {
  return res.status(200).json({ ok: true, ...data });
}

function bad(res, status, error) {
  return res.status(status).json({ ok: false, error });
}

async function fetchJson(url) {
  const cached = getFromCache(url);
  if (cached) return { ok: true, status: 200, json: cached, cached: true };

  const r = await fetch(url, { headers: { accept: "application/json" } });
  const j = await r.json().catch(() => null);

  if (!r.ok) return { ok: false, status: r.status, json: j, cached: false };

  setToCache(url, j, 20 * 1000);
  return { ok: true, status: r.status, json: j, cached: false };
}

function pickBestPool(poolsJson) {
  const arr = Array.isArray(poolsJson?.data) ? poolsJson.data : [];
  let best = null;
  let bestLiq = -1;

  for (const p of arr) {
    const a = p?.attributes || {};
    const liq = Number(a.reserve_in_usd || 0);
    if (liq > bestLiq) {
      bestLiq = liq;
      best = p;
    }
  }

  return best ? { id: best?.id || null, attributes: best?.attributes || {} } : null;
}

function mapToken(tokenJson) {
  const a = tokenJson?.data?.attributes || {};
  return {
    name: a.name ?? null,
    symbol: a.symbol ?? null,
    price_usd: a.price_usd ?? null,
    fdv_usd: a.fdv_usd ?? null,
    market_cap_usd: a.market_cap_usd ?? null,
    volume_usd: a.volume_usd ?? null,
    price_change_percentage: a.price_change_percentage ?? null,
  };
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "s-maxage=10, stale-while-revalidate=30");

  if (req.method !== "GET") {
    return bad(res, 405, "Method not allowed");
  }

  try {
    const network = normalizeStr(req.query.network || "base").toLowerCase();
    const address = normalizeStr(req.query.address || "");
    const mode = normalizeStr(req.query.mode || "token").toLowerCase();

    if (!network) return bad(res, 400, "Missing network");
    if (!address) return bad(res, 400, "Missing address");

    const base = "https://api.geckoterminal.com/api/v2";

    if (mode === "token") {
      if (!isEvmAddress(address)) return bad(res, 400, "Invalid token address");

      const tokenUrl = `${base}/networks/${encodeURIComponent(network)}/tokens/${encodeURIComponent(address)}`;
      const poolsUrl = `${tokenUrl}/pools`;

      const [tok, pls] = await Promise.all([fetchJson(tokenUrl), fetchJson(poolsUrl)]);

      if (!tok.ok) return ok(res, { network, address, mode, data: null, error: "token_fetch_failed", status: tok.status });
      if (!pls.ok) return ok(res, { network, address, mode, data: null, error: "pools_fetch_failed", status: pls.status });

      const token = mapToken(tok.json);
      const bestPool = pickBestPool(pls.json);

      return ok(res, {
        network,
        address,
        mode,
        data: { token, bestPool },
      });
    }

    if (mode === "pool") {
      const poolUrl = `${base}/networks/${encodeURIComponent(network)}/pools/${encodeURIComponent(address)}`;
      const out = await fetchJson(poolUrl);

      if (!out.ok) return ok(res, { network, address, mode, data: null, error: "pool_fetch_failed", status: out.status });

      const a = out.json?.data?.attributes || {};

      return ok(res, {
        network,
        address,
        mode,
        data: {
          id: out.json?.data?.id || null,
          attributes: a,
        },
      });
    }

    if (mode === "ohlcv") {
      const poolAddress = address;
      const timeframe = normalizeStr(req.query.timeframe || "hour").toLowerCase();
      const aggregate = normalizeStr(req.query.aggregate || "1");
      const limit = normalizeStr(req.query.limit || "100");
      const beforeTs = normalizeStr(req.query.before_timestamp || "");

      const qs = new URLSearchParams();
      if (timeframe) qs.set("timeframe", timeframe);
      if (aggregate) qs.set("aggregate", aggregate);
      if (limit) qs.set("limit", limit);
      if (beforeTs) qs.set("before_timestamp", beforeTs);

      const ohlcvUrl = `${base}/networks/${encodeURIComponent(network)}/pools/${encodeURIComponent(poolAddress)}/ohlcv?${qs.toString()}`;
      const out = await fetchJson(ohlcvUrl);

      if (!out.ok) return ok(res, { network, address: poolAddress, mode, data: null, error: "ohlcv_fetch_failed", status: out.status });

      return ok(res, {
        network,
        address: poolAddress,
        mode,
        data: out.json?.data || null,
      });
    }

    return bad(res, 400, "Invalid mode");
  } catch {
    return ok(res, { data: null, error: "Data not available." });
  }
}

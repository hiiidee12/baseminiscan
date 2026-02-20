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
  if (cached) return { ok: true, status: 200, json: cached };

  const r = await fetch(url, { headers: { accept: "application/json" } });
  const j = await r.json().catch(() => null);

  if (!r.ok) return { ok: false, status: r.status, json: j };

  setToCache(url, j, 20 * 1000);
  return { ok: true, status: r.status, json: j };
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

  return best
    ? {
        id: best.id || null,
        address: best.attributes?.address || null,
        attributes: best.attributes || {},
      }
    : null;
}

function mapToken(tokenJson) {
  const a = tokenJson?.data?.attributes || {};
  const pcp = a.price_change_percentage || {};

  return {
    name: a.name ?? null,
    symbol: a.symbol ?? null,
    address: tokenJson?.data?.id?.split("_").pop() || null,
    price_usd: a.price_usd ?? null,
    fdv_usd: a.fdv_usd ?? null,
    market_cap_usd: a.market_cap_usd ?? null,
    volume_usd_24h: a.volume_usd?.h24 ?? null,

    price_change_1h_pct: pcp?.h1 ?? null,
    price_change_6h_pct: pcp?.h6 ?? null,
    price_change_12h_pct: pcp?.h12 ?? null, // biasanya null
    price_change_24h_pct: pcp?.h24 ?? null,
  };
}

function calcPct(now, past) {
  const n = Number(now);
  const p = Number(past);
  if (!Number.isFinite(n) || !Number.isFinite(p) || p === 0) return null;
  return ((n - p) / p) * 100;
}

function getOhlcvCloseNowAndHoursAgo(ohlcvData, hoursAgo) {
  const list =
    ohlcvData?.attributes?.ohlcv_list ||
    ohlcvData?.ohlcv_list ||
    null;

  if (!Array.isArray(list) || list.length < hoursAgo + 1) {
    return { now: null, past: null };
  }

  // format: [timestamp, open, high, low, close, volume]
  const latest = list[0];
  const past = list[hoursAgo];

  return {
    now: Array.isArray(latest) ? latest[4] : null,
    past: Array.isArray(past) ? past[4] : null,
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

      const tokenUrl = `${base}/networks/${network}/tokens/${address}`;
      const poolsUrl = `${tokenUrl}/pools`;

      const [tok, pls] = await Promise.all([
        fetchJson(tokenUrl),
        fetchJson(poolsUrl),
      ]);

      if (!tok.ok || !tok.json?.data) {
        return ok(res, { network, address, mode, data: null });
      }

      const token = mapToken(tok.json);
      const bestPool = pls.ok ? pickBestPool(pls.json) : null;

      // fallback 1h / 6h / 24h dari best pool
      const poolPcp = bestPool?.attributes?.price_change_percentage || {};

      if (token.price_change_1h_pct == null) {
        token.price_change_1h_pct = poolPcp?.h1 ?? null;
      }
      if (token.price_change_6h_pct == null) {
        token.price_change_6h_pct = poolPcp?.h6 ?? null;
      }
      if (token.price_change_24h_pct == null) {
        token.price_change_24h_pct = poolPcp?.h24 ?? null;
      }

      // 12h dihitung dari OHLCV (hourly)
      if (token.price_change_12h_pct == null && bestPool?.address) {
        const qs = new URLSearchParams({
          timeframe: "hour",
          aggregate: "1",
          limit: "13",
        });

        const ohlcvUrl =
          `${base}/networks/${network}/pools/${bestPool.address}/ohlcv?` +
          qs.toString();

        const ohl = await fetchJson(ohlcvUrl);

        if (ohl.ok && ohl.json?.data) {
          const { now, past } = getOhlcvCloseNowAndHoursAgo(ohl.json.data, 12);
          token.price_change_12h_pct = calcPct(now, past);
        }
      }

      return ok(res, {
        network,
        address,
        mode,
        data: {
          token,
          bestPool,
        },
      });
    }

    if (mode === "pool") {
      const poolUrl = `${base}/networks/${network}/pools/${address}`;
      const out = await fetchJson(poolUrl);

      if (!out.ok || !out.json?.data) {
        return ok(res, { network, address, mode, data: null });
      }

      return ok(res, {
        network,
        address,
        mode,
        data: {
          id: out.json.data.id || null,
          attributes: out.json.data.attributes || {},
        },
      });
    }

    if (mode === "ohlcv") {
      const timeframe = normalizeStr(req.query.timeframe || "hour");
      const aggregate = normalizeStr(req.query.aggregate || "1");
      const limit = normalizeStr(req.query.limit || "100");

      const qs = new URLSearchParams({
        timeframe,
        aggregate,
        limit,
      });

      const url =
        `${base}/networks/${network}/pools/${address}/ohlcv?` +
        qs.toString();

      const out = await fetchJson(url);

      if (!out.ok || !out.json?.data) {
        return ok(res, { network, address, mode, data: null });
      }

      return ok(res, {
        network,
        address,
        mode,
        data: out.json.data,
      });
    }

    return bad(res, 400, "Invalid mode");
  } catch {
    return ok(res, { data: null });
  }
}

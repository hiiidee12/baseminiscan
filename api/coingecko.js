// File: pages/api/coingecko.js

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

function buildQueryString(params) {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    const val = normalizeStr(v);
    if (!val) continue;
    usp.set(k, val);
  }
  const s = usp.toString();
  return s ? `?${s}` : "";
}

function isSafeCoinId(id) {
  return /^[a-z0-9-]{1,64}$/.test(id);
}

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return res.status(405).json({ error: "Method not allowed" });
    }

    const apiKey = (process.env.COINGECKO_API_KEY || "").toString().trim();
    if (!apiKey) {
      return res.status(500).json({ error: "Missing COINGECKO_API_KEY" });
    }

    const baseUrl = "https://api.coingecko.com/api/v3";
    const endpoint = normalizeStr(req.query.endpoint || "simple_price");

    let url = "";
    let qs = "";
    let cacheTtlMs = 30_000;

    if (endpoint === "simple_price") {
      const ids = normalizeStr(req.query.ids || "bitcoin");
      const vs_currencies = normalizeStr(req.query.vs_currencies || "usd");
      const include_24hr_change = normalizeStr(req.query.include_24hr_change || "1");
      const include_24hr_vol = normalizeStr(req.query.include_24hr_vol || "0");
      const include_market_cap = normalizeStr(req.query.include_market_cap || "0");

      qs = buildQueryString({
        ids,
        vs_currencies,
        include_24hr_change,
        include_24hr_vol,
        include_market_cap,
      });

      url = `${baseUrl}/simple/price${qs}`;
      cacheTtlMs = 15_000;
    } else if (endpoint === "markets") {
      const vs_currency = normalizeStr(req.query.vs_currency || "usd");
      const ids = normalizeStr(req.query.ids || "");
      const category = normalizeStr(req.query.category || "");
      const order = normalizeStr(req.query.order || "market_cap_desc");
      const per_page = normalizeStr(req.query.per_page || "50");
      const page = normalizeStr(req.query.page || "1");
      const sparkline = normalizeStr(req.query.sparkline || "0");
      const price_change_percentage = normalizeStr(req.query.price_change_percentage || "24h");

      qs = buildQueryString({
        vs_currency,
        ids,
        category,
        order,
        per_page,
        page,
        sparkline,
        price_change_percentage,
      });

      url = `${baseUrl}/coins/markets${qs}`;
      cacheTtlMs = 20_000;
    } else if (endpoint === "coin") {
      const id = normalizeStr(req.query.id || "");
      if (!isSafeCoinId(id)) {
        return res.status(400).json({ error: "Invalid coin id" });
      }

      const localization = normalizeStr(req.query.localization || "false");
      const tickers = normalizeStr(req.query.tickers || "false");
      const market_data = normalizeStr(req.query.market_data || "true");
      const community_data = normalizeStr(req.query.community_data || "false");
      const developer_data = normalizeStr(req.query.developer_data || "false");
      const sparkline = normalizeStr(req.query.sparkline || "false");

      qs = buildQueryString({
        localization,
        tickers,
        market_data,
        community_data,
        developer_data,
        sparkline,
      });

      url = `${baseUrl}/coins/${encodeURIComponent(id)}${qs}`;
      cacheTtlMs = 30_000;
    } else if (endpoint === "trending") {
      url = `${baseUrl}/search/trending`;
      cacheTtlMs = 60_000;
    } else if (endpoint === "global") {
      url = `${baseUrl}/global`;
      cacheTtlMs = 60_000;
    } else {
      return res.status(400).json({ error: "Unsupported endpoint" });
    }

    const cacheKey = `cg:${url}`;
    const cached = getFromCache(cacheKey);
    if (cached) {
      res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
      return res.status(200).json(cached);
    }

    const r = await fetch(url, {
      headers: {
        Accept: "application/json",
        "x-cg-demo-api-key": apiKey,
      },
    });

    const text = await r.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    if (!r.ok) {
      return res.status(r.status).json({
        error: "CoinGecko request failed",
        status: r.status,
        data,
      });
    }

    setToCache(cacheKey, data, cacheTtlMs);

    res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
    return res.status(200).json(data);
  } catch (e) {
    return res.status(500).json({ error: "Server error", message: e?.message || "Unknown" });
  }
}

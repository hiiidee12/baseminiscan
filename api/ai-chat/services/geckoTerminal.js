export async function fetchLocalGeckoTerminalToken(req, tokenAddress) {
  const proto =
    (req.headers["x-forwarded-proto"] || "https").toString().split(",")[0].trim();
  const host =
    (req.headers["x-forwarded-host"] || req.headers.host || "").toString().split(",")[0].trim();
  const origin = host ? `${proto}://${host}` : "";

  const url = `${origin}/api/geckoterminal?mode=token&network=base&address=${encodeURIComponent(tokenAddress)}`;

  const r = await fetch(url, { headers: { accept: "application/json" } });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j || !j.ok) return null;
  return j.data || null;
}

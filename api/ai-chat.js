function __formatEthFromWei(balanceWei) {
  try {
    if (balanceWei === null || balanceWei === undefined) return null;

    // terima string/number/bigint
    const wei = typeof balanceWei === "bigint" ? balanceWei : BigInt(String(balanceWei));
    const neg = wei < 0n;
    const w = neg ? -wei : wei;

    const ETH = 10n ** 18n;
    const whole = w / ETH;
    const frac = w % ETH;

    // ambil 8 decimal biar kecil ga jadi 0
    const fracStr = frac.toString().padStart(18, "0").slice(0, 8);
    let s = `${whole.toString()}.${fracStr}`.replace(/\.?0+$/, "");
    if (!s.includes(".")) s = `${s}.0`;

    return neg ? `-${s}` : s;
  } catch {
    return null;
  }
}

function __formatNeynar(v) {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  // 2 decimal cukup
  return String(Math.round(v * 100) / 100);
}

function __buildProfileReply(context) {
  const address = context?.address || null;

  const username = context?.farcaster?.username || null;
  const neynarScoreRaw = context?.farcaster?.neynarScore ?? null;

  const balanceEth = __formatEthFromWei(context?.balanceWei);
  const txCount = context?.txCount ?? null;

  const farcasterLine = `🧐 Farcaster: ${username || "Data not available"}`;
  const neynarLine = `🥳 Neynar: ${__formatNeynar(neynarScoreRaw) || "Data not available"}`;
  const balLine = `🤑 Balance: ${balanceEth ? `${balanceEth} ETH` : "Data not available"}`;
  const txLine = `🤯 Total TX: ${txCount !== null && txCount !== undefined ? String(txCount) : "Data not available"}`;

  // link farcaster web (dibuka di in-app Farcaster juga)
  const profileUrl = username ? `https://farcaster.xyz/u/${encodeURIComponent(username)}` : null;

  const link1 = profileUrl ? `🔗 Open Farcaster Profile\n${profileUrl}` : `🔗 Open Farcaster Profile\nData not available`;
  const link2 = address ? `🌐 Open in Browser\nhttps://basescan.org/address/${encodeURIComponent(address)}` : `🌐 Open in Browser\nData not available`;

  // address di atas kalau kamu mau, tinggal aktifkan:
  // const addrLine = address ? address : "Data not available";

  return [
    farcasterLine,
    neynarLine,
    balLine,
    txLine,
    "",
    link1,
    link2,
  ].join("\n");
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const body = req.body || {};
    const message = String(body.message || "").trim();
    const context = body.context ?? null;

    if (!message) {
      return res.status(400).json({ ok: false, error: "Missing message" });
    }

    // kalau ada address di context -> balikin format profile yang kamu mau (deterministic)
    if (context?.address) {
      const reply = __buildProfileReply(context);
      return res.status(200).json({ ok: true, reply });
    }

    return res.status(200).json({
      ok: true,
      reply: "Data not available.",
    });
  } catch {
    return res.status(500).json({ ok: false, error: "Server error" });
  }
}

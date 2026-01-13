const $ = (id) => document.getElementById(id);

/* =========================
   Utils
========================= */

const isAddress = (v) => /^0x[a-fA-F0-9]{40}$/.test(v);
const isTx = (v) => /^0x[a-fA-F0-9]{64}$/.test(v);
const isBlock = (v) => /^[0-9]{1,20}$/.test(v);

function shortHex(h, a = 6, b = 4) {
  if (!h || h.length < a + b + 2) return h || "-";
  return `${h.slice(0, a + 2)}…${h.slice(-b)}`;
}

// 
function makeBaseScanUrl(q) {
  if (isTx(q)) return `https://basescan.org/tx/${q}`;
  if (isAddress(q)) return `https://basescan.org/address/${q}`;
  if (isBlock(q)) return `https://basescan.org/block/${q}`;
  return `https://basescan.org/search?f=0&q=${encodeURIComponent(q)}`;
}

async function openExternal(url) {
  try {
    if (window.__fcSdk && (await window.__fcSdk.isInMiniApp())) {
      await window.__fcSdk.actions.openUrl(url);
      return;
    }
  } catch {}
  window.open(url, "_blank", "noopener,noreferrer");
}

// BigInt-safe wei -> ETH string
function weiToEthStr(wei, decimals = 6) {
  try {
    if (wei === null || wei === undefined) return null;
    const w = BigInt(String(wei));
    const base = 10n ** 18n;

    const whole = w / base;
    const frac = w % base;

    const fracStr = frac.toString().padStart(18, "0").slice(0, decimals);
    return `${whole.toString()}.${fracStr}`;
  } catch {
    return null;
  }
}

function formatTokenAmount(raw, decimals, maxFrac = 6) {
  try {
    if (raw === null || raw === undefined) return "-";

    const v = BigInt(String(raw));

    let d = 0;
    if (decimals !== null && decimals !== undefined && decimals !== "") {
      d = Math.max(0, Math.min(36, parseInt(String(decimals), 10) || 0));
    }

    if (d === 0) return v.toString();

    const base = 10n ** BigInt(d);
    const whole = v / base;
    const frac = v % base;

    const fracStrFull = frac.toString().padStart(d, "0");
    const fracStr = fracStrFull
      .slice(0, Math.min(maxFrac, d))
      .replace(/0+$/, "");

    return fracStr ? `${whole.toString()}.${fracStr}` : whole.toString();
  } catch {
    return String(raw);
  }
}

function compactNumberString(s) {
  const n = Number(s);
  if (!Number.isFinite(n)) return s;
  const abs = Math.abs(n);
  if (abs < 1000) return s;
  if (abs < 1e6) return `${(n / 1e3).toFixed(2).replace(/\.?0+$/, "")}K`;
  if (abs < 1e9) return `${(n / 1e6).toFixed(2).replace(/\.?0+$/, "")}M`;
  if (abs < 1e12) return `${(n / 1e9).toFixed(2).replace(/\.?0+$/, "")}B`;
  return s;
}

function getTxCountValue(j) {
  const v = j?.totalTxCount ?? j?.txCount ?? null;
  return v === undefined ? null : v;
}

function renderTxCount(v) {
  if (v === null || v === undefined) return "-";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "-";
  if (typeof v === "string") {
    const s = v.trim();
    return s ? s : "-";
  }
  return String(v);
}

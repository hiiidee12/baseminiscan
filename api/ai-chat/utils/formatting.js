export function fmtNum(v, digits) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  if (typeof digits === "number") return n.toFixed(digits);
  return String(n);
}

export function toNum(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

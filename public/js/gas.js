/* =========================
   GAS
========================= */

let __gasTimer = null;

function toNum(v) {
  if (v === null || v === undefined) return NaN;
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = parseFloat(v.trim());
    return Number.isFinite(n) ? n : NaN;
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

function formatGwei(v) {
  const n = toNum(v);
  if (!Number.isFinite(n)) return "—";
  if (n < 1) return n.toFixed(3);
  if (n < 10) return n.toFixed(2);
  return n.toFixed(1);
}

function renderGasSkeleton() {
  return `
    <div class="gasGrid">
      ${Array.from({ length: 3 }).map(() => `
        <div class="gasCard skeleton">
          <div class="sk-line w30"></div>
          <div class="sk-line w50"></div>
          <div class="sk-line w40"></div>
        </div>
      `).join("")}
      <div class="resultCard skeleton">
        <div class="sk-line w40"></div>
        <div class="sk-line w60"></div>
        <div class="sk-line w30"></div>
      </div>
    </div>
  `;
}

function renderGasError(err) {
  return `<pre>${JSON.stringify(err, null, 2)}</pre>`;
}

function updateGasValues(data) {
  const safeRaw  = data?.safe ?? data?.standard ?? data?.slow ?? null;
  const fastRaw  = data?.fast ?? null;
  const rapidRaw = data?.rapid ?? data?.pro ?? null;

  const safe  = formatGwei(safeRaw);
  const fast  = formatGwei(fastRaw);
  const rapid = formatGwei(rapidRaw);

  const a = document.getElementById("gasStandardVal");
  const b = document.getElementById("gasFastVal");
  const c = document.getElementById("gasRapidVal");
  if (a) a.textContent = safe;
  if (b) b.textContent = fast;
  if (c) c.textContent = rapid;
}
  
function renderGas(data = {}) {
  const safeRaw  = data?.safe ?? data?.standard ?? data?.slow ?? null;
  const fastRaw  = data?.fast ?? null;
  const rapidRaw = data?.rapid ?? data?.pro ?? null;

  const safe  = formatGwei(safeRaw);
  const fast  = formatGwei(fastRaw);
  const rapid = formatGwei(rapidRaw);

  return `
    <div class="gasGrid">
      <div class="gasCard">
        <div class="gasLabel">❄️ Standard</div>
        <div class="gasValue"><span id="gasStandardVal">${safe}</span> <span class="unit">Gwei</span></div>
        <div class="muted">~ 12–16 secs</div>
      </div>

      <div class="gasCard">
        <div class="gasLabel">🌞 Fast</div>
        <div class="gasValue"><span id="gasFastVal">${fast}</span> <span class="unit">Gwei</span></div>
        <div class="muted">~ 6–8 secs</div>
      </div>

      <div class="gasCard">
        <div class="gasLabel">⚡ Rapid</div>
        <div class="gasValue"><span id="gasRapidVal">${rapid}</span> <span class="unit">Gwei</span></div>
        <div class="muted">~ 2–3 secs</div>
      </div>
    </div>
  `;
}

async function loadGasOnce() {
  const out = $("gasOutput");
  if (!out) return;

  if (!out.dataset.ready) {
    out.dataset.ready = "1";
    out.innerHTML = renderGas({}); 
  }

  try {
    const r = await fetch("/api/gas", { cache: "no-store" });
    const j = await r.json();
    if (!r.ok || j?.error) throw j;

    updateGasValues(j); 
  } catch (e) {
    console.log("gas error", e);
  }
}
function startGasAutoRefresh() {
  stopGasAutoRefresh();

  let next = 60;
  const tickEl = $("gasNext");
  if (tickEl) tickEl.innerHTML = `Next update in <b>${next}s</b>`;

  loadGasOnce();

  __gasTimer = setInterval(async () => {
    next--;
    if (tickEl) tickEl.innerHTML = `Next update in <b>${next}s</b>`;

    if (next <= 0) {
      next = 60;
      if (tickEl) tickEl.innerHTML = `Next update in <b>${next}s</b>`;
      await loadGasOnce();
    }
  }, 1000);
}

function stopGasAutoRefresh() {
  if (__gasTimer) clearInterval(__gasTimer);
  __gasTimer = null;
}

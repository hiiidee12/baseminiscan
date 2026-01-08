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

function makeBaseScanUrl(q) {
  if (isTx(q)) return `https://basescan.org/tx/${q}`;
  if (isAddress(q)) return `https://basescan.org/address/${q}`;
  if (isBlock(q)) return `https://basescan.org/block/${q}`;
  return `https://basescan.org/search?f=0&q=${encodeURIComponent(q)}`;
}

function toNum(v) {
  if (v === null || v === undefined) return NaN;
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    // handle "0.004", "0.004\n", etc
    const n = parseFloat(v.trim());
    return Number.isFinite(n) ? n : NaN;
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

function weiToEthStr(wei, decimals = 6) {
  const n = toNum(wei);
  if (!Number.isFinite(n)) return null;
  return (n / 1e18).toFixed(decimals);
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

/* =========================
   Router (hash)
========================= */

function getHash() {
  return (location.hash || "#/").replace(/^#/, "");
}

function setHash(path) {
  location.hash = `#${path}`;
}

function parseRoute() {
  // #/  => home
  // #/address/0xabc... => detail
  const h = getHash();
  const parts = h.split("/").filter(Boolean);
  if (parts.length >= 2 && parts[0] === "address") {
    return { page: "detail", address: parts[1] };
  }
  return { page: "home" };
}

function showPage(page) {
  const home = $("pageHome");
  const detail = $("pageDetail");
  if (!home || !detail) return;

  if (page === "detail") {
    home.style.display = "none";
    detail.style.display = "block";
  } else {
    detail.style.display = "none";
    home.style.display = "block";
  }
}

/* =========================
   Tabs (detail)
========================= */

function setActiveDetailTab(tab) {
  ["tabTx", "tabErc20"].forEach((id) => {
    const el = $(id);
    if (el) el.classList.add("secondary");
  });
  const active = tab === "erc20" ? "tabErc20" : "tabTx";
  const el = $(active);
  if (el) el.classList.remove("secondary");
}

/* =========================
   Skeletons
========================= */

function overviewSkeleton() {
  return `
    <div class="resultCard skeleton">
      <div class="sk-line w40"></div>
      <div class="sk-line w80"></div>
      <div class="sk-line w60"></div>
      <div class="sk-line w30"></div>
    </div>
  `;
}

function tableSkeleton(rows = 6) {
  return `
    <div class="tableWrap skeleton">
      <div class="tableScroll">
        <table>
          <thead>
            <tr>
              <th>Tx</th><th>Age</th><th>From</th><th>To</th><th>Value</th>
            </tr>
          </thead>
          <tbody>
            ${Array.from({ length: rows })
              .map(
                () => `
              <tr>
                <td><div class="sk-line w70"></div><div class="sk-line w40"></div></td>
                <td><div class="sk-line w40"></div></td>
                <td><div class="sk-line w50"></div></td>
                <td><div class="sk-line w50"></div></td>
                <td><div class="sk-line w30"></div></td>
              </tr>`
              )
              .join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

/* =========================
   Render Address
========================= */

function ageFromTs(ts) {
  const t = toNum(ts) * 1000;
  if (!Number.isFinite(t)) return "-";
  const d = Math.floor((Date.now() - t) / 1000);
  if (d < 60) return `${d}s ago`;
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
}

function renderTxTable(list = []) {
  const rows = list.slice(0, 25).map((tx) => `
    <tr>
      <td>
        <span class="click" data-open="${makeBaseScanUrl(tx.hash)}">
          ${shortHex(tx.hash)}
        </span>
        <div class="small">Block ${tx.blockNumber}</div>
      </td>
      <td class="small">${ageFromTs(tx.timeStamp)}</td>
      <td class="small">${shortHex(tx.from)}</td>
      <td class="small">${shortHex(tx.to)}</td>
      <td>${weiToEthStr(tx.value) ?? "0"} ETH</td>
    </tr>
  `).join("");

  return `
    <div class="tableWrap">
      <div class="tableScroll">
        <table>
          <thead>
            <tr>
              <th>Tx</th><th>Age</th><th>From</th><th>To</th><th>Value</th>
            </tr>
          </thead>
          <tbody>
            ${rows || `<tr><td colspan="5">No transactions</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderErc20Table(list = []) {
  const rows = list.slice(0, 25).map((t) => `
    <tr>
      <td>${shortHex(t.hash)}</td>
      <td class="small">${ageFromTs(t.timeStamp)}</td>
      <td>${t.tokenSymbol}</td>
      <td class="small">${shortHex(t.from)}</td>
      <td class="small">${shortHex(t.to)}</td>
      <td>${t.value}</td>
    </tr>
  `).join("");

  return `
    <div class="tableWrap">
      <div class="tableScroll">
        <table>
          <thead>
            <tr>
              <th>Tx</th><th>Age</th><th>Token</th><th>From</th><th>To</th><th>Amount</th>
            </tr>
          </thead>
          <tbody>
            ${rows || `<tr><td colspan="6">No transfers</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

/* =========================
   Detail Loader
========================= */

let __detailAddress = null;
let __detailTab = "tx";

async function loadDetail(address, tab = "tx") {
  __detailAddress = address;
  __detailTab = tab;

  stopGasAutoRefresh();
  showPage("detail");
  setActiveDetailTab(tab);

  $("detailAddress").textContent = address;
  $("link").innerHTML = "";

  const out = $("detailOutput");
  out.innerHTML = overviewSkeleton() + tableSkeleton();

  try {
    const r = await fetch(`/api/address?address=${address}&tab=${tab}`, { cache: "no-store" });
    const j = await r.json();
    if (!r.ok || j?.error) throw j;

    // overview (top)
    const eth = weiToEthStr(j.balanceWei, 6);
    $("detailBalance").textContent = eth ? `${eth} ETH` : "-";

    // txCount should be total (from API)
    const total = toNum(j.totalTxCount);
    $("detailTxCount").textContent = Number.isFinite(total) ? String(total) : "-";

    // link
    const url = makeBaseScanUrl(address);
    $("link").innerHTML = `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`;

    // table (tab)
    out.innerHTML = (tab === "erc20") ? renderErc20Table(j.list) : renderTxTable(j.list);

    out.querySelectorAll("[data-open]").forEach((el) =>
      el.onclick = () => openExternal(el.dataset.open)
    );
  } catch (e) {
    $("detailTxCount").textContent = "-";
    $("detailBalance").textContent = "-";
    out.innerHTML = `<pre>${JSON.stringify(e, null, 2)}</pre>`;
  }
}

/* =========================
   GAS (home)
========================= */

let __gasTimer = null;

function formatGwei(v) {
  const n = toNum(v);
  if (!Number.isFinite(n)) return "—";
  // keep 3 decimals for sub-1 gwei
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

function renderGas(data) {
  // support old/new keys
  const safeRaw = (data?.safe ?? data?.standard ?? data?.slow ?? null);
  const fastRaw = (data?.fast ?? null);
  const rapidRaw = (data?.rapid ?? data?.pro ?? null);

  const safe = formatGwei(safeRaw);
  const fast = formatGwei(fastRaw);
  const rapid = formatGwei(rapidRaw);

  const lastBlock = data?.lastBlock ?? "—";

  let util = "—";
  const ratio = toNum(data?.gasUsedRatio);
  if (Number.isFinite(ratio)) {
    // ratio might be 0.195 or 19.5
    const pct = ratio <= 1 ? ratio * 100 : ratio;
    util = `${pct.toFixed(2)}%`;
  }

  const src = data?.source ? String(data.source) : "—";

  return `
    <div class="gasGrid">
      <div class="gasCard">
        <div class="gasLabel">🙂 Standard</div>
        <div class="gasValue">${safe} <span class="unit">Gwei</span></div>
        <div class="muted">~ 12–16 secs</div>
      </div>

      <div class="gasCard">
        <div class="gasLabel">😄 Fast</div>
        <div class="gasValue">${fast} <span class="unit">Gwei</span></div>
        <div class="muted">~ 6–8 secs</div>
      </div>

      <div class="gasCard">
        <div class="gasLabel">🚀 Rapid</div>
        <div class="gasValue">${rapid} <span class="unit">Gwei</span></div>
        <div class="muted">~ 2–3 secs</div>
      </div>

      <div class="resultCard">
        <div style="font-weight:800; font-size:16px;">Additional Info</div>
        <div class="small muted" style="margin-top:10px;">
          <div>LAST BLOCK</div>
          <div style="font-size:20px; color:#fff; font-weight:800;">${lastBlock}</div>
        </div>
        <div class="small muted" style="margin-top:10px;">
          <div>AVG. UTILIZATION</div>
          <div style="font-size:20px; color:#fff; font-weight:800;">${util}</div>
        </div>
        <div class="muted" style="margin-top:10px;">Source: ${src}</div>
      </div>
    </div>
  `;
}

async function loadGasOnce() {
  const out = $("gasOutput");
  if (!out) return;
  out.innerHTML = renderGasSkeleton();

  try {
    const r = await fetch("/api/gas", { cache: "no-store" });
    const j = await r.json();
    if (!r.ok || j?.error) throw j;
    out.innerHTML = renderGas(j);
  } catch (e) {
    out.innerHTML = renderGasError(e);
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

/* =========================
   Bind UI + Route
========================= */

function handleRoute() {
  const r = parseRoute();
  if (r.page === "detail" && isAddress(r.address)) {
    loadDetail(r.address, __detailTab || "tx");
  } else {
    showPage("home");
    startGasAutoRefresh();
  }
}

window.addEventListener("hashchange", handleRoute);

window.addEventListener("DOMContentLoaded", () => {
  // Home
  $("open")?.addEventListener("click", () => {
    const q = $("query")?.value?.trim() || "";
    if (!q) return;

    if (isAddress(q)) {
      // go to detail page
      setHash(`/address/${q}`);
    } else {
      // open basescan directly
      const url = makeBaseScanUrl(q);
      openExternal(url);
    }
  });

  $("query")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") $("open")?.click();
  });

  // Detail
  $("back")?.addEventListener("click", () => {
    setHash(`/`);
  });

  $("tabTx")?.addEventListener("click", () => {
    if (__detailAddress) loadDetail(__detailAddress, "tx");
  });

  $("tabErc20")?.addEventListener("click", () => {
    if (__detailAddress) loadDetail(__detailAddress, "erc20");
  });

  // init route
  handleRoute();
});

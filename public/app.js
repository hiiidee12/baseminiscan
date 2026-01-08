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

function weiToEthStr(wei, decimals = 6) {
  const n = Number(wei);
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
   #/ => home
   #/address/0x...?tab=tx|erc20 => detail
========================= */

function goHome() {
  location.hash = "#/";
}

function goDetail(address, tab = "tx") {
  location.hash = `#/address/${address}?tab=${encodeURIComponent(tab)}`;
}

function parseRoute() {
  const raw = (location.hash || "#/").slice(1);
  const [path, qs] = raw.split("?");
  const parts = path.split("/").filter(Boolean);
  const query = new URLSearchParams(qs || "");
  return { parts, query };
}

/* =========================
   UI show/hide
========================= */

function showPage(which) {
  const home = $("pageHome");
  const detail = $("pageDetail");
  if (!home || !detail) return;

  if (which === "detail") {
    home.style.display = "none";
    detail.style.display = "";
  } else {
    detail.style.display = "none";
    home.style.display = "";
  }
}

function setActiveTab(tab) {
  ["tabTx", "tabErc20"].forEach((id) => {
    const el = $(id);
    if (el) el.classList.add("secondary");
  });
  const active = tab === "erc20" ? "tabErc20" : "tabTx";
  const el = $(active);
  if (el) el.classList.remove("secondary");
}

/* =========================
   Skeleton (inject CSS once)
========================= */

function ensureSkeletonCss() {
  if (document.getElementById("__sk_css")) return;
  const s = document.createElement("style");
  s.id = "__sk_css";
  s.textContent = `
    .sk { position:relative; overflow:hidden; background:rgba(255,255,255,0.16);
          border:1px solid rgba(255,255,255,0.22); border-radius:14px; }
    .sk::after { content:""; position:absolute; top:0; left:-150%; width:150%; height:100%;
                 background:linear-gradient(90deg, transparent, rgba(255,255,255,0.18), transparent);
                 animation:sk 1.15s ease-in-out infinite; }
    @keyframes sk { 0%{left:-150%} 100%{left:150%} }
    .skline{ height:12px; margin:10px 0; } .skline.lg{ height:16px; }
    .skrow{ height:44px; margin-top:10px; }
  `;
  document.head.appendChild(s);
}

function renderDetailSkeleton(tab = "tx") {
  ensureSkeletonCss();
  setActiveTab(tab);

  const a = $("detailAddress");
  const b = $("detailBalance");
  const c = $("detailTxCount");
  const out = $("detailOutput");

  if (a) a.innerHTML = `<div class="sk skline lg"></div>`;
  if (b) b.innerHTML = `<div class="sk skline"></div>`;
  if (c) c.innerHTML = `<div class="sk skline"></div>`;

  if (out) {
    out.innerHTML = `
      <div class="resultCard">
        <div class="sk skline lg"></div>
        <div class="sk skline"></div>
        <div class="sk skline"></div>
      </div>
      <div class="tableWrap">
        <div class="sk skrow"></div>
        <div class="sk skrow"></div>
        <div class="sk skrow"></div>
      </div>
    `;
  }
}

/* =========================
   Render tables
========================= */

function ageFromTs(ts) {
  const t = Number(ts) * 1000;
  if (!Number.isFinite(t)) return "-";
  const d = Math.floor((Date.now() - t) / 1000);
  if (d < 60) return `${d}s ago`;
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
}

function renderTxTable(list = []) {
  const rows = list.slice(0, 25).map((tx) => {
    const hash = tx.hash || tx.transactionHash || "-";
    const from = tx.from || "-";
    const to = tx.to || "-";
    const block = tx.blockNumber || "-";
    const value = tx.value || "0";
    const age = tx.timeStamp ? ageFromTs(tx.timeStamp) : "-";
    return `
      <tr>
        <td>
          <span class="click" data-open="${makeBaseScanUrl(hash)}">${shortHex(hash)}</span>
          <div class="small">Block ${block}</div>
        </td>
        <td class="small">${age}</td>
        <td class="small"><span class="click" data-open="${makeBaseScanUrl(from)}">${shortHex(from)}</span></td>
        <td class="small"><span class="click" data-open="${makeBaseScanUrl(to)}">${shortHex(to)}</span></td>
        <td>${weiToEthStr(value) ?? "0"} ETH</td>
      </tr>
    `;
  }).join("");

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
  const rows = list.slice(0, 25).map((t) => {
    const hash = t.hash || t.transactionHash || "-";
    const token = t.tokenSymbol || "-";
    const from = t.from || "-";
    const to = t.to || "-";
    const age = t.timeStamp ? ageFromTs(t.timeStamp) : "-";
    const amount = t.value ?? "-";
    return `
      <tr>
        <td><span class="click" data-open="${makeBaseScanUrl(hash)}">${shortHex(hash)}</span></td>
        <td class="small">${age}</td>
        <td>${token}</td>
        <td class="small"><span class="click" data-open="${makeBaseScanUrl(from)}">${shortHex(from)}</span></td>
        <td class="small"><span class="click" data-open="${makeBaseScanUrl(to)}">${shortHex(to)}</span></td>
        <td>${amount}</td>
      </tr>
    `;
  }).join("");

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
   Detail loader
========================= */

async function loadDetail(address, tab = "tx") {
  stopGasAutoRefresh();
  showPage("detail");
  renderDetailSkeleton(tab);

  try {
    const r = await fetch(
      `/api/address?address=${encodeURIComponent(address)}&tab=${encodeURIComponent(tab)}&offset=25&page=1`,
      { cache: "no-store" }
    );
    const j = await r.json();
    if (!r.ok || j?.error) throw j;

    const addrEl = $("detailAddress");
    if (addrEl) {
      addrEl.innerHTML = `
        <span class="click" data-open="${makeBaseScanUrl(address)}">${address}</span>
        <span class="muted" style="margin-left:10px">${shortHex(address, 8, 6)}</span>
      `;
      addrEl.querySelectorAll("[data-open]").forEach((el) => {
        el.onclick = () => openExternal(el.dataset.open);
      });
    }

    const eth = weiToEthStr(j.balanceWei, 6);
    const balEl = $("detailBalance");
    if (balEl) balEl.textContent = `${eth ?? j.balanceWei} ETH`;

    const txCount = j.txCount ?? j.totalTxCount ?? "-";
    const cntEl = $("detailTxCount");
    if (cntEl) cntEl.textContent = typeof txCount === "number" ? txCount.toLocaleString() : String(txCount);

    setActiveTab(tab);
    const out = $("detailOutput");
    if (out) {
      out.innerHTML = tab === "erc20" ? renderErc20Table(j.list) : renderTxTable(j.list);
      out.querySelectorAll("[data-open]").forEach((el) => {
        el.onclick = () => openExternal(el.dataset.open);
      });
    }
  } catch (e) {
    const out = $("detailOutput");
    if (out) out.innerHTML = `<pre>${JSON.stringify(e, null, 2)}</pre>`;
  }
}

/* =========================
   GAS (Home only, 1 minute refresh)
========================= */

let __gasTimer = null;

function fmtGwei(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "-";
  return n < 1 ? n.toFixed(3) : n.toFixed(1);
}

function gasUtilPercent(gasUsedRatio) {
  const n = Number(gasUsedRatio);
  if (!Number.isFinite(n)) return "-";
  return (n * 100).toFixed(2) + "%";
}

function renderGas(g, nextSec) {
  const standard = fmtGwei(g.safe);
  const fast = fmtGwei(g.fast);
  const rapid = fmtGwei(g.rapid);

  return `
    <div class="gasWrap">
      <div class="gasTopBar">
        <div class="gasTitle">Base Gas Tracker ⛽</div>
        <div class="gasNext">Next update in <b>${nextSec}s</b></div>
      </div>

      <div class="gasGrid">
        <div class="gasCard">
          <div class="gasCardHead"><div class="gasEmoji">🙂</div> Standard</div>
          <div class="gasValue standard">${standard} Gwei</div>
          <div class="gasSub">~ 12–16 secs</div>
        </div>

        <div class="gasCard">
          <div class="gasCardHead"><div class="gasEmoji">😄</div> Fast</div>
          <div class="gasValue fast">${fast} Gwei</div>
          <div class="gasSub">~ 6–8 secs</div>
        </div>

        <div class="gasCard center">
          <div class="gasCardHead"><div class="gasEmoji">🚀</div> Rapid</div>
          <div class="gasValue rapid">${rapid} Gwei</div>
          <div class="gasSub">~ 2–3 secs</div>
        </div>
      </div>

      <div class="resultCard" style="padding:14px;">
        <div style="font-weight:800;margin-bottom:10px;">Additional Info</div>
        <div class="gasInfoGrid">
          <div class="gasInfoCard">
            <div class="gasInfoLabel">LAST BLOCK</div>
            <div class="gasInfoValue">${g.lastBlock ?? "-"}</div>
          </div>
          <div class="gasInfoCard">
            <div class="gasInfoLabel">AVG. UTILIZATION</div>
            <div class="gasInfoValue">${gasUtilPercent(g.gasUsedRatio)}</div>
          </div>
        </div>
        <div class="gasFoot">Source: ${g.source ?? "-"}</div>
      </div>
    </div>
  `;
}

async function loadGasOnce(next) {
  const out = $("gasOutput");
  if (!out) return;

  out.innerHTML = `<div class="muted">Loading gas…</div>`;
  try {
    const r = await fetch("/api/gas", { cache: "no-store" });
    const j = await r.json();
    if (!r.ok || j?.error) throw j;
    out.innerHTML = renderGas(j, next);
  } catch (e) {
    out.innerHTML = `<pre>${JSON.stringify(e, null, 2)}</pre>`;
  }
}

function startGasAutoRefresh() {
  stopGasAutoRefresh();
  showPage("home");

  let next = 60;
  loadGasOnce(next);

  __gasTimer = setInterval(async () => {
    next -= 1;

    if (next <= 0) {
      next = 60;
      await loadGasOnce(next);
    } else {
      const b = document.querySelector("#pageHome .gasNext b");
      if (b) b.textContent = `${next}s`;
    }
  }, 1000);
}

function stopGasAutoRefresh() {
  if (__gasTimer) clearInterval(__gasTimer);
  __gasTimer = null;
}

/* =========================
   Router handler
========================= */

function handleRoute() {
  const { parts, query } = parseRoute();

  if (!parts.length) {
    startGasAutoRefresh();
    return;
  }

  if (parts[0] === "address" && parts[1] && isAddress(parts[1])) {
    const tab = query.get("tab") === "erc20" ? "erc20" : "tx";
    loadDetail(parts[1], tab);
    return;
  }

  goHome();
}

/* =========================
   Bind
========================= */

window.addEventListener("DOMContentLoaded", () => {
  ensureSkeletonCss();

  $("open")?.addEventListener("click", () => {
    const q = $("query")?.value?.trim();
    if (!q) return;

    if (isAddress(q)) {
      goDetail(q, "tx");
      return;
    }

    openExternal(makeBaseScanUrl(q));
  });

  // Optional: kalau nanti kamu menambah tombol fetch, ini tetap aman
  $("fetch")?.addEventListener("click", () => $("open")?.click());

  $("tabTx")?.addEventListener("click", () => {
    const { parts } = parseRoute();
    const addr = parts?.[1];
    if (addr && isAddress(addr)) goDetail(addr, "tx");
  });

  $("tabErc20")?.addEventListener("click", () => {
    const { parts } = parseRoute();
    const addr = parts?.[1];
    if (addr && isAddress(addr)) goDetail(addr, "erc20");
  });

  $("back")?.addEventListener("click", () => {
    if (history.length > 1) history.back();
    else goHome();
  });

  $("query")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") $("open")?.click();
  });

  window.addEventListener("hashchange", handleRoute);

  if (!location.hash) location.hash = "#/";
  handleRoute();
});

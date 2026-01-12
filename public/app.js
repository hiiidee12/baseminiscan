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

// ============== BARU: USD Formatter & Featured Actions ==============

function fmtUSD(v) {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return `$${v.toFixed(4)}`;
}

function renderFeaturedActionsCard(data) {
  const list = data?.featuredActions || [];
  const rows = list.map((r) => `
    <tr>
      <td>${r.label}</td>
      <td class="num">${fmtUSD(r.low)}</td>
      <td class="num">${fmtUSD(r.average)}</td>
      <td class="num">${fmtUSD(r.high)}</td>
    </tr>
  `).join("");

  return `
    <div class="card">
      <div class="cardTitle">Featured Actions</div>
      <table class="tbl">
        <thead>
          <tr>
            <th>Action</th>
            <th class="num">Low</th>
            <th class="num">Average</th>
            <th class="num">High</th>
          </tr>
        </thead>
        <tbody>
          ${rows || `<tr><td colspan="4">No data</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

async function loadFeaturedActions() {
  const el = document.getElementById("featuredActions");
  if (!el) return;

  el.innerHTML = `
    <div class="card">
      <div class="cardTitle">Featured Actions</div>
      <div class="muted">Loading...</div>
    </div>
  `;

  try {
    const r = await fetch("/api/featured-actions");
    const j = await r.json();
    el.innerHTML = renderFeaturedActionsCard(j);
  } catch (e) {
    el.innerHTML = `
      <div class="card">
        <div class="cardTitle">Featured Actions</div>
        <div class="muted">Failed to load data!</div>
      </div>
    `;
  }
}

// ===================================================================

/* =========================
   Overview State
========================= */

const overviewState = {
  address: null,
  balanceWei: null,
  txCount: null,
};

function applyOverviewFromState() {
  if ($("detailAddress")) $("detailAddress").textContent = overviewState.address || "-";
  const eth = weiToEthStr(overviewState.balanceWei, 6);
  if ($("detailBalance")) $("detailBalance").textContent = eth ? `${eth} ETH` : "-";
  if ($("detailTxCount")) $("detailTxCount").textContent = renderTxCount(overviewState.txCount);
}

/* =========================
   Router
========================= */

function getHash() {
  return (location.hash || "#/").replace(/^#/, "");
}

function setHash(path) {
  location.hash = `#${path}`;
}

function parseRoute() {
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

  document.body.setAttribute("data-page", page);

  if (page === "detail") {
    home.style.display = "none";
    detail.style.display = "block";
  } else {
    detail.style.display = "none";
    home.style.display = "block";
  }
}

/* =========================
   Tabs
========================= */

function setActiveDetailTab(tab) {
  ["tabTx", "tabErc20", "tabInternal", "tabNft"].forEach((id) => {
    const el = $(id);
    if (el) el.classList.add("secondary");
  });

  const active =
    tab === "erc20" ? "tabErc20" :
    tab === "internal" ? "tabInternal" :
    tab === "nft" ? "tabNft" :
    "tabTx";

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

function tableSkeletonTx(rows = 6) {
  return `
    <div class="tableWrap skeleton">
      <div class="tableScroll">
        <table>
          <thead>
            <tr><th>Tx</th><th>Age</th><th>From</th><th>To</th><th>Value</th></tr>
          </thead>
          <tbody>
            ${Array.from({ length: rows }).map(() => `
              <tr>
                <td><div class="sk-line w70"></div><div class="sk-line w40"></div></td>
                <td><div class="sk-line w40"></div></td>
                <td><div class="sk-line w50"></div></td>
                <td><div class="sk-line w50"></div></td>
                <td><div class="sk-line w30"></div></td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function tableSkeletonErc20(rows = 6) {
  return `
    <div class="tableWrap skeleton">
      <div class="tableScroll">
        <table>
          <thead>
            <tr><th>Tx</th><th>Age</th><th>Token</th><th>From</th><th>To</th><th>Amount</th></tr>
          </thead>
          <tbody>
            ${Array.from({ length: rows }).map(() => `
              <tr>
                <td><div class="sk-line w70"></div></td>
                <td><div class="sk-line w40"></div></td>
                <td><div class="sk-line w40"></div></td>
                <td><div class="sk-line w50"></div></td>
                <td><div class="sk-line w50"></div></td>
                <td><div class="sk-line w30"></div></td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function tableSkeletonInternal(rows = 6) {
  return `
    <div class="tableWrap skeleton">
      <div class="tableScroll">
        <table>
          <thead>
            <tr><th>Tx</th><th>Age</th><th>From</th><th>To</th><th>Type</th><th>Value</th></tr>
          </thead>
          <tbody>
            ${Array.from({ length: rows }).map(() => `
              <tr>
                <td><div class="sk-line w70"></div></td>
                <td><div class="sk-line w40"></div></td>
                <td><div class="sk-line w50"></div></td>
                <td><div class="sk-line w50"></div></td>
                <td><div class="sk-line w30"></div></td>
                <td><div class="sk-line w30"></div></td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function tableSkeletonNft(rows = 6) {
  return `
    <div class="tableWrap skeleton nft">
      <div class="tableScroll">
        <table>
          <thead>
            <tr>
              <th>Tx</th><th>Age</th><th>Std</th>
              <th>Collection</th><th>ID</th>
              <th>From</th><th>To</th>
            </tr>
          </thead>
          <tbody>
            ${Array.from({ length: rows }).map(() => `
              <tr>
                <td><div class="sk-line w70"></div></td>
                <td><div class="sk-line w40"></div></td>
                <td><div class="sk-line w30"></div></td>
                <td><div class="sk-line w50"></div></td>
                <td><div class="sk-line w30"></div></td>
                <td><div class="sk-line w50"></div></td>
                <td><div class="sk-line w50"></div></td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

/* =========================
   Renderers
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

async function loadFarcasterUsername(address) {
  if (__lastFarcasterAddress === address) return;
  __lastFarcasterAddress = address;

  const el = document.getElementById("fcUserDetail");
  if (!el) return;

  el.textContent = "-";

  try {
    const r = await fetch(`/api/farcaster?address=${encodeURIComponent(address)}`);
    const j = await r.json();

    if (!j.ok || !j.username) return;

    el.textContent = "@" + j.username;
  } catch (e) {
    // silent
  }
}

function renderTxTable(list = []) {
  const rows = list.slice(0, 25).map(tx => `
    <tr>
      <td>
        <span class="click" data-open="${makeBaseScanUrl(tx.hash)}">${shortHex(tx.hash)}</span>
        <div class="small">Block ${tx.blockNumber}</div>
      </td>
      <td class="small">${ageFromTs(tx.timeStamp)}</td>
      <td class="small">${shortHex(tx.from)}</td>
      <td class="small">${shortHex(tx.to)}</td>
      <td>${weiToEthStr(tx.value) ?? "0.000000"} ETH</td>
    </tr>
  `).join("");

  return `
    <div class="tableWrap">
      <div class="tableScroll">
        <table>
          <thead><tr><th>Tx</th><th>Age</th><th>From</th><th>To</th><th>Value</th></tr></thead>
          <tbody>${rows || `<tr><td colspan="5">No transactions</td></tr>`}</tbody>
        </table>
      </div>
    </div>
  `;
}

function renderErc20Table(list = []) {
  const rows = list.slice(0, 25).map(t => {
    const dec = t.tokenDecimal ?? t.tokenDecimals ?? t.decimals ?? 0;
    const human = formatTokenAmount(t.value, dec, 6);
    const show = compactNumberString(human);

    return `
      <tr>
        <td>
          <span class="click" data-open="${makeBaseScanUrl(t.hash)}">${shortHex(t.hash)}</span>
          <div class="small">${t.tokenName ? String(t.tokenName).slice(0, 32) : ""}</div>
        </td>
        <td class="small">${ageFromTs(t.timeStamp)}</td>
        <td>${t.tokenSymbol || "-"}</td>
        <td class="small">${shortHex(t.from)}</td>
        <td class="small">${shortHex(t.to)}</td>
        <td title="${human}">${show}</td>
      </tr>
    `;
  }).join("");

  return `
    <div class="tableWrap">
      <div class="tableScroll">
        <table>
          <thead><tr><th>Tx</th><th>Age</th><th>Token</th><th>From</th><th>To</th><th>Amount</th></tr></thead>
          <tbody>${rows || `<tr><td colspan="6">No transfers</td></tr>`}</tbody>
        </table>
      </div>
    </div>
  `;
}

function renderInternalTable(list = []) {
  const rows = list.slice(0, 25).map(t => {
    const hash = t.hash || t.transactionHash || "-";
    const typ = (t.type || t.callType || "-").toString();
    const val = weiToEthStr(t.value) ?? "0.000000";

    return `
      <tr>
        <td>
          <span class="click" data-open="${makeBaseScanUrl(hash)}">${shortHex(hash)}</span>
          <div class="small">Block ${t.blockNumber ?? "-"}</div>
        </td>
        <td class="small">${ageFromTs(t.timeStamp)}</td>
        <td class="small">${shortHex(t.from)}</td>
        <td class="small">${shortHex(t.to)}</td>
        <td class="small">${typ}</td>
        <td>${val} ETH</td>
      </tr>
    `;
  }).join("");

  return `
    <div class="tableWrap internal">
      <div class="tableScroll">
        <table>
          <thead><tr><th>Tx</th><th>Age</th><th>From</th><th>To</th><th>Type</th><th>Value</th></tr></thead>
          <tbody>${rows || `<tr><td colspan="6">No internal calls</td></tr>`}</tbody>
        </table>
      </div>
    </div>
  `;
}

function renderNftTable(list = []) {
  const rows = list.map(t => `
    <tr>
      <td>
        <span class="click" data-open="${makeBaseScanUrl(t.hash)}">${shortHex(t.hash)}</span>
      </td>
      <td class="small">${ageFromTs(t.timeStamp)}</td>
      <td class="small">${t.nftStd || "-"}</td>
      <td>${t.tokenName || "-"}</td>
      <td class="small">${shortHex(t.from)}</td>
      <td class="small">${shortHex(t.to)}</td>
      <td class="small id">
  #${(() => {
    const v = String(t.tokenID || "");
    return v.length > 5 ? v.slice(0, 5) + "…" : v;
  })()}
</td>
    </tr>
  `).join("");

  return `
    <div class="tableWrap nft">
      <div class="tableScroll">
        <table>
          <thead>
            <tr>
              <th>Tx</th><th>Age</th><th>Std</th>
              <th>Collection</th>
              <th>From</th><th>To</th><th>ID</th>
            </tr>
          </thead>
          <tbody>${rows || `<tr><td colspan="7">No NFT transfers</td></tr>`}</tbody>
        </table>
      </div>
    </div>
  `;
}

/* =========================
   Detail Loader
========================= */

let __lastFarcasterAddress = null;
let __detailAddress = null;
let __detailTab = "tx";

function hideLinkRow() {
  const link = $("link");
  if (!link) return;
  link.innerHTML = "";
  link.style.display = "none";
}

function normalizeDetailTab(tab) {
  const t = String(tab || "").toLowerCase();
  if (t === "erc20") return "erc20";
  if (t === "internal") return "internal";
  if (t === "nft") return "nft";
  return "tx";
}

async function loadDetail(address, tab = "tx") {
  tab = normalizeDetailTab(tab);
  __detailAddress = address;
  __detailTab = tab;

  stopGasAutoRefresh();
  showPage("detail");
  setActiveDetailTab(tab);

  loadFarcasterUsername(address);
  overviewState.address = address;
  hideLinkRow();
  applyOverviewFromState();

  const out = $("detailOutput");
  if (out) {
    const sk =
      tab === "erc20" ? tableSkeletonErc20() :
      tab === "internal" ? tableSkeletonInternal() :
      tab === "nft" ? tableSkeletonNft() :
      tableSkeletonTx();
    out.innerHTML = overviewSkeleton() + sk;
  }

  try {
    const r = await fetch(
      `/api/address?address=${encodeURIComponent(address)}&tab=${encodeURIComponent(tab)}`,
      { cache: "no-store" }
    );
    const j = await r.json();
    if (!r.ok || j?.error) throw j;

    overviewState.balanceWei = j.balanceWei ?? overviewState.balanceWei;
    const newCount = getTxCountValue(j);
    if (newCount !== null && newCount !== undefined) {
      overviewState.txCount = newCount;
    }
    applyOverviewFromState();

    if (out) {
      out.innerHTML =
        tab === "erc20" ? renderErc20Table(j.list) :
        tab === "internal" ? renderInternalTable(j.list) :
        tab === "nft" ? renderNftTable(j.list) :
        renderTxTable(j.list);

      out.querySelectorAll("[data-open]").forEach(el => {
        el.onclick = () => openExternal(el.dataset.open);
      });
    }
  } catch (e) {
    if (out) out.innerHTML = `<pre>${JSON.stringify(e, null, 2)}</pre>`;
  }
}

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
    // 
    loadFeaturedActions();
  }
}

window.addEventListener("hashchange", handleRoute);

window.addEventListener("DOMContentLoaded", () => {
  hideLinkRow();

  $("open")?.addEventListener("click", () => {
    const q = $("query")?.value?.trim() || "";
    if (!q) return;

    if (isAddress(q)) {
      setHash(`/address/${q}`);
    } else {
      openExternal(makeBaseScanUrl(q));
    }
  });

  $("query")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") $("open")?.click();
  });

  $("back")?.addEventListener("click", () => {
    setHash("/");
  });

  $("tabTx")?.addEventListener("click", () => {
    if (__detailAddress) loadDetail(__detailAddress, "tx");
  });

  $("tabErc20")?.addEventListener("click", () => {
    if (__detailAddress) loadDetail(__detailAddress, "erc20");
  });

  $("tabInternal")?.addEventListener("click", () => {
    if (__detailAddress) loadDetail(__detailAddress, "internal");
  });

  $("tabNft")?.addEventListener("click", () => {
    if (__detailAddress) loadDetail(__detailAddress, "nft");
  });

  handleRoute();
});

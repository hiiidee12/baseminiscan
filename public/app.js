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
   Tabs
========================= */

function setActiveTab(tab) {
  ["tabTx", "tabErc20", "gas"].forEach((id) => {
    const el = $(id);
    if (el) el.classList.add("secondary");
  });
  const active =
    tab === "tx" ? "tabTx" : tab === "erc20" ? "tabErc20" : "gas";
  const el = $(active);
  if (el) el.classList.remove("secondary");
}

/* =========================
   Render Address
========================= */

function renderOverview(address, balanceWei) {
  const eth = weiToEthStr(balanceWei, 6);
  return `
    <div class="resultCard">
      <div class="badge">Address</div>
      <div style="margin-top:10px">
        <b class="click" data-open="${makeBaseScanUrl(address)}">
          ${shortHex(address, 8, 6)}
        </b>
      </div>
      <div style="margin-top:8px">
        Balance: <b>${eth ?? balanceWei} ETH</b>
      </div>
      <div class="muted">Raw: ${balanceWei} wei</div>
    </div>
  `;
}

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
  const rows = list
    .slice(0, 25)
    .map(
      (tx) => `
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
  `
    )
    .join("");

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
  const rows = list
    .slice(0, 25)
    .map(
      (t) => `
    <tr>
      <td>${shortHex(t.hash)}</td>
      <td class="small">${ageFromTs(t.timeStamp)}</td>
      <td>${t.tokenSymbol || "-"}</td>
      <td class="small">${shortHex(t.from)}</td>
      <td class="small">${shortHex(t.to)}</td>
      <td>${t.value ?? "-"}</td>
    </tr>
  `
    )
    .join("");

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
   Address Loader
========================= */

async function loadAddressView(address, tab = "tx") {
  stopGasAutoRefresh();
  setActiveTab(tab);

  const out = $("output");
  out.innerHTML = `<div class="muted">Loading…</div>`;

  try {
    const r = await fetch(
      `/api/address?address=${encodeURIComponent(address)}&tab=${encodeURIComponent(tab)}`,
      { cache: "no-store" }
    );
    const j = await r.json();

    if (!r.ok || j?.error) throw j;

    const html =
      renderOverview(address, j.balanceWei) +
      (tab === "erc20" ? renderErc20Table(j.list) : renderTxTable(j.list));

    out.innerHTML = html;

    out.querySelectorAll("[data-open]").forEach((el) => {
      el.onclick = () => openExternal(el.dataset.open);
    });
  } catch (e) {
    const msg =
      typeof e === "string"
        ? e
        : e?.message
        ? e.message
        : JSON.stringify(e, null, 2);
    out.innerHTML = `<pre>${msg}</pre>`;
  }
}

/* =========================
   GAS UI (embedded fix)
========================= */

let __gasTimer = null;

function fmtGwei(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "-";
  return n < 1 ? n.toFixed(3) : n.toFixed(1);
}

function rapidFromFast(fast) {
  const n = Number(fast);
  if (!Number.isFinite(n)) return null;
  return n * 1.25;
}

function gasUtilPercent(gasUsedRatio) {
  const n = Number(gasUsedRatio);
  if (!Number.isFinite(n)) return "-";
  return (n * 100).toFixed(2) + "%";
}

function usdFrom(gwei, gasUnits, ethUsd) {
  const g = Number(gwei);
  const u = Number(gasUnits);
  const p = Number(ethUsd);
  if (!Number.isFinite(g) || !Number.isFinite(u) || !Number.isFinite(p)) return "-";
  const usd = (g * 1e-9) * u * p;
  if (!Number.isFinite(usd)) return "-";
  return usd < 0.01 ? "< $0.01" : `$${usd.toFixed(3)}`;
}

function renderGas(g, nextSec) {
  const standard = fmtGwei(g.safe);
  const fast = fmtGwei(g.fast);
  const rapid = fmtGwei(g.rapid ?? rapidFromFast(g.fast));

  const ethUsd = Number(g.ethUsd);
  const ethUsdStr = Number.isFinite(ethUsd) ? `$${ethUsd.toFixed(2)}` : "-";

  // gas units (perkiraan)
  const UNITS = {
    transfer: 21000,
    erc20: 65000,
    swap: 150000,
    lp: 220000,
  };

  const sUsdTransfer = usdFrom(g.safe, UNITS.transfer, g.ethUsd);
  const fUsdTransfer = usdFrom(g.fast, UNITS.transfer, g.ethUsd);
  const rUsdTransfer = usdFrom(g.rapid ?? rapidFromFast(g.fast), UNITS.transfer, g.ethUsd);

  const sUsdSwap = usdFrom(g.safe, UNITS.swap, g.ethUsd);
  const fUsdSwap = usdFrom(g.fast, UNITS.swap, g.ethUsd);
  const rUsdSwap = usdFrom(g.rapid ?? rapidFromFast(g.fast), UNITS.swap, g.ethUsd);

  const sUsdLp = usdFrom(g.safe, UNITS.lp, g.ethUsd);
  const fUsdLp = usdFrom(g.fast, UNITS.lp, g.ethUsd);
  const rUsdLp = usdFrom(g.rapid ?? rapidFromFast(g.fast), UNITS.lp, g.ethUsd);

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
          <div class="gasSub">${sUsdTransfer} • ~ 12–16 secs</div>
        </div>

        <div class="gasCard">
          <div class="gasCardHead"><div class="gasEmoji">😄</div> Fast</div>
          <div class="gasValue fast">${fast} Gwei</div>
          <div class="gasSub">${fUsdTransfer} • ~ 6–8 secs</div>
        </div>

        <div class="gasCard center">
          <div class="gasCardHead"><div class="gasEmoji">🚀</div> Rapid</div>
          <div class="gasValue rapid">${rapid} Gwei</div>
          <div class="gasSub">${rUsdTransfer} • ~ 2–3 secs</div>
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

        <div class="gasMeta muted" style="margin-top:10px;">
          ETH/USD: <b>${ethUsdStr}</b> • Source: ${g.source ?? "-"}
        </div>

        <div style="font-weight:800;margin:14px 0 8px;">Featured Actions</div>
        <div class="tableWrap">
          <div class="tableScroll">
            <table>
              <thead>
                <tr><th>Action</th><th>Low</th><th>Average</th><th>High</th></tr>
              </thead>
              <tbody>
                <tr>
                  <td>ERC-20 Transfer</td>
                  <td>${sUsdTransfer}</td>
                  <td>${fUsdTransfer}</td>
                  <td>${rUsdTransfer}</td>
                </tr>
                <tr>
                  <td>Swap</td>
                  <td>${sUsdSwap}</td>
                  <td>${fUsdSwap}</td>
                  <td>${rUsdSwap}</td>
                </tr>
                <tr>
                  <td>Add/Remove LP</td>
                  <td>${sUsdLp}</td>
                  <td>${fUsdLp}</td>
                  <td>${rUsdLp}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="muted" style="margin-top:10px;">
          Note: estimasi USD = (gwei × gasUnits) × ETH/USD
        </div>
      </div>
    </div>
  `;
}

/* =========================
   GAS (1 minute refresh)
========================= */

async function loadGasOnce(next) {
  const out = $("output");
  out.innerHTML = `<div class="muted">Loading gas…</div>`;
  try {
    const r = await fetch("/api/gas", { cache: "no-store" });
    const j = await r.json();
    if (!r.ok || j?.error) throw j;
    out.innerHTML = renderGas(j, next);
  } catch (e) {
    const msg =
      typeof e === "string"
        ? e
        : e?.message
        ? e.message
        : JSON.stringify(e, null, 2);
    out.innerHTML = `<pre>${msg}</pre>`;
  }
}

function startGasAutoRefresh() {
  stopGasAutoRefresh();
  setActiveTab("gas");

  let next = 60;
  loadGasOnce(next);

  __gasTimer = setInterval(async () => {
    next--;
    if (next <= 0) {
      next = 60;
      await loadGasOnce(next);
    } else {
      const b = document.querySelector(".gasNext b");
      if (b) b.textContent = `${next}s`;
    }
  }, 1000);
}

function stopGasAutoRefresh() {
  if (__gasTimer) clearInterval(__gasTimer);
  __gasTimer = null;
}

/* =========================
   UI Bind
========================= */

window.addEventListener("DOMContentLoaded", () => {
  $("open")?.addEventListener("click", async () => {
    const q = $("query").value.trim();
    if (!q) return;

    if (isAddress(q)) {
      $("link").textContent = "";
      await loadAddressView(q, "tx");
    } else {
      stopGasAutoRefresh();
      const url = makeBaseScanUrl(q);
      $("link").innerHTML = `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`;
      openExternal(url);
    }
  });

  $("fetch")?.addEventListener("click", () => $("open").click());

  $("tabTx")?.addEventListener("click", () => {
    const q = $("query").value.trim();
    if (isAddress(q)) loadAddressView(q, "tx");
  });

  $("tabErc20")?.addEventListener("click", () => {
    const q = $("query").value.trim();
    if (isAddress(q)) loadAddressView(q, "erc20");
  });

  $("gas")?.addEventListener("click", startGasAutoRefresh);

  $("query")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") $("open").click();
  });
});

const $ = (id) => document.getElementById(id);

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
  } catch (e) {}
  window.open(url, "_blank", "noopener,noreferrer");
}

function setActiveTab(tab) {
  const tx = $("tabTx");
  const erc = $("tabErc20");
  const gas = $("gas");
  if (tx) tx.classList.add("secondary");
  if (erc) erc.classList.add("secondary");
  if (gas) gas.classList.add("secondary");

  if (tab === "tx" && tx) tx.classList.remove("secondary");
  if (tab === "erc20" && erc) erc.classList.remove("secondary");
  if (tab === "gas" && gas) gas.classList.remove("secondary");
}

function renderOverview(address, balanceWei) {
  const eth = weiToEthStr(balanceWei, 6);
  return `
    <div class="resultCard">
      <div class="badge">Address</div>
      <div style="margin-top:10px;font-size:14px;">
        <b class="click" data-open="${makeBaseScanUrl(address)}">${shortHex(address, 8, 6)}</b>
      </div>
      <div style="margin-top:10px;font-size:14px;">
        Balance: <b>${eth ?? balanceWei} ETH</b> (Base)
      </div>
      <div class="muted" style="margin-top:8px;">Raw: ${balanceWei} wei</div>
    </div>
  `;
}

function ageFromTs(ts) {
  const t = Number(ts) * 1000;
  if (!Number.isFinite(t)) return "-";
  const diff = Date.now() - t;
  const s = Math.max(0, Math.floor(diff / 1000));
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d ago`;
  if (h > 0) return `${h}h ago`;
  if (m > 0) return `${m}m ago`;
  return `${s}s ago`;
}

function renderTxTable(list) {
  const rows = (list || [])
    .slice(0, 25)
    .map((tx) => {
      const hash = tx.hash || tx.transactionHash || "-";
      const from = tx.from || "-";
      const to = tx.to || "-";
      const valueEth = weiToEthStr(tx.value || "0", 6) || "0.000000";
      const age = tx.timeStamp ? ageFromTs(tx.timeStamp) : "-";
      const block = tx.blockNumber || "-";

      return `
      <tr>
        <td>
          <span class="click" data-open="${makeBaseScanUrl(hash)}">${shortHex(hash)}</span>
          <div class="small">Block ${block}</div>
        </td>
        <td class="small">${age}</td>
        <td class="small"><span class="click" data-open="${makeBaseScanUrl(from)}">${shortHex(from)}</span></td>
        <td class="small"><span class="click" data-open="${makeBaseScanUrl(to)}">${shortHex(to)}</span></td>
        <td>${valueEth}</td>
      </tr>
    `;
    })
    .join("");

  return `
    <div class="tableWrap">
      <div class="tableScroll">
        <table>
          <thead>
            <tr>
              <th>Txn Hash</th>
              <th>Age</th>
              <th>From</th>
              <th>To</th>
              <th>Value (ETH)</th>
            </tr>
          </thead>
          <tbody>
            ${rows || `<tr><td colspan="5" class="small">No transactions found.</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderErc20Table(list) {
  const rows = (list || [])
    .slice(0, 25)
    .map((t) => {
      const hash = t.hash || t.transactionHash || "-";
      const token = t.tokenSymbol || "-";
      const tokenName = t.tokenName || token;
      const from = t.from || "-";
      const to = t.to || "-";
      const age = t.timeStamp ? ageFromTs(t.timeStamp) : "-";

      const dec = Number(t.tokenDecimal || "0");
      const raw = t.value || "0";
      let amount = raw;
      const n = Number(raw);
      if (Number.isFinite(n) && dec >= 0 && dec <= 18) {
        amount = (n / Math.pow(10, dec)).toFixed(6);
      }

      return `
      <tr>
        <td><span class="click" data-open="${makeBaseScanUrl(hash)}">${shortHex(hash)}</span></td>
        <td class="small">${age}</td>
        <td>
          <div><b>${token}</b></div>
          <div class="small">${tokenName}</div>
        </td>
        <td class="small"><span class="click" data-open="${makeBaseScanUrl(from)}">${shortHex(from)}</span></td>
        <td class="small"><span class="click" data-open="${makeBaseScanUrl(to)}">${shortHex(to)}</span></td>
        <td>${amount}</td>
      </tr>
    `;
    })
    .join("");

  return `
    <div class="tableWrap">
      <div class="tableScroll">
        <table>
          <thead>
            <tr>
              <th>Txn Hash</th>
              <th>Age</th>
              <th>Token</th>
              <th>From</th>
              <th>To</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            ${rows || `<tr><td colspan="6" class="small">No token transfers found.</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function bindOpenHandlers(scopeEl) {
  if (!scopeEl) return;
  scopeEl.querySelectorAll("[data-open]").forEach((el) => {
    el.addEventListener("click", () => openExternal(el.getAttribute("data-open")));
  });
}

/* =========================
   GAS (expects /api/gas)
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

function gweiToUsd(gwei, gasUnits, ethUsd) {
  const g = Number(gwei);
  const u = Number(gasUnits);
  const p = Number(ethUsd);
  if (!Number.isFinite(g) || !Number.isFinite(u) || !Number.isFinite(p)) return null;
  const usd = (g * 1e-9) * u * p;
  return usd;
}

function fmtUsd(n) {
  if (!Number.isFinite(n)) return "-";
  if (n < 0.01) return "< $0.01";
  return `$${n.toFixed(n < 1 ? 2 : 3)}`;
}

function renderGas(g, nextSec) {
  const standard = fmtGwei(g.safe);
  const fast = fmtGwei(g.fast);
  const rapid = fmtGwei(g.rapid);

  const ethUsd = Number(g.ethUsd);
  const hasPrice = Number.isFinite(ethUsd) && ethUsd > 0;

  const lowUsd = hasPrice ? fmtUsd(gweiToUsd(g.safe, 21000, ethUsd)) : "-";
  const avgUsd = hasPrice ? fmtUsd(gweiToUsd(g.fast, 120000, ethUsd)) : "-";
  const highUsd = hasPrice ? fmtUsd(gweiToUsd(g.rapid, 180000, ethUsd)) : "-";

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
          <div class="gasSub">${hasPrice ? lowUsd : ""} ~ 12–16 secs</div>
        </div>

        <div class="gasCard">
          <div class="gasCardHead"><div class="gasEmoji">😄</div> Fast</div>
          <div class="gasValue fast">${fast} Gwei</div>
          <div class="gasSub">${hasPrice ? avgUsd : ""} ~ 6–8 secs</div>
        </div>

        <div class="gasCard center">
          <div class="gasCardHead"><div class="gasEmoji">🚀</div> Rapid</div>
          <div class="gasValue rapid">${rapid} Gwei</div>
          <div class="gasSub">${hasPrice ? highUsd : ""} ~ 2–3 secs</div>
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

        <div class="gasMeta">
          ${hasPrice ? `ETH/USD: $${ethUsd.toFixed(2)}` : ""}${hasPrice ? " • " : ""}Source: ${g.source ?? "-"}
        </div>

        <div style="font-weight:800;margin:14px 0 8px;">Featured Actions</div>
        <div class="tableWrap">
          <div class="tableScroll">
            <table>
              <thead>
                <tr>
                  <th>Action</th>
                  <th>Low</th>
                  <th>Average</th>
                  <th>High</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td class="small">ERC-20 Transfer</td>
                  <td>${hasPrice ? fmtUsd(gweiToUsd(g.safe, 65000, ethUsd)) : "-"}</td>
                  <td>${hasPrice ? fmtUsd(gweiToUsd(g.fast, 65000, ethUsd)) : "-"}</td>
                  <td>${hasPrice ? fmtUsd(gweiToUsd(g.rapid, 65000, ethUsd)) : "-"}</td>
                </tr>
                <tr>
                  <td class="small">Swap</td>
                  <td>${hasPrice ? fmtUsd(gweiToUsd(g.safe, 150000, ethUsd)) : "-"}</td>
                  <td>${hasPrice ? fmtUsd(gweiToUsd(g.fast, 150000, ethUsd)) : "-"}</td>
                  <td>${hasPrice ? fmtUsd(gweiToUsd(g.rapid, 150000, ethUsd)) : "-"}</td>
                </tr>
                <tr>
                  <td class="small">Add/Remove LP</td>
                  <td>${hasPrice ? fmtUsd(gweiToUsd(g.safe, 220000, ethUsd)) : "-"}</td>
                  <td>${hasPrice ? fmtUsd(gweiToUsd(g.fast, 220000, ethUsd)) : "-"}</td>
                  <td>${hasPrice ? fmtUsd(gweiToUsd(g.rapid, 220000, ethUsd)) : "-"}</td>
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

async function loadGasOnce(nextSec = 10) {
  const out = $("output");
  if (!out) return false;

  out.innerHTML = `<div class="muted">Loading gas…</div>`;

  try {
    const r = await fetch("/api/gas");
    const j = await r.json();

    if (!r.ok || j?.error) {
      out.innerHTML = `<pre>${JSON.stringify(j, null, 2)}</pre>`;
      return false;
    }

    out.innerHTML = renderGas(j, nextSec);
    return true;
  } catch (e) {
    out.innerHTML = `<pre>${String(e)}</pre>`;
    return false;
  }
}

function stopGasAutoRefresh() {
  if (__gasTimer) clearInterval(__gasTimer);
  __gasTimer = null;
}

function startGasAutoRefresh() {
  stopGasAutoRefresh();

  let next = 10;
  loadGasOnce(next);

  __gasTimer = setInterval(async () => {
    next -= 1;

    if (next <= 0) {
      next = 10;
      await loadGasOnce(next);
    } else {
      const b = document.querySelector(".gasNext b");
      if (b) b.textContent = `${next}s`;
    }
  }, 1000);
}

/* =========================
   ADDRESS VIEW
   ========================= */

async function loadAddressView(address, tab = "tx") {
  stopGasAutoRefresh();
  setActiveTab(tab);

  const out = $("output");
  if (!out) return;

  out.innerHTML = `<div class="muted">Loading ${tab === "tx" ? "transactions" : "ERC-20 transfers"}…</div>`;

  const url = `/api/address?address=${encodeURIComponent(address)}&tab=${encodeURIComponent(tab)}&offset=25&page=1`;
  let res, json;

  try {
    res = await fetch(url);
    json = await res.json();
  } catch (e) {
    out.innerHTML = `<pre>${String(e)}</pre>`;
    return;
  }

  if (!res.ok || json?.error) {
    out.innerHTML = `<pre>${JSON.stringify(json, null, 2)}</pre>`;
    return;
  }

  const overview = renderOverview(address, json.balanceWei);
  const table = tab === "erc20" ? renderErc20Table(json.list) : renderTxTable(json.list);

  out.innerHTML = overview + table;
  bindOpenHandlers(out);
}

/* =========================
   UI BINDING (fix loading/blank by waiting DOM)
   ========================= */

function safeOn(id, event, fn) {
  const el = $(id);
  if (!el) return;
  el.addEventListener(event, fn);
}

function bindUI() {
  safeOn("open", "click", async () => {
    const qEl = $("query");
    if (!qEl) return;
    const q = qEl.value.trim();
    if (!q) return;

    if (isAddress(q)) {
      const link = $("link");
      if (link) link.textContent = "";
      await loadAddressView(q, "tx");
      return;
    }

    stopGasAutoRefresh();

    const url = makeBaseScanUrl(q);
    const link = $("link");
    if (link) link.innerHTML = `Link: <a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`;
    await openExternal(url);
  });

  safeOn("fetch", "click", async () => {
    const qEl = $("query");
    const out = $("output");
    if (!qEl || !out) return;

    const q = qEl.value.trim();
    if (!q) return;

    if (isAddress(q)) {
      await loadAddressView(q, "tx");
      return;
    }

    stopGasAutoRefresh();
    out.innerHTML = `<div class="muted">Loading…</div>`;

    try {
      const res = await fetch(`/api/basescan?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      out.innerHTML = `<pre>${JSON.stringify(data, null, 2)}</pre>`;
    } catch (e) {
      out.innerHTML = `<pre>${String(e)}</pre>`;
    }
  });

  safeOn("tabTx", "click", async () => {
    const qEl = $("query");
    if (!qEl) return;
    const q = qEl.value.trim();
    if (!isAddress(q)) return;
    await loadAddressView(q, "tx");
  });

  safeOn("tabErc20", "click", async () => {
    const qEl = $("query");
    if (!qEl) return;
    const q = qEl.value.trim();
    if (!isAddress(q)) return;
    await loadAddressView(q, "erc20");
  });

  safeOn("gas", "click", async () => {
    setActiveTab("gas");
    startGasAutoRefresh();
  });

  const qEl = $("query");
  if (qEl) {
    qEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        const btn = $("open");
        if (btn) btn.click();
      }
    });
  }
}

window.addEventListener("DOMContentLoaded", () => {
  try {
    bindUI();
  } catch (e) {
    const out = $("output");
    if (out) out.innerHTML = `<pre>${String(e)}</pre>`;
  }
});

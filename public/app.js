/* =========================
   Base Mini Scan - app.js
   - Home: input + gas tracker
   - Detail: overview + tabs (tx / erc20)
   - Routing: hash (#/ and #/address/<addr>)
========================= */

const $ = (id) => document.getElementById(id);

const pageHome = $("pageHome");
const pageDetail = $("pageDetail");

const elQuery = $("query");
const elOpen = $("open");

const elBack = $("back");
const elLink = $("link");

const elDetailAddress = $("detailAddress");
const elDetailBalance = $("detailBalance");
const elDetailTxCount = $("detailTxCount");
const elDetailOutput = $("detailOutput");

const tabTx = $("tabTx");
const tabErc20 = $("tabErc20");

let gasTimer = null;

/* -------------------------
   Small helpers
------------------------- */

function showPage(name) {
  const isHome = name === "home";
  pageHome.style.display = isHome ? "" : "none";
  pageDetail.style.display = isHome ? "none" : "";
}

function shortAddr(a) {
  if (!a || a.length < 10) return a || "-";
  return `${a.slice(0, 8)}…${a.slice(-6)}`;
}

function isAddress(q) {
  return /^0x[a-fA-F0-9]{40}$/.test(q || "");
}

function setActiveTab(which) {
  const isTx = which === "tx";
  tabTx.classList.toggle("active", isTx);
  tabErc20.classList.toggle("active", !isTx);

  tabTx.classList.toggle("secondary", !isTx);
  tabErc20.classList.toggle("secondary", isTx);
}

/* -------------------------
   Routing (hash)
   - #/
   - #/address/<addr>
   - optional query: ?tab=tx|erc20
------------------------- */

function parseRoute() {
  const raw = (location.hash || "#/").replace(/^#/, "");
  const [path, qs] = raw.split("?");
  const parts = path.split("/").filter(Boolean); // ["address", "0x..."]
  const params = new URLSearchParams(qs || "");
  const tab = params.get("tab") || "tx";
  return { parts, tab };
}

function navTo(hash) {
  location.hash = hash;
}

/* -------------------------
   Home actions
------------------------- */

function handleOpen() {
  const q = (elQuery.value || "").trim();
  if (!q) return;

  // If user pasted an address -> go to detail
  if (isAddress(q)) {
    navTo(`#/address/${q}?tab=tx`);
    return;
  }

  // If tx hash or block -> open BaseScan directly
  // (keep your existing behavior: just open external)
  const isTxHash = /^0x[a-fA-F0-9]{64}$/.test(q);
  const isBlock = /^\d+$/.test(q);

  if (isTxHash) {
    window.open(`https://basescan.org/tx/${q}`, "_blank");
    return;
  }
  if (isBlock) {
    window.open(`https://basescan.org/block/${q}`, "_blank");
    return;
  }

  // fallback
  window.open(`https://basescan.org/search?f=0&q=${encodeURIComponent(q)}`, "_blank");
}

/* -------------------------
   Gas Tracker
------------------------- */

function stopGasAutoRefresh() {
  if (gasTimer) clearInterval(gasTimer);
  gasTimer = null;
}

function renderGas(g, nextSec) {
  // This renderer is used on HOME only.
  // The header ("Base Gas Tracker" + next update) lives in index.html,
  // so we only render the cards + additional info here.
  const standard = g?.standard ?? {};
  const fast = g?.fast ?? {};
  const rapid = g?.rapid ?? {};
  const block = g?.block ?? g?.lastBlock ?? g?.latestBlock ?? "-";
  const util = g?.utilization ?? g?.avgUtilization ?? "-";
  const source = g?.source ?? "-";

  const card = (label, emoji, item) => {
    const gwei = item?.gwei ?? item?.priceGwei ?? item?.maxFeePerGasGwei;
    const secs = item?.seconds ?? item?.waitSeconds;
    const cost = item?.usd ?? item?.costUsd;

    const gweiStr = typeof gwei === "number" ? gwei.toFixed(3) : (gwei ?? "-");
    const secsStr =
      typeof secs === "number" ? `~ ${Math.max(0, Math.round(secs))} secs` : (secs ?? "");
    const usdStr =
      typeof cost === "number" ? `$${cost.toFixed(2)}` : (cost ?? null);

    return `
      <div class="gasCard">
        <div class="gasEmoji">${emoji}</div>
        <div class="gasLabel">${label}</div>
        <div class="gasValue">${gweiStr} <span class="gasUnit">Gwei</span></div>
        <div class="muted small">
          ${usdStr ? `<span>${usdStr}</span> • ` : ""}${secsStr || ""}
        </div>
      </div>
    `;
  };

  return `
    <div class="gasGrid">
      ${card("Standard", "🙂", standard)}
      ${card("Fast", "😄", fast)}
      ${card("Rapid", "🚀", rapid)}
    </div>

    <div class="resultCard" style="margin-top:14px">
      <div class="sectionTitle">Additional Info</div>
      <div class="statRow">
        <div class="statPill">
          <div class="muted small">LAST BLOCK</div>
          <div class="statPillVal">${block}</div>
        </div>
        <div class="statPill">
          <div class="muted small">AVG. UTILIZATION</div>
          <div class="statPillVal">${typeof util === "number" ? `${util.toFixed(2)}%` : util}</div>
        </div>
      </div>
      <div class="muted small" style="margin-top:10px">Source: ${source}</div>
    </div>
  `;
}

async function loadGasOnce(next) {
  const out = $("gasOutput") || $("output");
  if (!out) return;

  out.innerHTML = `<div class="muted">Loading gas…</div>`;

  // Update "next update" label immediately
  const b = document.querySelector("#gasNext b") || document.querySelector(".gasNext b");
  if (b) b.textContent = `${next}s`;

  try {
    const res = await fetch("/api/gas", { cache: "no-store" });
    const json = await res.json();

    if (!res.ok || json?.error) {
      out.innerHTML = `<div class="muted">Gas API error</div>`;
      return;
    }

    out.innerHTML = renderGas(json, next);
  } catch (e) {
    out.innerHTML = `<div class="muted">Failed to load gas</div>`;
  }
}

function startGasAutoRefresh() {
  stopGasAutoRefresh();

  let next = 60;
  const b0 = document.querySelector("#gasNext b") || document.querySelector(".gasNext b");
  if (b0) b0.textContent = `${next}s`;
  loadGasOnce(next);

  gasTimer = setInterval(() => {
    const b = document.querySelector("#gasNext b") || document.querySelector(".gasNext b");
    if (b) b.textContent = `${next}s`;

    next -= 1;
    if (next <= 0) {
      next = 60;
      loadGasOnce(next);
    }
  }, 1000);
}

/* -------------------------
   Detail Page (Address)
   expects /api/address returns:
   {
     address,
     balanceEth,
     txCountTotal,   // total count (bukan panjang list)
     transactions: [...],
     erc20: [...]
   }
------------------------- */

function renderOverviewSkeleton() {
  elDetailBalance.textContent = "…";
  elDetailTxCount.textContent = "…";
  elDetailOutput.innerHTML = `
    <div class="skeletonBlock" style="height:12px; width:40%; margin:10px 0"></div>
    <div class="skeletonTable">
      <div class="skeletonRow"></div>
      <div class="skeletonRow"></div>
      <div class="skeletonRow"></div>
      <div class="skeletonRow"></div>
      <div class="skeletonRow"></div>
    </div>
  `;
}

function renderTxTable(rows) {
  if (!rows || rows.length === 0) {
    return `<div class="muted">No transactions found.</div>`;
  }

  // minimal columns to fit mobile
  const head = `
    <div class="table">
      <div class="thead">
        <div>Tx</div>
        <div>Age</div>
        <div>From</div>
        <div>To</div>
        <div>Value</div>
      </div>
  `;

  const body = rows
    .map((r) => {
      const hash = r.hash || r.txHash || "-";
      const age = r.age || r.timeAgo || "-";
      const from = r.from || "-";
      const to = r.to || "-";
      const val = r.valueEth ?? r.value ?? "-";

      return `
        <div class="trow">
          <div class="mono">${shortAddr(hash)}</div>
          <div class="muted">${age}</div>
          <div class="mono">${shortAddr(from)}</div>
          <div class="mono">${shortAddr(to)}</div>
          <div class="mono">${val}</div>
        </div>
      `;
    })
    .join("");

  return head + body + `</div>`;
}

function renderErc20Table(rows) {
  if (!rows || rows.length === 0) {
    return `<div class="muted">No ERC-20 transfers found.</div>`;
  }

  const head = `
    <div class="table">
      <div class="thead">
        <div>Tx</div>
        <div>Age</div>
        <div>Token</div>
        <div>From</div>
        <div>To</div>
        <div>Amount</div>
      </div>
  `;

  const body = rows
    .map((r) => {
      const hash = r.hash || r.txHash || "-";
      const age = r.age || r.timeAgo || "-";
      const token = r.tokenSymbol || r.token || "-";
      const from = r.from || "-";
      const to = r.to || "-";
      const amt = r.amount || r.value || "-";

      return `
        <div class="trow">
          <div class="mono">${shortAddr(hash)}</div>
          <div class="muted">${age}</div>
          <div class="mono">${token}</div>
          <div class="mono">${shortAddr(from)}</div>
          <div class="mono">${shortAddr(to)}</div>
          <div class="mono">${amt}</div>
        </div>
      `;
    })
    .join("");

  return head + body + `</div>`;
}

async function loadAddressDetail(address, tab) {
  renderOverviewSkeleton();

  // Link kecil (biar user bisa klik BaseScan)
  if (elLink) {
    elLink.innerHTML = `<a href="https://basescan.org/address/${address}" target="_blank" rel="noreferrer">BaseScan ↗</a>`;
  }

  try {
    // Keep simple: server decides pagination.
    const res = await fetch(`/api/address?address=${encodeURIComponent(address)}&tab=${encodeURIComponent(tab)}`, {
      cache: "no-store",
    });
    const json = await res.json();

    if (!res.ok || json?.error) {
      elDetailOutput.innerHTML = `<div class="muted">Address API error</div>`;
      elDetailBalance.textContent = "-";
      elDetailTxCount.textContent = "-";
      return;
    }

    elDetailAddress.textContent = address;
    elDetailBalance.textContent =
      typeof json.balanceEth === "number" ? `${json.balanceEth.toFixed(6)} ETH` : (json.balanceEth ?? "-");

    // IMPORTANT: total tx count from server (bukan panjang list)
    const total = json.txCountTotal ?? json.totalTx ?? json.txCount ?? "-";
    elDetailTxCount.textContent = total;

    if (tab === "erc20") {
      elDetailOutput.innerHTML = renderErc20Table(json.erc20 || json.erc20Transfers || []);
    } else {
      elDetailOutput.innerHTML = renderTxTable(json.transactions || json.txs || []);
    }
  } catch (e) {
    elDetailOutput.innerHTML = `<div class="muted">Failed to load address</div>`;
    elDetailBalance.textContent = "-";
    elDetailTxCount.textContent = "-";
  }
}

/* -------------------------
   Route handler
------------------------- */

function onRoute() {
  const { parts, tab } = parseRoute();

  // HOME
  if (parts.length === 0 || parts[0] === "") {
    showPage("home");
    startGasAutoRefresh();
    return;
  }

  // DETAIL
  if (parts[0] === "address") {
    const address = parts[1];
    if (!isAddress(address)) {
      navTo("#/");
      return;
    }

    stopGasAutoRefresh();
    showPage("detail");
    setActiveTab(tab === "erc20" ? "erc20" : "tx");
    loadAddressDetail(address, tab === "erc20" ? "erc20" : "tx");
    return;
  }

  // Unknown route -> home
  navTo("#/");
}

/* -------------------------
   Events
------------------------- */

elOpen?.addEventListener("click", handleOpen);
elQuery?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") handleOpen();
});

elBack?.addEventListener("click", () => navTo("#/"));

tabTx?.addEventListener("click", () => {
  const { parts } = parseRoute();
  const address = parts?.[1];
  if (!address) return;
  navTo(`#/address/${address}?tab=tx`);
});

tabErc20?.addEventListener("click", () => {
  const { parts } = parseRoute();
  const address = parts?.[1];
  if (!address) return;
  navTo(`#/address/${address}?tab=erc20`);
});

window.addEventListener("hashchange", onRoute);

/* -------------------------
   Init
------------------------- */

onRoute();

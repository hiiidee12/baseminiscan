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

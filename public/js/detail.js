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

  if (typeof loadFarcasterUsername === "function") loadFarcasterUsername(address);

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

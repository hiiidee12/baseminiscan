/* =========================
   Bind UI + Route
========================= */

function handleRoute() {
  const r = parseRoute();

  if (r.page === "detail" && isAddress(r.address)) {
    if (typeof loadFarcasterUsername === "function") loadFarcasterUsername(r.address);
    loadDetail(r.address, __detailTab || "tx");
    return;
  }

  if (r.page === "ai") {
    showPage("ai");
    window.__aiUi?.setActiveTopTab?.("ai");
    if (typeof stopGasAutoRefresh === "function") stopGasAutoRefresh();
    return;
  }

  // default: home
  showPage("home");
  window.__aiUi?.setActiveTopTab?.("home");
  if (typeof startGasAutoRefresh === "function") startGasAutoRefresh();
}

window.addEventListener("hashchange", handleRoute);

window.addEventListener("DOMContentLoaded", () => {
  // search submit
  $("searchForm")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const q = $("q")?.value?.trim() || "";
    if (!q) return;

    // route by input type
    if (isAddress(q)) {
      location.hash = `#/address/${q}`;
      return;
    }
    if (isTx(q)) {
      // open basescan directly for tx
      openExternal(makeBaseScanUrl(q));
      return;
    }
    if (isBlock(q)) {
      openExternal(makeBaseScanUrl(q));
      return;
    }

    // fallback: basescan search
    openExternal(makeBaseScanUrl(q));
  });

  // top tabs
  $("tabHomeTop")?.addEventListener("click", () => {
    location.hash = "#/";
  });

  $("tabAiTop")?.addEventListener("click", () => {
    location.hash = "#/ai";
  });

  // detail tabs
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

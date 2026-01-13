/* =========================
   Bind UI + Route
========================= */

function handleRoute() {
  const r = parseRoute();

  // DETAIL
  if (r.page === "detail" && isAddress(r.address)) {
    loadDetail(r.address, __detailTab || "tx");
    return;
  }

  // AI
  if (r.page === "ai") {
    showPage("ai");
    window.__aiUi?.setActiveTopTab?.("ai");

    // stop gas refresh kalau ada
    if (typeof stopGasAutoRefresh === "function") stopGasAutoRefresh();
    return;
  }

  // HOME (default)
  showPage("home");
  window.__aiUi?.setActiveTopTab?.("home");

  // start gas + featured
  if (typeof startGasAutoRefresh === "function") startGasAutoRefresh();
  if (typeof loadFeaturedActions === "function") loadFeaturedActions();
}

window.addEventListener("hashchange", handleRoute);

window.addEventListener("DOMContentLoaded", () => {
  if (typeof hideLinkRow === "function") hideLinkRow();

  $("open")?.addEventListener("click", () => {
    const q = $("query")?.value?.trim() || "";
    if (!q) return;

    if (isAddress(q)) {
      setHash(`/address/${q}`);
      return;
    }

    openExternal(makeBaseScanUrl(q));
  });

  $("tabHomeTop")?.addEventListener("click", () => setHash("/"));
  $("tabAiTop")?.addEventListener("click", () => setHash("/ai"));

  $("query")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") $("open")?.click();
  });

  $("back")?.addEventListener("click", () => setHash("/"));

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

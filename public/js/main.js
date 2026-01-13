/* =========================
   Bind UI + Route
========================= */

function handleRoute() {
  const r = parseRoute();

  if (r.page === "detail" && isAddress(r.address)) {
    loadDetail(r.address, __detailTab || "tx");
    return;
  }

  if (r.page === "ai") {
    showPage("ai");
    window.__aiUi?.setActiveTopTab?.("ai");
    if (typeof stopGasAutoRefresh === "function") stopGasAutoRefresh();
    return;
  }

  showPage("home");
  window.__aiUi?.setActiveTopTab?.("home");
  if (typeof startGasAutoRefresh === "function") startGasAutoRefresh();
  if (typeof loadFeaturedActions === "function") loadFeaturedActions();
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

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

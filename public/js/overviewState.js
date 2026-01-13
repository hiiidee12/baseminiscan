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

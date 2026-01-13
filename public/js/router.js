/* =========================
   Router
========================= */

function getHash() {
  return (location.hash || "#/").replace(/^#/, "");
}

function setHash(path) {
  location.hash = `#${path}`;
}

function parseRoute() {
  const h = getHash();
  const parts = h.split("/").filter(Boolean);
  if (parts.length >= 2 && parts[0] === "address") {
    return { page: "detail", address: parts[1] };
  }
   if (parts.length >= 1 && parts[0] === "ai") {
  return { page: "ai" };
   }
  return { page: "home" };
}

function showPage(page) {
  const home = $("pageHome");
  const detail = $("pageDetail");
  const ai = $("pageAi");
  if (!home || !detail || !ai) return;

  document.body.setAttribute("data-page", page);

  home.style.display = page === "home" ? "block" : "none";
  detail.style.display = page === "detail" ? "block" : "none";
  ai.style.display = page === "ai" ? "block" : "none";
 }
}

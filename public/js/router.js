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
  return { page: "home" };
}

function showPage(page) {
  const home = $("pageHome");
  const detail = $("pageDetail");
  if (!home || !detail) return;

  document.body.setAttribute("data-page", page);

  if (page === "detail") {
    home.style.display = "none";
    detail.style.display = "block";
  } else {
    detail.style.display = "none";
    home.style.display = "block";
  }
}

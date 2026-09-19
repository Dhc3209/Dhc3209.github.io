(function () {
  var toggle = document.querySelector(".menu-toggle");
  var row = document.querySelector(".nav-row");
  function setOpen(open) {
    if (!row || !toggle) return;
    row.classList.toggle("nav-open", open);
    document.body.classList.toggle("nav-is-open", open);
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
  }
  if (toggle && row) {
    toggle.addEventListener("click", function () {
      setOpen(!row.classList.contains("nav-open"));
    });
    row.querySelectorAll(".nav-links a").forEach(function (a) {
      a.addEventListener("click", function () { setOpen(false); });
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") setOpen(false);
    });
  }
  document.querySelectorAll(".nav-drop").forEach(function (btn) {
    btn.addEventListener("click", function (e) {
      e.preventDefault();
      btn.parentElement.classList.toggle("open");
    });
  });
})();

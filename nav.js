(function () {
  var toggle = document.querySelector(".menu-toggle");
  var row = document.querySelector(".nav-row");
  if (toggle && row) {
    toggle.addEventListener("click", function () {
      row.classList.toggle("nav-open");
      toggle.setAttribute("aria-expanded", row.classList.contains("nav-open") ? "true" : "false");
    });
  }
  document.querySelectorAll(".nav-drop").forEach(function (btn) {
    btn.addEventListener("click", function (e) {
      e.preventDefault();
      btn.parentElement.classList.toggle("open");
    });
  });
})();

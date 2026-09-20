(function () {
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var toggle = document.querySelector(".menu-toggle");
  var row = document.querySelector(".nav-row");

  function setOpen(open) {
    if (!row || !toggle) return;
    row.classList.toggle("nav-open", open);
    document.body.classList.toggle("nav-is-open", open);
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) {
      var first = row.querySelector(".nav-links a, .nav-links button");
      if (first) first.focus({ preventScroll: true });
    }
  }

  if (toggle && row) {
    toggle.addEventListener("click", function () {
      setOpen(!row.classList.contains("nav-open"));
    });
    row.querySelectorAll(".nav-links a").forEach(function (a) {
      a.addEventListener("click", function () { setOpen(false); });
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        row.querySelectorAll(".has-dropdown.open").forEach(function (li) {
          li.classList.remove("open");
          var btn = li.querySelector(".nav-drop");
          if (btn) btn.setAttribute("aria-expanded", "false");
        });
        setOpen(false);
      }
    });
    document.addEventListener("click", function (e) {
      if (!row.contains(e.target) && row.classList.contains("nav-open")) {
        setOpen(false);
      }
    });
  }

  document.querySelectorAll(".nav-drop").forEach(function (btn) {
    btn.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      var parent = btn.parentElement;
      var willOpen = !parent.classList.contains("open");
      document.querySelectorAll(".has-dropdown.open").forEach(function (li) {
        if (li !== parent) {
          li.classList.remove("open");
          var b = li.querySelector(".nav-drop");
          if (b) b.setAttribute("aria-expanded", "false");
        }
      });
      parent.classList.toggle("open", willOpen);
      btn.setAttribute("aria-expanded", willOpen ? "true" : "false");
    });
  });

  var header = document.querySelector(".site-header");
  if (header) {
    var scrolled = false;
    function onScroll() {
      var next = window.scrollY > 12;
      if (next === scrolled) return;
      scrolled = next;
      header.classList.toggle("is-scrolled", scrolled);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  if (reduceMotion) return;

  var revealSelector = [
    "section > .wrap > .section-head",
    "section .card",
    "section .step",
    "section .photo-frame",
    "section .lead-form",
    "section .contact-method",
    "section .two-col > *",
    "section .faq-item",
    "section .callout",
    ".trust-bar .wrap",
    ".cta-band .wrap"
  ].join(",");

  var nodes = document.querySelectorAll(revealSelector);
  if (!nodes.length || !("IntersectionObserver" in window)) return;
  nodes.forEach(function (el) { el.classList.add("reveal"); });
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-visible");
      io.unobserve(entry.target);
    });
  }, { root: null, rootMargin: "0px 0px -8% 0px", threshold: 0.12 });
  nodes.forEach(function (el) { io.observe(el); });
})();

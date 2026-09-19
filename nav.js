(function () {
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* —— Mobile nav —— */
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

  /* —— Sticky header: soft shadow / blur intensify on scroll —— */
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

  /* —— Scroll reveal (calm fade / translate-up) —— */
  if (reduceMotion) return;

  var revealSelector = [
    "section > .wrap > .section-head",
    "section .card",
    "section .step",
    "section .photo-frame",
    "section .lead-form",
    "section .contact-method",
    "section .two-col > *",
    "section .two-col-equal > *",
    "section .faq-item",
    "section .callout",
    "section .prose-wide > h2",
    "section .prose-wide > p",
    "section .prose-wide > ul",
    "section .google-widget",
    ".trust-bar .wrap",
    ".cta-band .wrap"
  ].join(",");

  var nodes = document.querySelectorAll(revealSelector);
  if (!nodes.length || !("IntersectionObserver" in window)) return;

  nodes.forEach(function (el) {
    el.classList.add("reveal");
  });

  var io = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        io.unobserve(entry.target);
      });
    },
    { root: null, rootMargin: "0px 0px -8% 0px", threshold: 0.12 }
  );

  nodes.forEach(function (el) {
    io.observe(el);
  });
})();

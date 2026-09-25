/**
 * CPR GA4 click tracking — phone taps (tel:) and email links (mailto:).
 * tel: taps also fire Meta Pixel 'Contact' when fbq is loaded.
 * Lead form submits fire generate_lead from their own scripts on success.
 */
(function () {
  "use strict";
  if (window.__cprTrackBound) return;
  window.__cprTrackBound = true;
  document.addEventListener(
    "click",
    function (e) {
      try {
        var t = e.target;
        var a = t && t.closest ? t.closest("a[href]") : null;
        if (!a) return;
        var href = a.getAttribute("href") || "";
        var low = href.toLowerCase();
        if (low.indexOf("tel:") === 0 && typeof fbq === "function") {
          fbq("track", "Contact");
        }
        if (typeof gtag !== "function") return;
        if (low.indexOf("tel:") === 0) {
          gtag("event", "phone_call_click", {
            link_url: href,
            page_path: location.pathname,
            transport_type: "beacon"
          });
        } else if (low.indexOf("mailto:") === 0) {
          gtag("event", "email_click", {
            link_url: href.split("?")[0],
            page_path: location.pathname,
            transport_type: "beacon"
          });
        }
      } catch (err) {}
    },
    true
  );
})();

/**
 * CPR GA4 click tracking — phone taps (tel:), text taps (sms:), and email links (mailto:).
 * tel: taps also fire Meta Pixel 'Contact' when fbq is loaded.
 * Lead form submits fire generate_lead (with form_name) from their own scripts on success.
 * 2026-09-28: added sms_click; email_click also recognizes Cloudflare email-protection links.
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
        var common = {
          send_to: "G-5QCZSNXX0B",
          link_url: href.split("?")[0],
          page_path: location.pathname,
          link_text: (a.textContent || "").trim().slice(0, 60),
          transport_type: "beacon"
        };
        if (low.indexOf("tel:") === 0) {
          gtag("event", "phone_call_click", common);
        } else if (low.indexOf("sms:") === 0) {
          gtag("event", "sms_click", common);
        } else if (low.indexOf("mailto:") === 0 || low.indexOf("/cdn-cgi/l/email-protection") === 0) {
          common.link_url = low.indexOf("mailto:") === 0 ? href.split("?")[0] : "mailto:(cloudflare-protected)";
          gtag("event", "email_click", common);
        }
      } catch (err) {}
    },
    true
  );
})();

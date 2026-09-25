/**
 * Roof quote lead modal — collects Name/Phone/Email/Address without leaving the page.
 * Posts to window.CPR_LEADS_ENDPOINT (leads-config.js) using the same no-cors JSON pattern as contact-leads.js / storm-inspect-modal.js.
 */
(function () {
  "use strict";

  var MODAL_ID = "quote-lead-modal";
  var lastFocus = null;

  function cprTrackLead(formName) {
    try {
      if (typeof gtag === "function") {
        gtag("event", "generate_lead", {
          form_name: formName,
          page_path: location.pathname,
          transport_type: "beacon"
        });
      }
    } catch (e) {}
  }
  function endpoint() {
    return String(window.CPR_LEADS_ENDPOINT || "").trim();
  }

  function etTimestamp() {
    return (
      new Date().toLocaleString("en-US", { timeZone: "America/New_York" }) + " ET"
    );
  }

  function ensureModal() {
    var existing = document.getElementById(MODAL_ID);
    if (existing) return existing;

    var wrap = document.createElement("div");
    wrap.id = MODAL_ID;
    wrap.className = "quote-lead-modal";
    wrap.setAttribute("hidden", "");
    wrap.innerHTML =
      '<div class="quote-lead-modal__backdrop" data-quote-lead-close tabindex="-1"></div>' +
      '<div class="quote-lead-modal__card" role="dialog" aria-modal="true" aria-labelledby="quote-lead-title" tabindex="-1">' +
      '  <button type="button" class="quote-lead-modal__close" data-quote-lead-close aria-label="Close dialog">&times;</button>' +
      '  <div class="quote-lead-modal__head">' +
      '    <p class="eyebrow">Free estimate</p>' +
      '    <h2 id="quote-lead-title">Request a free roof quote</h2>' +
      "    <p>Tell us about your property and we’ll follow up with a free inspection / estimate. No fake urgency — take your time.</p>" +
      "  </div>" +
      '  <form class="quote-lead-modal__form" data-quote-lead-form novalidate>' +
      '    <input type="text" name="_honey" class="quote-lead-modal__honey" tabindex="-1" autocomplete="off" aria-hidden="true">' +
      '    <div class="quote-lead-modal__grid">' +
      '      <div><label for="ql-name">Name *</label>' +
      '        <input id="ql-name" name="Name" type="text" required autocomplete="name" placeholder="Your name"></div>' +
      '      <div><label for="ql-phone">Phone *</label>' +
      '        <input id="ql-phone" name="Phone" type="tel" required autocomplete="tel" placeholder="(704) 280-5996"></div>' +
      '      <div class="quote-lead-modal__full"><label for="ql-email">Email *</label>' +
      '        <input id="ql-email" name="Email" type="email" required autocomplete="email" placeholder="you@email.com"></div>' +
      '      <div class="quote-lead-modal__full"><label for="ql-address">Property address *</label>' +
      '        <input id="ql-address" name="Address" type="text" required autocomplete="street-address" placeholder="Street, City, NC ZIP"></div>' +
      '      <div class="quote-lead-modal__full"><label for="ql-notes">Preferred time / notes <span class="quote-lead-modal__opt">(optional)</span></label>' +
      '        <textarea id="ql-notes" name="Notes" rows="3" placeholder="Best time to call, roof concerns, preferred product…"></textarea></div>' +
      "    </div>" +
      '    <p class="quote-lead-modal__status" data-quote-lead-status role="status" aria-live="polite"></p>' +
      '    <div class="quote-lead-modal__actions">' +
      '      <button type="submit" class="btn">Request free quote</button>' +
      '      <button type="button" class="btn btn-outline" data-quote-lead-close>Cancel</button>' +
      "    </div>" +
      '    <p class="quote-lead-modal__alt">Prefer to talk? Call or text <a href="tel:+17042805996">(704) 280-5996</a>.</p>' +
      "  </form>" +
      '  <div class="quote-lead-modal__thanks" data-quote-lead-thanks hidden>' +
      "    <p><strong>Thanks — we got your request.</strong> We’ll follow up soon about your free roof quote.</p>" +
      '    <button type="button" class="btn" data-quote-lead-close>Close</button>' +
      "  </div>" +
      "</div>";

    document.body.appendChild(wrap);
    return wrap;
  }

  function focusable(container) {
    return Array.prototype.slice.call(
      container.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    ).filter(function (el) {
      return el.offsetParent !== null || el === document.activeElement;
    });
  }

  function openModal() {
    var modal = ensureModal();
    var card = modal.querySelector(".quote-lead-modal__card");
    var form = modal.querySelector("[data-quote-lead-form]");
    var thanks = modal.querySelector("[data-quote-lead-thanks]");
    var status = modal.querySelector("[data-quote-lead-status]");
    lastFocus = document.activeElement;

    if (form) {
      form.hidden = false;
      form.reset();
    }
    if (thanks) thanks.hidden = true;
    if (status) status.textContent = "";

    modal.removeAttribute("hidden");
    document.documentElement.classList.add("quote-lead-modal-open");
    document.body.classList.add("quote-lead-modal-open");

    window.setTimeout(function () {
      var first = modal.querySelector("#ql-name") || card;
      if (first && first.focus) first.focus();
    }, 10);
  }

  function closeModal() {
    var modal = document.getElementById(MODAL_ID);
    if (!modal || modal.hasAttribute("hidden")) return;
    modal.setAttribute("hidden", "");
    document.documentElement.classList.remove("quote-lead-modal-open");
    document.body.classList.remove("quote-lead-modal-open");
    if (lastFocus && lastFocus.focus) {
      try {
        lastFocus.focus();
      } catch (e) {}
    }
  }

  function hrefOf(el) {
    return (el.getAttribute("href") || "").trim();
  }

  function isProtocolLink(href) {
    return /^(tel:|sms:|mailto:)/i.test(href);
  }

  function isInstantQuoteLink(href) {
    return /instant-quote/i.test(href);
  }

  function isStormInspectTarget(el) {
    if (!el) return false;
    if (el.classList.contains("js-storm-inspect-open")) return true;
    var href = hrefOf(el);
    if (/contact-us\/?\?topic=storm/i.test(href) || /[?&]topic=storm/i.test(href)) {
      return true;
    }
    var text = (el.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
    var stormCta =
      text.indexOf("schedule free storm inspection") !== -1 ||
      text.indexOf("get a free storm inspection") !== -1 ||
      text.indexOf("request a free claim inspection") !== -1;
    return stormCta;
  }

  function textLooksLikeQuoteCta(el) {
    var text = (el.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
    return (
      text.indexOf("get a free roof estimate") !== -1 ||
      text.indexOf("get roof quote") !== -1 ||
      text.indexOf("request a free roof quote") !== -1 ||
      text === "get a free estimate"
    );
  }

  function isQuoteLeadLink(el) {
    if (!el || el.tagName !== "A") return false;
    if (el.classList.contains("js-quote-lead-open")) return true;
    if (isStormInspectTarget(el)) return false;

    var href = hrefOf(el);
    if (!href || isProtocolLink(href) || isInstantQuoteLink(href)) return false;

    // Explicit estimate deep-links
    if (/contact-us\/?#estimate/i.test(href) || href === "#estimate") return true;

    // btn-estimate that target contact / estimate (not Instant Quote — already excluded)
    if (el.classList.contains("btn-estimate")) {
      return (
        /contact-us/i.test(href) ||
        /#estimate/i.test(href) ||
        href === "#" ||
        href === ""
      );
    }

    // Common footer / nav / body CTAs by label
    if (textLooksLikeQuoteCta(el)) {
      return (
        /contact-us/i.test(href) ||
        /#estimate/i.test(href) ||
        href === "#" ||
        href === "/contact-us/" ||
        href === "/contact-us"
      );
    }

    return false;
  }

  function onDocClick(e) {
    var t = e.target;
    if (!t || !t.closest) return;

    var closer = t.closest("[data-quote-lead-close]");
    if (closer) {
      e.preventDefault();
      closeModal();
      return;
    }

    var openBtn = t.closest("a, button");
    if (!openBtn) return;

    if (openBtn.classList.contains("js-quote-lead-open")) {
      e.preventDefault();
      openModal();
      return;
    }

    if (openBtn.tagName === "A" && isQuoteLeadLink(openBtn)) {
      e.preventDefault();
      openModal();
    }
  }

  function onKeydown(e) {
    var modal = document.getElementById(MODAL_ID);
    if (!modal || modal.hasAttribute("hidden")) return;
    if (e.key === "Escape") {
      e.preventDefault();
      closeModal();
      return;
    }
    if (e.key !== "Tab") return;
    var card = modal.querySelector(".quote-lead-modal__card");
    var nodes = focusable(card);
    if (!nodes.length) return;
    var first = nodes[0];
    var last = nodes[nodes.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function onSubmit(e) {
    var form = e.target;
    if (!form || !form.matches || !form.matches("[data-quote-lead-form]")) return;
    e.preventDefault();

    var honey = form.querySelector('[name="_honey"]');
    if (honey && honey.value) return;

    var status = form.querySelector("[data-quote-lead-status]");
    var thanks = document.querySelector("[data-quote-lead-thanks]");
    var name = ((form.Name && form.Name.value) || "").trim();
    var phone = ((form.Phone && form.Phone.value) || "").trim();
    var email = ((form.Email && form.Email.value) || "").trim();
    var address = ((form.Address && form.Address.value) || "").trim();
    var notes = ((form.Notes && form.Notes.value) || "").trim();

    if (!name || !phone || !email || !address) {
      if (status) status.textContent = "Please fill in name, phone, email, and property address.";
      return;
    }

    var url = endpoint();
    if (!url) {
      if (status) {
        status.textContent =
          "Lead email is not connected yet. Call/text (704) 280-5996 or email Daniel@cprhomepros.com.";
      }
      return;
    }

    var btn = form.querySelector('[type="submit"]');
    if (btn) {
      btn.disabled = true;
      btn.dataset.label = btn.textContent;
      btn.textContent = "Sending…";
    }
    if (status) status.textContent = "Sending…";

    var body = {
      _subject: "CPR website lead — Roof quote request",
      Name: name,
      Phone: phone,
      Email: email,
      Address: address,
      Message: notes,
      Notes: notes,
      Service: "Roof inspection / estimate",
      SourcePage: location.pathname,
      Timestamp: etTimestamp()
    };

    fetch(url, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(body)
    })
      .then(function () {
        if (status) status.textContent = "";
        form.hidden = true;
        if (thanks) thanks.hidden = false;
        cprTrackLead("roof_quote_popup");
        form.reset();
        window.setTimeout(function () {
          closeModal();
          form.hidden = false;
          if (thanks) thanks.hidden = true;
        }, 2800);
      })
      .catch(function () {
        if (status) {
          status.textContent =
            "Couldn’t send automatically — call/text (704) 280-5996.";
        }
      })
      .finally(function () {
        if (btn) {
          btn.disabled = false;
          btn.textContent = btn.dataset.label || "Request free quote";
        }
      });
  }

  function boot() {
    ensureModal();
    document.addEventListener("click", onDocClick, true);
    document.addEventListener("keydown", onKeydown);
    document.addEventListener("submit", onSubmit, true);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  window.CPR_openQuoteLeadModal = openModal;
  window.CPR_closeQuoteLeadModal = closeModal;
})();

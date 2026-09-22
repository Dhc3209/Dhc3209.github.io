/**
 * Storm inspection lead modal — collects Name/Phone/Email/Address without leaving the page.
 * Posts to window.CPR_LEADS_ENDPOINT (leads-config.js) using the same no-cors JSON pattern as contact-leads.js.
 */
(function () {
  "use strict";

  var MODAL_ID = "storm-inspect-modal";
  var OPEN_SEL =
    ".js-storm-inspect-open, a[href*='contact-us'][href*='topic=storm'], a[href='/contact-us/?topic=storm']";
  var lastFocus = null;

  function endpoint() {
    return String(window.CPR_LEADS_ENDPOINT || "").trim();
  }

  function etTimestamp() {
    return (
      new Date().toLocaleString("en-US", { timeZone: "America/New_York" }) + " ET"
    );
  }

  function lastStormAddress() {
    if (window.CPR_STORM_LAST_ADDRESS) return String(window.CPR_STORM_LAST_ADDRESS);
    var root = document.querySelector("[data-storm-check]");
    if (root && root.dataset && root.dataset.stormAddress) {
      return root.dataset.stormAddress;
    }
    var input = document.getElementById("sc-address");
    if (input && input.value && input.value.trim()) return input.value.trim();
    return "";
  }

  function lastStormRadius() {
    if (window.CPR_STORM_LAST_RADIUS != null && window.CPR_STORM_LAST_RADIUS !== "") {
      return String(window.CPR_STORM_LAST_RADIUS);
    }
    var root = document.querySelector("[data-storm-check]");
    if (root && root.dataset && root.dataset.stormRadius) {
      return root.dataset.stormRadius;
    }
    var sel = document.getElementById("sc-radius");
    if (sel && sel.value) return sel.value;
    return "";
  }

  function ensureModal() {
    var existing = document.getElementById(MODAL_ID);
    if (existing) return existing;

    var wrap = document.createElement("div");
    wrap.id = MODAL_ID;
    wrap.className = "storm-inspect-modal";
    wrap.setAttribute("hidden", "");
    wrap.innerHTML =
      '<div class="storm-inspect-modal__backdrop" data-storm-inspect-close tabindex="-1"></div>' +
      '<div class="storm-inspect-modal__card" role="dialog" aria-modal="true" aria-labelledby="storm-inspect-title" tabindex="-1">' +
      '  <button type="button" class="storm-inspect-modal__close" data-storm-inspect-close aria-label="Close dialog">&times;</button>' +
      '  <div class="storm-inspect-modal__head">' +
      '    <p class="eyebrow">Free storm inspection</p>' +
      '    <h2 id="storm-inspect-title">Schedule a free storm inspection</h2>' +
      "    <p>We’ll document hail/wind damage and work with your adjuster alongside you. No deductible waivers.</p>" +
      "  </div>" +
      '  <form class="storm-inspect-modal__form" data-storm-inspect-form novalidate>' +
      '    <input type="text" name="_honey" class="storm-inspect-modal__honey" tabindex="-1" autocomplete="off" aria-hidden="true">' +
      '    <div class="storm-inspect-modal__grid">' +
      '      <div><label for="si-name">Name *</label>' +
      '        <input id="si-name" name="Name" type="text" required autocomplete="name" placeholder="Your name"></div>' +
      '      <div><label for="si-phone">Phone *</label>' +
      '        <input id="si-phone" name="Phone" type="tel" required autocomplete="tel" placeholder="(704) 280-5996"></div>' +
      '      <div class="storm-inspect-modal__full"><label for="si-email">Email *</label>' +
      '        <input id="si-email" name="Email" type="email" required autocomplete="email" placeholder="you@email.com"></div>' +
      '      <div class="storm-inspect-modal__full"><label for="si-address">Property address *</label>' +
      '        <input id="si-address" name="Address" type="text" required autocomplete="street-address" placeholder="Street, City, NC ZIP"></div>' +
      '      <div class="storm-inspect-modal__full"><label for="si-notes">Preferred time / notes <span class="storm-inspect-modal__opt">(optional)</span></label>' +
      '        <textarea id="si-notes" name="Notes" rows="3" placeholder="Best time to call, storm date, claim number…"></textarea></div>' +
      "    </div>" +
      '    <p class="storm-inspect-modal__status" data-storm-inspect-status role="status" aria-live="polite"></p>' +
      '    <div class="storm-inspect-modal__actions">' +
      '      <button type="submit" class="btn">Request free inspection</button>' +
      '      <button type="button" class="btn btn-outline" data-storm-inspect-close>Cancel</button>' +
      "    </div>" +
      '    <p class="storm-inspect-modal__alt">Prefer to talk? Call or text <a href="tel:+17042805996">(704) 280-5996</a>.</p>' +
      "  </form>" +
      '  <div class="storm-inspect-modal__thanks" data-storm-inspect-thanks hidden>' +
      "    <p><strong>Thanks — we got your request.</strong> We’ll follow up soon to schedule the free inspection.</p>" +
      '    <button type="button" class="btn" data-storm-inspect-close>Close</button>' +
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
    var card = modal.querySelector(".storm-inspect-modal__card");
    var form = modal.querySelector("[data-storm-inspect-form]");
    var thanks = modal.querySelector("[data-storm-inspect-thanks]");
    var status = modal.querySelector("[data-storm-inspect-status]");
    lastFocus = document.activeElement;

    if (form) {
      form.hidden = false;
      if (!form.dataset.keepValues) form.reset();
      var addr = form.querySelector("#si-address");
      if (addr) addr.value = lastStormAddress();
    }
    if (thanks) thanks.hidden = true;
    if (status) status.textContent = "";

    modal.removeAttribute("hidden");
    document.documentElement.classList.add("storm-inspect-modal-open");
    document.body.classList.add("storm-inspect-modal-open");

    window.setTimeout(function () {
      var first = modal.querySelector("#si-name") || card;
      if (first && first.focus) first.focus();
    }, 10);
  }

  function closeModal() {
    var modal = document.getElementById(MODAL_ID);
    if (!modal || modal.hasAttribute("hidden")) return;
    modal.setAttribute("hidden", "");
    document.documentElement.classList.remove("storm-inspect-modal-open");
    document.body.classList.remove("storm-inspect-modal-open");
    if (lastFocus && lastFocus.focus) {
      try {
        lastFocus.focus();
      } catch (e) {}
    }
  }

  function isStormInspectLink(el) {
    if (!el || el.tagName !== "A") return false;
    if (el.classList.contains("js-storm-inspect-open")) return true;
    var href = (el.getAttribute("href") || "").trim();
    if (!href || href.indexOf("tel:") === 0 || href.indexOf("sms:") === 0) return false;
    // Hero / storm CTAs that go to contact for storm inspection
    if (/contact-us\/?\?topic=storm/i.test(href)) return true;
    var text = (el.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
    var stormCta =
      text.indexOf("schedule free storm inspection") !== -1 ||
      text.indexOf("get a free storm inspection") !== -1 ||
      text.indexOf("request a free claim inspection") !== -1;
    if (!stormCta) return false;
    return /contact-us/i.test(href) || href === "#" || href === "/storm-damage-insurance-claims/";
  }

  function onDocClick(e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var closer = t.closest("[data-storm-inspect-close]");
    if (closer) {
      e.preventDefault();
      closeModal();
      return;
    }
    var openBtn = t.closest("a, button");
    if (!openBtn) return;
    if (openBtn.classList.contains("js-storm-inspect-open") || isStormInspectLink(openBtn)) {
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
    var card = modal.querySelector(".storm-inspect-modal__card");
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
    if (!form || !form.matches || !form.matches("[data-storm-inspect-form]")) return;
    e.preventDefault();

    var honey = form.querySelector('[name="_honey"]');
    if (honey && honey.value) return;

    var status = form.querySelector("[data-storm-inspect-status]");
    var thanks = document.querySelector("[data-storm-inspect-thanks]");
    var name = (form.Name && form.Name.value || "").trim();
    var phone = (form.Phone && form.Phone.value || "").trim();
    var email = (form.Email && form.Email.value || "").trim();
    var address = (form.Address && form.Address.value || "").trim();
    var notes = (form.Notes && form.Notes.value || "").trim();

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

    var radius = lastStormRadius();
    var body = {
      _subject: "CPR website lead — Storm inspection request",
      Name: name,
      Phone: phone,
      Email: email,
      Address: address,
      Message: notes,
      Notes: notes,
      Service: "Storm / insurance inspection",
      SourcePage: location.pathname,
      Timestamp: etTimestamp()
    };
    if (radius) body.StormRadius = radius + " miles";

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
          btn.textContent = btn.dataset.label || "Request free inspection";
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

  window.CPR_openStormInspectModal = openModal;
  window.CPR_closeStormInspectModal = closeModal;
})();

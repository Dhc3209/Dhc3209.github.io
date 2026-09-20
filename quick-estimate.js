/**
 * CPR Quick Estimate — ballpark GAF Timberline HDZ® replacement ranges for Lake Norman / Charlotte metro.
 * Not a binding quote. Final price after free on-site inspection.
 *
 * Pricing model (GAF Timberline HDZ® architectural baseline, NC metro):
 *   - $/square (100 sq ft of roof): LOW $425 · HIGH $650 installed
 *   - Stories multiplier: 1 → 1.00 · 1.5 → 1.08 · 2+ → 1.18
 *   - Material: GAF Timberline HDZ (asphalt) 1.00 · GAF Designer 1.22 · MRS metal 1.85
 *   - Home-size presets map to typical roof squares for the area
 * Ranges rounded to nearest $500. Notify: FormSubmit AJAX → Daniel@cprhomepros.com
 */
(function () {
  var RATE_LOW = 425;
  var RATE_HIGH = 650;
  var SIZE_SQUARES = {
    small: 18,
    medium: 25,
    large: 33,
    estate: 42
  };
  var STORY_MULT = {
    "1": 1.0,
    "1.5": 1.08,
    "2": 1.18
  };
  var MAT_MULT = {
    asphalt: 1.0,
    designer: 1.22,
    metal: 1.85
  };

  function round500(n) {
    return Math.round(n / 500) * 500;
  }

  function formatMoney(n) {
    return "$" + n.toLocaleString("en-US");
  }

  function calc(squares, stories, material) {
    var sm = STORY_MULT[stories] || 1.0;
    var mm = MAT_MULT[material] || 1.0;
    var low = round500(squares * RATE_LOW * sm * mm);
    var high = round500(squares * RATE_HIGH * sm * mm);
    if (high <= low) high = low + 1500;
    return { low: low, high: high, squares: squares };
  }

  function resolveSquares(form) {
    var mode = form.querySelector('[name="qe-size-mode"]:checked');
    mode = mode ? mode.value : "preset";
    if (mode === "squares") {
      var raw = parseFloat(form.querySelector('[name="qe-squares"]').value);
      if (!isFinite(raw) || raw < 10) raw = 10;
      if (raw > 80) raw = 80;
      return Math.round(raw);
    }
    var preset = form.querySelector('[name="qe-home-size"]').value || "medium";
    return SIZE_SQUARES[preset] || 25;
  }

  function updatePreview(root) {
    var form = root.querySelector(".qe-form");
    if (!form) return;
    var squares = resolveSquares(form);
    var stories = form.querySelector('[name="qe-stories"]').value || "1";
    var material = form.querySelector('[name="qe-material"]').value || "asphalt";
    var result = calc(squares, stories, material);
    var out = root.querySelector("[data-qe-range]");
    var meta = root.querySelector("[data-qe-meta]");
    if (out) {
      out.textContent = formatMoney(result.low) + " – " + formatMoney(result.high);
    }
    if (meta) {
      var matLabel = {
        asphalt: "GAF Timberline HDZ® architectural",
        designer: "GAF Designer Collection",
        metal: "MRS standing-seam metal"
      }[material] || "GAF Timberline HDZ® architectural";
      meta.textContent =
        "Based on ~" +
        result.squares +
        " squares · " +
        matLabel +
        " ranges for Denver / Lake Norman / Charlotte metro · rough estimate only";
    }
    form.dataset.qeLow = String(result.low);
    form.dataset.qeHigh = String(result.high);
    form.dataset.qeSquares = String(result.squares);
    return result;
  }

  function setStatus(root, msg, kind) {
    var el = root.querySelector("[data-qe-status]");
    if (!el) return;
    el.textContent = msg || "";
    el.className = "qe-status" + (kind ? " qe-status--" + kind : "");
  }

  function toggleSizeMode(root) {
    var form = root.querySelector(".qe-form");
    var mode = form.querySelector('[name="qe-size-mode"]:checked');
    mode = mode ? mode.value : "preset";
    var presetWrap = root.querySelector("[data-qe-preset]");
    var squaresWrap = root.querySelector("[data-qe-squares-wrap]");
    if (presetWrap) presetWrap.hidden = mode !== "preset";
    if (squaresWrap) squaresWrap.hidden = mode !== "squares";
    updatePreview(root);
  }

  function payloadFrom(form, result) {
    var now = new Date();
    return {
      _subject: "CPR Quick Estimate Lead",
      _template: "table",
      _captcha: "false",
      Name: form.querySelector('[name="qe-name"]').value.trim(),
      Phone: form.querySelector('[name="qe-phone"]').value.trim(),
      Email: form.querySelector('[name="qe-email"]').value.trim(),
      Address: form.querySelector('[name="qe-address"]').value.trim(),
      HomeSize: form.querySelector('[name="qe-home-size"]').value,
      RoofSquares: String(result.squares),
      Stories: form.querySelector('[name="qe-stories"]').value,
      Material: form.querySelector('[name="qe-material"]').value,
      BallparkLow: formatMoney(result.low),
      BallparkHigh: formatMoney(result.high),
      BallparkShown: formatMoney(result.low) + " – " + formatMoney(result.high),
      Disclaimer: "Rough estimate — final after free inspection. Not a binding quote.",
      SourcePage: location.pathname,
      Timestamp: now.toLocaleString("en-US", { timeZone: "America/New_York" }) + " ET"
    };
  }

  function onSubmit(e, root) {
    e.preventDefault();
    var form = root.querySelector(".qe-form");
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }
    var result = updatePreview(root);
    var btn = form.querySelector('[type="submit"]');
    if (btn) {
      btn.disabled = true;
      btn.dataset.label = btn.textContent;
      btn.textContent = "Sending…";
    }
    setStatus(root, "Sending your ballpark to our team…", "pending");

    var body = payloadFrom(form, result);

    fetch("https://formsubmit.co/ajax/Daniel@cprhomepros.com", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify(body)
    })
      .then(function (res) {
        if (!res.ok) throw new Error("notify failed");
        return res.json().catch(function () { return {}; });
      })
      .then(function () {
        setStatus(
          root,
          "Got it — your rough range is " +
            body.BallparkShown +
            ". We’ll follow up to schedule a free inspection. This is not a binding quote.",
          "ok"
        );
        var panel = root.querySelector("[data-qe-result]");
        if (panel) panel.classList.add("qe-result--locked");
        form.reset();
        // restore defaults for preview
        var mid = form.querySelector('[name="qe-home-size"]');
        if (mid) mid.value = "medium";
        updatePreview(root);
      })
      .catch(function () {
        setStatus(
          root,
          "We couldn’t email the lead automatically. Please call or text (704) 280-5996 — your ballpark was " +
            body.BallparkShown +
            ".",
          "err"
        );
      })
      .finally(function () {
        if (btn) {
          btn.disabled = false;
          btn.textContent = btn.dataset.label || "Get my rough estimate";
        }
      });
  }

  function init(root) {
    if (!root || root.dataset.qeReady) return;
    root.dataset.qeReady = "1";
    var form = root.querySelector(".qe-form");
    if (!form) return;

    form.addEventListener("input", function () { updatePreview(root); });
    form.addEventListener("change", function (e) {
      if (e.target && e.target.name === "qe-size-mode") toggleSizeMode(root);
      else updatePreview(root);
    });
    form.addEventListener("submit", function (e) { onSubmit(e, root); });

    toggleSizeMode(root);
    updatePreview(root);
  }

  function boot() {
    document.querySelectorAll("[data-quick-estimate]").forEach(init);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();

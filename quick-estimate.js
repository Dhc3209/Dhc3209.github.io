/**
 * CPR Instant Quote — Roofle-like multi-step ballpark for GAF products.
 * Steps: Address → Map confirm → GAF product → Roof size → Contact + range
 *
 * Pricing (GAF Timberline HDZ® architectural baseline, NC metro):
 *   - $/square: LOW $500 · HIGH $650 installed
 *   - Stories: 1 → 1.00 · 1.5 → 1.08 · 2+ → 1.18
 *   - Product: HDZ/UHDZ 1.00 · Designer 1.22 · MRS metal 1.85
 * Ranges rounded to nearest $500.
 * Notify: FormSubmit AJAX → Daniel@cprhomepros.com · subject CPR Instant Quote Lead
 * Geocode: Photon (primary) + Nominatim (fallback) — same pattern as storm-check.js
 * Map: Leaflet + OSM tiles (no API key)
 */
(function () {
  "use strict";

  var RATE_LOW = 500;
  var RATE_HIGH = 650;
  var SIZE_SQUARES = { small: 18, medium: 25, large: 33, estate: 42 };
  var STORY_MULT = { "1": 1.0, "1.5": 1.08, "2": 1.18 };
  var MAT_MULT = { hdz: 1.0, uhdz: 1.0, designer: 1.22, metal: 1.85 };
  var MAT_LABEL = {
    hdz: "GAF Timberline HDZ® architectural",
    uhdz: "GAF Timberline UHDZ®",
    designer: "GAF Designer Collection",
    metal: "MRS standing-seam metal"
  };
  var TOTAL_STEPS = 5;
  var LEAFLET_CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
  var LEAFLET_JS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
  var leafletPromise = null;

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
      if (raw > 100) raw = 100;
      return Math.round(raw);
    }
    var preset = form.querySelector('[name="qe-home-size"]').value || "medium";
    return SIZE_SQUARES[preset] || 25;
  }

  function selectedMaterial(form) {
    var el = form.querySelector('[name="qe-material"]:checked');
    return el ? el.value : "hdz";
  }

  function loadLeaflet() {
    if (window.L) return Promise.resolve(window.L);
    if (leafletPromise) return leafletPromise;
    leafletPromise = new Promise(function (resolve, reject) {
      if (!document.querySelector('link[data-qe-leaflet]')) {
        var link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = LEAFLET_CSS;
        link.setAttribute("data-qe-leaflet", "1");
        document.head.appendChild(link);
      }
      var s = document.createElement("script");
      s.src = LEAFLET_JS;
      s.async = true;
      s.setAttribute("data-qe-leaflet", "1");
      s.onload = function () {
        if (window.L) resolve(window.L);
        else reject(new Error("Leaflet missing"));
      };
      s.onerror = function () {
        reject(new Error("Leaflet failed to load"));
      };
      document.head.appendChild(s);
    });
    return leafletPromise;
  }

  async function geocodePhoton(address) {
    var url =
      "https://photon.komoot.io/api/?q=" +
      encodeURIComponent(address) +
      "&limit=5&lang=en";
    var res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error("Photon " + res.status);
    var data = await res.json();
    var features = (data && data.features) || [];
    for (var i = 0; i < features.length; i++) {
      var f = features[i];
      var props = f.properties || {};
      var cc = (props.countrycode || "").toUpperCase();
      if (cc && cc !== "US") continue;
      var coords = (f.geometry && f.geometry.coordinates) || [];
      if (coords.length < 2) continue;
      var streetBit = props.housenumber
        ? props.housenumber + " " + (props.street || "")
        : props.street;
      var parts = [
        streetBit || props.name,
        props.city || props.district || props.county,
        props.state,
        props.postcode
      ].filter(Boolean);
      return {
        lat: coords[1],
        lon: coords[0],
        label: parts.join(", ") || address,
        provider: "Photon/OSM"
      };
    }
    throw new Error("No US match");
  }

  async function geocodeNominatim(address) {
    var url =
      "https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=3&countrycodes=us&q=" +
      encodeURIComponent(address) +
      "&email=" +
      encodeURIComponent("Daniel@cprhomepros.com");
    var res = await fetch(url, {
      headers: { Accept: "application/json", "Accept-Language": "en" }
    });
    if (!res.ok) throw new Error("Nominatim " + res.status);
    var data = await res.json();
    if (!data || !data.length) throw new Error("No match");
    var hit = data[0];
    return {
      lat: parseFloat(hit.lat),
      lon: parseFloat(hit.lon),
      label: hit.display_name || address,
      provider: "Nominatim/OSM"
    };
  }

  async function geocode(address) {
    try {
      return await geocodePhoton(address);
    } catch (e1) {
      try {
        return await geocodeNominatim(address);
      } catch (e2) {
        throw new Error("Couldn't look up that address");
      }
    }
  }

  function setStatus(root, msg, kind) {
    var el = root.querySelector("[data-qe-status]");
    if (!el) return;
    el.textContent = msg || "";
    el.className = "qe-status" + (kind ? " qe-status--" + kind : "");
  }

  function updateProgress(root, step) {
    var bar = root.querySelector("[data-qe-progress]");
    if (!bar) return;
    var steps = bar.querySelectorAll("[data-qe-prog]");
    steps.forEach(function (el) {
      var n = parseInt(el.getAttribute("data-qe-prog"), 10);
      el.classList.toggle("is-active", n === step);
      el.classList.toggle("is-done", n < step);
    });
    var label = root.querySelector("[data-qe-step-label]");
    if (label) label.textContent = "Step " + step + " of " + TOTAL_STEPS;
  }

  function showStep(root, step) {
    root._qeStep = step;
    root.querySelectorAll("[data-qe-step]").forEach(function (panel) {
      var n = parseInt(panel.getAttribute("data-qe-step"), 10);
      panel.hidden = n !== step;
    });
    updateProgress(root, step);
    setStatus(root, "", "");
    if (step === 2) ensureMap(root);
    if (step === 4 || step === 5) updatePreview(root);
    var focusSel =
      step === 1
        ? '[name="qe-address"]'
        : step === 3
          ? '[name="qe-material"]:checked'
          : step === 5
            ? '[name="qe-name"]'
            : null;
    if (focusSel) {
      var focusEl = root.querySelector(focusSel);
      if (focusEl && typeof focusEl.focus === "function") {
        try {
          focusEl.focus({ preventScroll: true });
        } catch (e) {
          focusEl.focus();
        }
      }
    }
  }

  function updatePreview(root) {
    var form = root.querySelector(".qe-form");
    if (!form) return null;
    var squares = resolveSquares(form);
    var stories = form.querySelector('[name="qe-stories"]').value || "1";
    var material = selectedMaterial(form);
    var result = calc(squares, stories, material);
    var out = root.querySelector("[data-qe-range]");
    var meta = root.querySelector("[data-qe-meta]");
    if (out) {
      out.textContent = formatMoney(result.low) + " – " + formatMoney(result.high);
    }
    if (meta) {
      meta.textContent =
        "Based on ~" +
        result.squares +
        " squares · " +
        (MAT_LABEL[material] || MAT_LABEL.hdz) +
        " · Denver / Lake Norman / Charlotte metro · rough estimate only";
    }
    form.dataset.qeLow = String(result.low);
    form.dataset.qeHigh = String(result.high);
    form.dataset.qeSquares = String(result.squares);
    form.dataset.qeMaterial = material;
    return result;
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

  function ensureMap(root) {
    var geo = root._qeGeo;
    var mapEl = root.querySelector("[data-qe-map]");
    var labelEl = root.querySelector("[data-qe-geolabel]");
    if (!mapEl || !geo) return;

    if (labelEl) {
      labelEl.textContent = geo.label || root._qeAddress || "";
    }

    loadLeaflet()
      .then(function (L) {
        if (!root._qeMap) {
          root._qeMap = L.map(mapEl, {
            zoomControl: true,
            attributionControl: true,
            scrollWheelZoom: false
          });
          L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            maxZoom: 19,
            attribution:
              '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          }).addTo(root._qeMap);
          root._qeMarker = L.marker([geo.lat, geo.lon]).addTo(root._qeMap);
        } else {
          root._qeMarker.setLatLng([geo.lat, geo.lon]);
        }
        root._qeMap.setView([geo.lat, geo.lon], 17);
        setTimeout(function () {
          try {
            root._qeMap.invalidateSize();
          } catch (e) {}
        }, 80);
        setTimeout(function () {
          try {
            root._qeMap.invalidateSize();
          } catch (e) {}
        }, 320);
      })
      .catch(function () {
        setStatus(
          root,
          "Map couldn’t load — you can still continue. Address: " +
            (geo.label || ""),
          "err"
        );
      });
  }

  function payloadFrom(form, result, root) {
    var now = new Date();
    var material = selectedMaterial(form);
    var geo = root._qeGeo || {};
    return {
      _subject: "CPR Instant Quote Lead",
      _template: "table",
      _captcha: "false",
      Name: form.querySelector('[name="qe-name"]').value.trim(),
      Phone: form.querySelector('[name="qe-phone"]').value.trim(),
      Email: form.querySelector('[name="qe-email"]').value.trim(),
      Address: (root._qeAddress || form.querySelector('[name="qe-address"]').value).trim(),
      GeocodedLabel: geo.label || "",
      Latitude: geo.lat != null ? String(geo.lat) : "",
      Longitude: geo.lon != null ? String(geo.lon) : "",
      GeocodeProvider: geo.provider || "",
      HomeSize: form.querySelector('[name="qe-home-size"]').value,
      SizeMode: (form.querySelector('[name="qe-size-mode"]:checked') || {}).value || "preset",
      RoofSquares: String(result.squares),
      Stories: form.querySelector('[name="qe-stories"]').value,
      Product: MAT_LABEL[material] || material,
      ProductKey: material,
      BallparkLow: formatMoney(result.low),
      BallparkHigh: formatMoney(result.high),
      BallparkShown: formatMoney(result.low) + " – " + formatMoney(result.high),
      Disclaimer: "Rough estimate — final after free inspection. Not a binding quote.",
      SourcePage: location.pathname + location.hash,
      Timestamp: now.toLocaleString("en-US", { timeZone: "America/New_York" }) + " ET"
    };
  }

  async function goNext(root) {
    var step = root._qeStep || 1;
    var form = root.querySelector(".qe-form");

    if (step === 1) {
      var addrInput = form.querySelector('[name="qe-address"]');
      var address = (addrInput.value || "").trim();
      if (address.length < 5) {
        setStatus(root, "Enter a street address so we can find your roof.", "err");
        addrInput.focus();
        return;
      }
      var nextBtn = root.querySelector('[data-qe-step="1"] [data-qe-next]');
      if (nextBtn) {
        nextBtn.disabled = true;
        nextBtn.textContent = "Looking up…";
      }
      setStatus(root, "Looking up that address…", "pending");
      try {
        var geo = await geocode(address);
        root._qeGeo = geo;
        root._qeAddress = address;
        if (addrInput) addrInput.value = geo.label || address;
        setStatus(root, "", "");
        showStep(root, 2);
      } catch (err) {
        setStatus(
          root,
          "We couldn’t find that address. Try adding city and ZIP (e.g. Denver NC 28037).",
          "err"
        );
      } finally {
        if (nextBtn) {
          nextBtn.disabled = false;
          nextBtn.textContent = "Find my roof →";
        }
      }
      return;
    }

    if (step === 2) {
      if (!root._qeGeo) {
        setStatus(root, "Please look up an address first.", "err");
        showStep(root, 1);
        return;
      }
      showStep(root, 3);
      return;
    }

    if (step === 3) {
      if (!form.querySelector('[name="qe-material"]:checked')) {
        setStatus(root, "Pick a GAF product to continue.", "err");
        return;
      }
      showStep(root, 4);
      return;
    }

    if (step === 4) {
      updatePreview(root);
      showStep(root, 5);
      return;
    }
  }

  function goBack(root) {
    var step = root._qeStep || 1;
    if (step > 1) showStep(root, step - 1);
  }

  function onSubmit(e, root) {
    e.preventDefault();
    var form = root.querySelector(".qe-form");
    if (root._qeStep !== 5) {
      goNext(root);
      return;
    }

    var name = form.querySelector('[name="qe-name"]');
    var phone = form.querySelector('[name="qe-phone"]');
    var email = form.querySelector('[name="qe-email"]');
    if (!name.value.trim() || !phone.value.trim() || !email.value.trim()) {
      form.reportValidity();
      setStatus(root, "Name, phone, and email are required.", "err");
      return;
    }
    if (!email.checkValidity()) {
      email.reportValidity();
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

    var body = payloadFrom(form, result, root);

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
        return res.json().catch(function () {
          return {};
        });
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
        var done = root.querySelector("[data-qe-done]");
        if (done) {
          done.hidden = false;
          done.querySelector("[data-qe-done-range]").textContent = body.BallparkShown;
        }
        var fields = root.querySelector("[data-qe-contact-fields]");
        if (fields) fields.hidden = true;
        if (btn) btn.hidden = true;
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
        if (btn && !btn.hidden) {
          btn.disabled = false;
          btn.textContent = btn.dataset.label || "Get my rough estimate";
        }
      });
  }

  function init(root) {
    if (!root || root.dataset.qeReady) return;
    root.dataset.qeReady = "1";
    root._qeStep = 1;
    var form = root.querySelector(".qe-form");
    if (!form) return;

    form.addEventListener("input", function (e) {
      if (root._qeStep === 4 || root._qeStep === 5) updatePreview(root);
    });
    form.addEventListener("change", function (e) {
      if (e.target && e.target.name === "qe-size-mode") toggleSizeMode(root);
      else if (root._qeStep === 3 || root._qeStep === 4 || root._qeStep === 5) {
        updatePreview(root);
      }
    });
    form.addEventListener("submit", function (e) {
      onSubmit(e, root);
    });

    root.querySelectorAll("[data-qe-next]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        goNext(root);
      });
    });
    root.querySelectorAll("[data-qe-back]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        goBack(root);
      });
    });

    // Enter on address field advances
    var addr = form.querySelector('[name="qe-address"]');
    if (addr) {
      addr.addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
          e.preventDefault();
          goNext(root);
        }
      });
    }

    // Product card click selects radio
    root.querySelectorAll(".qe-product").forEach(function (card) {
      card.addEventListener("click", function (e) {
        if (e.target && e.target.tagName === "INPUT") return;
        var radio = card.querySelector('input[type="radio"]');
        if (radio) {
          radio.checked = true;
          updatePreview(root);
        }
      });
    });

    toggleSizeMode(root);
    showStep(root, 1);
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

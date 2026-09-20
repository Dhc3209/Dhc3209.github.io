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
  var OVERPASS_ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter"
  ];
  var ROOF_SURFACE_FACTOR = 1.25;
  var SQ_METERS_TO_SQ_FEET = 10.7639;
  var MIN_SQUARES = 10;
  var MAX_SQUARES = 100;
  var leafletPromise = null;

  function round500(n) {
    return Math.round(n / 500) * 500;
  }

  function formatMoney(n) {
    return "$" + n.toLocaleString("en-US");
  }

  function clampSquares(n) {
    return Math.max(MIN_SQUARES, Math.min(MAX_SQUARES, Math.round(n)));
  }

  function polygonAreaSqMeters(geometry) {
    if (!geometry || geometry.length < 3) return 0;
    var latSum = 0;
    geometry.forEach(function (point) {
      latSum += point.lat;
    });
    var lat0 = (latSum / geometry.length) * Math.PI / 180;
    var metersPerLat = 111320;
    var metersPerLon = 111320 * Math.cos(lat0);
    var area = 0;
    for (var i = 0; i < geometry.length; i++) {
      var current = geometry[i];
      var next = geometry[(i + 1) % geometry.length];
      var x1 = current.lon * metersPerLon;
      var y1 = current.lat * metersPerLat;
      var x2 = next.lon * metersPerLon;
      var y2 = next.lat * metersPerLat;
      area += x1 * y2 - x2 * y1;
    }
    return Math.abs(area) / 2;
  }

  function polygonCentroid(geometry) {
    var lat = 0;
    var lon = 0;
    geometry.forEach(function (point) {
      lat += point.lat;
      lon += point.lon;
    });
    return { lat: lat / geometry.length, lon: lon / geometry.length };
  }

  function pointInPolygon(point, geometry) {
    var inside = false;
    for (var i = 0, j = geometry.length - 1; i < geometry.length; j = i++) {
      var xi = geometry[i].lon;
      var yi = geometry[i].lat;
      var xj = geometry[j].lon;
      var yj = geometry[j].lat;
      var crosses = yi > point.lat !== yj > point.lat;
      if (crosses && point.lon < ((xj - xi) * (point.lat - yi)) / (yj - yi) + xi) {
        inside = !inside;
      }
    }
    return inside;
  }

  function buildingEstimateFromData(data, geo) {
    var buildings = ((data && data.elements) || [])
      .filter(function (element) {
        return element.type === "way" && element.tags && element.tags.building && element.geometry;
      })
      .map(function (element) {
        var geometry = element.geometry.map(function (point) {
          return { lat: parseFloat(point.lat), lon: parseFloat(point.lon) };
        });
        var area = polygonAreaSqMeters(geometry);
        return {
          geometry: geometry,
          area: area,
          center: polygonCentroid(geometry),
          contains: pointInPolygon(geo, geometry)
        };
      })
      .filter(function (building) {
        return building.area > 20;
      });
    if (!buildings.length) throw new Error("No nearby building footprint");

    var containing = buildings.filter(function (building) {
      return building.contains;
    });
    var candidates = containing.length ? containing : buildings;
    candidates.sort(function (a, b) {
      if (containing.length) return b.area - a.area;
      var aDistance = Math.pow(a.center.lat - geo.lat, 2) + Math.pow(a.center.lon - geo.lon, 2);
      var bDistance = Math.pow(b.center.lat - geo.lat, 2) + Math.pow(b.center.lon - geo.lon, 2);
      return aDistance - bDistance;
    });
    var selected = candidates[0];
    var footprintSqFt = selected.area * SQ_METERS_TO_SQ_FEET;
    var roofSqFt = footprintSqFt * ROOF_SURFACE_FACTOR;
    var squares = clampSquares(roofSqFt / 100);
    return {
      squares: squares,
      footprintSqFt: Math.round(footprintSqFt),
      roofSqFt: Math.round(roofSqFt),
      source: "OSM Overpass building footprint",
      note: "Estimated ~" + squares + " roof squares from the nearby OSM building footprint (includes pitch/waste); adjust if needed."
    };
  }

  async function requestOverpass(endpoint, query) {
    var controller = window.AbortController ? new AbortController() : null;
    var timeout = setTimeout(function () {
      if (controller) controller.abort();
    }, 9000);
    var options = { headers: { Accept: "application/json" } };
    if (controller) options.signal = controller.signal;
    try {
      var res = await fetch(endpoint + "?data=" + encodeURIComponent(query), options);
      if (!res.ok) throw new Error("Overpass " + res.status);
      return await res.json();
    } finally {
      clearTimeout(timeout);
    }
  }

  async function estimateBuildingSquares(geo) {
    if (!geo || !isFinite(geo.lat) || !isFinite(geo.lon)) throw new Error("Missing coordinates");
    var query =
      "[out:json][timeout:10];way[\"building\"](around:75," +
      geo.lat +
      "," +
      geo.lon +
      ");out tags geom;";
    var lastError = null;
    for (var i = 0; i < OVERPASS_ENDPOINTS.length; i++) {
      try {
        var data = await requestOverpass(OVERPASS_ENDPOINTS[i], query);
        return buildingEstimateFromData(data, geo);
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError || new Error("Building footprint unavailable");
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

  function applyBuildingEstimate(root, estimate) {
    var form = root.querySelector(".qe-form");
    var note = root.querySelector("[data-qe-building-note]");
    root._qeBuildingEstimate = estimate || null;
    if (estimate) {
      if (note) note.textContent = estimate.note;
      var mode = form.querySelector('[name="qe-size-mode"][value="squares"]');
      var squares = form.querySelector('[name="qe-squares"]');
      if (mode) mode.checked = true;
      if (squares) squares.value = String(estimate.squares);
      toggleSizeMode(root);
    } else {
      if (note) note.textContent = "We couldn’t estimate the footprint from map data. Choose a home-size preset or enter 10–100 squares.";
      var preset = form.querySelector('[name="qe-size-mode"][value="preset"]');
      if (preset) preset.checked = true;
      toggleSizeMode(root);
    }
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
    var unlocked = root._qeContactUnlocked === true;
    if (out) {
      out.textContent = unlocked
        ? formatMoney(result.low) + " – " + formatMoney(result.high)
        : "Complete the contact form to unlock your range";
    }
    if (meta) {
      meta.textContent =
        (unlocked ? "Based on ~" : "Your range will be based on ~") +
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
      RoofSquareSource: root._qeBuildingEstimate ? root._qeBuildingEstimate.source : "Home size preset",
      BuildingFootprintSqFt: root._qeBuildingEstimate ? String(root._qeBuildingEstimate.footprintSqFt) : "",
      EstimatedRoofAreaSqFt: root._qeBuildingEstimate ? String(root._qeBuildingEstimate.roofSqFt) : "",
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
        root._qeEstimatePromise = estimateBuildingSquares(geo)
          .then(function (estimate) {
            applyBuildingEstimate(root, estimate);
            return estimate;
          })
          .catch(function () {
            applyBuildingEstimate(root, null);
            return null;
          });
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
      var estimateBtn = root.querySelector('[data-qe-step="2"] [data-qe-next]');
      if (root._qeEstimatePromise) {
        if (estimateBtn) {
          estimateBtn.disabled = true;
          estimateBtn.dataset.label = estimateBtn.textContent;
          estimateBtn.textContent = "Estimating roof size…";
        }
        setStatus(root, "Estimating roof squares from the nearby building footprint…", "pending");
        await root._qeEstimatePromise;
        if (estimateBtn) {
          estimateBtn.disabled = false;
          estimateBtn.textContent = estimateBtn.dataset.label || "Looks right →";
        }
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

    root._qeContactUnlocked = true;
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

/**
 * CPR Storm Activity Checker (client-side, GitHub Pages safe)
 * Sources: IEM LSR (Iowa Mesonet), SPC storm reports, NWS api.weather.gov alerts
 * Filters: all hail last 1095 days; wind only ≥60 mph (or LSR TSTM wind damage);
 *          SPC today/yesterday; NWS alerts ~14 days. Service-area label for LN hub.
 * Area view: on page load (no address) shows hail/wind/tornado LSRs + SPC for the
 *          last 90 days within 35 mi of Denver NC / Lake Norman.
 * Geocode: Photon (primary) + Nominatim (fallback). Addresses stay in the browser.
 */
(function () {
  "use strict";

  var TZ = "America/New_York";
  /** Hail + qualifying wind/tornado history window (3 years). */
  var HAIL_LOOKBACK_DAYS = 1095;
  /** NWS alerts + flood noise stay short-window. */
  var ALERT_LOOKBACK_DAYS = 14;
  var FLOOD_LOOKBACK_DAYS = 30;
  /** Measured / estimated wind gust threshold (mph). */
  var WIND_MIN_MPH = 60;
  var DEFAULT_RADIUS = 25;
  var MAX_RESULTS = 150;
  var LEAFLET_CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
  var LEAFLET_JS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
  var leafletPromise = null;
  /** Area-wide view shown on page load (no address needed). */
  var AREA_CENTER = { lat: 35.53, lon: -80.95, label: "Denver NC / Lake Norman / north Charlotte" };
  /** 45 mi reaches the SC side too (Rock Hill / Fort Mill, York & north Lancaster Co.). */
  var AREA_RADIUS_MILES = 45;
  var AREA_LOOKBACK_DAYS = 90;
  var AREA_LIST_INITIAL = 10;
  /** Lake Norman / Denver NC hub for service-area labeling (~50 mi). */
  var SERVICE_HUB = { lat: 35.5318, lon: -81.0298, label: "Lake Norman / Denver NC" };
  var SERVICE_HUB_MILES = 50;
  var SERVICE_COUNTIES = [
    "Lincoln",
    "Gaston",
    "Mecklenburg",
    "Catawba",
    "Iredell",
    "Cleveland"
  ];
  var SEVERE_TYPES = {
    H: "hail",
    A: "hail",
    D: "wind",
    G: "wind",
    W: "wind",
    O: "wind",
    T: "tornado",
    C: "tornado",
    F: "flood",
    R: "flood"
  };

  function $(sel, root) {
    return (root || document).querySelector(sel);
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function haversineMiles(lat1, lon1, lat2, lon2) {
    var R = 3958.8;
    var toRad = Math.PI / 180;
    var dLat = (lat2 - lat1) * toRad;
    var dLon = (lon2 - lon1) * toRad;
    var a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function bboxFor(lat, lon, miles) {
    var latDeg = miles / 69.0;
    var lonDeg = miles / (Math.cos((lat * Math.PI) / 180) * 69.172);
    return {
      south: lat - latDeg,
      north: lat + latDeg,
      west: lon - lonDeg,
      east: lon + lonDeg
    };
  }

  function formatEt(isoOrDate) {
    var d = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate);
    if (isNaN(d.getTime())) return "Time unknown";
    return d.toLocaleString("en-US", {
      timeZone: TZ,
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short"
    });
  }


  function daysBetween(a, b) {
    return Math.abs((a.getTime() - b.getTime()) / 86400000);
  }

  function withinLookback(when, days) {
    if (!(when instanceof Date) || isNaN(when.getTime())) return false;
    return daysBetween(when, new Date()) <= days + 0.5;
  }

  function parseWindMph(mag) {
    if (mag == null) return null;
    var s = String(mag).trim();
    if (!s || /^none$/i.test(s) || s === "") return null;
    // LSR wind is mph; tolerate "60 mph" / "60KT"
    var m = s.match(/([0-9]+(?:\.[0-9]+)?)/);
    if (!m) return null;
    var n = parseFloat(m[1]);
    if (isNaN(n)) return null;
    if (/\bkt|knot/i.test(s)) n = n * 1.15078;
    return n;
  }

  function windPassesThreshold(report) {
    var mph = report.magMph != null ? report.magMph : parseWindMph(report._magRaw);
    if (mph != null) return mph >= WIND_MIN_MPH;
    // Equivalent severe: NWS LSR thunderstorm wind *damage* (TYPECODE D) without a gust
    // is logged when criteria are met (~58+ mph). Include those; exclude unmetered gust-only.
    if (report._typecode === "D") return true;
    return false;
  }

  function reportPassesFilters(r) {
    if (!r || !r.kind) return false;
    if (r.kind === "hail") return withinLookback(r.when, HAIL_LOOKBACK_DAYS);
    if (r.kind === "wind") {
      if (!withinLookback(r.when, HAIL_LOOKBACK_DAYS)) return false;
      return windPassesThreshold(r);
    }
    if (r.kind === "tornado") return withinLookback(r.when, HAIL_LOOKBACK_DAYS);
    if (r.kind === "flood") return withinLookback(r.when, FLOOD_LOOKBACK_DAYS);
    if (r.kind === "alert") return withinLookback(r.when, ALERT_LOOKBACK_DAYS);
    return false;
  }

  function serviceAreaInfo(geo) {
    var county = String(geo.county || "")
      .replace(/\s+County$/i, "")
      .trim();
    var state = String(geo.state || "").trim().toUpperCase();
    var stateOk = !state || state === "NC" || state === "NORTH CAROLINA";
    var i;
    if (stateOk && county) {
      for (i = 0; i < SERVICE_COUNTIES.length; i++) {
        if (county.toLowerCase() === SERVICE_COUNTIES[i].toLowerCase()) {
          return {
            inArea: true,
            label: SERVICE_COUNTIES[i] + " County, NC (primary service area)"
          };
        }
      }
    }
    var d = haversineMiles(geo.lat, geo.lon, SERVICE_HUB.lat, SERVICE_HUB.lon);
    if (d <= SERVICE_HUB_MILES) {
      return {
        inArea: true,
        label:
          Math.round(d) +
          " mi of " +
          SERVICE_HUB.label +
          " (within ~" +
          SERVICE_HUB_MILES +
          " mi hub)"
      };
    }
    return {
      inArea: false,
      label:
        "Outside primary Lake Norman counties / ~" +
        SERVICE_HUB_MILES +
        " mi hub — still searching near your pin"
    };
  }

  function lookbackCopy() {
    return (
      "Hail: last " +
      HAIL_LOOKBACK_DAYS +
      " days (~3 years) · Wind: ≥" +
      WIND_MIN_MPH +
      " mph (or TSTM wind damage) · SPC: today/yesterday · NWS alerts: ~" +
      ALERT_LOOKBACK_DAYS +
      " days"
    );
  }


  function loadLeaflet() {
    if (window.L) return Promise.resolve(window.L);
    if (leafletPromise) return leafletPromise;
    leafletPromise = new Promise(function (resolve, reject) {
      if (!document.querySelector("link[data-sc-leaflet]")) {
        var link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = LEAFLET_CSS;
        link.setAttribute("data-sc-leaflet", "1");
        document.head.appendChild(link);
      }
      var s = document.createElement("script");
      s.src = LEAFLET_JS;
      s.async = true;
      s.setAttribute("data-sc-leaflet", "1");
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

  function hailInches(r) {
    if (!r) return 0;
    var raw = r.magLabel || r._magRaw || "";
    var m = String(raw).match(/([0-9]+(?:\.[0-9]+)?)/);
    return m ? parseFloat(m[1]) : 0;
  }

  function formatDateOnly(isoOrDate) {
    var d = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleString("en-US", {
      timeZone: TZ,
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric"
    });
  }

  /** Pick standout hail (largest, then closest) and strongest wind ≥60. */
  function pickSignificant(list) {
    var hail = null;
    var wind = null;
    list.forEach(function (r) {
      if (r.kind === "hail") {
        if (!hail) {
          hail = r;
          return;
        }
        var hi = hailInches(r);
        var hiH = hailInches(hail);
        if (hi > hiH) hail = r;
        else if (hi === hiH && (r.distance || 99) < (hail.distance || 99)) hail = r;
        else if (
          hi === hiH &&
          (r.distance || 99) === (hail.distance || 99) &&
          (r.when && hail.when && r.when.getTime() > hail.when.getTime())
        ) {
          hail = r;
        }
      }
      if (r.kind === "wind") {
        var mph = r.magMph != null ? r.magMph : parseWindMph(r._magRaw);
        var cur = wind && (wind.magMph != null ? wind.magMph : parseWindMph(wind._magRaw));
        if (mph == null && r._typecode === "D") mph = WIND_MIN_MPH; // damage LSR floor
        if (mph == null) return;
        if (!wind || mph > (cur || 0)) wind = r;
        else if (mph === cur && (r.distance || 99) < (wind.distance || 99)) wind = r;
      }
    });
    return { hail: hail, wind: wind };
  }

  function countKinds(list) {
    var c = { hail: 0, wind: 0, tornado: 0 };
    list.forEach(function (r) {
      if (r.kind === "hail") c.hail++;
      else if (r.kind === "wind") c.wind++;
      else if (r.kind === "tornado") c.tornado++;
    });
    return c;
  }

  function markerColor(kind) {
    if (kind === "hail") return "#B71C2C";
    if (kind === "wind") return "#3D7AB5";
    if (kind === "tornado") return "#7B4FB0";
    if (kind === "flood") return "#2A8F7A";
    return "#B8975F";
  }

  function destroyReportMap(root) {
    if (root._scMap) {
      try {
        root._scMap.remove();
      } catch (e) {}
      root._scMap = null;
      root._scMarkers = null;
      root._scHomeMarker = null;
    }
  }

  function initReportMap(root, mapEl, geo, list, radiusMiles, opts) {
    opts = opts || {};
    destroyReportMap(root);
    if (!mapEl || !geo) return;
    loadLeaflet()
      .then(function (L) {
        var map = L.map(mapEl, {
          zoomControl: true,
          attributionControl: true,
          scrollWheelZoom: false,
          dragging: true
        });
        L.tileLayer(
          "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
          {
            maxZoom: 19,
            attribution:
              'Tiles &copy; <a href="https://www.esri.com/">Esri</a> — Maxar, Earthstar Geographics'
          }
        ).addTo(map);
        L.tileLayer(
          "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
          { maxZoom: 19, opacity: 0.85, attribution: "" }
        ).addTo(map);

        if (!opts.noHome) {
          var home = L.circleMarker([geo.lat, geo.lon], {
            radius: 9,
            color: "#B8975F",
            weight: 2,
            fillColor: "#E8D4B0",
            fillOpacity: 0.95
          })
            .addTo(map)
            .bindPopup("<strong>Your address</strong><br>" + escapeHtml(geo.label));
          root._scHomeMarker = home;
        }

        // Search radius ring
        var ring = L.circle([geo.lat, geo.lon], {
          radius: radiusMiles * 1609.34,
          color: "#B8975F",
          weight: opts.noHome ? 1.5 : 1,
          opacity: 0.55,
          dashArray: opts.noHome ? "6 6" : null,
          fillColor: "#B8975F",
          fillOpacity: opts.noHome ? 0.04 : 0.06,
          interactive: false
        }).addTo(map);

        var markers = {};
        var bounds = L.latLngBounds([geo.lat, geo.lon]);
        list.forEach(function (r, idx) {
          if (r.lat == null || r.lon == null || r.kind === "alert") return;
          var color = markerColor(r.kind);
          var m = L.circleMarker([r.lat, r.lon], {
            radius: r.kind === "tornado" ? 8 : 6,
            color: "#1a1a1a",
            weight: 1,
            fillColor: color,
            fillOpacity: 0.9
          }).addTo(map);
          var popup =
            "<strong>" +
            escapeHtml(badgeLabel(r.kind)) +
            "</strong>" +
            (r.magLabel ? " · " + escapeHtml(r.magLabel) : "") +
            "<br>" +
            escapeHtml(formatEtShort(r.when)) +
            "<br>" +
            (opts.noHome
              ? escapeHtml(r.city || "Location on map")
              : escapeHtml(formatDist(r.distance)) +
                (r.city ? " · " + escapeHtml(r.city) : ""));
          m.bindPopup(popup);
          var key = r.id || "r-" + idx;
          markers[key] = m;
          bounds.extend([r.lat, r.lon]);
        });
        root._scMap = map;
        root._scMarkers = markers;
        try {
          if (opts.noHome) map.fitBounds(ring.getBounds(), { padding: [6, 6] });
          else map.fitBounds(bounds.pad(0.2), { maxZoom: 12 });
        } catch (e) {
          map.setView([geo.lat, geo.lon], 10);
        }
        setTimeout(function () {
          map.invalidateSize();
        }, 80);
      })
      .catch(function () {
        mapEl.innerHTML =
          '<p class="sc-map-fallback">Map unavailable — the report list below still shows public reports.</p>';
      });
  }

  function wireReportMapFocus(root, resultsEl) {
    if (!resultsEl) return;
    resultsEl.addEventListener("click", function (ev) {
      var hit = ev.target && ev.target.closest ? ev.target.closest("[data-report-id]") : null;
      if (!hit || !root._scMarkers) return;
      var id = hit.getAttribute("data-report-id");
      var m = root._scMarkers[id];
      if (!m || !root._scMap) return;
      root._scMap.setView(m.getLatLng(), Math.max(root._scMap.getZoom(), 12), { animate: true });
      m.openPopup();
      var focusEl = hit.closest("tr[data-report-id]") || hit;
      var prev = resultsEl.querySelectorAll(".is-focused");
      for (var i = 0; i < prev.length; i++) prev[i].classList.remove("is-focused");
      focusEl.classList.add("is-focused");
    });
  }

  function renderSignificantStrip(sig) {
    var parts = [];
    if (sig.hail) {
      parts.push(
        '<div class="ewr-sig ewr-sig--hail">' +
          '<span class="ewr-sig-label">Significant hail</span>' +
          '<span class="ewr-sig-date">' +
          escapeHtml(formatDateOnly(sig.hail.when)) +
          "</span>" +
          '<span class="ewr-sig-detail">' +
          escapeHtml(sig.hail.magLabel || "Hail") +
          " · " +
          escapeHtml(formatDist(sig.hail.distance)) +
          "</span></div>"
      );
    }
    if (sig.wind) {
      var wLabel =
        sig.wind.magLabel ||
        (sig.wind.magMph != null ? Math.round(sig.wind.magMph) + " mph" : "Wind ≥60 mph / damage");
      parts.push(
        '<div class="ewr-sig ewr-sig--wind">' +
          '<span class="ewr-sig-label">Strongest wind (≥60 mph)</span>' +
          '<span class="ewr-sig-date">' +
          escapeHtml(formatDateOnly(sig.wind.when)) +
          "</span>" +
          '<span class="ewr-sig-detail">' +
          escapeHtml(wLabel) +
          " · " +
          escapeHtml(formatDist(sig.wind.distance)) +
          "</span></div>"
      );
    }
    if (!parts.length) {
      return (
        '<div class="ewr-sig-strip ewr-sig-strip--empty">' +
        "<p>No standout hail or ≥60 mph wind LSRs in this radius for the ~3-year window — nearby weaker or unreported events may still exist.</p>" +
        "</div>"
      );
    }
    return '<div class="ewr-sig-strip" role="region" aria-label="Significant storm dates">' + parts.join("") + "</div>";
  }

  function renderCountTiles(counts) {
    return (
      '<div class="ewr-tiles" role="group" aria-label="Three-year nearby report counts">' +
      '<div class="ewr-tile ewr-tile--hail"><span class="ewr-tile-num">' +
      counts.hail +
      '</span><span class="ewr-tile-label">Hail reports</span><span class="ewr-tile-sub">~3 years · public LSRs</span></div>' +
      '<div class="ewr-tile ewr-tile--wind"><span class="ewr-tile-num">' +
      counts.wind +
      '</span><span class="ewr-tile-label">Wind ≥60 mph / damage</span><span class="ewr-tile-sub">~3 years · public LSRs</span></div>' +
      '<div class="ewr-tile ewr-tile--tornado"><span class="ewr-tile-num">' +
      counts.tornado +
      '</span><span class="ewr-tile-label">Tornado reports</span><span class="ewr-tile-sub">~3 years · public LSRs</span></div>' +
      "</div>" +
      '<p class="ewr-tiles-note">Counts are public Local Storm Reports near this address — not proof the roof was hit. Always verify with a professional inspection.</p>'
    );
  }

  function renderReportHeader(geo, radius, area) {
    return (
      '<header class="ewr-header">' +
      '<div class="ewr-brand">' +
      '<span class="ewr-brand-mark">CPR</span>' +
      '<div class="ewr-brand-text">' +
      '<p class="ewr-eyebrow">Campbells Precision Roofing</p>' +
      "<h3 class=\"ewr-title\">Extreme Weather Report</h3>" +
      "</div></div>" +
      '<div class="ewr-address">' +
      '<p class="ewr-address-label">Resolved address</p>' +
      '<p class="ewr-address-value">' +
      escapeHtml(geo.label) +
      "</p>" +
      '<p class="ewr-address-meta">' +
      '<span><strong>Radius:</strong> ' +
      escapeHtml(String(radius)) +
      " miles</span>" +
      '<span><strong>Service area:</strong> ' +
      escapeHtml(area.label) +
      "</span></p>" +
      "</div></header>"
    );
  }

  function renderResultsCta() {
    return (
      '<div class="storm-check-results-cta" role="region" aria-label="Storm damage help">' +
      "<h3>Storm hit your roof? We’ll document it for the claim.</h3>" +
      "<p>Free inspection for hail and high-wind damage across Denver and Lake Norman. GAF Master Elite — we speak adjuster.</p>" +
      '<p class="storm-check-results-cta-actions">' +
      '<a class="btn btn-white js-storm-inspect-open" href="#">Get a free storm inspection</a> ' +
      '<a class="btn btn-outline btn-on-dark" href="tel:+17042805996">Call (704) 280-5996</a>' +
      "</p>" +
      '<p class="storm-check-results-cta-alt">See damage near you? Call <a href="tel:+17042805996">(704) 280-5996</a> or <a class="js-storm-inspect-open" href="#">request a free claim inspection</a>.</p>' +
      "</div>"
    );
  }


  function isoDaysAgo(days) {
    var d = new Date(Date.now() - days * 86400000);
    return d.toISOString().replace(/\.\d{3}Z$/, "Z");
  }

  function pad2(n) {
    return n < 10 ? "0" + n : String(n);
  }

  function ymdUtc(d) {
    return d.getUTCFullYear() + "-" + pad2(d.getUTCMonth() + 1) + "-" + pad2(d.getUTCDate());
  }

  function classifyFromText(text) {
    var t = (text || "").toUpperCase();
    if (/HAIL/.test(t)) return "hail";
    if (/TORNADO|FUNNEL/.test(t)) return "tornado";
    if (/FLOOD|FLASH FLOOD/.test(t)) return "flood";
    if (/WIND|TSTM|THUNDERSTORM|GUST/.test(t)) return "wind";
    if (/SEVERE|WARNING|WATCH|ADVISORY/.test(t)) return "alert";
    return "other";
  }

  function badgeLabel(kind) {
    if (kind === "hail") return "Hail";
    if (kind === "wind") return "Wind";
    if (kind === "tornado") return "Tornado";
    if (kind === "flood") return "Flood";
    if (kind === "alert") return "NWS alert";
    return "Report";
  }

  function parseCsv(text) {
    var rows = [];
    var i = 0;
    var field = "";
    var row = [];
    var inQuotes = false;
    text = text.replace(/^\uFEFF/, "");
    while (i < text.length) {
      var c = text.charAt(i);
      if (inQuotes) {
        if (c === '"') {
          if (text.charAt(i + 1) === '"') {
            field += '"';
            i += 2;
            continue;
          }
          inQuotes = false;
          i++;
          continue;
        }
        field += c;
        i++;
        continue;
      }
      if (c === '"') {
        inQuotes = true;
        i++;
        continue;
      }
      if (c === ",") {
        row.push(field);
        field = "";
        i++;
        continue;
      }
      if (c === "\n" || c === "\r") {
        if (c === "\r" && text.charAt(i + 1) === "\n") i++;
        row.push(field);
        if (row.length > 1 || (row[0] && row[0].trim())) rows.push(row);
        row = [];
        field = "";
        i++;
        continue;
      }
      field += c;
      i++;
    }
    if (field.length || row.length) {
      row.push(field);
      rows.push(row);
    }
    if (!rows.length) return [];
    var headers = rows[0].map(function (h) {
      return String(h || "").trim();
    });
    return rows.slice(1).map(function (r) {
      var obj = {};
      for (var j = 0; j < headers.length; j++) obj[headers[j]] = r[j] != null ? r[j] : "";
      return obj;
    });
  }

  function settle(promise) {
    return promise.then(
      function (v) {
        return { ok: true, value: v };
      },
      function (e) {
        return { ok: false, error: e };
      }
    );
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
      var parts = [
        props.name,
        props.housenumber ? props.housenumber + " " + (props.street || "") : props.street,
        props.city || props.district || props.county,
        props.state,
        props.postcode
      ].filter(Boolean);
      return {
        lat: coords[1],
        lon: coords[0],
        label: parts.join(", ") || address,
        provider: "Photon/OSM",
        county: props.county || props.district || "",
        state: props.state || "",
        city: props.city || props.name || ""
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
      headers: {
        Accept: "application/json",
        "Accept-Language": "en"
      }
    });
    if (!res.ok) throw new Error("Nominatim " + res.status);
    var data = await res.json();
    if (!data || !data.length) throw new Error("No match");
    var hit = data[0];
    var addr = hit.address || {};
    return {
      lat: parseFloat(hit.lat),
      lon: parseFloat(hit.lon),
      label: hit.display_name || address,
      provider: "Nominatim/OSM",
      county: addr.county || "",
      state: addr.state || "",
      city: addr.city || addr.town || addr.village || ""
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

  function yearChunksUtc(lookbackDays) {
    var endMs = Date.now();
    var startMs = endMs - lookbackDays * 86400000;
    var chunks = [];
    var cursor = startMs;
    while (cursor < endMs) {
      var cStart = new Date(cursor);
      var yearEnd = Date.UTC(cStart.getUTCFullYear() + 1, 0, 1);
      var cEndMs = Math.min(yearEnd, endMs);
      // Avoid zero-length; nudge end if same
      if (cEndMs <= cursor) cEndMs = Math.min(cursor + 86400000 * 180, endMs);
      chunks.push({
        sts: new Date(cursor).toISOString().replace(/\.\d{3}Z$/, "Z"),
        ets: new Date(cEndMs).toISOString().replace(/\.\d{3}Z$/, "Z")
      });
      cursor = cEndMs;
    }
    return chunks;
  }

  function parseIemLsrCsv(text, lat, lon, radiusMiles) {
    var rows = parseCsv(text);
    var out = [];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var rlat = parseFloat(r.LAT);
      var rlon = parseFloat(r.LON);
      if (isNaN(rlat) || isNaN(rlon)) continue;
      var dist = haversineMiles(lat, lon, rlat, rlon);
      if (dist > radiusMiles) continue;
      var code = String(r.TYPECODE || "").trim().toUpperCase();
      var typetext = String(r.TYPETEXT || "").trim();
      var kind = SEVERE_TYPES[code] || classifyFromText(typetext);
      if (kind === "other") continue;
      if (/SNOW|FREEZING RAIN|ICE|FOG|DENSE|SMOKE|HEAT|COLD/i.test(typetext)) continue;

      var mag = r.MAG && r.MAG !== "None" ? String(r.MAG).trim() : "";
      var magMph = kind === "wind" ? parseWindMph(mag) : null;
      var magLabel = "";
      if (kind === "hail" && mag) magLabel = mag + '" hail';
      else if (kind === "wind" && magMph != null) magLabel = Math.round(magMph) + " mph gust";
      else if (kind === "wind" && code === "D") magLabel = "Wind damage";
      else if (kind === "wind" && mag) magLabel = mag + " mph gust";
      else if (mag) magLabel = mag;

      var when = r.VALID2
        ? new Date(String(r.VALID2).replace(" ", "T") + "Z")
        : new Date();
      if (r.VALID && /^\d{12}$/.test(r.VALID)) {
        var v = r.VALID;
        when = new Date(
          Date.UTC(
            +v.slice(0, 4),
            +v.slice(4, 6) - 1,
            +v.slice(6, 8),
            +v.slice(8, 10),
            +v.slice(10, 12)
          )
        );
      }

      out.push({
        id: "iem-" + (r.VALID || "") + "-" + rlat + "-" + rlon + "-" + code,
        kind: kind,
        title: typetext || badgeLabel(kind),
        magLabel: magLabel,
        magMph: magMph,
        _magRaw: mag,
        _typecode: code,
        when: when,
        city: [r.CITY, r.COUNTY, r.STATE].filter(Boolean).join(", "),
        remark: (r.REMARK || "").trim(),
        distance: dist,
        lat: rlat,
        lon: rlon,
        source: "IEM / NWS LSR"
      });
    }
    return out;
  }

  async function fetchIemLsrChunk(box, sts, ets) {
    var url =
      "https://mesonet.agron.iastate.edu/cgi-bin/request/gis/lsr.py?" +
      "west=" +
      box.west.toFixed(4) +
      "&east=" +
      box.east.toFixed(4) +
      "&south=" +
      box.south.toFixed(4) +
      "&north=" +
      box.north.toFixed(4) +
      "&sts=" +
      encodeURIComponent(sts) +
      "&ets=" +
      encodeURIComponent(ets) +
      "&fmt=csv";
    var res = await fetch(url);
    if (!res.ok) throw new Error("IEM LSR " + res.status);
    return await res.text();
  }

  /**
   * IEM LSR for ~3 years near the pin. Batched by calendar year so one slow
   * window does not fail the whole history pull; optional onProgress for UI.
   */
  async function fetchIemLsr(lat, lon, radiusMiles, onProgress, lookbackDays) {
    var box = bboxFor(lat, lon, Math.max(radiusMiles, 5) + 2);
    var chunks = yearChunksUtc(lookbackDays || HAIL_LOOKBACK_DAYS);
    var out = [];
    for (var i = 0; i < chunks.length; i++) {
      if (typeof onProgress === "function") {
        onProgress(
          "Loading IEM local storm reports " +
            (i + 1) +
            "/" +
            chunks.length +
            " (up to ~3 years of hail / severe wind)…"
        );
      }
      var text = await fetchIemLsrChunk(box, chunks[i].sts, chunks[i].ets);
      out = out.concat(parseIemLsrCsv(text, lat, lon, radiusMiles));
    }
    return out.filter(reportPassesFilters);
  }

  function parseSpcTimeToday(hhmm) {
    var now = new Date();
    var h = parseInt(String(hhmm).slice(0, 2), 10);
    var m = parseInt(String(hhmm).slice(2, 4) || "0", 10);
    if (isNaN(h)) return now;
    // SPC times are UTC for the report day
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), h, m || 0));
  }

  function parseSpcTimeYesterday(hhmm) {
    var now = new Date(Date.now() - 86400000);
    var h = parseInt(String(hhmm).slice(0, 2), 10);
    var m = parseInt(String(hhmm).slice(2, 4) || "0", 10);
    if (isNaN(h)) return now;
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), h, m || 0));
  }

  async function fetchSpcFile(path, kind, day) {
    var url = "https://www.spc.noaa.gov/climo/reports/" + path;
    var res = await fetch(url);
    if (!res.ok) throw new Error("SPC " + path + " " + res.status);
    var text = await res.text();
    if (!text || /No reports/i.test(text)) return [];
    var rows = parseCsv(text);
    var out = [];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var rlat = parseFloat(r.Lat);
      var rlon = parseFloat(r.Lon);
      if (isNaN(rlat) || isNaN(rlon)) continue;
      var size = r.Size != null && r.Size !== "" ? String(r.Size) : "";
      var magLabel = "";
      if (kind === "hail" && size) {
        var inches = (parseFloat(size) / 100).toFixed(2).replace(/\.?0+$/, "");
        if (inches === "") inches = String(parseFloat(size) / 100);
        magLabel = inches + '" hail';
      } else if (kind === "wind" && size) {
        magLabel = size + " mph";
      } else if (kind === "tornado" && size) {
        magLabel = "EF/F " + size;
      }
      var when =
        day === "yesterday"
          ? parseSpcTimeYesterday(r.Time)
          : parseSpcTimeToday(r.Time);
      var magMph = kind === "wind" ? parseWindMph(size) : null;
      out.push({
        id: "spc-" + day + "-" + kind + "-" + r.Time + "-" + rlat + "-" + rlon,
        kind: kind,
        title:
          kind === "hail"
            ? "Hail report"
            : kind === "wind"
            ? "Wind report"
            : "Tornado report",
        magLabel: magLabel,
        magMph: magMph,
        _magRaw: size,
        _typecode: kind === "wind" ? "G" : "",
        when: when,
        city: [r.Location, r.County, r.State].filter(Boolean).join(", "),
        remark: (r.Comments || "").trim(),
        distance: null, // filled later
        lat: rlat,
        lon: rlon,
        source: "SPC " + day,
        _raw: r
      });
    }
    return out;
  }

  async function fetchSpcNear(lat, lon, radiusMiles) {
    var files = [
      ["today_hail.csv", "hail", "today"],
      ["today_wind.csv", "wind", "today"],
      ["today_torn.csv", "tornado", "today"],
      ["yesterday_hail.csv", "hail", "yesterday"],
      ["yesterday_wind.csv", "wind", "yesterday"],
      ["yesterday_torn.csv", "tornado", "yesterday"]
    ];
    var settled = await Promise.all(
      files.map(function (f) {
        return settle(fetchSpcFile(f[0], f[1], f[2]));
      })
    );
    var out = [];
    settled.forEach(function (s) {
      if (s.ok) out = out.concat(s.value);
    });
    return out
      .map(function (r) {
        r.distance = haversineMiles(lat, lon, r.lat, r.lon);
        return r;
      })
      .filter(function (r) {
        return r.distance <= radiusMiles && reportPassesFilters(r);
      });
  }

  async function fetchNwsAlerts(lat, lon) {
    var headers = { Accept: "application/geo+json" };
    var start = isoDaysAgo(ALERT_LOOKBACK_DAYS);
    var urls = [
      "https://api.weather.gov/alerts/active?point=" + lat + "," + lon,
      "https://api.weather.gov/alerts?point=" +
        lat +
        "," +
        lon +
        "&status=actual&message_type=alert&limit=50&start=" +
        encodeURIComponent(start)
    ];
    var settled = await Promise.all(
      urls.map(function (u) {
        return settle(
          fetch(u, { headers: headers }).then(function (res) {
            if (!res.ok) throw new Error("NWS " + res.status);
            return res.json();
          })
        );
      })
    );
    var features = [];
    var seen = {};
    settled.forEach(function (s) {
      if (!s.ok || !s.value || !s.value.features) return;
      s.value.features.forEach(function (f) {
        var id = (f.id || (f.properties && f.properties.id) || "") + "";
        if (seen[id]) return;
        seen[id] = true;
        features.push(f);
      });
    });

    var out = [];
    for (var i = 0; i < features.length; i++) {
      var f = features[i];
      var p = f.properties || {};
      var event = p.event || "Weather alert";
      var kind = classifyFromText(event);
      if (kind === "other") kind = "alert";
      // Focus on severe / flood / tornado / thunderstorm
      if (
        !/Severe|Thunderstorm|Tornado|Hail|Wind|Flood|Hurricane|Tropical/i.test(
          event
        )
      ) {
        continue;
      }
      var when = new Date(p.onset || p.effective || p.sent || Date.now());
      var geo = f.geometry;
      var clat = lat;
      var clon = lon;
      var dist = 0;
      if (geo && geo.type === "Point" && geo.coordinates) {
        clon = geo.coordinates[0];
        clat = geo.coordinates[1];
        dist = haversineMiles(lat, lon, clat, clon);
      }
      out.push({
        id: "nws-" + (p.id || i),
        kind: kind,
        title: event,
        magLabel: p.severity && p.severity !== "Unknown" ? p.severity : "",
        when: when,
        city: p.areaDesc || "",
        remark: (p.headline || p.description || "").slice(0, 220),
        distance: dist,
        lat: clat,
        lon: clon,
        source: "NWS alerts"
      });
    }
    return out.filter(reportPassesFilters);
  }

  function dedupeReports(list) {
    var out = [];
    var keys = {};
    list.forEach(function (r) {
      var t = r.when instanceof Date ? r.when.getTime() : 0;
      var bucket = Math.round(t / 600000); // 10-min
      var key =
        r.kind +
        "|" +
        (r.lat != null ? r.lat.toFixed(2) : "") +
        "|" +
        (r.lon != null ? r.lon.toFixed(2) : "") +
        "|" +
        bucket;
      if (keys[key]) {
        // Prefer IEM for history detail; keep SPC/NWS tags if same
        var existing = keys[key];
        if (existing.source.indexOf(r.source) === -1) {
          existing.source = existing.source + " · " + r.source;
        }
        if (!existing.magLabel && r.magLabel) existing.magLabel = r.magLabel;
        if (!existing.remark && r.remark) existing.remark = r.remark;
        return;
      }
      keys[key] = r;
      out.push(r);
    });
    return out;
  }

  function sortReports(list) {
    return list.slice().sort(function (a, b) {
      var ta = a.when instanceof Date ? a.when.getTime() : 0;
      var tb = b.when instanceof Date ? b.when.getTime() : 0;
      if (tb !== ta) return tb - ta;
      return (a.distance || 0) - (b.distance || 0);
    });
  }

  /** Keep older hail/tornado reports from being crowded out by recent wind LSRs. */
  function prioritizeReports(list) {
    var sorted = sortReports(list);
    var hailTornado = sorted.filter(function (r) {
      return r.kind === "hail" || r.kind === "tornado";
    });
    var wind = sorted.filter(function (r) {
      return r.kind === "wind";
    });
    var other = sorted.filter(function (r) {
      return r.kind !== "hail" && r.kind !== "tornado" && r.kind !== "wind";
    });
    var selected = hailTornado.slice(0, MAX_RESULTS);
    var remaining = MAX_RESULTS - selected.length;

    if (remaining > 0) {
      selected = selected.concat(wind.slice(0, remaining));
      remaining = MAX_RESULTS - selected.length;
    }
    if (remaining > 0) {
      selected = selected.concat(other.slice(0, remaining));
    }

    return sortReports(selected);
  }

  function formatDist(mi) {
    if (mi == null || isNaN(mi)) return "—";
    if (mi < 10) return mi.toFixed(1) + " mi";
    return Math.round(mi) + " mi";
  }

  function formatEtShort(isoOrDate) {
    var d = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleString("en-US", {
      timeZone: TZ,
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short"
    });
  }

  function sizeOrMph(r) {
    if (r.magLabel) return r.magLabel;
    if (r.kind === "tornado") return "Tornado report";
    if (r.kind === "flood") return "Flood report";
    if (r.kind === "alert") return "Alert";
    return "—";
  }

  /** Compact magnitude for LIST OF TOTAL EVENTS (e.g. 0.75" / 60mph / EF1). */
  function tableMagnitude(r) {
    if (!r) return "—";
    if (r.kind === "hail") {
      var inches = hailInches(r);
      if (inches) return String(inches) + '"';
      var hailRaw = sizeOrMph(r);
      var hm = String(hailRaw).match(/([0-9]+(?:\.[0-9]+)?)/);
      return hm ? hm[1] + '"' : "—";
    }
    if (r.kind === "wind") {
      var mph = r.magMph != null ? r.magMph : parseWindMph(r._magRaw || r.magLabel);
      if (mph != null && !isNaN(mph)) return Math.round(mph) + "mph";
      var windRaw = sizeOrMph(r);
      if (/damage/i.test(windRaw)) return "Damage";
      var wm = String(windRaw).match(/([0-9]+)/);
      return wm ? wm[1] + "mph" : "—";
    }
    if (r.kind === "tornado") {
      var tRaw = r.magLabel || r._magRaw || sizeOrMph(r) || "";
      var ef = String(tRaw).match(/EF-?\s*\d/i);
      if (ef) return ef[0].replace(/\s+/g, "").toUpperCase().replace("EF", "EF");
      var fOnly = String(tRaw).match(/\bF\s*\d\b/i);
      if (fOnly) return fOnly[0].replace(/\s+/g, "").toUpperCase();
      if (tRaw && !/tornado report/i.test(tRaw)) return String(tRaw).trim();
      return "—";
    }
    var fallback = sizeOrMph(r);
    return fallback && fallback !== "—" ? fallback : "—";
  }

  function formatMdY(isoOrDate) {
    var d = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("en-US", {
      timeZone: TZ,
      month: "numeric",
      day: "numeric",
      year: "numeric"
    });
  }

  function typeIconSvg(kind) {
    if (kind === "hail") {
      return (
        '<svg class="ewr-type-icon" viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false">' +
        '<path fill="#5B6B7A" d="M5.2 9.2c0-2.6 2-4.7 4.8-4.7 2.2 0 4.1 1.5 4.6 3.5.9.3 1.6 1.2 1.6 2.2 0 1.3-1.1 2.4-2.4 2.4H6.6C5.2 12.6 4 11.4 4 10c0-.4.1-.8.2-1.1.3-.4.7-.7 1-.7z"/>' +
        '<circle fill="#7A8A98" cx="7.2" cy="15.2" r="1.1"/>' +
        '<circle fill="#7A8A98" cx="10" cy="16.2" r="1.1"/>' +
        '<circle fill="#7A8A98" cx="12.8" cy="15.1" r="1.1"/>' +
        "</svg>"
      );
    }
    if (kind === "wind") {
      return (
        '<svg class="ewr-type-icon" viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false">' +
        '<path fill="none" stroke="#5B6B7A" stroke-width="1.6" stroke-linecap="round" d="M3 6.5h9.5c1.4 0 2.5 1 2.5 2.2S13.9 11 12.5 11H11"/>' +
        '<path fill="none" stroke="#5B6B7A" stroke-width="1.6" stroke-linecap="round" d="M3 10h11.2c1.1 0 2 .8 2 1.9S15.3 14 14.2 14H13"/>' +
        '<path fill="none" stroke="#5B6B7A" stroke-width="1.6" stroke-linecap="round" d="M3 13.5h7.5"/>' +
        "</svg>"
      );
    }
    if (kind === "tornado") {
      return (
        '<svg class="ewr-type-icon" viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false">' +
        '<path fill="#5B6B7A" d="M3.5 4.2h13l-1.4 2.2H4.9L3.5 4.2zm1.8 3.4h9.4l-1.2 2.1H6.5L5.3 7.6zm1.6 3.3h6.2l-1.1 2H8l-1.1-2zm1.4 3.2h3.4l-.9 2.2h-1.6l-.9-2.2z"/>' +
        "</svg>"
      );
    }
    if (kind === "flood") {
      return (
        '<svg class="ewr-type-icon" viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false">' +
        '<path fill="none" stroke="#5B6B7A" stroke-width="1.5" stroke-linecap="round" d="M3 8c1.2 1.2 2.4 1.2 3.6 0s2.4-1.2 3.6 0 2.4 1.2 3.6 0"/>' +
        '<path fill="none" stroke="#5B6B7A" stroke-width="1.5" stroke-linecap="round" d="M3 12c1.2 1.2 2.4 1.2 3.6 0s2.4-1.2 3.6 0 2.4 1.2 3.6 0"/>' +
        "</svg>"
      );
    }
    return (
      '<svg class="ewr-type-icon" viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false">' +
      '<path fill="none" stroke="#5B6B7A" stroke-width="1.5" d="M10 3.5l1.2 2.6 2.8.3-2.1 1.9.6 2.8L10 9.8 7.5 11.1l.6-2.8-2.1-1.9 2.8-.3L10 3.5z"/>' +
      "</svg>"
    );
  }

  function isNearImpact(r) {
    return r && r.distance != null && !isNaN(r.distance) && r.distance <= 1;
  }

  function renderEventsRow(r, idx) {
    var kind = r.kind || "other";
    var type = badgeLabel(kind);
    var rid = r.id || ("r-" + idx);
    var near = isNearImpact(r);
    var titleAttr = escapeHtml(
      (r.title || type) +
        (r.city ? " · " + r.city : "") +
        (r.source ? " · " + r.source : "") +
        (near ? " · Within ~1 mile of address" : "") +
        " · View on map"
    );
    return (
      '<tr class="ewr-events-row storm-row--' +
      escapeHtml(kind) +
      (near ? " is-near" : "") +
      '" data-report-id="' +
      escapeHtml(rid) +
      '" title="' +
      titleAttr +
      '">' +
      '<td class="ewr-events-type" data-label="Type">' +
      '<span class="ewr-type-cell">' +
      typeIconSvg(kind) +
      '<span class="ewr-type-label">' +
      escapeHtml(type) +
      "</span>" +
      (near
        ? '<span class="ewr-impact-mark" title="Report is within about 1 mile of this address" aria-label="Within about 1 mile">⊕</span>'
        : "") +
      "</span></td>" +
      '<td class="ewr-events-mag" data-label="Magnitude">' +
      escapeHtml(tableMagnitude(r)) +
      "</td>" +
      '<td class="ewr-events-date" data-label="Date">' +
      escapeHtml(formatMdY(r.when)) +
      "</td>" +
      '<td class="ewr-events-map" data-label="Map">' +
      '<button type="button" class="ewr-view-storm" data-report-id="' +
      escapeHtml(rid) +
      '">View Storm</button>' +
      "</td>" +
      "</tr>"
    );
  }

  function renderEventsTable(list) {
    var filtered = (list || []).filter(function (r) {
      return r.kind === "hail" || r.kind === "wind" || r.kind === "tornado";
    });
    if (!filtered.length) {
      return '<p class="ewr-empty-table">No hail, wind, or tornado reports in this radius for the current filters.</p>';
    }
    var rows = filtered.map(function (r, i) { return renderEventsRow(r, i); }).join("");
    return (
      '<div class="ewr-events-wrap" role="region" aria-label="List of total events" tabindex="0">' +
      '<table class="ewr-events-table">' +
      "<thead><tr>" +
      '<th scope="col">Type</th>' +
      '<th scope="col">Magnitude</th>' +
      '<th scope="col">Date</th>' +
      '<th scope="col">Map</th>' +
      "</tr></thead>" +
      "<tbody>" +
      rows +
      "</tbody></table></div>" +
      '<p class="ewr-events-legend"><span class="ewr-impact-mark" aria-hidden="true">⊕</span> — Report is within about 1 mile of this address</p>'
    );
  }

  function renderNearbyReports(list) {
    return (
      '<h4 class="ewr-events-title">LIST OF TOTAL EVENTS</h4>' +
      renderEventsTable(list)
    );
  }


  function renderFullReport(opts) {
    var geo = opts.geo;
    var radius = opts.radius;
    var area = opts.area;
    var list = opts.list || [];
    var sourceNotes = opts.sourceNotes || [];
    var sig = pickSignificant(list);
    var counts = countKinds(list);
    return (
      '<article class="ewr-report" aria-label="Extreme Weather Report">' +
      renderReportHeader(geo, radius, area) +
      renderSignificantStrip(sig) +
      '<div class="ewr-map-card">' +
      '<div class="ewr-map-head"><span>Satellite map · nearby public reports</span>' +
      '<span class="ewr-map-legend">' +
      '<i class="ewr-leg ewr-leg--home"></i> Address ' +
      '<i class="ewr-leg ewr-leg--hail"></i> Hail ' +
      '<i class="ewr-leg ewr-leg--wind"></i> Wind ' +
      '<i class="ewr-leg ewr-leg--tornado"></i> Tornado</span></div>' +
      '<div class="ewr-map" role="img" aria-label="Satellite map of storm reports near address"></div>' +
      "</div>" +
      renderCountTiles(counts) +
      '<div class="ewr-events-card">' +
      renderNearbyReports(list) +
      "</div>" +
      '<p class="ewr-sources"><strong>Sources:</strong> ' +
      escapeHtml(sourceNotes.join(" · ")) +
      " · " +
      escapeHtml(lookbackCopy()) +
      "</p>" +
      renderResultsCta() +
      "</article>"
    );
  }


  /* ——— Area-wide view (page load, no address) ——— */

  function titleCaseIfCaps(str) {
    var t = String(str || "").trim();
    if (!t || t !== t.toUpperCase()) return t;
    return t.toLowerCase().replace(/\b([a-z])/g, function (m) {
      return m.toUpperCase();
    }).replace(/\b(Nne|Ne|Ene|Ese|Se|Sse|Ssw|Sw|Wsw|Wnw|Nw|Nnw|N|E|S|W)\b/g, function (m) {
      return m.toUpperCase();
    });
  }

  function nearestTown(r) {
    var parts = String(r.city || "").split(",").map(function (x) {
      return x.trim();
    }).filter(Boolean);
    if (!parts.length) return "—";
    var place = titleCaseIfCaps(parts[0]);
    var state = parts.length >= 3 ? parts[parts.length - 1].toUpperCase() : "";
    // LSR city carries a "3 SW Town" prefix — show "Town, ST (3 mi SW)".
    var m = place.match(/^(\d+(?:\.\d+)?)\s+([NSEW]{1,3})\s+(.+)$/i);
    var off = "";
    if (m) {
      place = m[3];
      off = " (" + m[1] + " mi " + m[2].toUpperCase() + ")";
    }
    return place + (state ? ", " + state : "") + off;
  }

  /** Common hail size names (NWS reference objects). */
  function hailSizeName(inches) {
    if (!inches) return "";
    var names = [
      [4.5, "softball"],
      [4.0, "grapefruit"],
      [3.0, "teacup"],
      [2.75, "baseball"],
      [2.5, "tennis ball"],
      [2.0, "hen egg"],
      [1.75, "golf ball"],
      [1.5, "ping-pong ball"],
      [1.25, "half dollar"],
      [1.0, "quarter"],
      [0.88, "nickel"],
      [0.75, "penny"],
      [0.5, "marble"]
    ];
    for (var i = 0; i < names.length; i++) {
      if (inches >= names[i][0] - 0.005) return names[i][1];
    }
    return "pea";
  }

  function areaMagnitude(r) {
    if (r.kind === "hail") {
      var inch = hailInches(r);
      if (!inch) return "Hail";
      return inch + '" ' + hailSizeName(inch);
    }
    if (r.kind === "wind") {
      if (r.magMph != null && !isNaN(r.magMph)) {
        return Math.round(r.magMph) + " mph" + (r.qualifier === "M" ? " (measured)" : r.qualifier === "E" ? " (est.)" : "");
      }
      return "Damage";
    }
    if (r.kind === "tornado") return r.magLabel && !/tornado/i.test(r.magLabel) ? r.magLabel : "Tornado";
    return tableMagnitude(r);
  }

  function areaWindowLabel() {
    return "Hail & wind reports, last " + AREA_LOOKBACK_DAYS + " days";
  }

  function areaScopeLabel() {
    return (
      "Within " +
      AREA_RADIUS_MILES +
      " mi of Denver NC — Lake Norman, Huntersville, Mooresville, Cornelius, Davidson, Lincolnton, Charlotte & Rock Hill / Fort Mill SC"
    );
  }

  function renderAreaHeader(updatedAt) {
    return (
      '<header class="ewr-header">' +
      '<div class="ewr-brand">' +
      '<span class="ewr-brand-mark">CPR</span>' +
      '<div class="ewr-brand-text">' +
      '<p class="ewr-eyebrow">Extreme Weather Report · Lake Norman area</p>' +
      '<h3 class="ewr-title" id="sc-area-heading">Recent storm reports near Lake Norman</h3>' +
      "</div></div>" +
      '<div class="ewr-address">' +
      '<p class="ewr-address-label">' + escapeHtml(areaWindowLabel()) + "</p>" +
      '<p class="ewr-address-value">' + escapeHtml(areaScopeLabel()) + "</p>" +
      '<p class="ewr-address-meta">' +
      "<span><strong>Source:</strong> NOAA / NWS local storm reports</span>" +
      (updatedAt
        ? "<span><strong>Updated:</strong> " + escapeHtml(formatEtShort(updatedAt)) + "</span>"
        : "") +
      "</p></div></header>"
    );
  }

  function renderAreaRow(r, idx, hidden) {
    var kind = r.kind || "other";
    var rid = r.id || "a-" + idx;
    return (
      '<tr class="ewr-events-row storm-row--' +
      escapeHtml(kind) +
      '" data-kind="' +
      escapeHtml(kind) +
      '" data-report-id="' +
      escapeHtml(rid) +
      '"' +
      (hidden ? " hidden" : "") +
      ' title="' +
      escapeHtml(
        (r.title || badgeLabel(kind)) +
          (r.city ? " · " + r.city : "") +
          (r.remark ? " · " + r.remark.slice(0, 160) : "") +
          " · View on map"
      ) +
      '">' +
      '<td class="ewr-events-date" data-label="Date">' + escapeHtml(formatMdY(r.when)) + "</td>" +
      '<td class="ewr-events-type" data-label="Type"><span class="ewr-type-cell">' +
      typeIconSvg(kind) +
      '<span class="ewr-type-label">' + escapeHtml(badgeLabel(kind)) + "</span></span></td>" +
      '<td class="ewr-events-mag" data-label="Size / speed">' + escapeHtml(areaMagnitude(r)) + "</td>" +
      '<td class="ewr-events-town" data-label="Nearest town">' + escapeHtml(nearestTown(r)) + "</td>" +
      '<td class="ewr-events-map" data-label="Map"><button type="button" class="ewr-view-storm" data-report-id="' +
      escapeHtml(rid) +
      '">View</button></td>' +
      "</tr>"
    );
  }

  function renderAreaTable(list) {
    var rows = list
      .map(function (r, i) {
        return renderAreaRow(r, i, i >= AREA_LIST_INITIAL);
      })
      .join("");
    var counts = countKinds(list);
    var chips = [["all", "All", list.length], ["hail", "Hail", counts.hail], ["wind", "Wind", counts.wind]];
    if (counts.tornado) chips.push(["tornado", "Tornado", counts.tornado]);
    var chipHtml =
      '<div class="sc-area-chips" role="group" aria-label="Filter reports by type">' +
      chips
        .map(function (c) {
          return (
            '<button type="button" class="sc-area-chip' +
            (c[0] === "all" ? " is-active" : "") +
            '" data-sc-area-filter="' +
            c[0] +
            '" aria-pressed="' +
            (c[0] === "all" ? "true" : "false") +
            '">' +
            c[1] +
            " <span>" +
            c[2] +
            "</span></button>"
          );
        })
        .join("") +
      "</div>";
    var more =
      '<p class="sc-area-more"' +
      (list.length > AREA_LIST_INITIAL ? "" : " hidden") +
      '><button type="button" class="sc-area-more-btn" data-sc-area-more>Show all ' +
      list.length +
      " reports</button></p>";
    return (
      chipHtml +
      '<div class="ewr-events-wrap" role="region" aria-label="Recent area storm reports" tabindex="0">' +
      '<table class="ewr-events-table ewr-events-table--area">' +
      "<thead><tr>" +
      '<th scope="col">Date</th>' +
      '<th scope="col">Type</th>' +
      '<th scope="col">Size / speed</th>' +
      '<th scope="col">Nearest town</th>' +
      '<th scope="col">Map</th>' +
      "</tr></thead><tbody>" +
      rows +
      "</tbody></table></div>" +
      more
    );
  }

  function renderAreaSignificant(list) {
    var hail = list.filter(function (r) {
      return r.kind === "hail";
    });
    if (!hail.length) return "";
    var latest = hail[0];
    var largest = hail.reduce(function (a, b) {
      return hailInches(b) > hailInches(a) ? b : a;
    }, hail[0]);
    function card(label, r) {
      return (
        '<div class="ewr-sig ewr-sig--hail">' +
        '<span class="ewr-sig-label">' + escapeHtml(label) + "</span>" +
        '<span class="ewr-sig-date">' + escapeHtml(formatDateOnly(r.when)) + "</span>" +
        '<span class="ewr-sig-detail">' +
        escapeHtml(areaMagnitude(r)) +
        " · " +
        escapeHtml(nearestTown(r)) +
        "</span></div>"
      );
    }
    var parts = [card("Largest hail · last " + AREA_LOOKBACK_DAYS + " days", largest)];
    if (latest !== largest) parts.push(card("Most recent hail", latest));
    return '<div class="ewr-sig-strip" role="region" aria-label="Notable hail reports">' + parts.join("") + "</div>";
  }

  function applyAreaRows(areaEl) {
    var filter = areaEl._scFilter || "all";
    var expanded = !!areaEl._scExpanded;
    var rows = areaEl.querySelectorAll("tbody tr[data-kind]");
    var shown = 0;
    var matching = 0;
    for (var i = 0; i < rows.length; i++) {
      var match = filter === "all" || rows[i].getAttribute("data-kind") === filter;
      if (match) matching++;
      var vis = match && (expanded || shown < AREA_LIST_INITIAL);
      rows[i].hidden = !vis;
      if (vis) shown++;
    }
    var more = areaEl.querySelector(".sc-area-more");
    if (more) {
      more.hidden = expanded || matching <= AREA_LIST_INITIAL;
      var btn = more.querySelector("button");
      if (btn) btn.textContent = "Show all " + matching + " reports";
    }
  }

  function renderAreaTiles(counts) {
    var sub = "last " + AREA_LOOKBACK_DAYS + " days · " + AREA_RADIUS_MILES + " mi";
    return (
      '<div class="ewr-tiles ewr-tiles--area" role="group" aria-label="Area report counts">' +
      '<div class="ewr-tile ewr-tile--hail"><span class="ewr-tile-num">' + counts.hail +
      '</span><span class="ewr-tile-label">Hail reports</span><span class="ewr-tile-sub">' + sub + "</span></div>" +
      '<div class="ewr-tile ewr-tile--wind"><span class="ewr-tile-num">' + counts.wind +
      '</span><span class="ewr-tile-label">Wind ≥60 mph / damage</span><span class="ewr-tile-sub">' + sub + "</span></div>" +
      '<div class="ewr-tile ewr-tile--tornado"><span class="ewr-tile-num">' + counts.tornado +
      '</span><span class="ewr-tile-label">Tornado reports</span><span class="ewr-tile-sub">' + sub + "</span></div>" +
      "</div>"
    );
  }

  function renderAreaReport(list, sourceNotes, updatedAt, errorMsg) {
    var body;
    if (errorMsg) {
      body =
        '<div class="ewr-sig-strip ewr-sig-strip--empty"><p>' +
        escapeHtml(errorMsg) +
        ' <button type="button" class="sc-area-more-btn" data-sc-area-retry>Try again</button></p></div>';
    } else if (!list.length) {
      body =
        '<div class="ewr-sig-strip ewr-sig-strip--empty"><p>No hail or wind reports in the last ' +
        AREA_LOOKBACK_DAYS +
        " days near Lake Norman — check your address below for the full 3-year history.</p></div>";
    } else {
      body = renderAreaTiles(countKinds(list)) + renderAreaSignificant(list);
    }
    var mapCard =
      '<div class="ewr-map-card">' +
      '<div class="ewr-map-head"><span>' + escapeHtml(areaWindowLabel()) + " · " + AREA_RADIUS_MILES + " mi around Lake Norman</span>" +
      '<span class="ewr-map-legend">' +
      '<i class="ewr-leg ewr-leg--hail"></i> Hail ' +
      '<i class="ewr-leg ewr-leg--wind"></i> Wind ' +
      '<i class="ewr-leg ewr-leg--tornado"></i> Tornado</span></div>' +
      '<div class="ewr-map" role="img" aria-label="Satellite map of recent hail and wind reports around Lake Norman"></div>' +
      "</div>";
    var table = list.length
      ? '<div class="ewr-events-card"><h4 class="ewr-events-title">Recent reports · last ' +
        AREA_LOOKBACK_DAYS +
        " days</h4>" +
        renderAreaTable(list) +
        "</div>"
      : "";
    return (
      '<article class="ewr-report ewr-report--area" aria-labelledby="sc-area-heading">' +
      renderAreaHeader(updatedAt) +
      body +
      (errorMsg ? "" : mapCard) +
      table +
      '<p class="ewr-sources"><strong>Sources:</strong> ' +
      escapeHtml(
        (sourceNotes && sourceNotes.length ? sourceNotes : ["NOAA / NWS local storm reports via Iowa Environmental Mesonet"]).join(" · ")
      ) +
      " · Wind shown only when ≥" +
      WIND_MIN_MPH +
      " mph or NWS thunderstorm wind-damage reports. Public reports are not proof a specific roof was hit.</p>" +
      '<p class="sc-area-next">Want reports for your home? <a href="#sc-address" data-sc-area-focus>Enter your address below</a> for a 3-year history — or <a class="js-storm-inspect-open" href="#">get a free storm inspection</a>.</p>' +
      "</article>"
    );
  }

  /** IEM LSR GeoJSON (CORS-enabled) for the area view; bbox prefilter + exact Haversine. */
  async function fetchIemGeojsonArea() {
    var c = AREA_CENTER;
    var box = bboxFor(c.lat, c.lon, AREA_RADIUS_MILES + 2);
    var url =
      "https://mesonet.agron.iastate.edu/geojson/lsr.py?west=" +
      box.west.toFixed(3) +
      "&east=" +
      box.east.toFixed(3) +
      "&south=" +
      box.south.toFixed(3) +
      "&north=" +
      box.north.toFixed(3) +
      "&sts=" +
      encodeURIComponent(isoDaysAgo(AREA_LOOKBACK_DAYS + 1).replace(/:\d\dZ$/, "Z")) +
      "&ets=" +
      encodeURIComponent(new Date(Date.now() + 3600000).toISOString().replace(/:\d\d\.\d{3}Z$/, "Z"));
    var res = await fetch(url, { headers: { Accept: "application/geo+json, application/json" } });
    if (!res.ok) throw new Error("IEM LSR GeoJSON " + res.status);
    var data = await res.json();
    var feats = (data && data.features) || [];
    // Corrections: same (type, valid, lat2, lon2) → keep newest product_id.
    var byKey = {};
    feats.forEach(function (f) {
      var p = f.properties || {};
      var code = String(p.type || "").toUpperCase();
      var kind = code === "H" ? "hail" : code === "G" || code === "D" ? "wind" : code === "T" ? "tornado" : null;
      if (!kind) return; // excludes O/N non-thunderstorm wind, floods, winter, etc.
      var lat = parseFloat(p.lat);
      var lon = parseFloat(p.lon);
      if (isNaN(lat) || isNaN(lon)) return;
      var key = code + "|" + p.valid + "|" + lat.toFixed(2) + "|" + lon.toFixed(2);
      var prev = byKey[key];
      if (prev && String(prev.p.product_id || "") >= String(p.product_id || "")) return;
      byKey[key] = { p: p, kind: kind, code: code, lat: lat, lon: lon };
    });
    var out = [];
    Object.keys(byKey).forEach(function (k) {
      var o = byKey[k];
      var p = o.p;
      var dist = haversineMiles(c.lat, c.lon, o.lat, o.lon);
      if (dist > AREA_RADIUS_MILES) return;
      var magf = p.magf != null && p.magf !== "" ? parseFloat(p.magf) : null;
      if (magf != null && isNaN(magf)) magf = null;
      var r = {
        id: "iem-" + (p.product_id || "") + "-" + k,
        kind: o.kind,
        title: p.typetext || badgeLabel(o.kind),
        magLabel: o.kind === "hail" && magf ? magf + '" hail' : o.kind === "wind" && magf ? Math.round(magf) + " mph gust" : o.kind === "wind" ? "Wind damage" : "",
        magMph: o.kind === "wind" ? magf : null,
        _magRaw: magf != null ? String(magf) : "",
        _typecode: o.code,
        qualifier: p.qualifier || "",
        when: new Date(p.valid),
        city: [p.city, p.county, p.st || p.state].filter(Boolean).join(", "),
        remark: String(p.remark || "").trim(),
        reporter: p.source || "",
        distance: dist,
        lat: o.lat,
        lon: o.lon,
        source: "NWS " + (p.wfo || "") + " LSR via IEM"
      };
      if (!withinLookback(r.when, AREA_LOOKBACK_DAYS)) return;
      if (r.kind === "wind" && !windPassesThreshold(r)) return;
      out.push(r);
    });
    return out;
  }

  /** SPC rows are the same NWS LSRs: drop ones matching an IEM row (peril, ≤2 min, ≤1 mi). */
  function mergeSpcIntoArea(iemList, spcList) {
    var extra = [];
    spcList.forEach(function (s) {
      if (s.kind !== "hail" && s.kind !== "wind" && s.kind !== "tornado") return;
      var dup = iemList.some(function (r) {
        return (
          r.kind === s.kind &&
          Math.abs(r.when.getTime() - s.when.getTime()) <= 120000 &&
          haversineMiles(r.lat, r.lon, s.lat, s.lon) <= 1
        );
      });
      if (!dup) extra.push(s);
    });
    return iemList.concat(extra);
  }

  async function fetchAreaReports() {
    var c = AREA_CENTER;
    var parts = await Promise.all([
      settle(fetchIemGeojsonArea()),
      settle(fetchSpcNear(c.lat, c.lon, AREA_RADIUS_MILES))
    ]);
    var iem;
    if (parts[0].ok) iem = parts[0].value;
    else {
      // Fallback: existing IEM CSV request path.
      var csv = await settle(fetchIemLsr(c.lat, c.lon, AREA_RADIUS_MILES, null, AREA_LOOKBACK_DAYS));
      if (!csv.ok) throw new Error("Area feed unavailable");
      iem = dedupeReports(
        csv.value.filter(function (r) {
          return (
            (r.kind === "hail" || r.kind === "wind" || r.kind === "tornado") &&
            r._typecode !== "O" && r._typecode !== "N" && r._typecode !== "C" &&
            withinLookback(r.when, AREA_LOOKBACK_DAYS)
          );
        })
      );
    }
    var notes = ["NOAA / NWS local storm reports via Iowa Environmental Mesonet (last " + AREA_LOOKBACK_DAYS + " days, ground reports only)"];
    var list = iem;
    if (parts[1].ok && parts[1].value.length) {
      var spc = parts[1].value.filter(function (r) {
        return withinLookback(r.when, AREA_LOOKBACK_DAYS);
      });
      var merged = mergeSpcIntoArea(iem, spc);
      if (merged.length > iem.length) notes.push("NOAA Storm Prediction Center (today/yesterday)");
      list = merged;
    }
    return { list: sortReports(list), notes: notes };
  }

  function initArea(root, areaEl) {
    var cache = null;

    function wire() {
      if (areaEl._scAreaWired) return;
      areaEl._scAreaWired = true;
      wireReportMapFocus(areaEl, areaEl);
      areaEl.addEventListener("click", function (ev) {
        var t = ev.target;
        if (!t || !t.closest) return;
        if (t.closest("[data-sc-area-more]")) {
          areaEl._scExpanded = true;
          applyAreaRows(areaEl);
          return;
        }
        var chip = t.closest("[data-sc-area-filter]");
        if (chip) {
          areaEl._scFilter = chip.getAttribute("data-sc-area-filter");
          areaEl._scExpanded = false;
          var chips = areaEl.querySelectorAll("[data-sc-area-filter]");
          for (var c = 0; c < chips.length; c++) {
            var on = chips[c] === chip;
            chips[c].classList.toggle("is-active", on);
            chips[c].setAttribute("aria-pressed", on ? "true" : "false");
          }
          applyAreaRows(areaEl);
          return;
        }
        if (t.closest("[data-sc-area-retry]")) {
          ev.preventDefault();
          load();
          return;
        }
        if (t.closest("[data-sc-area-focus]")) {
          var input = $("#sc-address", root) || $('[name="address"]', root);
          if (input) {
            ev.preventDefault();
            input.scrollIntoView({ behavior: "smooth", block: "center" });
            try {
              input.focus({ preventScroll: true });
            } catch (e) {
              input.focus();
            }
          }
          return;
        }
        if (t.closest("[data-sc-area-show]")) {
          ev.preventDefault();
          if (typeof areaEl._scOnShow === "function") areaEl._scOnShow();
          show();
        }
      });
    }

    function paint(data, errorMsg) {
      destroyReportMap(areaEl);
      areaEl.hidden = false;
      areaEl.classList.remove("is-collapsed");
      areaEl.innerHTML = renderAreaReport(
        data ? data.list : [],
        data ? data.notes : [],
        data ? data.at : null,
        errorMsg
      );
      areaEl._scFilter = "all";
      areaEl._scExpanded = false;
      if (!errorMsg) {
        var mapEl = areaEl.querySelector(".ewr-map");
        // Draw wind first so hail / tornado dots sit on top.
        var rank = { wind: 0, hail: 1, tornado: 2 };
        var mapList = (data ? data.list : []).slice().sort(function (a, b) {
          return (rank[a.kind] || 0) - (rank[b.kind] || 0);
        });
        initReportMap(
          areaEl,
          mapEl,
          { lat: AREA_CENTER.lat, lon: AREA_CENTER.lon, label: AREA_CENTER.label },
          mapList,
          AREA_RADIUS_MILES,
          { noHome: true }
        );
      }
    }

    async function load() {
      destroyReportMap(areaEl);
      areaEl.hidden = false;
      areaEl.classList.remove("is-collapsed");
      areaEl.innerHTML =
        '<div class="storm-check-status is-loading sc-area-loading" role="status">Loading recent NOAA hail &amp; wind reports around Lake Norman…</div>';
      try {
        var res = await fetchAreaReports();
        cache = { list: res.list, notes: res.notes, at: new Date() };
        areaEl.setAttribute("data-sc-area-count", String(res.list.length));
        paint(cache, null);
      } catch (e) {
        areaEl.setAttribute("data-sc-area-count", "error");
        paint(null, "Couldn't load area storm reports right now. You can still check your address below, or call (704) 280-5996.");
      }
    }

    function show() {
      if (cache) paint(cache, null);
      else load();
    }

    function collapse() {
      destroyReportMap(areaEl);
      areaEl.hidden = false;
      areaEl.classList.add("is-collapsed");
      areaEl.innerHTML =
        '<p class="sc-area-collapsed">Showing reports near your address. <button type="button" class="sc-area-more-btn" data-sc-area-show>Back to Lake Norman area reports (last ' +
        AREA_LOOKBACK_DAYS +
        " days)</button></p>";
    }

    wire();
    return { load: load, show: show, collapse: collapse };
  }

  function setStatus(el, msg, cls) {
    el.className = "storm-check-status" + (cls ? " " + cls : "");
    el.textContent = msg || "";
  }

  function initRoot(root) {
    var mode = root.getAttribute("data-mode") || "full";
    var isTeaser = mode === "teaser";
    var form = $(".storm-check-form", root);
    var status = $(".storm-check-status", root);
    var results = $(".storm-check-results", root);
    var meta = $(".storm-check-meta", root);
    var addressInput = $("#sc-address", root) || $('[name="address"]', root);
    var radiusSelect = $("#sc-radius", root) || $('[name="radius"]', root);
    var submitBtn = $('button[type="submit"]', form);

    if (!form || !addressInput) return;

    // Area-wide report on page load (full page only)
    var areaView = null;
    if (!isTeaser) {
      var areaEl = $(".sc-area", root);
      if (!areaEl) {
        areaEl = document.createElement("div");
        areaEl.className = "sc-area";
        form.parentNode.insertBefore(areaEl, form);
      }
      areaView = initArea(root, areaEl);
      areaEl._scOnShow = function () {
        destroyReportMap(root);
        if (results) results.innerHTML = "";
        if (meta) meta.innerHTML = "";
        setStatus(status, "", "");
      };
    }

    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      run();
    });

    async function run() {
      var address = (addressInput.value || "").trim();
      var radius = parseInt(radiusSelect && radiusSelect.value, 10) || DEFAULT_RADIUS;
      if (!address) {
        setStatus(status, "Enter a street address to check nearby storm reports.", "is-error");
        return;
      }
      destroyReportMap(root);
      if (results) results.innerHTML = "";
      if (meta) meta.innerHTML = "";
      if (areaView) areaView.collapse();
      setStatus(status, "Looking up address and checking storm reports…", "is-loading");
      if (submitBtn) submitBtn.disabled = true;

      try {
        var geo = await geocode(address);
        window.CPR_STORM_LAST_ADDRESS = geo.label || address;
        window.CPR_STORM_LAST_RADIUS = radius;
        try {
          root.dataset.stormAddress = window.CPR_STORM_LAST_ADDRESS;
          root.dataset.stormRadius = String(radius);
        } catch (e) {}
        if (isTeaser) {
          setStatus(
            status,
            "Found " +
              geo.label +
              ". Opening the full storm checker with multi-source reports…",
            ""
          );
          var target =
            "/storm-damage-insurance-claims/#storm-check?address=" +
            encodeURIComponent(address) +
            "&radius=" +
            radius;
          window.location.href = target;
          return;
        }

        var area = serviceAreaInfo(geo);
        setStatus(
          status,
          "Checking IEM local storm reports (3-year hail), SPC, and NWS near " +
            geo.label +
            "…",
          "is-loading"
        );

        var iemProgress = function (msg) {
          setStatus(status, msg, "is-loading");
        };

        var parts = await Promise.all([
          settle(fetchIemLsr(geo.lat, geo.lon, radius, iemProgress)),
          settle(fetchSpcNear(geo.lat, geo.lon, radius)),
          settle(fetchNwsAlerts(geo.lat, geo.lon))
        ]);

        var combined = [];
        var sourceNotes = [];
        if (parts[0].ok) {
          combined = combined.concat(parts[0].value);
          sourceNotes.push("IEM LSR (~3 yr)");
        } else sourceNotes.push("IEM LSR unavailable");
        if (parts[1].ok) {
          combined = combined.concat(parts[1].value);
          sourceNotes.push("SPC (today/yesterday)");
        } else sourceNotes.push("SPC unavailable");
        if (parts[2].ok) {
          combined = combined.concat(parts[2].value);
          sourceNotes.push("NWS alerts");
        } else sourceNotes.push("NWS unavailable");

        var deduped = prioritizeReports(dedupeReports(combined));

        if (meta) {
          meta.innerHTML = "";
        }

        destroyReportMap(root);

        if (!deduped.length) {
          setStatus(
            status,
            "No matching public hail (3 years) or wind ≥" +
              WIND_MIN_MPH +
              " mph reports found within " +
              radius +
              " miles. That does not mean no storm happened — many events go unreported. A free inspection can still document roof condition.",
            "is-empty"
          );
          if (results) {
            results.innerHTML = renderFullReport({
              geo: geo,
              radius: radius,
              area: area,
              list: [],
              sourceNotes: sourceNotes
            });
            var mapEl0 = results.querySelector(".ewr-map");
            initReportMap(root, mapEl0, geo, [], radius);
            if (!root._scReportWired) {
              wireReportMapFocus(root, results);
              root._scReportWired = true;
            }
          }
          return;
        }

        var hailCount = deduped.filter(function (r) {
          return r.kind === "hail";
        }).length;
        var windCount = deduped.filter(function (r) {
          return r.kind === "wind";
        }).length;
        setStatus(
          status,
          "Found " +
            deduped.length +
            " nearby report" +
            (deduped.length === 1 ? "" : "s") +
            " (" +
            hailCount +
            " hail in ~3 years, " +
            windCount +
            " wind ≥" +
            WIND_MIN_MPH +
            " mph / damage, others). Public reports near your address — not proof that hail hit your house.",
          ""
        );
        if (results) {
          results.innerHTML = renderFullReport({
            geo: geo,
            radius: radius,
            area: area,
            list: deduped,
            sourceNotes: sourceNotes
          });
          var mapEl = results.querySelector(".ewr-map");
          initReportMap(root, mapEl, geo, deduped, radius);
          if (!root._scReportWired) {
            wireReportMapFocus(root, results);
            root._scReportWired = true;
          }
        }
      } catch (err) {
        var msg =
          err && err.message === "Couldn't look up that address"
            ? "Couldn't look up that address. Try a fuller street address with city and state (e.g. Denver, NC 28037)."
            : "Something went wrong checking storm reports. Please try again in a moment, or call/text (704) 280-5996.";
        setStatus(status, msg, "is-error");
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    }

    var hasPrefill = !isTeaser && /address=/.test(location.hash + location.search);
    if (areaView) {
      if (hasPrefill) areaView.collapse();
      else areaView.load();
    }

    // Prefill from query string on full page
    if (hasPrefill) {
      try {
        var raw = location.hash.indexOf("?") >= 0
          ? location.hash.split("?")[1]
          : location.search.replace(/^\?/, "");
        var params = new URLSearchParams(raw);
        var a = params.get("address");
        var r = params.get("radius");
        if (a) addressInput.value = a;
        if (r && radiusSelect) radiusSelect.value = r;
        if (a) setTimeout(run, 50);
      } catch (e) {}
    }
  }

  function boot() {
    var roots = document.querySelectorAll("[data-storm-check]");
    for (var i = 0; i < roots.length; i++) initRoot(roots[i]);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();

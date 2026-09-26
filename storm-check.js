/**
 * CPR Storm Reports — area-wide view (client-side, GitHub Pages safe)
 * Shows NOAA / NWS local storm reports (hail, wind ≥60 mph or wind damage, tornado)
 * for the last 90 days within 45 mi of Denver NC / Lake Norman, straight from the
 * Iowa Environmental Mesonet LSR GeoJSON feed on every page load, refreshed every
 * 10 minutes while the tab is visible. No address entry; nothing is stored.
 */
(function () {
  "use strict";

  var TZ = "America/New_York";
  /** Measured / estimated wind gust threshold (mph). */
  var WIND_MIN_MPH = 60;
  var LEAFLET_CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
  var LEAFLET_JS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
  var leafletPromise = null;
  var AREA_CENTER = { lat: 35.53, lon: -80.95, label: "Denver NC / Lake Norman / north Charlotte" };
  /** 45 mi reaches the SC side too (Rock Hill / Fort Mill, York & north Lancaster Co.). */
  var AREA_RADIUS_MILES = 45;
  var AREA_LOOKBACK_DAYS = 90;
  var AREA_LIST_INITIAL = 10;
  var REFRESH_MS = 10 * 60 * 1000;

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

  function isoDaysAgo(days) {
    var d = new Date(Date.now() - days * 86400000);
    return d.toISOString().replace(/\.\d{3}Z$/, "Z");
  }

  function badgeLabel(kind) {
    if (kind === "hail") return "Hail";
    if (kind === "wind") return "Wind";
    if (kind === "tornado") return "Tornado";
    if (kind === "flood") return "Flood";
    if (kind === "alert") return "NWS alert";
    return "Report";
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

  function sortReports(list) {
    return list.slice().sort(function (a, b) {
      var ta = a.when instanceof Date ? a.when.getTime() : 0;
      var tb = b.when instanceof Date ? b.when.getTime() : 0;
      if (tb !== ta) return tb - ta;
      return (a.distance || 0) - (b.distance || 0);
    });
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
      '<p class="ewr-eyebrow">Campbells Precision Roofing · Lake Norman area</p>' +
      '<h3 class="ewr-title" id="sc-area-heading">Extreme Weather Report</h3>' +
      "</div></div>" +
      '<div class="ewr-address">' +
      '<p class="ewr-address-label">' + escapeHtml(areaWindowLabel()) + "</p>" +
      '<p class="ewr-address-value">' + escapeHtml(areaScopeLabel()) + "</p>" +
      '<p class="ewr-address-meta">' +
      "<span><strong>Source:</strong> NOAA / NWS local storm reports</span>" +
      (updatedAt
        ? '<span><strong>Updated:</strong> <span data-sc-area-updated>' + escapeHtml(formatEtShort(updatedAt)) + "</span></span>"
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
        " days within " +
        AREA_RADIUS_MILES +
        " miles of Denver NC. Many storms go unreported — a free inspection can still document your roof.</p></div>";
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
      '<p class="sc-area-next">Think a storm hit your roof? <a class="js-storm-inspect-open" href="#">Get a free storm inspection</a> or call <a href="tel:+17042805996">(704) 280-5996</a>.</p>' +
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

  function initAreaMap(areaEl, mapEl, list) {
    destroyReportMap(areaEl);
    if (!mapEl) return;
    // Draw wind first so hail / tornado dots sit on top.
    var rank = { wind: 0, hail: 1, tornado: 2 };
    var mapList = list.slice().sort(function (a, b) {
      return (rank[a.kind] || 0) - (rank[b.kind] || 0);
    });
    loadLeaflet()
      .then(function (L) {
        if (!mapEl.isConnected) return;
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
        var ring = L.circle([AREA_CENTER.lat, AREA_CENTER.lon], {
          radius: AREA_RADIUS_MILES * 1609.34,
          color: "#B8975F",
          weight: 1.5,
          opacity: 0.55,
          dashArray: "6 6",
          fillColor: "#B8975F",
          fillOpacity: 0.04,
          interactive: false
        }).addTo(map);
        var markers = {};
        mapList.forEach(function (r, idx) {
          if (r.lat == null || r.lon == null) return;
          var m = L.circleMarker([r.lat, r.lon], {
            radius: r.kind === "tornado" ? 8 : 6,
            color: "#1a1a1a",
            weight: 1,
            fillColor: markerColor(r.kind),
            fillOpacity: 0.9
          }).addTo(map);
          m.bindPopup(
            "<strong>" +
              escapeHtml(badgeLabel(r.kind)) +
              "</strong> · " +
              escapeHtml(areaMagnitude(r)) +
              "<br>" +
              escapeHtml(formatEtShort(r.when)) +
              "<br>" +
              escapeHtml(nearestTown(r))
          );
          markers[r.id || "a-" + idx] = m;
        });
        areaEl._scMap = map;
        areaEl._scMarkers = markers;
        try {
          map.fitBounds(ring.getBounds(), { padding: [6, 6] });
        } catch (e) {
          map.setView([AREA_CENTER.lat, AREA_CENTER.lon], 9);
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

  async function fetchAreaReports() {
    var list = await fetchIemGeojsonArea();
    return {
      list: sortReports(list),
      notes: [
        "NOAA / NWS local storm reports via Iowa Environmental Mesonet (last " +
          AREA_LOOKBACK_DAYS +
          " days, ground reports only)"
      ]
    };
  }

  function signature(list) {
    return list
      .map(function (r) {
        return r.id;
      })
      .join("|");
  }

  function initArea(areaEl) {
    var cache = null;
    var loading = false;

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
        load(false);
      }
    });

    function paint(data, errorMsg) {
      destroyReportMap(areaEl);
      areaEl._scFilter = "all";
      areaEl._scExpanded = false;
      areaEl.innerHTML = renderAreaReport(
        data ? data.list : [],
        data ? data.notes : [],
        data ? data.at : null,
        errorMsg
      );
      if (!errorMsg) initAreaMap(areaEl, areaEl.querySelector(".ewr-map"), data ? data.list : []);
    }

    async function load(silent) {
      if (loading) return;
      loading = true;
      if (!silent) {
        destroyReportMap(areaEl);
        areaEl.innerHTML =
          '<div class="storm-check-status is-loading sc-area-loading" role="status">Loading recent NOAA hail &amp; wind reports around Lake Norman…</div>';
      }
      try {
        var res = await fetchAreaReports();
        var next = { list: res.list, notes: res.notes, at: new Date() };
        var unchanged = silent && cache && signature(cache.list) === signature(next.list);
        cache = next;
        areaEl.setAttribute("data-sc-area-count", String(next.list.length));
        if (unchanged) {
          // Same reports: just bump the timestamp (keeps map view / filters as-is).
          var up = areaEl.querySelector("[data-sc-area-updated]");
          if (up) up.textContent = formatEtShort(next.at);
        } else {
          paint(next, null);
        }
      } catch (e) {
        // Background refresh failures keep the last good data on screen.
        if (!silent || !cache) {
          areaEl.setAttribute("data-sc-area-count", "error");
          paint(null, "Couldn't load area storm reports right now. Please try again in a moment, or call (704) 280-5996.");
        }
      } finally {
        loading = false;
      }
    }

    function refreshIfStale() {
      if (document.visibilityState === "hidden") return;
      if (!cache || Date.now() - cache.at.getTime() >= REFRESH_MS - 5000) load(true);
    }

    setInterval(refreshIfStale, REFRESH_MS);
    document.addEventListener("visibilitychange", refreshIfStale);
    load(false);
  }

  function boot() {
    var roots = document.querySelectorAll("[data-storm-check]");
    for (var i = 0; i < roots.length; i++) {
      var root = roots[i];
      var areaEl = $(".sc-area", root);
      if (!areaEl) {
        areaEl = document.createElement("div");
        areaEl.className = "sc-area";
        var panel = $(".storm-check-panel", root) || root;
        var head = $(".section-head", panel);
        if (head && head.nextSibling) panel.insertBefore(areaEl, head.nextSibling);
        else panel.appendChild(areaEl);
      }
      initArea(areaEl);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();

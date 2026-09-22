/**
 * CPR Storm Activity Checker (client-side, GitHub Pages safe)
 * Sources: IEM LSR (Iowa Mesonet), SPC storm reports, NWS api.weather.gov alerts
 * Filters: all hail last 1095 days; wind only ≥60 mph (or LSR TSTM wind damage);
 *          SPC today/yesterday; NWS alerts ~14 days. Service-area label for LN hub.
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
  var DEFAULT_RADIUS = 15;
  var MAX_RESULTS = 80;
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

  function renderResultsCta() {
    return (
      '<div class="storm-check-results-cta" role="region" aria-label="Storm damage help">' +
      "<p><strong>Think a storm hit your roof?</strong> Public reports nearby are a starting point — not proof of damage at your address.</p>" +
      '<p class="storm-check-results-cta-actions">' +
      '<a class="btn btn-white" href="/storm-damage-insurance-claims/">Get a free storm damage inspection</a> ' +
      '<a class="btn btn-outline btn-on-dark" href="/storm-damage-insurance-claims/#claims">Insurance claim help</a>' +
      "</p>" +
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
  async function fetchIemLsr(lat, lon, radiusMiles, onProgress) {
    var box = bboxFor(lat, lon, Math.max(radiusMiles, 5) + 2);
    var chunks = yearChunksUtc(HAIL_LOOKBACK_DAYS);
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

  function renderCard(r) {
    var dist =
      r.distance != null && !isNaN(r.distance)
        ? r.distance < 10
          ? r.distance.toFixed(1)
          : String(Math.round(r.distance))
        : "—";
    var remark = r.remark
      ? '<p>' + escapeHtml(r.remark.slice(0, 180)) + (r.remark.length > 180 ? "…" : "") + "</p>"
      : "";
    return (
      '<article class="storm-card">' +
      '<div class="storm-card-top">' +
      '<span class="storm-badge storm-badge--' +
      escapeHtml(r.kind) +
      '">' +
      escapeHtml(badgeLabel(r.kind)) +
      "</span>" +
      "<span class=\"storm-card-mag\">" +
      escapeHtml(r.magLabel || "") +
      "</span>" +
      "</div>" +
      "<h3>" +
      escapeHtml(r.title) +
      "</h3>" +
      "<p><strong>" +
      escapeHtml(formatEt(r.when)) +
      "</strong></p>" +
      "<p>" +
      escapeHtml(dist) +
      " mi · " +
      escapeHtml(r.city || "Near your search") +
      "</p>" +
      remark +
      '<div class="storm-card-foot">' +
      '<span class="storm-source-tag">' +
      escapeHtml(r.source) +
      "</span>" +
      "</div>" +
      "</article>"
    );
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
      if (results) results.innerHTML = "";
      if (meta) meta.innerHTML = "";
      setStatus(status, "Looking up address and checking storm reports…", "is-loading");
      if (submitBtn) submitBtn.disabled = true;

      try {
        var geo = await geocode(address);
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

        var deduped = sortReports(dedupeReports(combined)).slice(0, MAX_RESULTS);
        var ctaHtml = renderResultsCta();

        if (meta) {
          meta.innerHTML =
            "<span><strong>Near:</strong> " +
            escapeHtml(geo.label) +
            "</span>" +
            "<span><strong>Radius:</strong> " +
            escapeHtml(String(radius)) +
            " miles</span>" +
            "<span><strong>Service area:</strong> " +
            escapeHtml(area.label) +
            "</span>" +
            "<span><strong>Filters:</strong> " +
            escapeHtml(lookbackCopy()) +
            "</span>" +
            "<span><strong>Sources reached:</strong> " +
            escapeHtml(sourceNotes.join(" · ")) +
            "</span>";
        }

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
          if (results) results.innerHTML = ctaHtml;
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
        if (results) results.innerHTML = deduped.map(renderCard).join("") + ctaHtml;
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

    // Prefill from query string on full page
    if (!isTeaser && /address=/.test(location.hash + location.search)) {
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

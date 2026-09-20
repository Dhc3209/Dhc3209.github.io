/**
 * CPR Instant Quote — 4-step preliminary GAF ballpark.
 * Steps: 1 Address → 2 Confirm squares → 3 Your info → 4 Estimate (ONLY after contact)
 *
 * Pricing (product-specific installed ballparks, NC metro):
 *   - GAF Timberline HDZ®: $550–$750/sq
 *   - GAF Timberline UHDZ®: $700–$950/sq
 *   - GAF Designer Collection: $900–$1,250/sq
 *   - MRS standing-seam metal: $1,000–$1,400/sq (secondary; ≈1.85× HDZ midpoint)
 *   - Cap: max 100 roof squares
 *   - Stories: 1 → 1.00 · 1.5 → 1.08 · 2+ → 1.18
 * Ranges rounded to nearest $500. No $ shown until step 4 (after full contact).
 * Notify: FormSubmit AJAX → Daniel@cprhomepros.com · subject CPR Instant Quote Lead
 * Geocode: US Census → Photon variants → Nominatim · Map: Leaflet + Esri satellite · Footprint: OSM Overpass
 */
(function () {
  "use strict";

  var MAT_RATES = {
    hdz: { low: 550, high: 750 },
    uhdz: { low: 700, high: 950 },
    designer: { low: 900, high: 1250 },
    metal: { low: 1000, high: 1400 }
  };
  var SIZE_SQUARES = { small: 18, medium: 25, large: 33, estate: 42 };
  var STORY_MULT = { "1": 1.0, "1.5": 1.08, "2": 1.18 };
  var MAT_LABEL = {
    hdz: "GAF Timberline HDZ® architectural",
    uhdz: "GAF Timberline UHDZ®",
    designer: "GAF Designer Collection",
    metal: "MRS standing-seam metal"
  };
  var TOTAL_STEPS = 4;
  var LEAFLET_CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
  var LEAFLET_JS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
  var OVERPASS_ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter"
  ];
  var ROOF_SURFACE_FACTOR = 1.2;
  var SQ_METERS_TO_SQ_FEET = 10.7639;
  var FOOTPRINT_MIN_SQ = 5;
  var FOOTPRINT_MAX_SQ = 100;
  var MANUAL_MIN_SQ = 5;
  var MAX_SQUARES = 100;
  var leafletPromise = null;

  function round500(n) {
    return Math.round(n / 500) * 500;
  }

  function formatMoney(n) {
    return "$" + n.toLocaleString("en-US");
  }

  function clampManualSquares(n) {
    return Math.max(MANUAL_MIN_SQ, Math.min(MAX_SQUARES, Math.round(n)));
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

  function haversineMeters(a, b) {
    var R = 6371000;
    var dLat = ((b.lat - a.lat) * Math.PI) / 180;
    var dLon = ((b.lon - a.lon) * Math.PI) / 180;
    var lat1 = (a.lat * Math.PI) / 180;
    var lat2 = (b.lat * Math.PI) / 180;
    var h =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  function squaresDisclaimer(squares) {
    return (
      "Approx. " +
      squares +
      " squares from aerial/satellite data for this address — not a final measurement. Pitch, layers, waste, and extras change the number."
    );
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
        var center = polygonCentroid(geometry);
        return {
          geometry: geometry,
          area: area,
          center: center,
          contains: pointInPolygon(geo, geometry),
          distance: haversineMeters(geo, center)
        };
      })
      .filter(function (building) {
        return building.area > 20;
      });
    if (!buildings.length) throw new Error("No nearby building footprint");

    var containing = buildings.filter(function (building) {
      return building.contains;
    });
    var candidates = containing.length ? containing : buildings.slice();
    candidates.sort(function (a, b) {
      if (containing.length) return b.area - a.area;
      return a.distance - b.distance;
    });

    var selected = candidates[0];
    var footprintSqFt = selected.area * SQ_METERS_TO_SQ_FEET;
    var roofSqFt = footprintSqFt * ROOF_SURFACE_FACTOR;
    var rawSquares = roofSqFt / 100;
    var squares = Math.round(rawSquares);

    if (squares < FOOTPRINT_MIN_SQ || squares > FOOTPRINT_MAX_SQ) {
      throw new Error("Footprint squares outside 5–100 validation (" + squares + ")");
    }

    return {
      squares: squares,
      footprintSqFt: Math.round(footprintSqFt),
      roofSqFt: Math.round(roofSqFt),
      source: "footprint",
      sourceLabel: "OSM building footprint (aerial/satellite-derived)",
      note: squaresDisclaimer(squares)
    };
  }

  async function requestOverpass(endpoint, query) {
    var controller = window.AbortController ? new AbortController() : null;
    var timeout = setTimeout(function () {
      if (controller) controller.abort();
    }, 8000);
    var options = {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"
      },
      body: "data=" + encodeURIComponent(query)
    };
    if (controller) options.signal = controller.signal;
    try {
      var res = await fetch(endpoint, options);
      if (!res.ok) throw new Error("Overpass " + res.status);
      return await res.json();
    } finally {
      clearTimeout(timeout);
    }
  }

  async function estimateBuildingSquares(geo) {
    if (!geo || !isFinite(geo.lat) || !isFinite(geo.lon)) throw new Error("Missing coordinates");
    var radii = [60, 100, 150];
    var lastError = null;
    for (var r = 0; r < radii.length; r++) {
      var query =
        '[out:json][timeout:8];way["building"](around:' +
        radii[r] +
        "," +
        geo.lat +
        "," +
        geo.lon +
        ");out tags geom;";
      for (var i = 0; i < OVERPASS_ENDPOINTS.length; i++) {
        try {
          var data = await requestOverpass(OVERPASS_ENDPOINTS[i], query);
          return buildingEstimateFromData(data, geo);
        } catch (err) {
          lastError = err;
        }
      }
    }
    throw lastError || new Error("Building footprint unavailable");
  }

  function calc(squares, stories, material) {
    var sm = STORY_MULT[stories] || 1.0;
    var rates = MAT_RATES[material] || MAT_RATES.hdz;
    var low = round500(squares * rates.low * sm);
    var high = round500(squares * rates.high * sm);
    if (high <= low) high = low + 2500;
    return { low: low, high: high, squares: squares, rateLow: rates.low, rateHigh: rates.high };
  }

  function resolveSquares(form) {
    var mode = form.querySelector('[name="qe-size-mode"]:checked');
    mode = mode ? mode.value : "preset";
    if (mode === "squares") {
      var raw = parseFloat(form.querySelector('[name="qe-squares"]').value);
      if (!isFinite(raw)) raw = 25;
      return clampManualSquares(raw);
    }
    var preset = form.querySelector('[name="qe-home-size"]').value || "medium";
    return SIZE_SQUARES[preset] || 25;
  }

  function resolveSquareSource(root, form) {
    var mode = (form.querySelector('[name="qe-size-mode"]:checked') || {}).value || "preset";
    var est = root._qeBuildingEstimate;
    if (mode === "preset") return "manual_preset";
    if (!est) return "manual";
    var current = resolveSquares(form);
    if (current === est.squares) return "footprint";
    return "manual_adjusted";
  }

  function squareSourceLabel(key) {
    if (key === "footprint") return "Aerial/satellite footprint estimate";
    if (key === "manual_adjusted") return "Manual override (adjusted from footprint)";
    if (key === "manual_preset") return "Home size preset (manual)";
    return "Manual square entry";
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

  function normalizeToken(s) {
    return String(s || "")
      .toLowerCase()
      .replace(/[.,#]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  var US_STATE_ABBR = {
    alabama: "al", alaska: "ak", arizona: "az", arkansas: "ar", california: "ca",
    colorado: "co", connecticut: "ct", delaware: "de", florida: "fl", georgia: "ga",
    hawaii: "hi", idaho: "id", illinois: "il", indiana: "in", iowa: "ia",
    kansas: "ks", kentucky: "ky", louisiana: "la", maine: "me", maryland: "md",
    massachusetts: "ma", michigan: "mi", minnesota: "mn", mississippi: "ms",
    missouri: "mo", montana: "mt", nebraska: "ne", nevada: "nv", "new hampshire": "nh",
    "new jersey": "nj", "new mexico": "nm", "new york": "ny", "north carolina": "nc",
    "north dakota": "nd", ohio: "oh", oklahoma: "ok", oregon: "or", pennsylvania: "pa",
    "rhode island": "ri", "south carolina": "sc", "south dakota": "sd", tennessee: "tn",
    texas: "tx", utah: "ut", vermont: "vt", virginia: "va", washington: "wa",
    "west virginia": "wv", wisconsin: "wi", wyoming: "wy", "district of columbia": "dc"
  };

  function stateAbbr(s) {
    var n = normalizeToken(s);
    if (!n) return "";
    if (n.length === 2) return n;
    return US_STATE_ABBR[n] || n;
  }

  function streetCore(s) {
    return normalizeToken(s)
      .replace(
        /\b(road|rd|street|st|avenue|ave|drive|dr|lane|ln|boulevard|blvd|court|ct|circle|cir|way|hwy|highway|route|rte|business|bus)\b/g,
        ""
      )
      .replace(/\s+/g, " ")
      .trim();
  }

  function parseAddressParts(address) {
    var raw = String(address || "").trim();
    var zip = "";
    var zipMatch = raw.match(/\b(\d{5})(?:-\d{4})?\b/);
    if (zipMatch) zip = zipMatch[1];
    var state = "";
    var city = "";
    var street = raw;
    var m = raw.match(/^(.*?)[,\s]+([A-Za-z .]+?)[,\s]+([A-Za-z]{2})\s*,?\s*(\d{5})?(?:-\d{4})?\s*$/);
    if (m) {
      street = m[1].trim();
      city = m[2].trim();
      state = m[3].toUpperCase();
      if (m[4]) zip = m[4];
    } else {
      var m2 = raw.match(/^(.*?)[,\s]+([A-Za-z]{2})\s+(\d{5})(?:-\d{4})?\s*$/);
      if (m2) {
        var left = m2[1].trim();
        state = m2[2].toUpperCase();
        zip = m2[3];
        var bits = left.split(",");
        if (bits.length >= 2) {
          city = bits[bits.length - 1].trim();
          street = bits.slice(0, -1).join(",").trim();
        } else {
          var words = left.split(/\s+/);
          if (words.length >= 2) {
            city = words[words.length - 1];
            street = words.slice(0, -1).join(" ");
          } else {
            street = left;
          }
        }
      }
    }
    var house = "";
    var hm = street.match(/^(\d+[A-Za-z]?)\s+(.*)$/);
    if (hm) {
      house = hm[1];
      street = hm[2].trim() || street;
    }
    return { raw: raw, street: street, house: house, city: city, state: state, zip: zip };
  }

  function titleCaseCity(city) {
    return String(city || "")
      .toLowerCase()
      .replace(/\b[a-z]/g, function (c) {
        return c.toUpperCase();
      });
  }

  function photonLabel(props, fallback) {
    var streetBit = props.housenumber
      ? props.housenumber + " " + (props.street || "")
      : props.street;
    var parts = [
      streetBit || props.name,
      props.city || props.district || props.county,
      props.state,
      props.postcode
    ].filter(Boolean);
    return parts.join(", ") || fallback;
  }

  function photonCity(props) {
    return (
      props.city ||
      props.district ||
      (props.osm_key === "place" || props.type === "district" || props.type === "city"
        ? props.name
        : "") ||
      props.county ||
      ""
    );
  }

  function scorePhotonFeature(f, parts) {
    var props = f.properties || {};
    var cc = (props.countrycode || "").toUpperCase();
    if (cc && cc !== "US") return -1;
    var coords = (f.geometry && f.geometry.coordinates) || [];
    if (coords.length < 2) return -1;
    var score = 0;
    var featCity = normalizeToken(props.city || props.district || "");
    var featName = normalizeToken(props.name || "");
    var featCounty = normalizeToken(props.county || "");
    var featState = stateAbbr(props.state || "");
    var featZip = String(props.postcode || "").slice(0, 5);
    var featStreet = normalizeToken(props.street || "");
    var wantCity = normalizeToken(parts.city);
    var wantState = stateAbbr(parts.state);
    var wantZip = parts.zip || "";
    var wantStreetCore = streetCore(parts.street);
    var featStreetCore = streetCore(props.street || "");
    var featNameCore = streetCore(props.name || "");
    var ptype = props.type || "";
    var isPlace =
      ptype === "city" ||
      ptype === "district" ||
      props.osm_key === "place" ||
      props.osm_value === "hamlet" ||
      props.osm_value === "village" ||
      props.osm_value === "town" ||
      props.osm_value === "city";

    if (wantZip && featZip === wantZip) score += 40;
    else if (wantZip && featZip && featZip !== wantZip) score -= 35;

    if (wantState) {
      if (featState && featState === wantState) score += 20;
      else if (featState) score -= 30;
    }

    if (wantCity) {
      if (
        featCity === wantCity ||
        featName === wantCity ||
        (featCity && (featCity.indexOf(wantCity) >= 0 || wantCity.indexOf(featCity) >= 0))
      ) {
        score += 25;
      } else if (featCounty.indexOf(wantCity) >= 0) {
        score += 8;
      } else if (featCity || (featName && !isPlace)) {
        score -= 20;
      }
    }

    var streetMatched = false;
    if (wantStreetCore) {
      if (
        (featStreetCore &&
          (featStreetCore.indexOf(wantStreetCore) >= 0 ||
            wantStreetCore.indexOf(featStreetCore) >= 0)) ||
        (featNameCore &&
          (featNameCore.indexOf(wantStreetCore) >= 0 ||
            wantStreetCore.indexOf(featNameCore) >= 0))
      ) {
        score += 22;
        streetMatched = true;
      } else if (isPlace) {
        // city/area hit with no street — usable only as weak fallback
        score -= 5;
      } else {
        // Wrong street POI in the right city is worse than a city centroid
        score -= 40;
      }
    }

    if (parts.house && String(props.housenumber || "") === parts.house) score += 15;

    if (ptype === "house" || (props.housenumber && streetMatched)) score += 6;
    if (ptype === "street" || props.osm_key === "highway") score += 4;
    if (isPlace) score += 2;

    return score;
  }
  function featureStreetMatched(f, parts) {
    var wantStreetCore = streetCore(parts.street);
    if (!wantStreetCore) return true;
    var props = f.properties || {};
    var featStreetCore = streetCore(props.street || "");
    var featNameCore = streetCore(props.name || "");
    return !!(
      (featStreetCore &&
        (featStreetCore.indexOf(wantStreetCore) >= 0 ||
          wantStreetCore.indexOf(featStreetCore) >= 0)) ||
      (featNameCore &&
        (featNameCore.indexOf(wantStreetCore) >= 0 ||
          wantStreetCore.indexOf(featNameCore) >= 0))
    );
  }

  function pickPhotonFeature(features, parts, minScore) {
    var best = null;
    var bestScore = minScore;
    for (var i = 0; i < features.length; i++) {
      var s = scorePhotonFeature(features[i], parts);
      if (s > bestScore) {
        bestScore = s;
        best = features[i];
      }
    }
    return best
      ? {
          feature: best,
          score: bestScore,
          streetMatched: featureStreetMatched(best, parts)
        }
      : null;
  }

  async function fetchPhoton(query) {
    var url =
      "https://photon.komoot.io/api/?q=" +
      encodeURIComponent(query) +
      "&limit=8&lang=en";
    var res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error("Photon " + res.status);
    var data = await res.json();
    return (data && data.features) || [];
  }

  function geoFromPhoton(feature, address, weak) {
    var props = feature.properties || {};
    var coords = feature.geometry.coordinates;
    var label = photonLabel(props, address);
    if (weak) label = (label || address) + " (approximate area)";
    return {
      lat: coords[1],
      lon: coords[0],
      label: label,
      city: photonCity(props),
      provider: weak ? "Photon/OSM (approx)" : "Photon/OSM",
      weak: !!weak
    };
  }

  async function geocodePhoton(address, parts) {
    parts = parts || parseAddressParts(address);
    var queries = [];
    function addQuery(q) {
      q = String(q || "").trim();
      if (!q) return;
      if (queries.indexOf(q) === -1) queries.push(q);
    }
    addQuery(parts.raw || address);
    if (parts.street && (parts.city || parts.zip)) {
      addQuery(
        [parts.street, parts.city, parts.state, parts.zip].filter(Boolean).join(", ")
      );
    }
    if (parts.house && parts.street && (parts.city || parts.state || parts.zip)) {
      addQuery(
        [parts.house + " " + parts.street, parts.city, parts.state, parts.zip]
          .filter(Boolean)
          .join(", ")
      );
    }

    var lastErr = null;
    var weakCandidate = null;
    for (var i = 0; i < queries.length; i++) {
      try {
        var features = await fetchPhoton(queries[i]);
        var picked = pickPhotonFeature(features, parts, 15);
        if (picked) {
          if (!parts.street || picked.streetMatched) {
            return geoFromPhoton(picked.feature, address, false);
          }
          if (!weakCandidate || picked.score > weakCandidate.score) {
            weakCandidate = picked;
          }
        }
      } catch (err) {
        lastErr = err;
      }
    }
    if (weakCandidate) {
      return geoFromPhoton(weakCandidate.feature, address, true);
    }

    // Last resort: city + zip only — clearly labeled weak (prefer place centroid)
    if (parts.city && (parts.zip || parts.state)) {
      try {
        var weakQ = [parts.city, parts.state, parts.zip].filter(Boolean).join(", ");
        var weakParts = {
          raw: weakQ,
          street: "",
          house: "",
          city: parts.city,
          state: parts.state,
          zip: parts.zip
        };
        var weakFeatures = await fetchPhoton(weakQ);
        var weakPick = pickPhotonFeature(weakFeatures, weakParts, 10);
        if (weakPick) return geoFromPhoton(weakPick.feature, address, true);
      } catch (err2) {
        lastErr = err2;
      }
    }

    throw lastErr || new Error("No US match");
  }

  function geocodeCensus(address) {
    return new Promise(function (resolve, reject) {
      var cbName = "_qeCensusCb" + String(Date.now()) + Math.floor(Math.random() * 1e6);
      var script = document.createElement("script");
      var settled = false;
      var timeout = setTimeout(function () {
        cleanup();
        reject(new Error("Census timeout"));
      }, 10000);

      function cleanup() {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        try {
          delete window[cbName];
        } catch (e) {
          window[cbName] = undefined;
        }
        if (script.parentNode) script.parentNode.removeChild(script);
      }

      window[cbName] = function (data) {
        cleanup();
        try {
          var matches = (data && data.result && data.result.addressMatches) || [];
          if (!matches.length) {
            reject(new Error("Census no match"));
            return;
          }
          var hit = matches[0];
          var coords = hit.coordinates || {};
          var comps = hit.addressComponents || {};
          var lat = parseFloat(coords.y);
          var lon = parseFloat(coords.x);
          if (!isFinite(lat) || !isFinite(lon)) {
            reject(new Error("Census bad coords"));
            return;
          }
          resolve({
            lat: lat,
            lon: lon,
            label: hit.matchedAddress || address,
            city: titleCaseCity(comps.city || ""),
            provider: "US Census"
          });
        } catch (err) {
          reject(err);
        }
      };

      script.async = true;
      script.src =
        "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=" +
        encodeURIComponent(address) +
        "&benchmark=Public_AR_Current&format=jsonp&callback=" +
        encodeURIComponent(cbName);
      script.onerror = function () {
        cleanup();
        reject(new Error("Census script error"));
      };
      document.head.appendChild(script);
    });
  }

  async function geocodeNominatim(address, parts) {
    parts = parts || parseAddressParts(address);
    var queries = [address];
    if (parts.street && parts.city) {
      queries.push(
        [parts.street, parts.city, parts.state, parts.zip, "USA"].filter(Boolean).join(", ")
      );
    }
    var lastErr = null;
    for (var q = 0; q < queries.length; q++) {
      try {
        var url =
          "https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=5&countrycodes=us&q=" +
          encodeURIComponent(queries[q]) +
          "&email=" +
          encodeURIComponent("Daniel@cprhomepros.com");
        var res = await fetch(url, {
          headers: { Accept: "application/json", "Accept-Language": "en" }
        });
        if (!res.ok) throw new Error("Nominatim " + res.status);
        var data = await res.json();
        if (!data || !data.length) continue;
        for (var i = 0; i < data.length; i++) {
          var hit = data[i];
          var addr = hit.address || {};
          var city = addr.city || addr.town || addr.village || addr.hamlet || "";
          var state = addr.state || "";
          var postcode = String(addr.postcode || "").slice(0, 5);
          if (parts.zip && postcode && postcode !== parts.zip) continue;
          if (parts.state) {
            var st = stateAbbr(state);
            var ws = stateAbbr(parts.state);
            if (st && ws && st !== ws) continue;
          }
          if (parts.city) {
            var cnorm = normalizeToken(city || addr.county || "");
            var wcity = normalizeToken(parts.city);
            if (cnorm && cnorm.indexOf(wcity) < 0 && wcity.indexOf(cnorm) < 0) continue;
          }
          return {
            lat: parseFloat(hit.lat),
            lon: parseFloat(hit.lon),
            label: hit.display_name || address,
            city: city || addr.county || "",
            provider: "Nominatim/OSM"
          };
        }
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr || new Error("No match");
  }

  async function geocode(address) {
    var parts = parseAddressParts(address);
    try {
      return await geocodeCensus(address);
    } catch (eCensus) {
      try {
        return await geocodePhoton(address, parts);
      } catch (ePhoton) {
        try {
          return await geocodeNominatim(address, parts);
        } catch (eNom) {
          throw new Error("Couldn't look up that address");
        }
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
      if (note) {
        note.textContent =
          "We couldn’t pull an aerial footprint for this pin. Choose a home-size preset or enter approximate squares (5–100). Not a final measurement.";
      }
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
    if (step === 2) {
      ensureMap(root);
      if (root._qeBuildingEstimate) applyBuildingEstimate(root, root._qeBuildingEstimate);
    }
    if (step === 4) updatePreview(root, true);
    var focusSel =
      step === 1
        ? '[name="qe-address"]'
        : step === 3
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

  function updatePreview(root, unlocked) {
    var form = root.querySelector(".qe-form");
    if (!form) return null;
    var squares = resolveSquares(form);
    var stories = form.querySelector('[name="qe-stories"]').value || "1";
    var material = selectedMaterial(form);
    var result = calc(squares, stories, material);
    var out = root.querySelector("[data-qe-range]");
    var meta = root.querySelector("[data-qe-meta]");
    var showMoney = unlocked === true || root._qeContactUnlocked === true;
    if (out) {
      out.textContent = showMoney
        ? formatMoney(result.low) + " – " + formatMoney(result.high)
        : "Complete your info to unlock the preliminary range";
    }
    if (meta) {
      meta.textContent = showMoney
        ? "~" +
          result.squares +
          " squares · " +
          (MAT_LABEL[material] || MAT_LABEL.hdz) +
          " · Denver / Lake Norman / Charlotte metro · preliminary only"
        : "Range unlocks after name, phone, email, and property address.";
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
    var note = root.querySelector("[data-qe-building-note]");
    if (mode === "squares" && root._qeBuildingEstimate && note) {
      var sq = resolveSquares(form);
      if (sq === root._qeBuildingEstimate.squares) {
        note.textContent = root._qeBuildingEstimate.note;
      } else {
        note.textContent =
          "Approx. " +
          sq +
          " squares (adjusted). Aerial/satellite data is a starting point only — not a final measurement. Pitch, layers, waste, and extras change the number.";
      }
    }
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
          L.tileLayer(
            "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
            {
              maxZoom: 19,
              attribution:
                'Tiles &copy; <a href="https://www.esri.com/">Esri</a> — Maxar, Earthstar Geographics'
            }
          ).addTo(root._qeMap);
          L.tileLayer(
            "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
            {
              maxZoom: 19,
              opacity: 0.85,
              attribution: ""
            }
          ).addTo(root._qeMap);
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
          "Map couldn’t load — you can still continue. Address: " + (geo.label || ""),
          "err"
        );
      });
  }

  function payloadFrom(form, result, root) {
    var now = new Date();
    var material = selectedMaterial(form);
    var geo = root._qeGeo || {};
    var sourceKey = resolveSquareSource(root, form);
    return {
      _subject: "CPR Instant Quote Lead",
      _template: "table",
      _captcha: "false",
      Name: form.querySelector('[name="qe-name"]').value.trim(),
      Phone: form.querySelector('[name="qe-phone"]').value.trim(),
      Email: form.querySelector('[name="qe-email"]').value.trim(),
      Address: (root._qeAddress || form.querySelector('[name="qe-address"]').value).trim(),
      City: (form.querySelector('[name="qe-city"]') || {}).value
        ? form.querySelector('[name="qe-city"]').value.trim()
        : geo.city || "",
      GeocodedLabel: geo.label || "",
      Latitude: geo.lat != null ? String(geo.lat) : "",
      Longitude: geo.lon != null ? String(geo.lon) : "",
      GeocodeProvider: geo.provider || "",
      HomeSize: form.querySelector('[name="qe-home-size"]').value,
      SizeMode: (form.querySelector('[name="qe-size-mode"]:checked') || {}).value || "preset",
      RoofSquares: String(result.squares),
      RoofSquareSource: squareSourceLabel(sourceKey),
      RoofSquareSourceKey: sourceKey,
      BuildingFootprintSqFt: root._qeBuildingEstimate
        ? String(root._qeBuildingEstimate.footprintSqFt)
        : "",
      EstimatedRoofAreaSqFt: root._qeBuildingEstimate
        ? String(root._qeBuildingEstimate.roofSqFt)
        : "",
      Stories: form.querySelector('[name="qe-stories"]').value,
      Product: MAT_LABEL[material] || material,
      ProductKey: material,
      BallparkLow: formatMoney(result.low),
      BallparkHigh: formatMoney(result.high),
      BallparkShown: formatMoney(result.low) + " – " + formatMoney(result.high),
      RateFloorPerSquare: "$" + result.rateLow,
      RateHighPerSquare: "$" + result.rateHigh,
      Disclaimer:
        "Rough web estimate only — actual price depends on measured squares, pitch, stories, tear-off, decking, access, flashings, and options; final pricing after inspection. Not an insurance quote. We don’t waive deductibles.",
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
        var cityInput = form.querySelector('[name="qe-city"]');
        if (cityInput && !cityInput.value.trim() && geo.city) {
          cityInput.value = geo.city;
        }
        root._qeEstimatePromise = estimateBuildingSquares(geo)
          .then(function (estimate) {
            applyBuildingEstimate(root, estimate);
            return estimate;
          })
          .catch(function () {
            applyBuildingEstimate(root, null);
            return null;
          });
        showStep(root, 2);
        if (geo.weak) {
          setStatus(
            root,
            "We couldn’t pin the exact house number — showing the local area. Confirm the pin or enter squares manually.",
            "pending"
          );
        }
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
      if (!form.querySelector('[name="qe-material"]:checked')) {
        setStatus(root, "Pick a GAF product to continue.", "err");
        return;
      }
      var estimateBtn = root.querySelector('[data-qe-step="2"] [data-qe-next]');
      if (root._qeEstimatePromise) {
        if (estimateBtn) {
          estimateBtn.disabled = true;
          estimateBtn.dataset.label = estimateBtn.textContent;
          estimateBtn.textContent = "Confirming square estimate…";
        }
        setStatus(root, "Pulling approximate squares from map data…", "pending");
        await root._qeEstimatePromise;
        if (estimateBtn) {
          estimateBtn.disabled = false;
          estimateBtn.textContent = estimateBtn.dataset.label || "Confirm squares →";
        }
      }
      var sq = resolveSquares(form);
      if (sq < MANUAL_MIN_SQ || sq > MAX_SQUARES) {
        setStatus(root, "Enter between " + MANUAL_MIN_SQ + " and " + MAX_SQUARES + " squares.", "err");
        return;
      }
      showStep(root, 3);
      return;
    }

    if (step === 3) {
      var name = form.querySelector('[name="qe-name"]');
      var phone = form.querySelector('[name="qe-phone"]');
      var email = form.querySelector('[name="qe-email"]');
      var city = form.querySelector('[name="qe-city"]');
      if (!name.value.trim() || !phone.value.trim() || !email.value.trim() || !city.value.trim()) {
        form.reportValidity();
        setStatus(root, "Name, phone, email, and city are required before any dollar range.", "err");
        return;
      }
      if (!email.checkValidity()) {
        email.reportValidity();
        return;
      }
      if (!(root._qeAddress || form.querySelector('[name="qe-address"]').value || "").trim()) {
        setStatus(root, "Property address is required.", "err");
        showStep(root, 1);
        return;
      }

      root._qeContactUnlocked = true;
      var result = updatePreview(root, true);
      var btn = root.querySelector('[data-qe-step="3"] [data-qe-next]');
      if (btn) {
        btn.disabled = true;
        btn.dataset.label = btn.textContent;
        btn.textContent = "Sending…";
      }
      setStatus(root, "Saving your info and preparing the preliminary range…", "pending");

      var body = payloadFrom(form, result, root);
      root._qeLeadBody = body;
      var notified = await notifyLead(body);
      root._qeNotifyOk = notified;
      applyDoneMessaging(root, body, notified);
      showStep(root, 4);
      // showStep clears status — set notify outcome after
      if (notified) {
        setStatus(root, "", "");
      } else {
        setStatus(
          root,
          "We couldn’t email automatically — call/text (704) 280-5996 or use Email this estimate. Showing your preliminary range anyway.",
          "err"
        );
      }
      if (btn) {
        btn.disabled = false;
        btn.textContent = btn.dataset.label || "See preliminary range →";
      }
      return;
    }
  }

  async function notifyLead(body) {
    try {
      var controller = window.AbortController ? new AbortController() : null;
      var timeout = setTimeout(function () {
        if (controller) controller.abort();
      }, 12000);
      var options = {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify(body)
      };
      if (controller) options.signal = controller.signal;
      try {
        var res = await fetch("https://formsubmit.co/ajax/Daniel@cprhomepros.com", options);
        clearTimeout(timeout);
        if (!res.ok) throw new Error("notify http " + res.status);
        var data = await res.json().catch(function () {
          return {};
        });
        if (data && (data.success === "false" || data.success === false)) throw new Error("notify rejected");
        return true;
      } catch (err) {
        clearTimeout(timeout);
        throw err;
      }
    } catch (e1) {
      try {
        var fd = new FormData();
        Object.keys(body).forEach(function (key) {
          if (body[key] != null) fd.append(key, String(body[key]));
        });
        var res2 = await fetch("https://formsubmit.co/ajax/Daniel@cprhomepros.com", {
          method: "POST",
          headers: { Accept: "application/json" },
          body: fd
        });
        if (!res2.ok) throw new Error("notify form " + res2.status);
        var data2 = await res2.json().catch(function () {
          return {};
        });
        if (data2 && (data2.success === "false" || data2.success === false)) throw new Error("notify rejected");
        return true;
      } catch (e2) {
        return false;
      }
    }
  }

  function mailtoHrefForLead(body) {
    var lines = [
      "CPR Instant Quote Lead",
      "",
      "Name: " + (body.Name || ""),
      "Phone: " + (body.Phone || ""),
      "Email: " + (body.Email || ""),
      "Address: " + (body.Address || ""),
      "City: " + (body.City || ""),
      "Product: " + (body.Product || ""),
      "Squares: " + (body.RoofSquares || ""),
      "Ballpark: " + (body.BallparkShown || ""),
      "Geocoded: " + (body.GeocodedLabel || ""),
      "Provider: " + (body.GeocodeProvider || ""),
      "Source: " + (body.SourcePage || ""),
      "Time: " + (body.Timestamp || "")
    ];
    return (
      "mailto:Daniel@cprhomepros.com?subject=" +
      encodeURIComponent(body._subject || "CPR Instant Quote Lead") +
      "&body=" +
      encodeURIComponent(lines.join("\n"))
    );
  }

  function applyDoneMessaging(root, body, notified) {
    var doneRange = root.querySelector("[data-qe-done-range]");
    if (doneRange) doneRange.textContent = body.BallparkShown || "";
    var title = root.querySelector("[data-qe-done-title]");
    var copy = root.querySelector("[data-qe-done-copy]");
    var mail = root.querySelector("[data-qe-done-mailto]");
    if (notified) {
      if (title) title.textContent = "You’re on our list";
      if (copy) {
        copy.innerHTML =
          "Your preliminary range of <strong data-qe-done-range></strong> was sent to our team. We’ll follow up to schedule a <strong>free inspection</strong>.";
        var r = copy.querySelector("[data-qe-done-range]");
        if (r) r.textContent = body.BallparkShown || "";
      }
      if (mail) mail.hidden = true;
    } else {
      if (title) title.textContent = "Your preliminary range is ready";
      if (copy) {
        copy.innerHTML =
          "Your preliminary range is <strong data-qe-done-range></strong>. We couldn’t email our team automatically — please call/text <a href=\"tel:+17042805996\">(704) 280-5996</a> or tap Email this estimate so we can schedule your free inspection.";
        var r2 = copy.querySelector("[data-qe-done-range]");
        if (r2) r2.textContent = body.BallparkShown || "";
      }
      if (mail) {
        mail.hidden = false;
        mail.setAttribute("href", mailtoHrefForLead(body));
      }
    }
  }

  function goBack(root) {
    var step = root._qeStep || 1;
    if (step === 4) {
      // Don't re-lock if they already unlocked; just navigate
      showStep(root, 3);
      return;
    }
    if (step > 1) showStep(root, step - 1);
  }

  function onSubmit(e, root) {
    e.preventDefault();
    if (root._qeStep !== 4) {
      goNext(root);
      return;
    }
  }

  function init(root) {
    if (!root || root.dataset.qeReady) return;
    root.dataset.qeReady = "1";
    root._qeStep = 1;
    root._qeContactUnlocked = false;
    var form = root.querySelector(".qe-form");
    if (!form) return;

    form.addEventListener("change", function (e) {
      if (e.target && e.target.name === "qe-size-mode") toggleSizeMode(root);
      if (e.target && (e.target.name === "qe-squares" || e.target.name === "qe-home-size")) {
        toggleSizeMode(root);
      }
    });
    form.addEventListener("input", function (e) {
      if (e.target && e.target.name === "qe-squares") toggleSizeMode(root);
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

    var addr = form.querySelector('[name="qe-address"]');
    if (addr) {
      addr.addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
          e.preventDefault();
          goNext(root);
        }
      });
    }

    root.querySelectorAll(".qe-product").forEach(function (card) {
      card.addEventListener("click", function (e) {
        if (e.target && e.target.tagName === "INPUT") return;
        var radio = card.querySelector('input[type="radio"]');
        if (radio) radio.checked = true;
      });
    });

    toggleSizeMode(root);
    showStep(root, 1);
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

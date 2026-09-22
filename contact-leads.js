(function () {
  "use strict";
  function endpoint() {
    return String((window.CPR_LEADS_ENDPOINT || "")).trim();
  }
  function payloadFromForm(form) {
    var fd = new FormData(form);
    var data = {};
    fd.forEach(function (value, key) {
      if (key === "attachment") return; // files: ask homeowner to text photos
      if (typeof value === "string") data[key] = value.trim();
    });
    data._subject = data._subject || "CPR website lead — Contact form";
    data.SourcePage = location.pathname;
    data.Timestamp =
      new Date().toLocaleString("en-US", { timeZone: "America/New_York" }) + " ET";
    var fileInput = form.querySelector('input[type="file"]');
    if (fileInput && fileInput.files && fileInput.files.length) {
      data.PhotoNote =
        "Homeowner selected a photo in the form — ask them to text it to (704) 280-5996 (Apps Script email path does not accept uploads).";
    }
    return data;
  }
  function boot() {
    var form = document.querySelector("form[data-cpr-leads-form]");
    if (!form || form.dataset.bound) return;
    form.dataset.bound = "1";
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var url = endpoint();
      var status = form.querySelector("[data-cpr-lead-status]");
      if (!status) {
        status = document.createElement("p");
        status.setAttribute("data-cpr-lead-status", "");
        status.setAttribute("role", "status");
        form.appendChild(status);
      }
      if (!url) {
        status.textContent =
          "Lead email is not connected yet. Call/text (704) 280-5996 or email Daniel@cprhomepros.com.";
        return;
      }
      var btn = form.querySelector('[type="submit"]');
      if (btn) {
        btn.disabled = true;
        btn.dataset.label = btn.textContent;
        btn.textContent = "Sending…";
      }
      status.textContent = "Sending…";
      var body = payloadFromForm(form);
      fetch(url, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(body)
      })
        .then(function () {
          status.textContent = "Thanks — we got it. We'll follow up soon.";
          form.reset();
          if (location.search.indexOf("submitted=1") === -1) {
            history.replaceState(null, "", location.pathname + "?submitted=1");
          }
        })
        .catch(function () {
          status.textContent =
            "Couldn’t send automatically — call/text (704) 280-5996.";
        })
        .finally(function () {
          if (btn) {
            btn.disabled = false;
            btn.textContent = btn.dataset.label || "Send";
          }
        });
    });
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();

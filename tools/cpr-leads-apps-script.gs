/**
 * CPR website leads — Instant Quote + Contact
 * Deploy: Deploy → Manage deployments → Edit → New version
 *   (or New deployment → Web app, Execute as: Me, Who has access: Anyone)
 * Then confirm CPR_LEADS_ENDPOINT in leads-config.js still matches the Web app URL.
 */

var NOTIFY_TO = 'cpr2643@gmail.com, Daniel@cprhomepros.com';

function doGet() {
  return ContentService.createTextOutput(
    JSON.stringify({ ok: true, service: 'CPR leads' })
  ).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    var data = parseBody_(e);
    var subject =
      String(data._subject || data.subject || 'CPR Website Lead').slice(0, 180);
    var replyTo = String(data.Email || data.email || data.ReplyTo || '').trim();
    var lines = [];
    Object.keys(data)
      .filter(function (k) {
        return k && k.charAt(0) !== '_' && data[k] !== '' && data[k] != null;
      })
      .sort()
      .forEach(function (k) {
        lines.push(k + ': ' + data[k]);
      });
    if (!lines.length) {
      lines.push('(empty payload)');
    }
    var options = {
      to: NOTIFY_TO,
      subject: subject,
      body: lines.join('\n'),
      name: 'CPR Website'
    };
    if (replyTo && /@/.test(replyTo)) {
      options.replyTo = replyTo;
    }
    MailApp.sendEmail(options);
    return ContentService.createTextOutput(
      JSON.stringify({ ok: true })
    ).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(
      JSON.stringify({ ok: false, error: String(err) })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}

function parseBody_(e) {
  if (!e) return {};
  if (e.parameter && Object.keys(e.parameter).length) {
    var fromParams = {};
    Object.keys(e.parameter).forEach(function (k) {
      fromParams[k] = e.parameter[k];
    });
    if (e.postData && e.postData.contents) {
      try {
        var parsed = JSON.parse(e.postData.contents);
        if (parsed && typeof parsed === 'object') return parsed;
      } catch (ignore) {}
    }
    return fromParams;
  }
  if (e.postData && e.postData.contents) {
    try {
      return JSON.parse(e.postData.contents);
    } catch (ignore2) {
      return { raw: e.postData.contents };
    }
  }
  return {};
}

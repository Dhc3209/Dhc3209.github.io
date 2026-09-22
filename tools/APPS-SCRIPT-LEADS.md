# CPR leads — Google Apps Script deploy

1. Open https://script.google.com/ while signed into the Google account that can send as / to Daniel@cprhomepros.com
2. New project → name it `CPR Website Leads`
3. Delete any stub code; paste contents of `cpr-leads-apps-script.gs`
4. Save
5. Deploy → New deployment → Type: **Web app**
   - Description: CPR Instant Quote + Contact
   - Execute as: **Me**
   - Who has access: **Anyone**
6. Authorize the MailApp permission when prompted
7. Copy the Web app URL (`https://script.google.com/macros/s/.../exec`)
8. Put that URL into `leads-config.js` as `window.CPR_LEADS_ENDPOINT = "..."`
9. Redeploy site (App Builder syncs github.io)

Test: submit Instant Quote or Contact; email should arrive at Daniel@cprhomepros.com.

/**
 * Gmail relay for the LMS server — paste this into a Google Apps Script project.
 *
 * Why: Render's free plan blocks SMTP, and Brevo/Resend need a verified sender
 * or domain. This script runs inside YOUR Google account and sends mail from
 * your Gmail. The LMS server calls it over normal HTTPS, so there is no SMTP.
 *
 * Setup (about 3 minutes):
 *  1. Open https://script.google.com while signed in to the Gmail account that
 *     should send the emails → New project.
 *  2. Delete the sample code, paste this whole file, and replace SECRET below
 *     with a long random string (letters and numbers only).
 *  3. Click Deploy → New deployment → gear icon → "Web app".
 *       Execute as:      Me
 *       Who has access:  Anyone
 *     Click Deploy, then Authorize access and allow it to send email as you.
 *     (Google may show "Google hasn't verified this app": click Advanced →
 *      Go to <project name> (unsafe). It's your own script, so this is expected.)
 *  4. Copy the Web app URL (ends in /exec).
 *  5. On Render (and in server/.env for local dev) set:
 *       GMAIL_SCRIPT_URL=<the /exec URL>
 *       GMAIL_SCRIPT_SECRET=<the same SECRET as below>
 *
 * If you edit this script later: Deploy → Manage deployments → edit (pencil) →
 * Version: "New version" → Deploy. The URL stays the same.
 *
 * Limit: about 100 emails per day on a free Gmail account (1,500 on Workspace).
 */

const SECRET = "CHANGE_ME_TO_A_LONG_RANDOM_STRING";

function doPost(e) {
  try {
    const data = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    if (SECRET.indexOf("CHANGE_ME") === 0) return json_({ ok: false, error: "Set SECRET in the Apps Script first" });
    if (data.secret !== SECRET) return json_({ ok: false, error: "Wrong secret (GMAIL_SCRIPT_SECRET doesn't match)" });
    if (!data.to || !data.subject || !data.html) return json_({ ok: false, error: "Missing to, subject or html" });

    if (MailApp.getRemainingDailyQuota() < 1) {
      return json_({ ok: false, error: "Daily Gmail sending limit reached" });
    }

    MailApp.sendEmail({
      to: String(data.to),
      subject: String(data.subject),
      htmlBody: String(data.html),
      name: String(data.name || "LMS"),
    });
    return json_({ ok: true, remaining: MailApp.getRemainingDailyQuota() });
  } catch (err) {
    return json_({ ok: false, error: String((err && err.message) || err) });
  }
}

/** Open the /exec URL in a browser to check the deployment works. */
function doGet() {
  return json_({ ok: true, service: "lms-gmail-relay", remainingToday: MailApp.getRemainingDailyQuota() });
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

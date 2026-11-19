// One Google Sheet row per lead. Rows are written with valueInputOption RAW,
// so values like "+639..." stay text instead of turning into numbers/formulas.
// Pure module: no Node APIs, so it runs under the jsc test runner.

export const HEADER = ["Received", "Page", "Source", "Name", "Phone", "Email", "What they said", "Status", "Replied at", "Reply text", "Follow-ups", "Last follow-up"];

const SOURCE = { form: "Lead form", message: "Page message", comment: "Post comment" };
const STATUS = { waiting: "Waiting", followup: "Follow-up", sent: "Replied", skipped: "Skipped", failed: "Failed", cold: "Cold" };

// Manila has no daylight saving, so a fixed +8h is exact (jsc has no Intl time zones).
export function fmtManila(ms) {
  if (ms === undefined || ms === null) return "";
  const d = new Date(ms + 8 * 3600e3);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

export function leadToRow(lead, pageName) {
  return [
    fmtManila(lead.receivedAt), pageName || "", SOURCE[lead.source] || lead.source, lead.name || "",
    lead.phone || "", lead.email || "", lead.said || "", STATUS[lead.status] || lead.status,
    fmtManila(lead.sentAt), lead.sentText || "", String(lead.followUps || 0), fmtManila(lead.lastFollowUpAt),
  ];
}

export function rowFromUpdatedRange(range) {
  const m = /![A-Z]+(\d+)/.exec(range || "");
  return m ? Number(m[1]) : null;
}

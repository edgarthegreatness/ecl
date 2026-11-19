// Which channel each lead source replies on, and Facebook's reply windows.
// Pure module: no Node APIs, so it runs under the jsc test runner.
const H = 3600e3;

export const CHANNEL = { form: "email", message: "messenger", comment: "private_reply" };

// When Facebook stops letting the Page reply (epoch ms), or null for no limit.
export function windowEndsAt(lead) {
  if (lead.source === "message") return (lead.lastInboundAt ?? lead.receivedAt) + 24 * H;
  if (lead.source === "comment") return lead.receivedAt + 7 * 24 * H;
  return null;
}

// Server-side gate for every send. The UI shows the same reason.
export function canSend(lead, now) {
  if (lead.source === "form") {
    if (lead.email) return { ok: true };
    return { ok: false, reason: lead.phone ? "No email: call or text" : "No contact details" };
  }
  if (lead.source === "comment" && (lead.replyCount || 0) >= 1)
    return { ok: false, reason: "Already replied to this comment" };
  const end = windowEndsAt(lead);
  if (end !== null && now > end)
    return { ok: false, reason: lead.source === "message" ? "Messenger window closed" : "Reply window closed" };
  return { ok: true };
}

// Countdown for the card: 'none' (no window), 'ok', 'warn' (under warnH[source] hours), 'closed'.
export function clock(lead, now, warnH = {}) {
  const end = windowEndsAt(lead);
  if (end === null) return { level: "none", hoursLeft: null };
  const hoursLeft = Math.round(((end - now) / H) * 10) / 10;
  if (hoursLeft <= 0) return { level: "closed", hoursLeft: 0 };
  const w = warnH[lead.source];
  return { level: w !== undefined && hoursLeft <= w ? "warn" : "ok", hoursLeft };
}

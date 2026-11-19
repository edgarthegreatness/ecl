// Follow-up reminders, checked every 15 minutes by the scheduled function.
// Never sends anything: it only drafts a follow-up and tells the owner.
// Pure module: no Node APIs, so it runs under the jsc test runner.
import { canSend, clock } from "./rules.js";
import { renderDraft } from "./leads.js";

const H = 3600e3;

export const DEFAULT_REMINDERS = { unrepliedAfterH: 1, quietAfterH: 48, maxFollowUps: 2, windowWarnH: { message: 3, comment: 24 } };

const none = (lead) => ({ lead, notify: null });

export function evaluate(lead, now, settings = DEFAULT_REMINDERS, followupTemplate = "") {
  const s = { ...DEFAULT_REMINDERS, ...settings };
  const reminded = lead.reminded || {};

  if (lead.status === "waiting" || lead.status === "followup") {
    const c = clock(lead, now, s.windowWarnH);
    if (c.level === "warn" && canSend(lead, now).ok && !reminded.window) {
      return { lead: { ...lead, reminded: { ...reminded, window: now } }, notify: { type: "window", text: `Reply window closes in ${c.hoursLeft}h` } };
    }
  }

  if (lead.status === "waiting" && !reminded.unreplied) {
    const since = lead.lastInboundAt ?? lead.receivedAt;
    if (now - since >= s.unrepliedAfterH * H) {
      return { lead: { ...lead, reminded: { ...reminded, unreplied: now } }, notify: { type: "unreplied", text: "Not replied yet" } };
    }
  }

  if (lead.status === "sent") {
    const answered = lead.lastInboundAt !== undefined && lead.lastInboundAt > (lead.sentAt || 0);
    const quietSince = Math.max(lead.sentAt || 0, lead.lastFollowUpAt || 0);
    if (answered || now - quietSince < s.quietAfterH * H) return none(lead);
    if ((lead.followUps || 0) >= s.maxFollowUps) {
      return { lead: { ...lead, status: "cold" }, notify: { type: "cold", text: `No answer after ${s.maxFollowUps} follow-ups: marked cold` } };
    }
    const bumped = { ...lead, followUps: (lead.followUps || 0) + 1, lastFollowUpAt: now };
    if (canSend(lead, now).ok) {
      return { lead: { ...bumped, status: "followup", draft: renderDraft(followupTemplate, lead) }, notify: { type: "quiet", text: "No answer yet: follow-up drafted for you" } };
    }
    if (lead.phone) return { lead: bumped, notify: { type: "call", text: `No answer and the chat window is closed: call or text ${lead.phone}` } };
  }

  return none(lead);
}

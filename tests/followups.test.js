import { test, assert, done } from "./assert.js";
import { DEFAULT_REMINDERS, evaluate } from "../lib/core/followups.js";
import { DEFAULT_TEMPLATES } from "../lib/core/leads.js";

const H = 3600e3, T0 = Date.UTC(2026, 10, 19, 0, 0);
const S = DEFAULT_REMINDERS, F = DEFAULT_TEMPLATES.followup;
const base = { followUps: 0, replyCount: 0, reminded: {}, receivedAt: T0 };
const formLead = (o = {}) => ({ ...base, source: "form", name: "Maria Santos", email: "m@x.co", phone: "+63 917", status: "waiting", ...o });
const msgLead = (o = {}) => ({ ...base, source: "message", name: "Jun Reyes", lastInboundAt: T0, status: "waiting", ...o });
const cmtLead = (o = {}) => ({ ...base, source: "comment", name: "Ana Cruz", status: "waiting", ...o });

test("defaults match the design", () => assert.deepEqual(DEFAULT_REMINDERS, { unrepliedAfterH: 1, quietAfterH: 48, maxFollowUps: 2, windowWarnH: { message: 3, comment: 24 } }));

test("waiting 30 min → no reminder", () => assert.equal(evaluate(formLead(), T0 + 0.5 * H, S, F).notify, null));
test("waiting 2h → unreplied once, not twice", () => {
  const r1 = evaluate(formLead(), T0 + 2 * H, S, F);
  assert.equal(r1.notify.type, "unreplied");
  assert.equal(evaluate(r1.lead, T0 + 3 * H, S, F).notify, null);
});
test("unreplied counts from the latest inbound message on a reopened lead", () =>
  assert.equal(evaluate(msgLead({ receivedAt: T0 - 100 * H, lastInboundAt: T0 }), T0 + 0.5 * H, S, F).notify, null));

test("message 2h before its window closes → urgent window reminder first", () => {
  const r1 = evaluate(msgLead(), T0 + 22 * H, S, F);
  assert.equal(r1.notify.type, "window");
  assert.equal(r1.lead.reminded.window, T0 + 22 * H);
  assert.equal(evaluate(r1.lead, T0 + 22.5 * H, S, F).notify.type, "unreplied");
});
test("comment with 20h left (warn 24h) → window reminder", () =>
  assert.equal(evaluate(cmtLead({ receivedAt: T0 - 6 * 24 * H + 20 * H - 20 * H }), T0 + 4 * H, S, F).notify.type, "window"));

test("sent form lead quiet 49h → follow-up drafted for approval", () => {
  const r = evaluate(formLead({ status: "sent", sentAt: T0 }), T0 + 49 * H, S, F);
  assert.equal(r.notify.type, "quiet");
  assert.equal(r.lead.status, "followup"); assert.equal(r.lead.followUps, 1); assert.equal(r.lead.lastFollowUpAt, T0 + 49 * H);
  assert.ok(r.lead.draft.startsWith("Hi Maria, just checking in"), r.lead.draft);
});
test("quiet clock restarts from the last follow-up that was sent", () =>
  assert.equal(evaluate(formLead({ status: "sent", sentAt: T0 + 40 * H, lastFollowUpAt: T0 + 30 * H, followUps: 1 }), T0 + 60 * H, S, F).notify, null));
test("after max follow-ups → cold", () => {
  const r = evaluate(formLead({ status: "sent", sentAt: T0, followUps: 2 }), T0 + 49 * H, S, F);
  assert.equal(r.notify.type, "cold"); assert.equal(r.lead.status, "cold");
});
test("lead answered after our reply → no quiet reminder", () =>
  assert.equal(evaluate(msgLead({ status: "sent", sentAt: T0, lastInboundAt: T0 + H }), T0 + 49 * H, S, F).notify, null));
test("comment already privately replied, no phone → dropped from follow-ups", () =>
  assert.equal(evaluate(cmtLead({ status: "sent", sentAt: T0, replyCount: 1 }), T0 + 49 * H, S, F).notify, null));
test("message lead quiet with closed window and a phone → call reminder", () => {
  const r = evaluate(msgLead({ status: "sent", sentAt: T0, phone: "+63 905" }), T0 + 49 * H, S, F);
  assert.equal(r.notify.type, "call"); assert.equal(r.lead.followUps, 1); assert.equal(r.lead.status, "sent");
});
test("skipped and cold leads are left alone", () => {
  assert.equal(evaluate(formLead({ status: "skipped" }), T0 + 99 * H, S, F).notify, null);
  assert.equal(evaluate(formLead({ status: "cold", sentAt: T0 }), T0 + 99 * H, S, F).notify, null);
});

done();

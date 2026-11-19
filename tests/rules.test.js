import { test, assert, done } from "./assert.js";
import { CHANNEL, windowEndsAt, canSend, clock } from "../lib/core/rules.js";

const H = 3600e3, D = 24 * H, T0 = Date.UTC(2026, 10, 19, 0, 0);
const form = (o = {}) => ({ source: "form", receivedAt: T0, replyCount: 0, ...o });
const msg = (o = {}) => ({ source: "message", receivedAt: T0, lastInboundAt: T0, replyCount: 0, ...o });
const cmt = (o = {}) => ({ source: "comment", receivedAt: T0, replyCount: 0, ...o });
const warn = { message: 3, comment: 24 };

test("channels per source", () => assert.deepEqual(CHANNEL, { form: "email", message: "messenger", comment: "private_reply" }));

test("form with email can send", () => assert.deepEqual(canSend(form({ email: "a@b.co" }), T0), { ok: true }));
test("form without email but phone → call or text", () =>
  assert.deepEqual(canSend(form({ phone: "+63 917" }), T0), { ok: false, reason: "No email: call or text" }));
test("form with no email and no phone → no contact details", () =>
  assert.deepEqual(canSend(form(), T0), { ok: false, reason: "No contact details" }));

test("message 23h after last inbound can send", () => assert.equal(canSend(msg(), T0 + 23 * H).ok, true));
test("message 25h after last inbound → window closed", () =>
  assert.deepEqual(canSend(msg(), T0 + 25 * H), { ok: false, reason: "Messenger window closed" }));
test("message window counts from the latest inbound, not first contact", () =>
  assert.equal(canSend(msg({ lastInboundAt: T0 + 20 * H }), T0 + 30 * H).ok, true));

test("comment already replied once → refused", () =>
  assert.deepEqual(canSend(cmt({ replyCount: 1 }), T0 + H), { ok: false, reason: "Already replied to this comment" }));
test("comment 8 days old → reply window closed", () =>
  assert.deepEqual(canSend(cmt(), T0 + 8 * D), { ok: false, reason: "Reply window closed" }));
test("comment 6 days old can send", () => assert.equal(canSend(cmt(), T0 + 6 * D).ok, true));

test("windowEndsAt per source", () => {
  assert.equal(windowEndsAt(form()), null);
  assert.equal(windowEndsAt(msg()), T0 + 24 * H);
  assert.equal(windowEndsAt(cmt()), T0 + 7 * D);
});

test("clock: message with 2h left and warn 3 → warn", () => {
  const c = clock(msg(), T0 + 22 * H, warn);
  assert.equal(c.level, "warn"); assert.equal(c.hoursLeft, 2);
});
test("clock: message with 10h left → ok", () => assert.equal(clock(msg(), T0 + 14 * H, warn).level, "ok"));
test("clock: closed window → closed", () => assert.equal(clock(msg(), T0 + 30 * H, warn).level, "closed"));
test("clock: form has no window", () => assert.deepEqual(clock(form(), T0, warn), { level: "none", hoursLeft: null }));

done();

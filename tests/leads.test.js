import { test, assert, done } from "./assert.js";
import {
  DEFAULT_TEMPLATES, ASK_PHONE, parseWebhook, leadId, formFieldsToContact,
  newLead, renderDraft, mergeInbound, markRepliedOutside,
} from "../lib/core/leads.js";

const APP = "999";
const T = 1763510400; // seconds
const page = (changes, messaging) => ({ object: "page", entry: [{ id: "P1", time: T, ...(changes ? { changes } : {}), ...(messaging ? { messaging } : {}) }] });
const leadgen = page([{ field: "leadgen", value: { leadgen_id: "L1", page_id: "P1", form_id: "F1", created_time: T } }]);
const msgEv = (mid, text = "hi po") => page(null, [{ sender: { id: "U1" }, recipient: { id: "P1" }, timestamp: T * 1000, message: { mid, text } }]);
const echo = (appId) => page(null, [{ sender: { id: "P1" }, recipient: { id: "U1" }, timestamp: T * 1000, message: { mid: "e1", text: "reply", is_echo: true, ...(appId ? { app_id: appId } : {}) } }]);
const comment = (o = {}) => page([{ field: "feed", value: { item: "comment", verb: "add", comment_id: "C1", post_id: "P1_9", parent_id: "P1_9", from: { id: "U2", name: "Ana Cruz" }, message: "Interested! PM", created_time: T, ...o } }]);

test("leadgen change → one form event", () => {
  const ev = parseWebhook(leadgen, APP);
  assert.equal(ev.length, 1);
  assert.deepEqual([ev[0].kind, ev[0].pageId, ev[0].ref, ev[0].at], ["form", "P1", "L1", T * 1000]);
});
test("inbound message → message event with mid and text", () => {
  const [e] = parseWebhook(msgEv("m1"), APP);
  assert.deepEqual([e.kind, e.ref, e.mid, e.text], ["message", "U1", "m1", "hi po"]);
});
test("echo of our own app's send is dropped", () => assert.equal(parseWebhook(echo(999), APP).length, 0));
test("echo from someone replying in the inbox → echo event for that person", () => {
  const [e] = parseWebhook(echo(), APP);
  assert.deepEqual([e.kind, e.ref], ["echo", "U1"]);
});
test("top-level comment → comment event keyed by post and person", () => {
  const [e] = parseWebhook(comment(), APP);
  assert.deepEqual([e.kind, e.ref, e.commentId, e.fromName, e.mid], ["comment", "P1_9:U2", "C1", "Ana Cruz", "C1"]);
});
test("comment by the Page itself is dropped", () => assert.equal(parseWebhook(comment({ from: { id: "P1", name: "Page" } }), APP).length, 0));
test("reply to a comment (not top-level) is dropped", () => assert.equal(parseWebhook(comment({ parent_id: "C0" }), APP).length, 0));
test("edited/removed comment is dropped", () => assert.equal(parseWebhook(comment({ verb: "edited" }), APP).length, 0));
test("non-page objects are ignored", () => assert.equal(parseWebhook({ object: "user", entry: [] }, APP).length, 0));

test("leadId is deterministic; echo maps to the message lead", () => {
  const [m] = parseWebhook(msgEv("m1"), APP), [e] = parseWebhook(echo(), APP);
  assert.equal(leadId(m), "message:P1:U1");
  assert.equal(leadId(e), "message:P1:U1");
});

test("form fields → contact with name, email, phone and other answers", () => {
  const c = formFieldsToContact([
    { name: "first_name", values: ["Maria"] }, { name: "last_name", values: ["Santos"] },
    { name: "email", values: ["maria@example.com"] }, { name: "phone_number", values: ["+639175550142"] },
    { name: "budget", values: ["₱20–30k"] }, { name: "event_date", values: ["Dec 2026"] },
  ]);
  assert.equal(c.name, "Maria Santos"); assert.equal(c.email, "maria@example.com"); assert.equal(c.phone, "+639175550142");
  assert.ok(c.said.includes("Budget: ₱20–30k"), c.said);
  assert.ok(c.said.includes("Event Date: Dec 2026"), c.said);
});
test("full_name wins over first/last", () => assert.equal(formFieldsToContact([{ name: "full_name", values: ["Jun Reyes"] }]).name, "Jun Reyes"));

test("renderDraft: empty name falls back to 'there'", () => assert.ok(renderDraft(DEFAULT_TEMPLATES.message, { name: "" }).startsWith("Hi there!")));
test("renderDraft: no phone → ask-for-phone suffix", () => assert.ok(renderDraft("Hi {first}!", { name: "Jun Reyes" }).endsWith(ASK_PHONE)));
test("renderDraft: with phone → no suffix, first name only", () => assert.equal(renderDraft("Hi {first}!", { name: "Jun  Reyes", phone: "1" }), "Hi Jun!"));

test("newLead: waiting, drafted, dedup memory seeded", () => {
  const [e] = parseWebhook(msgEv("m1"), APP);
  const l = newLead(e, { name: "Jun Reyes", said: "hi po" }, DEFAULT_TEMPLATES.message, 5);
  assert.equal(l.id, "message:P1:U1"); assert.equal(l.status, "waiting"); assert.equal(l.followUps, 0);
  assert.equal(l.replyCount, 0); assert.deepEqual(l.seenMids, ["m1"]); assert.equal(l.lastInboundAt, T * 1000);
  assert.deepEqual(l.fbRefs, { psid: "U1" });
  assert.ok(l.draft.startsWith("Hi Jun!"));
});
test("newLead for a comment keeps the comment id for the private reply", () => {
  const [e] = parseWebhook(comment(), APP);
  const l = newLead(e, { name: "Ana Cruz", said: "Interested! PM" }, DEFAULT_TEMPLATES.comment, 5);
  assert.deepEqual(l.fbRefs, { commentId: "C1", postId: "P1_9", fromId: "U2" });
});

test("same message delivered twice → second merge changes nothing", () => {
  const [e] = parseWebhook(msgEv("m1"), APP);
  const l = newLead(e, { name: "Jun", said: "hi po" }, "x", 0);
  const r = mergeInbound(l, e, 10);
  assert.equal(r.changed, false); assert.equal(r.lead.said, "hi po");
});
test("new message on a replied lead reopens it", () => {
  const [e1] = parseWebhook(msgEv("m1"), APP), [e2] = parseWebhook(msgEv("m2", "how much?"), APP);
  const l = { ...newLead(e1, { name: "Jun", said: "hi po" }, "x", 0), status: "sent", reminded: { unreplied: 1 } };
  const r = mergeInbound(l, e2, 10);
  assert.equal(r.changed, true); assert.equal(r.reopened, true);
  assert.equal(r.lead.status, "waiting"); assert.deepEqual(r.lead.reminded, {});
  assert.equal(r.lead.said, "hi po\nhow much?"); assert.deepEqual(r.lead.seenMids, ["m1", "m2"]);
});
test("new message on a waiting lead does not count as reopened", () => {
  const [e1] = parseWebhook(msgEv("m1"), APP), [e2] = parseWebhook(msgEv("m2"), APP);
  const r = mergeInbound(newLead(e1, { name: "Jun", said: "a" }, "x", 0), e2, 10);
  assert.equal(r.changed, true); assert.equal(r.reopened, false);
});
test("markRepliedOutside sets sent and keeps the draft", () => {
  const r = markRepliedOutside({ status: "waiting", draft: "d" }, 42);
  assert.deepEqual([r.status, r.sentAt, r.draft], ["sent", 42, "d"]);
});

done();

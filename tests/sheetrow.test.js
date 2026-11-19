import { test, assert, done } from "./assert.js";
import { HEADER, leadToRow, rowFromUpdatedRange, fmtManila } from "../lib/core/sheetrow.js";

test("header has the 12 columns from the design", () =>
  assert.deepEqual(HEADER, ["Received", "Page", "Source", "Name", "Phone", "Email", "What they said", "Status", "Replied at", "Reply text", "Follow-ups", "Last follow-up"]));

test("times are written in Manila time (UTC+8)", () => assert.equal(fmtManila(Date.UTC(2026, 10, 19, 2, 5)), "2026-11-19 10:05"));
test("Manila time rolls over the date", () => assert.equal(fmtManila(Date.UTC(2026, 10, 19, 20, 0)), "2026-11-20 04:00"));

test("a replied form lead maps to a full row", () => {
  const row = leadToRow({
    source: "form", name: "Maria Santos", phone: "+63 917", email: "m@x.co", said: "Budget: 20k",
    receivedAt: Date.UTC(2026, 10, 19, 2, 5), status: "sent", sentAt: Date.UTC(2026, 10, 19, 3, 0), sentText: "Hi Maria!",
    followUps: 1, lastFollowUpAt: Date.UTC(2026, 10, 21, 3, 0),
  }, "Your Main Page");
  assert.deepEqual(row, ["2026-11-19 10:05", "Your Main Page", "Lead form", "Maria Santos", "+63 917", "m@x.co", "Budget: 20k", "Replied", "2026-11-19 11:00", "Hi Maria!", "1", "2026-11-21 11:00"]);
});
test("a waiting message lead leaves reply columns blank", () => {
  const row = leadToRow({ source: "message", name: "Jun", said: "hi", receivedAt: 0, status: "waiting", followUps: 0 }, "P");
  assert.deepEqual(row.slice(2, 12), ["Page message", "Jun", "", "", "hi", "Waiting", "", "", "0", ""]);
});
test("status labels", () => {
  const st = (status) => leadToRow({ source: "comment", status, receivedAt: 0 }, "P")[7];
  assert.deepEqual(["followup", "skipped", "failed", "cold"].map(st), ["Follow-up", "Skipped", "Failed", "Cold"]);
});
test("phone numbers are kept as text (no leading + stripped by Sheets)", () =>
  assert.equal(leadToRow({ source: "form", phone: "+639175550142", receivedAt: 0, status: "waiting" }, "P")[4], "+639175550142"));

test("row number from the Sheets append response range", () => {
  assert.equal(rowFromUpdatedRange("Leads!A12:L12"), 12);
  assert.equal(rowFromUpdatedRange("'Leads'!A7:L7"), 7);
});

done();

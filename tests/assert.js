// Tiny test helpers for the macOS jsc shell (no Node here).
let failed = 0;
export function test(name, fn) {
  try { fn(); print("ok - " + name); }
  catch (e) { failed++; print("not ok - " + name + "\n  " + (e && e.stack || e)); }
}
export function done() { if (failed) throw new Error(failed + " test(s) failed"); }
export const assert = {
  ok(v, msg) { if (!v) throw new Error(msg || "expected truthy, got " + JSON.stringify(v)); },
  equal(a, b, msg) { if (a !== b) throw new Error((msg ? msg + ": " : "") + "expected " + JSON.stringify(b) + ", got " + JSON.stringify(a)); },
  deepEqual(a, b, msg) { const x = JSON.stringify(a), y = JSON.stringify(b); if (x !== y) throw new Error((msg ? msg + ": " : "") + "expected " + y + ", got " + x); },
};

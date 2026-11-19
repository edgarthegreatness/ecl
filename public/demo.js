// In-browser stand-in for /api/* used by ?demo. Made-up data only; nothing leaves the page.
const H = 3600e3, now = Date.now();
const pages = [
  { id: "p1", name: "Your Main Page", color: "#d8b77a", connected: true },
  { id: "p2", name: "Your Events Page", color: "#7aa7d8", connected: true },
  { id: "p3", name: "Your Studio Page", color: "#c08ad8", connected: false },
];
const ok = { ok: true };
let leads = [
  { id: "form:p1:L1", pageId: "p1", source: "form", name: "Maria Santos", email: "maria.s@example.com", phone: "+63 917 555 0142", said: "Service: Event Video · Budget: ₱20–30k · Date: Dec 2026", receivedAt: now - 0.05 * H, status: "waiting", followUps: 0, draft: "Hi Maria! Thanks for filling out our form. We'd love to hear more about what you need. When's a good time for a quick 10-minute call this week?", canSend: ok, clock: { level: "none", hoursLeft: null } },
  { id: "message:p2:U1", pageId: "p2", source: "message", name: "Jun Reyes", said: "Hi, how much po for a 1-min company video?", receivedAt: now - 21.5 * H, status: "waiting", followUps: 0, draft: "Hi Jun! Thanks for messaging us. Happy to help. Could you tell me a bit more about what you're looking for? What's the best number to reach you?", canSend: ok, clock: { level: "warn", hoursLeft: 2.5 } },
  { id: "form:p1:L2", pageId: "p1", source: "form", name: "Leo Tan", email: "leo.t@example.com", phone: "+63 918 555 0199", said: "Service: Product Shoot · Budget: ₱10–20k", receivedAt: now - 52 * H, status: "followup", followUps: 1, draft: "Hi Leo, just checking in on my last message. Are you still interested? Happy to answer any questions.", canSend: ok, clock: { level: "none", hoursLeft: null } },
  { id: "form:p2:L3", pageId: "p2", source: "form", name: "Carlo Mendoza", phone: "+63 920 555 0163", said: "Event: Wedding · Guests: 150", receivedAt: now - 1.2 * H, status: "waiting", followUps: 0, draft: "Hi Carlo! Thanks for filling out our form.", canSend: { ok: false, reason: "No email: call or text" }, clock: { level: "none", hoursLeft: null } },
  { id: "comment:p1:C1", pageId: "p1", source: "comment", name: "Ana Cruz", said: "Interested! PM", receivedAt: now - 30 * H, status: "sent", followUps: 0, draft: "", canSend: { ok: false, reason: "Already replied to this comment" }, clock: { level: "ok", hoursLeft: 138 } },
];
let settings = { groups: [{ name: "Makati Small Business Owners", url: "https://www.facebook.com/groups/example1" }, { name: "Events PH Suppliers", url: "https://www.facebook.com/groups/example2" }], groupPostText: "Need a video for your business? We shoot and edit ads, reels and event highlights. Message us for rates!", reminders: { unrepliedAfterH: 1, quietAfterH: 48, maxFollowUps: 2, windowWarnH: { message: 3, comment: 24 } } };
const templates = {};
const T = { form: "Hi {first}! Thanks for filling out our form.", message: "Hi {first}! Thanks for messaging us.", comment: "Hi {first}! Saw your comment on our post.", followup: "Hi {first}, just checking in on my last message." };
const connected = () => pages.filter((p) => p.connected).map(({ id, name, color }) => ({ id, name, color }));
const wait = (v) => new Promise((r) => setTimeout(() => r(structuredClone(v)), 150));

export function demoApi(path, { method = "GET", body } = {}) {
  const [, , a, b, c] = path.split("?")[0].split("/").map(decodeURIComponent);
  if (a === "me") return wait({ pages: connected(), dataAccessExpiresAt: now + 60 * 864e5, reminders: settings.reminders });
  if (a === "pages" && b === "available") return wait(pages.map(({ id, name, connected }) => ({ id, name, connected })));
  if (a === "pages") { pages.forEach((p) => (p.connected = body.ids.includes(p.id))); return wait({ pages: connected(), warnings: [] }); }
  if (a === "leads" && !b) return wait(leads.filter((l) => pages.find((p) => p.id === l.pageId).connected));
  if (a === "leads") {
    const l = leads.find((x) => x.id === b);
    if (method === "PATCH") l.draft = body.draft;
    if (c === "skip") l.status = "skipped";
    if (c === "send") Object.assign(l, { status: "sent", sentAt: Date.now(), draft: body.text, canSend: { ok: false, reason: "Already replied" } });
    return wait(l);
  }
  if (a === "templates") { if (method === "PUT") templates[b] = body; return wait(templates[b] || T); }
  if (a === "settings") { if (method === "PUT") settings = { ...settings, ...body, reminders: { ...settings.reminders, ...(body.reminders || {}) } }; return wait(settings); }
  if (a === "posts" && method === "POST") return wait({ results: body.pageIds.map((pageId) => ({ pageId, ok: true, id: "demo" })) });
  if (a === "posts") return wait([{ id: "1", message: "Behind the scenes from last weekend's shoot ✨", time: now - 26 * H, url: "https://www.facebook.com/", scheduled: false }]);
  return Promise.reject(new Error("Not in demo"));
}

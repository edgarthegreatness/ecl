// Everything the Lead Desk screens call. Owner-only. Nothing here sends a
// message unless the owner tapped Send (POST /api/leads/:id/send).
import { json } from "../../lib/svc/http.js";
import { requireOwner } from "../../lib/svc/session.js";
import { getJSON, setJSON, del, listJSON, leadKey } from "../../lib/svc/store.js";
import { listPages, subscribePage, unsubscribePage, sendMessenger, sendPrivateReply, createPost, recentPosts } from "../../lib/svc/fb.js";
import { loadLead, saveLead } from "../../lib/svc/leadstore.js";
import { sendMail } from "../../lib/svc/mail.js";
import { env } from "../../lib/svc/config.js";
import { canSend, clock } from "../../lib/core/rules.js";
import { DEFAULT_TEMPLATES } from "../../lib/core/leads.js";
import { getSettings } from "../../lib/svc/settings.js";

const PALETTE = ["#d8b77a", "#7aa7d8", "#c08ad8", "#7ad8b0", "#d87a8a"];
const TEMPLATE_KEYS = ["form", "message", "comment", "followup"];
const OPEN = new Set(["waiting", "followup", "failed"]);
const MIN = 60e3, DAY = 864e5;

export default async (req) => {
  const uid = await requireOwner(req);
  if (uid instanceof Response) return uid;
  const url = new URL(req.url);
  const parts = url.pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  try {
    return await route(req.method, parts, url, req);
  } catch (e) {
    console.error("api", req.method, url.pathname, e);
    return json({ error: e.message }, 500);
  }
};

async function body(req) { try { return await req.json(); } catch { return {}; } }

const pagesPublic = async () => (await listJSON("pages/")).map(({ id, name, color }) => ({ id, name, color }));

function present(lead, reminders, now = Date.now()) {
  const { seenMids, ...rest } = lead;
  return { ...rest, canSend: canSend(lead, now), clock: clock(lead, now, reminders.windowWarnH) };
}

async function route(method, [a, b, c], url, req) {
  if (a === "me" && method === "GET") {
    const user = (await getJSON("user")) || {};
    return json({ pages: await pagesPublic(), dataAccessExpiresAt: user.dataAccessExpiresAt || null, reminders: (await getSettings()).reminders });
  }

  if (a === "pages" && b === "available" && method === "GET") {
    const user = await getJSON("user");
    if (!user) return json({ error: "Please sign in with Facebook again." }, 401);
    const connected = new Set((await listJSON("pages/")).map((p) => p.id));
    return json((await listPages(user.token)).map((p) => ({ id: p.id, name: p.name, connected: connected.has(p.id) })));
  }

  if (a === "pages" && !b && method === "POST") {
    const { ids = [] } = await body(req);
    const user = await getJSON("user");
    if (!user) return json({ error: "Please sign in with Facebook again." }, 401);
    const available = await listPages(user.token);
    const current = await listJSON("pages/");
    const wanted = new Set(ids.map(String));
    const warnings = [];
    for (const old of current.filter((p) => !wanted.has(p.id))) {
      try { await unsubscribePage(old.id, old.token); } catch (e) { warnings.push(`${old.name}: ${e.message}`); }
      await del(`pages/${old.id}`);
    }
    const used = new Set(current.filter((p) => wanted.has(p.id)).map((p) => p.color));
    for (const p of available.filter((x) => wanted.has(x.id))) {
      const prev = current.find((x) => x.id === p.id);
      const color = (prev && prev.color) || PALETTE.find((col) => !used.has(col)) || PALETTE[used.size % PALETTE.length];
      used.add(color);
      await setJSON(`pages/${p.id}`, { id: p.id, name: p.name, color, token: p.access_token });
      try { await subscribePage(p.id, p.access_token); } catch (e) { warnings.push(`${p.name}: ${e.message}`); }
      if (!(await getJSON(`templates/${p.id}`))) await setJSON(`templates/${p.id}`, DEFAULT_TEMPLATES);
    }
    return json({ pages: await pagesPublic(), warnings });
  }

  if (a === "leads" && !b && method === "GET") {
    const { reminders } = await getSettings();
    const open = (l) => (l.status === "waiting" || l.status === "followup" ? 0 : 1);
    const leads = (await listJSON("leads/")).sort((x, y) => open(x) - open(y) || y.receivedAt - x.receivedAt);
    return json(leads.map((l) => present(l, reminders)));
  }

  if (a === "leads" && b) {
    const lead = await loadLead(b);
    if (!lead) return json({ error: "Lead not found" }, 404);
    const page = await getJSON(`pages/${lead.pageId}`);
    const { reminders } = await getSettings();

    if (!c && method === "PATCH") {
      const { draft } = await body(req);
      if (typeof draft !== "string") return json({ error: "draft must be text" }, 400);
      await setJSON(leadKey(lead.id), { ...lead, draft });
      return json(present({ ...lead, draft }, reminders));
    }
    if (c === "skip" && method === "POST") {
      return json(present(await saveLead({ ...lead, status: "skipped" }, page), reminders));
    }
    if (c === "send" && method === "POST") {
      if (!page) return json({ error: "This Page is no longer connected." }, 409);
      if (!OPEN.has(lead.status)) return json({ error: "This lead was already handled." }, 409);
      const now = Date.now();
      const gate = canSend(lead, now);
      if (!gate.ok) return json({ error: gate.reason }, 409);
      const { text: t } = await body(req);
      const text = String(t ?? lead.draft ?? "").trim();
      if (!text) return json({ error: "The reply is empty." }, 400);
      try {
        if (lead.source === "form") {
          const subject = lead.status === "followup" ? `Following up from ${page.name}` : `Thanks for reaching out to ${page.name}`;
          await sendMail({ to: lead.email, subject, text, replyTo: env("GMAIL_USER"), fromName: page.name });
        } else if (lead.source === "message") {
          await sendMessenger(page.id, page.token, lead.fbRefs.psid, text);
        } else {
          await sendPrivateReply(page.id, page.token, lead.fbRefs.commentId, text);
        }
      } catch (e) {
        await saveLead({ ...lead, status: "failed", error: e.message, draft: text }, page);
        return json({ error: e.message }, 502);
      }
      const sent = { ...lead, status: "sent", sentAt: now, sentText: text, draft: text, replyCount: (lead.replyCount || 0) + 1, reminded: {} };
      delete sent.error;
      return json(present(await saveLead(sent, page), reminders));
    }
  }

  if (a === "templates" && b) {
    if (!(await getJSON(`pages/${b}`))) return json({ error: "Page not connected" }, 404);
    if (method === "GET") return json({ ...DEFAULT_TEMPLATES, ...((await getJSON(`templates/${b}`)) || {}) });
    if (method === "PUT") {
      const input = await body(req);
      const next = { ...DEFAULT_TEMPLATES, ...((await getJSON(`templates/${b}`)) || {}) };
      for (const k of TEMPLATE_KEYS) if (typeof input[k] === "string" && input[k].trim()) next[k] = input[k];
      await setJSON(`templates/${b}`, next);
      return json(next);
    }
  }

  if (a === "settings") {
    if (method === "GET") return json(await getSettings());
    if (method === "PUT") {
      const input = await body(req);
      const cur = await getSettings();
      const num = (v, d) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);
      const r = input.reminders || {};
      const next = {
        groups: Array.isArray(input.groups)
          ? input.groups.filter((g) => g && g.name).map((g) => ({ name: String(g.name).slice(0, 120), url: /^https:\/\//.test(g.url || "") ? g.url : "" }))
          : cur.groups,
        groupPostText: typeof input.groupPostText === "string" ? input.groupPostText : cur.groupPostText,
        reminders: {
          unrepliedAfterH: num(r.unrepliedAfterH, cur.reminders.unrepliedAfterH),
          quietAfterH: num(r.quietAfterH, cur.reminders.quietAfterH),
          maxFollowUps: Math.round(num(r.maxFollowUps, cur.reminders.maxFollowUps)),
          windowWarnH: cur.reminders.windowWarnH,
        },
      };
      await setJSON("settings", next);
      return json(next);
    }
  }

  if (a === "posts") {
    if (method === "GET") {
      const page = await getJSON(`pages/${url.searchParams.get("page")}`);
      if (!page) return json({ error: "Page not connected" }, 404);
      return json(await recentPosts(page.id, page.token));
    }
    if (method === "POST") {
      const { pageIds = [], message = "", link = "", imageBase64 = "", scheduleAt } = await body(req);
      if (!message.trim() && !imageBase64) return json({ error: "Write something or add a photo." }, 400);
      if (link && !/^https?:\/\//.test(link)) return json({ error: "The link must start with http:// or https://" }, 400);
      const now = Date.now();
      if (scheduleAt && (scheduleAt < now + 10 * MIN || scheduleAt > now + 30 * DAY))
        return json({ error: "Schedule between 10 minutes and 30 days from now." }, 400);
      const image = String(imageBase64).replace(/^data:[^,]+,/, "");
      const results = [];
      for (const id of pageIds) {
        const page = await getJSON(`pages/${id}`);
        if (!page) { results.push({ pageId: id, ok: false, error: "Page not connected" }); continue; }
        try { results.push({ pageId: id, ok: true, id: await createPost(page.id, page.token, { message, link: link || undefined, imageBase64: image || undefined, scheduleAt: scheduleAt || undefined }) }); }
        catch (e) { results.push({ pageId: id, ok: false, error: e.message }); }
      }
      return json({ results });
    }
  }

  return json({ error: "Not found" }, 404);
}

export const config = { path: "/api/*" };

// Meta webhook: Facebook calls this the moment a Page gets a lead, message or comment.
import { env } from "../../lib/svc/config.js";
import { getJSON } from "../../lib/svc/store.js";
import { verifyMetaSignature } from "../../lib/svc/session.js";
import { getLead, getName } from "../../lib/svc/fb.js";
import { loadLead, createLead, saveLead, alertLead } from "../../lib/svc/leadstore.js";
import { DEFAULT_TEMPLATES, parseWebhook, leadId, formFieldsToContact, newLead, mergeInbound, markRepliedOutside } from "../../lib/core/leads.js";

export default async (req, context) => {
  const url = new URL(req.url);
  if (req.method === "GET") {
    const ok = url.searchParams.get("hub.mode") === "subscribe" && url.searchParams.get("hub.verify_token") === env("FB_VERIFY_TOKEN");
    return ok ? new Response(url.searchParams.get("hub.challenge") || "") : new Response("Forbidden", { status: 403 });
  }
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const raw = Buffer.from(await req.arrayBuffer());
  if (!verifyMetaSignature(raw, req.headers.get("x-hub-signature-256"))) return new Response("Bad signature", { status: 401 });
  let body;
  try { body = JSON.parse(raw.toString("utf8")); } catch { return new Response("Bad JSON", { status: 400 }); }

  const work = processAll(parseWebhook(body, env("FB_APP_ID")));
  if (context && typeof context.waitUntil === "function") context.waitUntil(work); // answer Facebook fast
  else await work;
  return new Response("EVENT_RECEIVED");
};

async function processAll(events) {
  for (const e of events) { // one at a time, so two events for the same person can't race
    try { await processEvent(e); } catch (err) { console.error("webhook event", e.kind, e.pageId, err); }
  }
}

async function processEvent(e) {
  const page = await getJSON(`pages/${e.pageId}`);
  if (!page) return; // only Pages the owner connected
  const now = Date.now();
  const existing = await loadLead(leadId(e));

  if (e.kind === "echo") {
    if (existing && (existing.status === "waiting" || existing.status === "followup")) await saveLead(markRepliedOutside(existing, now), page);
    return;
  }
  if (existing) {
    if (e.kind === "form") return; // retried delivery
    const r = mergeInbound(existing, e, now);
    if (!r.changed) return;
    await saveLead(r.lead, page);
    if (r.reopened) await alertLead(r.lead, page, "They wrote again");
    return;
  }

  const templates = { ...DEFAULT_TEMPLATES, ...((await getJSON(`templates/${e.pageId}`)) || {}) };
  const contact = e.kind === "form" ? formFieldsToContact(await getLead(e.ref, page.token))
    : e.kind === "message" ? { name: await getName(e.ref, page.token), said: e.text }
    : { name: e.fromName, said: e.text };
  const lead = await createLead(newLead(e, contact, templates[e.kind], now), page);
  await alertLead(lead, page, "New lead");
}

export const config = { path: "/webhook" };

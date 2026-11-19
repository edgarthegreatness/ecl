// Turning Facebook webhook payloads into leads, and keeping leads up to date.
// Pure module: no Node APIs, so it runs under the jsc test runner.

export const DEFAULT_TEMPLATES = {
  form: "Hi {first}! Thanks for filling out our form. We'd love to hear more about what you need. When's a good time for a quick 10-minute call this week?",
  message: "Hi {first}! Thanks for messaging us. Happy to help. Could you tell me a bit more about what you're looking for?",
  comment: "Hi {first}! Saw your comment on our post. Thank you! Sending you the details here.",
  followup: "Hi {first}, just checking in on my last message. Are you still interested? Happy to answer any questions.",
};
export const ASK_PHONE = " What's the best number to reach you?";

const REOPENS = new Set(["sent", "followup", "skipped", "cold"]);

// body: a Meta webhook POST body. ourAppId: our Facebook App ID (echoes of our own sends are dropped).
export function parseWebhook(body, ourAppId) {
  const out = [];
  if (!body || body.object !== "page") return out;
  for (const entry of body.entry || []) {
    const pageId = String(entry.id);
    for (const ch of entry.changes || []) {
      const v = ch.value || {};
      if (ch.field === "leadgen" && v.leadgen_id) {
        out.push({ kind: "form", pageId, ref: String(v.leadgen_id), at: secs(v.created_time) ?? secs(entry.time) });
      } else if (ch.field === "feed" && v.item === "comment" && v.verb === "add"
        && v.parent_id === v.post_id && v.from && String(v.from.id) !== pageId) {
        out.push({
          kind: "comment", pageId, ref: `${v.post_id}:${v.from.id}`, fromId: String(v.from.id), fromName: v.from.name || "",
          text: v.message || "", at: secs(v.created_time) ?? secs(entry.time), postId: v.post_id, commentId: v.comment_id, mid: v.comment_id,
        });
      }
    }
    for (const m of entry.messaging || []) {
      const msg = m.message;
      if (!msg) continue; // reads, deliveries, postbacks
      if (msg.is_echo) {
        if (msg.app_id !== undefined && String(msg.app_id) === String(ourAppId)) continue;
        out.push({ kind: "echo", pageId, ref: String(m.recipient.id), at: m.timestamp, mid: msg.mid });
      } else {
        out.push({ kind: "message", pageId, ref: String(m.sender.id), at: m.timestamp, mid: msg.mid, text: msg.text || (msg.attachments ? "[attachment]" : "") });
      }
    }
  }
  return out;
}

function secs(s) {
  if (s === undefined || s === null) return undefined;
  const n = typeof s === "number" ? s : Date.parse(s) / 1000;
  return Number.isFinite(n) ? Math.round(n * 1000) : undefined;
}

export function leadId(event) {
  const kind = event.kind === "echo" ? "message" : event.kind;
  return `${kind}:${event.pageId}:${event.ref}`;
}

const titleCase = (s) => s.replace(/[_?]+/g, " ").trim().replace(/\s+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export function formFieldsToContact(fieldData = []) {
  const f = {};
  for (const x of fieldData) f[x.name] = (x.values || []).join(", ");
  const name = f.full_name || [f.first_name, f.last_name].filter(Boolean).join(" ");
  const skip = new Set(["full_name", "first_name", "last_name", "email", "phone_number"]);
  const said = fieldData.filter((x) => !skip.has(x.name)).map((x) => `${titleCase(x.name)}: ${(x.values || []).join(", ")}`).join(" · ");
  const c = { name: name || "", said };
  if (f.email) c.email = f.email;
  if (f.phone_number) c.phone = f.phone_number;
  return c;
}

export function renderDraft(template, lead) {
  const first = (lead.name || "").trim().split(/\s+/)[0] || "there";
  return template.replace(/\{first\}/g, first) + (lead.phone ? "" : ASK_PHONE);
}

export function newLead(event, contact, template, now) {
  const fbRefs = event.kind === "form" ? { leadgenId: event.ref }
    : event.kind === "comment" ? { commentId: event.commentId, postId: event.postId, fromId: event.fromId }
    : { psid: event.ref };
  const lead = {
    id: leadId(event), pageId: event.pageId, source: event.kind,
    name: contact.name || "", said: contact.said || "",
    receivedAt: event.at || now, status: "waiting",
    followUps: 0, replyCount: 0, seenMids: event.mid ? [event.mid] : [], reminded: {}, fbRefs,
  };
  if (contact.email) lead.email = contact.email;
  if (contact.phone) lead.phone = contact.phone;
  if (event.kind !== "form") lead.lastInboundAt = event.at || now;
  lead.draft = renderDraft(template, lead);
  return lead;
}

// A later message/comment from the same person. Idempotent on the message id.
export function mergeInbound(lead, event, now) {
  if (event.mid && (lead.seenMids || []).includes(event.mid)) return { lead, changed: false, reopened: false };
  const next = {
    ...lead,
    said: lead.said ? `${lead.said}\n${event.text || ""}` : event.text || "",
    lastInboundAt: event.at || now,
    seenMids: [...(lead.seenMids || []), ...(event.mid ? [event.mid] : [])],
  };
  const reopened = REOPENS.has(lead.status);
  if (reopened) { next.status = "waiting"; next.reminded = {}; }
  return { lead: next, changed: true, reopened };
}

// Someone replied from Business Suite / the Page inbox instead of the app.
export function markRepliedOutside(lead, now) {
  return { ...lead, status: "sent", sentAt: now };
}

// Runs every 15 minutes: raises follow-up reminders and emails the owner one digest.
// It never sends anything to a lead; follow-ups wait in the review queue.
import { getJSON, listJSON } from "../../lib/svc/store.js";
import { saveLead } from "../../lib/svc/leadstore.js";
import { alert } from "../../lib/svc/mail.js";
import { siteUrl } from "../../lib/svc/config.js";
import { getSettings } from "../../lib/svc/settings.js";
import { evaluate } from "../../lib/core/followups.js";
import { DEFAULT_TEMPLATES } from "../../lib/core/leads.js";

const LABEL = { unreplied: "Not replied yet", window: "Reply window closing", quiet: "Follow-up drafted", call: "Call or text", cold: "Marked cold" };

export default async () => {
  const { reminders } = await getSettings();
  const pages = Object.fromEntries((await listJSON("pages/")).map((p) => [p.id, p]));
  const templates = {};
  const notes = [];
  const now = Date.now();

  for (const lead of await listJSON("leads/")) {
    const page = pages[lead.pageId];
    if (!page) continue;
    templates[page.id] ||= { ...DEFAULT_TEMPLATES, ...((await getJSON(`templates/${page.id}`)) || {}) };
    try {
      const r = evaluate(lead, now, reminders, templates[page.id].followup);
      if (!r.notify) continue;
      await saveLead(r.lead, page);
      notes.push(`${LABEL[r.notify.type]} · ${lead.name || "Someone"} · ${page.name}\n   ${r.notify.text}`);
    } catch (e) { console.error("followups", lead.id, e); }
  }

  if (notes.length) {
    const n = notes.length;
    try { await alert(`Lead Desk: ${n} lead${n > 1 ? "s" : ""} need${n > 1 ? "" : "s"} you`, `${notes.join("\n\n")}\n\nOpen Lead Desk: ${siteUrl()}/`); }
    catch (e) { console.error("followups digest", e.message); }
  }
};

export const config = { schedule: "*/15 * * * *" };

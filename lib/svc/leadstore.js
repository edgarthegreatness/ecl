// Saving a lead also keeps its Google Sheet row in step. Sheet or email
// failures are logged, never allowed to lose the lead itself.
import { getJSON, setJSON, leadKey } from "./store.js";
import { appendRow, updateRow } from "./sheets.js";
import { alert } from "./mail.js";
import { leadToRow } from "../core/sheetrow.js";
import { siteUrl } from "./config.js";

const SOURCE = { form: "Lead form", message: "Page message", comment: "Post comment" };

export const loadLead = (id) => getJSON(leadKey(id));

export async function createLead(lead, page) {
  await setJSON(leadKey(lead.id), lead); // stored first, so a retried webhook dedupes even if Sheets fails
  try {
    lead.sheetRow = await appendRow(leadToRow(lead, page.name));
    await setJSON(leadKey(lead.id), lead);
  } catch (e) { console.error("sheet append", lead.id, e.message); }
  return lead;
}

export async function saveLead(lead, page) {
  await setJSON(leadKey(lead.id), lead);
  try {
    if (lead.sheetRow) await updateRow(lead.sheetRow, leadToRow(lead, page ? page.name : ""));
    else if (page) {
      lead.sheetRow = await appendRow(leadToRow(lead, page.name));
      await setJSON(leadKey(lead.id), lead);
    }
  } catch (e) { console.error("sheet update", lead.id, e.message); }
  return lead;
}

export async function alertLead(lead, page, headline) {
  const lines = [
    `${headline}: ${lead.name || "Someone"} (${page.name})`,
    `From: ${SOURCE[lead.source] || lead.source}`,
    lead.phone ? `Phone: ${lead.phone}` : "Phone: not shared",
    lead.email ? `Email: ${lead.email}` : null,
    "", lead.said || "", "",
    `Review and reply: ${siteUrl()}/`,
  ].filter((x) => x !== null);
  try { await alert(`${headline}: ${lead.name || "Someone"} · ${page.name}`, lines.join("\n")); }
  catch (e) { console.error("alert email", lead.id, e.message); }
}

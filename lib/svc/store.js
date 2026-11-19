// Netlify Blobs: one private store for everything Lead Desk keeps.
// Keys: owner, user, settings, pages/<id>, templates/<pageId>, leads/<safe lead id>
import { getStore } from "@netlify/blobs";

const store = () => getStore({ name: "leaddesk", consistency: "strong" });

export const getJSON = (key) => store().get(key, { type: "json" });
export const setJSON = (key, value) => store().setJSON(key, value);
export const del = (key) => store().delete(key);
export async function listJSON(prefix) {
  const { blobs } = await store().list({ prefix });
  const values = await Promise.all(blobs.map((b) => getJSON(b.key)));
  return values.filter(Boolean);
}
export const leadKey = (leadId) => "leads/" + String(leadId).replace(/[^A-Za-z0-9_-]/g, "_");

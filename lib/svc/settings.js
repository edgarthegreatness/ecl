// Owner settings with defaults filled in.
import { getJSON } from "./store.js";
import { DEFAULT_REMINDERS } from "../core/followups.js";

export async function getSettings() {
  const s = (await getJSON("settings")) || {};
  return { groups: s.groups || [], groupPostText: s.groupPostText || "", reminders: { ...DEFAULT_REMINDERS, ...(s.reminders || {}) } };
}

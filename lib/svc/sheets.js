// Google Sheets via a service account (the owner shares the Sheet with its email).
import crypto from "node:crypto";
import { env } from "./config.js";
import { HEADER, rowFromUpdatedRange } from "../core/sheetrow.js";

const TAB = "Leads";
let cached = null;
let headerChecked = false;

async function accessToken() {
  if (cached && cached.exp > Date.now() + 60e3) return cached.token;
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const unsigned = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({
    iss: env("GOOGLE_SA_EMAIL"), scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600,
  })}`;
  const key = env("GOOGLE_SA_KEY").replace(/\\n/g, "\n");
  const sig = crypto.createSign("RSA-SHA256").update(unsigned).sign(key, "base64url");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${sig}` }),
  });
  const d = await res.json();
  if (!res.ok) throw new Error(`Google sign-in failed: ${d.error_description || d.error || res.status}`);
  cached = { token: d.access_token, exp: Date.now() + d.expires_in * 1000 };
  return cached.token;
}

async function call(path, { method = "GET", body } = {}) {
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${env("SHEET_ID")}${path}`, {
    method, headers: { authorization: `Bearer ${await accessToken()}`, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Google Sheets error: ${(d.error && d.error.message) || res.status}`);
  return d;
}

const range = (r) => encodeURIComponent(`${TAB}!${r}`);

// Creates the "Leads" tab and header row if they are missing.
export async function ensureHeader() {
  if (headerChecked) return;
  let first;
  try { first = await call(`/values/${range("A1:L1")}`); }
  catch {
    await call(":batchUpdate", { method: "POST", body: { requests: [{ addSheet: { properties: { title: TAB } } }] } });
    first = {};
  }
  if (!first.values || !first.values.length) {
    await call(`/values/${range("A1:L1")}?valueInputOption=RAW`, { method: "PUT", body: { values: [HEADER] } });
  }
  headerChecked = true;
}

export async function appendRow(values) {
  await ensureHeader();
  const d = await call(`/values/${range("A:L")}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, { method: "POST", body: { values: [values] } });
  return rowFromUpdatedRange(d.updates && d.updates.updatedRange);
}

export async function updateRow(row, values) {
  if (!row) return;
  await call(`/values/${range(`A${row}:L${row}`)}?valueInputOption=RAW`, { method: "PUT", body: { values: [values] } });
}

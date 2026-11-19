// Signed session cookie for the owner, plus Meta webhook signature checks.
import crypto from "node:crypto";
import { env } from "./config.js";
import { getJSON } from "./store.js";
import { json } from "./http.js";

export const SESSION = "ld_session";
const DAY = 864e5;

const mac = (body) => crypto.createHmac("sha256", env("SESSION_SECRET")).update(body).digest("base64url");
const safeEqual = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

export function sign(payload, days = 30) {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + days * DAY })).toString("base64url");
  return `${body}.${mac(body)}`;
}

export function verify(value) {
  if (!value || !value.includes(".")) return null;
  const [body, sig] = value.split(".");
  if (!safeEqual(sig, mac(body))) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    return p.exp > Date.now() ? p : null;
  } catch { return null; }
}

export function getCookie(req, name) {
  for (const part of (req.headers.get("cookie") || "").split(/;\s*/)) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i) === name) return decodeURIComponent(part.slice(i + 1));
  }
  return null;
}

export const setCookie = (name, value, maxAgeSeconds) =>
  `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`;

// Returns the owner's Facebook user id, or a 401 Response.
export async function requireOwner(req) {
  const p = verify(getCookie(req, SESSION));
  const owner = p ? await getJSON("owner") : null;
  if (!p || !owner || owner.userId !== p.uid) return json({ error: "Please sign in with Facebook." }, 401);
  return p.uid;
}

// rawBody: Buffer of the exact request bytes. header: X-Hub-Signature-256.
export function verifyMetaSignature(rawBody, header) {
  if (!header || !header.startsWith("sha256=")) return false;
  const expected = crypto.createHmac("sha256", env("FB_APP_SECRET")).update(rawBody).digest("hex");
  return safeEqual(header.slice(7), expected);
}

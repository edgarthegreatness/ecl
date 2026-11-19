// Facebook Graph API calls. Every call with a token also sends appsecret_proof.
import crypto from "node:crypto";
import { env, graphBase } from "./config.js";

export const PAGE_FIELDS = "leadgen,messages,message_echoes,feed";

export async function graph(path, { token, method = "GET", params = {}, body, form } = {}) {
  const url = new URL(graphBase() + path);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, typeof v === "object" ? JSON.stringify(v) : String(v));
  }
  if (token) {
    url.searchParams.set("access_token", token);
    url.searchParams.set("appsecret_proof", crypto.createHmac("sha256", env("FB_APP_SECRET")).update(token).digest("hex"));
  }
  const init = { method };
  if (form) init.body = form;
  else if (body) { init.headers = { "content-type": "application/json" }; init.body = JSON.stringify(body); }
  const res = await fetch(url, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error((data.error && data.error.message) || `Facebook error ${res.status}`);
  return data;
}

const appParams = () => ({ client_id: env("FB_APP_ID"), client_secret: env("FB_APP_SECRET") });

export async function exchangeCode(code, redirectUri) {
  const d = await graph("/oauth/access_token", { params: { ...appParams(), redirect_uri: redirectUri, code } });
  return d.access_token;
}

export async function longLived(shortToken) {
  const d = await graph("/oauth/access_token", { params: { ...appParams(), grant_type: "fb_exchange_token", fb_exchange_token: shortToken } });
  return { token: d.access_token, expiresAt: d.expires_in ? Date.now() + d.expires_in * 1000 : null };
}

export async function debugToken(token) {
  const d = await graph("/debug_token", { params: { input_token: token, access_token: `${env("FB_APP_ID")}|${env("FB_APP_SECRET")}` } });
  const x = d.data || {};
  return { userId: String(x.user_id), dataAccessExpiresAt: x.data_access_expires_at ? x.data_access_expires_at * 1000 : null };
}

export async function listPages(userToken) {
  const d = await graph("/me/accounts", { token: userToken, params: { fields: "id,name,access_token", limit: 100 } });
  return d.data || [];
}

export const subscribePage = (pageId, pageToken) =>
  graph(`/${pageId}/subscribed_apps`, { token: pageToken, method: "POST", params: { subscribed_fields: PAGE_FIELDS } });
export const unsubscribePage = (pageId, pageToken) =>
  graph(`/${pageId}/subscribed_apps`, { token: pageToken, method: "DELETE" });

export async function getLead(leadgenId, pageToken) {
  const d = await graph(`/${leadgenId}`, { token: pageToken, params: { fields: "field_data,created_time" } });
  return d.field_data || [];
}

export async function getName(psid, pageToken) {
  try { return (await graph(`/${psid}`, { token: pageToken, params: { fields: "name" } })).name || ""; }
  catch { return ""; }
}

export const sendMessenger = (pageId, pageToken, psid, text) =>
  graph(`/${pageId}/messages`, { token: pageToken, method: "POST", body: { recipient: { id: psid }, messaging_type: "RESPONSE", message: { text } } });

export const sendPrivateReply = (pageId, pageToken, commentId, text) =>
  graph(`/${pageId}/messages`, { token: pageToken, method: "POST", body: { recipient: { comment_id: commentId }, message: { text } } });

// scheduleAt: epoch ms or undefined (publish now). imageBase64: JPEG without the data: prefix.
export async function createPost(pageId, pageToken, { message, link, imageBase64, scheduleAt }) {
  const sched = scheduleAt ? { published: false, scheduled_publish_time: Math.floor(scheduleAt / 1000) } : {};
  if (imageBase64) {
    const form = new FormData();
    form.append("source", new Blob([Buffer.from(imageBase64, "base64")], { type: "image/jpeg" }), "photo.jpg");
    if (message) form.append("caption", message);
    for (const [k, v] of Object.entries(sched)) form.append(k, String(v));
    const d = await graph(`/${pageId}/photos`, { token: pageToken, method: "POST", form });
    return d.post_id || d.id;
  }
  const d = await graph(`/${pageId}/feed`, { token: pageToken, method: "POST", body: { message, ...(link ? { link } : {}), ...sched } });
  return d.id;
}

export async function recentPosts(pageId, pageToken) {
  const [posted, scheduled] = await Promise.all([
    graph(`/${pageId}/posts`, { token: pageToken, params: { fields: "id,message,created_time,permalink_url", limit: 5 } }),
    graph(`/${pageId}/scheduled_posts`, { token: pageToken, params: { fields: "id,message,scheduled_publish_time" } }).catch(() => ({ data: [] })),
  ]);
  return [
    ...(scheduled.data || []).map((p) => ({ id: p.id, message: p.message || "", time: p.scheduled_publish_time * 1000, scheduled: true })),
    ...(posted.data || []).map((p) => ({ id: p.id, message: p.message || "", time: Date.parse(p.created_time), url: p.permalink_url, scheduled: false })),
  ];
}

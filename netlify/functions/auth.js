// Facebook Login. The first Facebook account to sign in becomes the owner;
// anyone else is turned away.
import crypto from "node:crypto";
import { env, siteUrl } from "../../lib/svc/config.js";
import { exchangeCode, longLived, debugToken } from "../../lib/svc/fb.js";
import { getJSON, setJSON } from "../../lib/svc/store.js";
import { SESSION, sign, getCookie, setCookie } from "../../lib/svc/session.js";
import { redirect } from "../../lib/svc/http.js";

const SCOPES = "pages_show_list,pages_read_engagement,pages_manage_metadata,pages_read_user_content,pages_manage_posts,pages_messaging,leads_retrieval,pages_manage_ads,business_management";
const STATE = "ld_state";
const text = (body, status) => new Response(body, { status, headers: { "content-type": "text/plain; charset=utf-8" } });

export default async (req) => {
  const url = new URL(req.url);
  const redirectUri = `${siteUrl()}/auth/callback`;

  if (url.pathname === "/auth/start") {
    const state = crypto.randomBytes(16).toString("hex");
    const dialog = new URL(`https://www.facebook.com/${env("FB_GRAPH_VERSION", "v23.0")}/dialog/oauth`);
    dialog.search = new URLSearchParams({ client_id: env("FB_APP_ID"), redirect_uri: redirectUri, state, scope: SCOPES, response_type: "code" }).toString();
    return redirect(dialog.toString(), { "set-cookie": setCookie(STATE, state, 600) });
  }

  if (url.pathname === "/auth/logout") return redirect("/", { "set-cookie": setCookie(SESSION, "", 0) });

  // /auth/callback
  if (url.searchParams.get("error")) return redirect("/?login=cancelled");
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  if (!code || !state || state !== getCookie(req, STATE)) return text("Sign-in expired. Please go back and try again.", 400);

  try {
    const token = await longLived(await exchangeCode(code, redirectUri));
    const info = await debugToken(token.token);
    const owner = await getJSON("owner");
    if (owner && owner.userId !== info.userId) return text("This Lead Desk belongs to someone else.", 403);
    if (!owner) await setJSON("owner", { userId: info.userId, claimedAt: Date.now() });
    await setJSON("user", { token: token.token, expiresAt: token.expiresAt, dataAccessExpiresAt: info.dataAccessExpiresAt });

    const headers = new Headers({ location: "/?connect=1" });
    headers.append("set-cookie", setCookie(SESSION, sign({ uid: info.userId }), 30 * 86400));
    headers.append("set-cookie", setCookie(STATE, "", 0));
    return new Response(null, { status: 302, headers });
  } catch (e) {
    console.error("auth callback", e);
    return text(`Facebook sign-in failed: ${e.message}`, 502);
  }
};

export const config = { path: ["/auth/start", "/auth/callback", "/auth/logout"] };

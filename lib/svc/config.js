// Environment settings. Secrets only ever come from Netlify environment variables.
export function env(name, fallback) {
  const v = process.env[name];
  if (v === undefined || v === "") {
    if (fallback !== undefined) return fallback;
    throw new Error(`Missing env ${name}`);
  }
  return v;
}
export const graphBase = () => `https://graph.facebook.com/${env("FB_GRAPH_VERSION", "v23.0")}`;
export const siteUrl = () => env("SITE_URL").replace(/\/+$/, "");

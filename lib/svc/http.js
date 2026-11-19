// Small Response helpers shared by the functions.
export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...headers } });
export const redirect = (location, headers = {}) => new Response(null, { status: 302, headers: { location, ...headers } });

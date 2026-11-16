/** Keep the public client URL (cookies and OAuth) and route only server HTTP calls internally. */
export function serverTransport(publicUrl: string) {
  const internal = process.env.SUPABASE_INTERNAL_URL;
  if (!internal) return {};
  if (typeof window !== "undefined") throw new Error("Internal Supabase transport is server-only");
  const source = new URL(publicUrl);
  const target = new URL(internal);
  const base = source.pathname.replace(/\/$/, "");
  if (target.protocol !== "http:" || target.hostname !== "127.0.0.1" ||
      target.username || target.password || target.search || target.hash ||
      target.pathname.replace(/\/$/, "") !== base) {
    throw new Error("SUPABASE_INTERNAL_URL must use the loopback gateway and the same project path");
  }
  const internalFetch: typeof fetch = (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    // Do not send credentials or unrelated requests to another destination.
    if (url.origin !== source.origin || !url.pathname.startsWith(`${base}/`)) {
      throw new Error("Unexpected Supabase transport destination");
    }
    url.protocol = target.protocol;
    url.host = target.host;
    return fetch(input instanceof Request ? new Request(url, input) : url, init);
  };
  return { global: { fetch: internalFetch } };
}

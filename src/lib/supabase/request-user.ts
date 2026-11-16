/** Internal request header: proxy always replaces client-supplied values. Never an authorization source. */
export const REQUEST_USER_HEADER = "x-trip-request-user";
export type RequestUser = { id: string; email: string | null };

export function encodeRequestUser(user: RequestUser | null): string {
  return encodeURIComponent(JSON.stringify(user));
}

export function decodeRequestUser(value: string): RequestUser | null {
  try {
    const user = JSON.parse(decodeURIComponent(value));
    if (user && typeof user.id === "string" && (typeof user.email === "string" || user.email === null)) {
      return { id: user.id, email: user.email };
    }
  } catch { /* Invalid context is anonymous, never a grant of access. */ }
  return null;
}

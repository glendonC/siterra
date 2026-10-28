import { sessionCookieName, sessionOwner } from "@siterra/db";
import { database } from "./database.ts";

function cookieValue(header: string | null, name: string): string | null {
  if (header === null) {
    return null;
  }
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) {
      return rest.join("=");
    }
  }
  return null;
}

/**
 * The owner scope of the request's session, or null. In development only, and only when
 * SITERRA_DEV_OWNER_SCOPE is set, a request without a session cookie acts as that owner, so the
 * workspace runs locally before session issuance exists.
 */
export async function requestOwner(request: Request): Promise<string | null> {
  const token = cookieValue(request.headers.get("cookie"), sessionCookieName);
  if (token !== null && token !== "") {
    return sessionOwner(database(), token);
  }
  const devOwner = process.env["SITERRA_DEV_OWNER_SCOPE"];
  if (process.env.NODE_ENV === "development" && devOwner !== undefined && devOwner !== "") {
    return devOwner;
  }
  return null;
}

/**
 * State-changing requests are accepted only from the application origin (openapi.json,
 * sessionCookie). With SITERRA_APP_ORIGIN set (a deployment), the Origin header must equal it.
 * Without it (local work), the Origin must name the host the request was sent to, from the Host
 * header or X-Forwarded-Host behind a proxy, because the server's own request URL can name an
 * internal address.
 */
export function fromApplicationOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (origin === null) {
    return request.headers.get("sec-fetch-site") === "same-origin";
  }
  const configured = process.env["SITERRA_APP_ORIGIN"];
  if (configured !== undefined && configured !== "") {
    return origin === configured;
  }
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return host !== null && new URL(origin).host === host;
  } catch {
    return false;
  }
}

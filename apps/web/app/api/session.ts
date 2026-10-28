import { type SessionInfo, sessionCookieName, sessionInfo } from "@siterra/db";
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
 * The request's session, or null. In development only, and only when SITERRA_DEV_OWNER_SCOPE is
 * set, a request without a session cookie acts as that owner with a local session.
 */
export async function requestSession(request: Request): Promise<SessionInfo | null> {
  const token = cookieValue(request.headers.get("cookie"), sessionCookieName);
  if (token !== null && token !== "") {
    return sessionInfo(database(), token);
  }
  const devOwner = process.env["SITERRA_DEV_OWNER_SCOPE"];
  if (process.env.NODE_ENV === "development" && devOwner !== undefined && devOwner !== "") {
    return { ownerScopeId: devOwner, kind: "local" };
  }
  return null;
}

/** The owner scope of the request's session, or null. */
export async function requestOwner(request: Request): Promise<string | null> {
  return (await requestSession(request))?.ownerScopeId ?? null;
}

/** The Set-Cookie value for a session token (openapi.json, sessionCookie). */
export function sessionCookie(token: string, maxAgeSeconds: number): string {
  return `${sessionCookieName}=${token}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
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

/**
 * HTTP client untuk POS → Backoffice ALLEE.
 *
 * Fitur:
 *  - Sign-in sekali pakai service account email+password (§2.1 contract).
 *  - Cache session cookie di memory module-scope (per server instance).
 *  - Auto-retry 1x kalau response 401 (session expired) — re-sign-in lalu replay.
 *  - Throw `BackofficeApiError` dengan status + body buat handler upstream.
 *
 * NOT a singleton across edge instances: di runtime serverless multi-instance
 * (Vercel), tiap warm instance punya cookie sendiri. Itu OK — backoffice
 * issue independent session tiap sign-in.
 */

import {
  BackofficeConfigError,
  isBackofficeModeEnabled,
  readBackofficeConfig,
} from "./config";
import type { BackofficeError } from "@/lib/types/backoffice";

export class BackofficeApiError extends Error {
  status: number;
  body: BackofficeError | string | null;

  constructor(status: number, message: string, body: BackofficeError | string | null) {
    super(message);
    this.name = "BackofficeApiError";
    this.status = status;
    this.body = body;
  }
}

interface CachedSession {
  /** Raw `Set-Cookie` header value, e.g. `allee.session_token=...; Path=/; ...` */
  cookieHeader: string;
  /** Best-effort expiry; kita re-sign-in kalau backoffice balikin 401 lebih dulu. */
  expiresAt: number;
}

let cached: CachedSession | null = null;

function parseSetCookie(setCookie: string | null): CachedSession | null {
  if (!setCookie) return null;
  // `Set-Cookie` bisa berisi banyak cookie di-pisahkan koma — tapi value-nya
  // sendiri kadang punya koma di Expires. Kita cari token spesifik.
  //
  // Better Auth otomatis menambah prefix `__Secure-` di cookie name saat
  // attribute Secure aktif (production HTTPS). Kita harus capture prefix-nya
  // supaya saat dikirim balik ke backoffice, cookie name match exactly.
  const tokenMatch = setCookie.match(/(?:__Secure-|__Host-)?allee\.session_token=[^;,]+/);
  if (!tokenMatch) return null;

  // Default 1 jam — kalau backoffice override pendek, akan ke-handle oleh 401 retry.
  const expiresMatch = setCookie.match(/Max-Age=(\d+)/i);
  const ttlSec = expiresMatch ? Math.max(60, Number(expiresMatch[1])) : 3600;

  return {
    cookieHeader: tokenMatch[0],
    expiresAt: Date.now() + ttlSec * 1000,
  };
}

async function signIn(): Promise<CachedSession> {
  const cfg = readBackofficeConfig();
  const url = `${cfg.apiUrl}/api/auth/sign-in/email`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: cfg.serviceEmail,
      password: cfg.servicePassword,
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await safeReadBody(res);
    throw new BackofficeApiError(
      res.status,
      `Sign-in ke backoffice gagal (${res.status}). Cek BACKOFFICE_SERVICE_EMAIL / BACKOFFICE_SERVICE_PASSWORD.`,
      body
    );
  }

  const session = parseSetCookie(res.headers.get("set-cookie"));
  if (!session) {
    throw new BackofficeApiError(
      res.status,
      "Sign-in sukses tapi cookie session tidak ditemukan di response. Cek `allee.session_token` cookie name di backoffice.",
      null
    );
  }
  cached = session;
  return session;
}

async function ensureSession(): Promise<CachedSession> {
  if (cached && cached.expiresAt > Date.now() + 5_000) return cached;
  return signIn();
}

interface BackofficeFetchInit {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  json?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  /** Override timeout in ms. Default 15s. */
  timeoutMs?: number;
}

function buildUrl(
  apiUrl: string,
  path: string,
  query?: BackofficeFetchInit["query"]
): string {
  // path harus mulai dengan `/api/...` sesuai contract.
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const url = `${apiUrl}${normalized}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null) continue;
    params.set(k, String(v));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

async function safeReadBody(res: Response): Promise<BackofficeError | string | null> {
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    return (await res.json().catch(() => null)) as BackofficeError | null;
  }
  return res.text().catch(() => null);
}

async function doFetch(
  url: string,
  init: BackofficeFetchInit,
  cookieHeader: string
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    init.timeoutMs ?? 15_000
  );
  try {
    return await fetch(url, {
      method: init.method ?? "GET",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookieHeader,
        Accept: "application/json",
      },
      body: init.json !== undefined ? JSON.stringify(init.json) : undefined,
      cache: "no-store",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Inti client. Ensure session → call backoffice. Kalau 401, re-sign-in lalu
 * replay sekali. Lebih dari itu lempar error supaya caller bisa surface ke user.
 */
export async function backofficeFetch<T>(
  path: string,
  init: BackofficeFetchInit = {}
): Promise<T> {
  if (!isBackofficeModeEnabled()) {
    throw new BackofficeConfigError("BACKOFFICE_MODE belum aktif");
  }
  const cfg = readBackofficeConfig();
  const url = buildUrl(cfg.apiUrl, path, init.query);

  let session = await ensureSession();
  let res = await doFetch(url, init, session.cookieHeader);

  if (res.status === 401) {
    // Cookie kemungkinan expired / di-revoke. Re-sign-in sekali lalu retry.
    cached = null;
    session = await signIn();
    res = await doFetch(url, init, session.cookieHeader);
  }

  if (!res.ok) {
    const body = await safeReadBody(res);
    const msg =
      body && typeof body === "object" && "error" in body
        ? body.error
        : `Backoffice request gagal (${res.status})`;
    throw new BackofficeApiError(res.status, msg, body);
  }

  // Beberapa endpoint balikin Set-Cookie baru (refresh) — update cache silently.
  const newCookie = parseSetCookie(res.headers.get("set-cookie"));
  if (newCookie) cached = newCookie;

  return (await res.json()) as T;
}

/** Test-only helper untuk reset cache (dipakai e2e). */
export function __resetBackofficeSessionCache() {
  cached = null;
}

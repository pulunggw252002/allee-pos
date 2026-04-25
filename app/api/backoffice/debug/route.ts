/**
 * GET /api/backoffice/debug
 *
 * Debug endpoint POS — sementara — untuk diagnosa kenapa sign-in ke
 * backoffice 401 padahal password DB sudah di-reset dan curl manual sukses.
 *
 * Auth: header `x-debug-key` harus match `BETTER_AUTH_SECRET` POS.
 *
 * Return:
 *  - apakah env BACKOFFICE_* loaded di runtime + fingerprint
 *  - hasil panggil signIn() ke backoffice (status, body)
 *
 * Hapus setelah masalah teratasi.
 */
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const debugKey = req.headers.get("x-debug-key") ?? "";
  const expected = process.env.BETTER_AUTH_SECRET ?? "";
  if (!expected || debugKey !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const apiUrl = (process.env.BACKOFFICE_API_URL ?? "").trim();
  const email = (process.env.BACKOFFICE_SERVICE_EMAIL ?? "").trim();
  const password = (process.env.BACKOFFICE_SERVICE_PASSWORD ?? "").trim();
  const mode = (process.env.BACKOFFICE_MODE ?? "").trim();
  const webhookSecret = (process.env.POS_WEBHOOK_SECRET ?? "").trim();

  const out: Record<string, unknown> = {
    env: {
      BACKOFFICE_MODE: mode,
      BACKOFFICE_API_URL: apiUrl,
      BACKOFFICE_SERVICE_EMAIL: email, // not secret — service account email
      BACKOFFICE_SERVICE_PASSWORD_set: Boolean(password),
      BACKOFFICE_SERVICE_PASSWORD_length: password.length,
      BACKOFFICE_SERVICE_PASSWORD_fingerprint: password
        ? `${password.slice(0, 2)}...${password.slice(-2)}`
        : null,
      POS_WEBHOOK_SECRET_set: Boolean(webhookSecret),
      POS_WEBHOOK_SECRET_length: webhookSecret.length,
    },
  };

  if (!apiUrl || !email || !password) {
    out.signIn = { skipped: true, reason: "config incomplete" };
    return NextResponse.json(out);
  }

  // Try direct sign-in to backoffice
  try {
    const res = await fetch(`${apiUrl}/api/auth/sign-in/email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: apiUrl,
      },
      body: JSON.stringify({ email, password }),
      cache: "no-store",
    });
    const text = await res.text().catch(() => "");
    out.signIn = {
      url: `${apiUrl}/api/auth/sign-in/email`,
      status: res.status,
      ok: res.ok,
      body: text.slice(0, 500),
      hasSetCookie: Boolean(res.headers.get("set-cookie")),
    };
  } catch (err) {
    out.signIn = {
      error: err instanceof Error ? err.message : String(err),
    };
  }

  return NextResponse.json(out);
}

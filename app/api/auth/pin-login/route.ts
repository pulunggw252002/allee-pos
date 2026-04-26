import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { auth } from "@/lib/auth/server";
import { ApiError, handle, err } from "@/lib/api-server/response";

const bodySchema = z.object({
  pin: z.string().min(4).max(8),
});

/**
 * In-memory rate limiter — best-effort throttle untuk PIN brute-force.
 * Tidak bisa replace WAF/proper auth lockout, tapi mengurangi blast-radius
 * O(n) loop di bawah saat kasir gak sengaja paste string panjang atau
 * attacker scripting via curl. Map di reset tiap cold-start (Vercel
 * function instance), itu OK karena PIN-only login memang hanya untuk
 * single-tenant device di outlet — bukan public-facing.
 */
const ATTEMPTS = new Map<string, { count: number; firstAt: number }>();
const WINDOW_MS = 60_000; // 1 menit window
const MAX_ATTEMPTS = 8;
const COOLDOWN_AFTER = 5; // setelah 5 attempt mulai delay

function clientKey(req: Request): string {
  // Pakai header `x-forwarded-for` (Vercel set ini) sebagai identitas client.
  // Kalau header tidak ada (local dev), fall-back ke "unknown" — semua dev
  // request share quota, fine.
  const fwd = req.headers.get("x-forwarded-for") ?? "";
  const ip = fwd.split(",")[0]?.trim() || "unknown";
  return ip;
}

function checkRateLimit(key: string): { allowed: boolean; retryAfterMs: number } {
  const now = Date.now();
  const entry = ATTEMPTS.get(key);
  if (!entry || now - entry.firstAt > WINDOW_MS) {
    ATTEMPTS.set(key, { count: 1, firstAt: now });
    return { allowed: true, retryAfterMs: 0 };
  }
  entry.count += 1;
  if (entry.count > MAX_ATTEMPTS) {
    return { allowed: false, retryAfterMs: WINDOW_MS - (now - entry.firstAt) };
  }
  return { allowed: true, retryAfterMs: 0 };
}

function delayForAttempt(count: number): number {
  // Linear backoff after the first few free attempts. Penalty is small enough
  // to not break legit kasir typing wrong PIN once or twice, but big enough
  // to make scripted brute-force impractical.
  if (count <= COOLDOWN_AFTER) return 0;
  const overshoot = count - COOLDOWN_AFTER;
  return Math.min(overshoot * 250, 2000); // 250ms..2s
}

export async function POST(req: Request) {
  return handle(async () => {
    const { pin } = bodySchema.parse(await req.json());

    const rl = checkRateLimit(clientKey(req));
    if (!rl.allowed) {
      throw new ApiError(
        429,
        `Terlalu banyak percobaan PIN. Tunggu ${Math.ceil(rl.retryAfterMs / 1000)} detik lagi.`,
      );
    }
    const attemptCount = ATTEMPTS.get(clientKey(req))?.count ?? 1;
    const delay = delayForAttempt(attemptCount);
    if (delay > 0) await new Promise((r) => setTimeout(r, delay));

    // Hanya loop user yang punya credential row (PIN sudah pernah di-sync).
    // Sebelumnya kita loop SEMUA user — termasuk yang PIN-nya belum ada,
    // setiap iterasi makan satu scrypt verify. Inner-join lewat subquery
    // memastikan PIN sync skip + user inactive otomatis ke-skip dari brute
    // force budget.
    const candidates = await db
      .select({ username: schema.users.username })
      .from(schema.users)
      .innerJoin(
        schema.accounts,
        and(
          eq(schema.accounts.userId, schema.users.id),
          eq(schema.accounts.providerId, "credential"),
        ),
      );

    // Pertahankan UX "PIN-only" tapi cegah collision diam-diam: kalau dua
    // cashier kebetulan pakai PIN sama, jangan auto-log-in salah satu —
    // kembali 409 supaya operator paham harus rotate salah satu PIN.
    let firstHit: Response | null = null;
    let multiHit = false;
    for (const c of candidates) {
      if (!c.username) continue;
      try {
        const res = await auth.api.signInUsername({
          body: { username: c.username, password: pin },
          asResponse: true,
        });
        if (res.ok) {
          if (firstHit) {
            multiHit = true;
            break;
          }
          firstHit = res;
        }
      } catch {
        // signInUsername throws on credential mismatch — kita treat sebagai
        // miss biasa.
      }
    }
    if (multiHit) {
      throw new ApiError(
        409,
        "PIN ini dipakai lebih dari 1 kasir. Owner perlu rotate salah satunya di Backoffice.",
      );
    }
    if (firstHit) return firstHit;
    throw new ApiError(401, "PIN tidak valid");
  }).catch((e) => {
    if (e instanceof ApiError) return err(e.status, e.message);
    throw e;
  });
}

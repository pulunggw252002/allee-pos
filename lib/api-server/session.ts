import { headers } from "next/headers";
import { auth } from "@/lib/auth/server";
import { ApiError } from "./response";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: "cashier" | "supervisor";
};

export async function requireSession(): Promise<SessionUser> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new ApiError(401, "Unauthorized");
  const user = session.user as SessionUser;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: (user.role ?? "cashier") as "cashier" | "supervisor",
  };
}

export async function requireRole(...roles: ("cashier" | "supervisor")[]): Promise<SessionUser> {
  const u = await requireSession();
  if (!roles.includes(u.role)) {
    throw new ApiError(403, `Hanya role ${roles.join("/")} yang diizinkan`);
  }
  return u;
}

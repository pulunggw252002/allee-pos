import type { Cashier } from "@/lib/types";
import { authClient } from "@/lib/auth/client";
import { apiFetch } from "./client";

type CashierRow = {
  id: string;
  name: string;
  username: string | null;
  role: "cashier" | "supervisor";
};

export async function loginWithPin(pin: string): Promise<Cashier> {
  const res = await fetch("/api/auth/pin-login", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pin }),
  });
  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new Error((payload as { error?: string }).error ?? "PIN tidak valid");
  }
  const session = await authClient.getSession();
  const user = session.data?.user;
  if (!user) throw new Error("Gagal membaca sesi setelah login");
  return {
    id: user.id,
    name: user.name,
    pin: "",
    role: ((user as unknown as { role?: "cashier" | "supervisor" }).role ?? "cashier"),
  };
}

export async function signOut(): Promise<void> {
  await authClient.signOut();
}

export async function listCashiers(): Promise<Cashier[]> {
  const rows = await apiFetch<CashierRow[]>("/api/cashiers");
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    pin: "",
    role: r.role,
  }));
}

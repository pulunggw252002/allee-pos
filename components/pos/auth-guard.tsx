"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/stores/auth-store";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const cashier = useAuthStore((s) => s.cashier);

  useEffect(() => {
    if (!cashier) router.replace("/login");
  }, [cashier, router]);

  if (!cashier) {
    return (
      <div className="flex h-screen w-full items-center justify-center text-muted-foreground">
        <p className="text-sm">Mengarahkan ke login…</p>
      </div>
    );
  }
  return <>{children}</>;
}

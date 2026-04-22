"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/stores/auth-store";
import { useShiftStore } from "@/lib/stores/shift-store";

export default function RootRedirect() {
  const router = useRouter();
  const cashier = useAuthStore((s) => s.cashier);
  const hydrated = useShiftStore((s) => s.hydrated);
  const hydrate = useShiftStore((s) => s.hydrate);
  const shift = useShiftStore((s) => s.shift);

  useEffect(() => {
    if (!hydrated) void hydrate();
  }, [hydrated, hydrate]);

  useEffect(() => {
    if (!hydrated) return;
    if (!cashier) {
      router.replace("/login");
      return;
    }
    router.replace(shift ? "/order" : "/shift/open");
  }, [cashier, hydrated, shift, router]);

  return (
    <div className="flex h-screen items-center justify-center text-muted-foreground">
      <p className="text-sm">Memuat ALLEE POS…</p>
    </div>
  );
}

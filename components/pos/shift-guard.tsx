"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/stores/auth-store";
import { useShiftStore } from "@/lib/stores/shift-store";
import { authClient } from "@/lib/auth/client";

interface ShiftGuardProps {
  children: React.ReactNode;
  requireShift?: boolean;
}

export function ShiftGuard({ children, requireShift = true }: ShiftGuardProps) {
  const router = useRouter();
  const cashier = useAuthStore((s) => s.cashier);
  const shift = useShiftStore((s) => s.shift);
  const hydrated = useShiftStore((s) => s.hydrated);
  const hydrate = useShiftStore((s) => s.hydrate);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const session = await authClient.getSession();
        const user = session.data?.user;
        if (cancelled) return;
        if (!user) {
          useAuthStore.getState().logout();
        } else {
          const current = useAuthStore.getState().cashier;
          if (!current || current.id !== user.id) {
            useAuthStore.getState().setCashier({
              id: user.id,
              name: user.name,
              pin: "",
              role:
                ((user as unknown as { role?: "cashier" | "supervisor" }).role ??
                  "cashier"),
            });
          }
        }
      } catch {
        useAuthStore.getState().logout();
      } finally {
        if (!cancelled) setAuthChecked(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) {
      void hydrate();
    }
  }, [hydrated, hydrate]);

  useEffect(() => {
    if (!authChecked) return;
    if (!cashier) {
      router.replace("/login");
      return;
    }
    if (!hydrated) return;
    if (requireShift && !shift) {
      router.replace("/shift/open");
    }
  }, [authChecked, cashier, shift, hydrated, requireShift, router]);

  if (!authChecked) return <FullscreenLoader label="Memeriksa sesi…" />;
  if (!cashier) return <FullscreenLoader label="Mengarahkan ke login…" />;
  if (!hydrated) return <FullscreenLoader label="Memeriksa shift…" />;
  if (requireShift && !shift) return <FullscreenLoader label="Mengarahkan ke open shift…" />;

  return <>{children}</>;
}

function FullscreenLoader({ label }: { label: string }) {
  return (
    <div className="flex h-screen w-full items-center justify-center bg-background text-muted-foreground">
      <p className="text-sm">{label}</p>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ChefHat, ClipboardList, Coffee, History, LogOut, Receipt, Utensils } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuthStore } from "@/lib/stores/auth-store";
import { useShiftStore } from "@/lib/stores/shift-store";
import { signOut } from "@/lib/api/auth";
import { formatDuration, formatIDR } from "@/lib/format";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

export function PosHeader() {
  const router = useRouter();
  const pathname = usePathname();
  const cashier = useAuthStore((s) => s.cashier);
  const logout = useAuthStore((s) => s.logout);
  const shift = useShiftStore((s) => s.shift);
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const navItems = [
    { href: "/order", label: "Order", icon: Coffee },
    { href: "/stations", label: "Station", icon: ChefHat },
    { href: "/tables", label: "Open Bills", icon: ClipboardList },
    { href: "/history", label: "Riwayat", icon: History },
    { href: "/shift/close", label: "Tutup Shift", icon: Receipt },
  ];

  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="flex h-16 items-center gap-4 px-4">
        <div className="flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Utensils className="h-5 w-5" />
          </div>
          <div className="leading-tight">
            <p className="text-sm font-semibold">ALLEE Social House</p>
            <p className="text-xs text-muted-foreground">POS Kasir</p>
          </div>
        </div>

        <nav className="ml-4 flex items-center gap-1">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link key={href} href={href}>
                <Button
                  variant={active ? "default" : "ghost"}
                  size="lg"
                  className={cn(!active && "text-foreground/80")}
                >
                  <Icon className="h-5 w-5" />
                  <span>{label}</span>
                </Button>
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          {shift && (
            <div className="hidden text-right md:block">
              <p className="text-xs text-muted-foreground">Shift berjalan</p>
              <p className="text-sm font-semibold tabular" suppressHydrationWarning>
                {formatDuration(shift.openedAt)} · Kas {formatIDR(shift.openingCash)}
              </p>
            </div>
          )}
          {cashier && (
            <Badge variant="secondary" className="h-8 px-3 text-sm">
              {cashier.name}
            </Badge>
          )}
          <Button
            variant="ghost"
            size="icon-lg"
            aria-label="Logout"
            onClick={async () => {
              if (shift) {
                toast.error("Tutup shift dulu sebelum logout / ganti kasir.");
                router.push("/shift/close");
                return;
              }
              try {
                await signOut();
              } catch {}
              logout();
              router.replace("/login");
            }}
          >
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </div>
      {/* suppress unused var */}
      <span className="hidden">{now}</span>
    </header>
  );
}

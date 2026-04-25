"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  ChefHat,
  ClipboardList,
  Coffee,
  History,
  LogOut,
  Menu,
  Receipt,
  Settings,
  Utensils,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useAuthStore } from "@/lib/stores/auth-store";
import { useShiftStore } from "@/lib/stores/shift-store";
import { signOut } from "@/lib/api/auth";
import { formatDuration, formatIDR } from "@/lib/format";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { getPosConfig } from "@/lib/api/config";

const NAV_ITEMS = [
  { href: "/order", label: "Order", icon: Coffee },
  { href: "/stations", label: "Station", icon: ChefHat },
  { href: "/tables", label: "Open Bills", icon: ClipboardList },
  { href: "/history", label: "Riwayat", icon: History },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/shift/close", label: "Tutup Shift", icon: Receipt },
];

export function PosHeader() {
  const router = useRouter();
  const pathname = usePathname();
  const cashier = useAuthStore((s) => s.cashier);
  const logout = useAuthStore((s) => s.logout);
  const shift = useShiftStore((s) => s.shift);
  const [now, setNow] = useState<number>(() => Date.now());
  const [navOpen, setNavOpen] = useState(false);
  // Brand di header dibaca dari runtime config (dynamic per outlet).
  // Tidak ada hardcoded "ALLEE Social House" — franchise-ready.
  const { outlet } = getPosConfig();
  const brandName = outlet.brandName || "POS";
  const brandSubtitle = outlet.subtitle || "POS Kasir";

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const handleLogout = async () => {
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
  };

  return (
    <header
      className={cn(
        "sticky top-0 z-40 border-b bg-background/95 backdrop-blur",
        "supports-[backdrop-filter]:bg-background/80",
        // Hormati notch / dynamic island di iOS saat standalone PWA
        "pt-safe"
      )}
    >
      <div className="flex h-14 items-center gap-2 px-3 sm:h-16 sm:gap-4 sm:px-4">
        {/* Mobile hamburger */}
        <Sheet open={navOpen} onOpenChange={setNavOpen}>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Buka menu navigasi"
              className="md:hidden"
            >
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="flex flex-col p-0">
            <SheetHeader className="border-b px-4 py-4 pt-safe">
              <SheetTitle className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
                  <Utensils className="h-5 w-5" />
                </div>
                <div className="leading-tight text-left">
                  <p className="text-sm font-semibold">{brandName}</p>
                  <p className="text-xs font-normal text-muted-foreground">
                    {brandSubtitle}
                  </p>
                </div>
              </SheetTitle>
            </SheetHeader>

            {shift && (
              <div className="border-b bg-muted/30 px-4 py-3 text-sm">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Shift berjalan
                </p>
                <p className="font-semibold tabular" suppressHydrationWarning>
                  {formatDuration(shift.openedAt)} · Kas {formatIDR(shift.openingCash)}
                </p>
                {cashier && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Kasir: <span className="font-medium text-foreground">{cashier.name}</span>
                  </p>
                )}
              </div>
            )}

            <nav className="flex-1 overflow-y-auto p-2">
              <ul className="flex flex-col gap-1">
                {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
                  const active = pathname === href || pathname.startsWith(`${href}/`);
                  return (
                    <li key={href}>
                      <SheetClose asChild>
                        <Link
                          href={href}
                          className={cn(
                            "flex items-center gap-3 rounded-md px-3 py-3 text-sm font-medium transition-colors",
                            active
                              ? "bg-primary text-primary-foreground"
                              : "text-foreground/80 hover:bg-accent hover:text-accent-foreground"
                          )}
                        >
                          <Icon className="h-5 w-5" />
                          <span>{label}</span>
                        </Link>
                      </SheetClose>
                    </li>
                  );
                })}
              </ul>
            </nav>

            <div className="border-t p-3 pb-safe-4">
              <SheetClose asChild>
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={handleLogout}
                >
                  <LogOut className="h-4 w-4" />
                  Logout / Ganti Kasir
                </Button>
              </SheetClose>
            </div>
          </SheetContent>
        </Sheet>

        {/* Brand */}
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground sm:h-10 sm:w-10">
            <Utensils className="h-4 w-4 sm:h-5 sm:w-5" />
          </div>
          <div className="min-w-0 leading-tight">
            <p className="truncate text-sm font-semibold">{brandName}</p>
            <p className="hidden text-xs text-muted-foreground sm:block">
              {brandSubtitle}
            </p>
          </div>
        </div>

        {/* Desktop nav */}
        <nav className="ml-4 hidden items-center gap-1 md:flex">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link key={href} href={href}>
                <Button
                  variant={active ? "default" : "ghost"}
                  size="lg"
                  className={cn(!active && "text-foreground/80")}
                >
                  <Icon className="h-5 w-5" />
                  <span className="hidden lg:inline">{label}</span>
                </Button>
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          {shift && (
            <div className="hidden text-right lg:block">
              <p className="text-xs text-muted-foreground">Shift berjalan</p>
              <p className="text-sm font-semibold tabular" suppressHydrationWarning>
                {formatDuration(shift.openedAt)} · Kas {formatIDR(shift.openingCash)}
              </p>
            </div>
          )}
          {cashier && (
            <Badge
              variant="secondary"
              className="h-7 px-2 text-xs sm:h-8 sm:px-3 sm:text-sm"
            >
              {cashier.name}
            </Badge>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="hidden md:inline-flex"
            aria-label="Logout"
            onClick={handleLogout}
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

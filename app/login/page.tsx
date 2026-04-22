"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Utensils } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Numpad } from "@/components/pos/numpad";
import { loginWithPin, signOut } from "@/lib/api/auth";
import { useAuthStore } from "@/lib/stores/auth-store";
import { useShiftStore } from "@/lib/stores/shift-store";
import { MOCK_CASHIERS } from "@/lib/mock/cashiers";

export default function LoginPage() {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const setCashier = useAuthStore((s) => s.setCashier);
  const hydrate = useShiftStore((s) => s.hydrate);

  useEffect(() => {
    void signOut().catch(() => {});
    useAuthStore.getState().logout();
  }, []);

  const handleSubmit = async (rawPin: string) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const cashier = await loginWithPin(rawPin);
      setCashier(cashier);
      await hydrate();
      const shift = useShiftStore.getState().shift;
      toast.success(`Selamat datang, ${cashier.name}`);
      router.replace(shift ? "/order" : "/shift/open");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Login gagal");
      setPin("");
    } finally {
      setSubmitting(false);
    }
  };

  const handleChange = (next: string) => {
    setPin(next);
    if (next.length === 6) {
      void handleSubmit(next);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-amber-50 via-background to-stone-100 p-6">
      <Card className="w-full max-w-md">
        <CardContent className="pt-8">
          <div className="mb-6 flex flex-col items-center gap-2 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
              <Utensils className="h-7 w-7" />
            </div>
            <h1 className="text-2xl font-semibold">ALLEE Social House</h1>
            <p className="text-sm text-muted-foreground">
              Masukkan PIN kasir Anda untuk memulai shift.
            </p>
          </div>

          <div className="mb-6 flex items-center justify-center gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className={`h-4 w-4 rounded-full border-2 transition-colors ${
                  i < pin.length
                    ? "border-primary bg-primary"
                    : "border-muted-foreground/30 bg-transparent"
                }`}
              />
            ))}
          </div>

          {/* PIN mode — allowLeadingZero agar PIN "012345" juga valid. */}
          <Numpad
            value={pin}
            onChange={handleChange}
            maxLength={6}
            allowLeadingZero
          />

          <div className="mt-6 flex justify-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPin("")}
              disabled={submitting}
            >
              Reset
            </Button>
          </div>

          <div className="mt-6 rounded-md border border-dashed bg-muted/40 p-3 text-xs text-muted-foreground">
            <p className="mb-1 font-medium text-foreground">PIN demo:</p>
            {MOCK_CASHIERS.map((c) => (
              <p key={c.id} className="tabular">
                {c.name}: <span className="font-mono">{c.pin}</span>
              </p>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

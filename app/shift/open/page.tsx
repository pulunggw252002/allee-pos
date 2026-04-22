"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Banknote, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthGuard } from "@/components/pos/auth-guard";
import { Numpad, parseNumpadValue } from "@/components/pos/numpad";
import { formatIDR } from "@/lib/format";
import { openShift, getActiveShift } from "@/lib/api/shifts";
import { getPosConfig } from "@/lib/api/config";
import { useAuthStore } from "@/lib/stores/auth-store";
import { useShiftStore } from "@/lib/stores/shift-store";

function OpenShiftInner() {
  const router = useRouter();
  const cashier = useAuthStore((s) => s.cashier);
  const setShift = useShiftStore((s) => s.setShift);
  const { openingCashPresets } = getPosConfig();
  const [raw, setRaw] = useState("0");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    void getActiveShift().then((active) => {
      if (active) {
        setShift(active);
        router.replace("/order");
      }
    });
  }, [router, setShift]);

  const amount = parseNumpadValue(raw);

  const handleOpen = async () => {
    if (!cashier) return;
    if (amount <= 0) {
      toast.error("Kas awal harus lebih dari 0");
      return;
    }
    setSubmitting(true);
    try {
      const shift = await openShift({
        cashierId: cashier.id,
        openingCash: amount,
        note: note.trim() || undefined,
      });
      setShift(shift);
      toast.success(`Shift dibuka. Kas awal ${formatIDR(amount)}`);
      router.replace("/order");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal buka shift");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-background to-stone-100 p-6">
      <div className="mx-auto max-w-4xl">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Buka Shift</h1>
            <p className="text-sm text-muted-foreground">
              Kasir: <span className="font-medium text-foreground">{cashier?.name}</span>
            </p>
          </div>
          <Button
            variant="ghost"
            onClick={() => {
              useAuthStore.getState().logout();
              router.replace("/login");
            }}
          >
            <ArrowLeft className="h-4 w-4" /> Ganti kasir
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-[1.2fr_1fr]">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Banknote className="h-5 w-5 text-primary" /> Uang Awal Kas
              </CardTitle>
              <CardDescription>
                Masukkan nominal uang tunai yang ada di laci kasir saat shift dimulai.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="rounded-lg border bg-muted/30 p-4 text-center">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Opening Cash
                </p>
                <p className="mt-1 text-4xl font-semibold tabular">{formatIDR(amount)}</p>
              </div>

              <div className="grid grid-cols-5 gap-2">
                {openingCashPresets.map((d) => (
                  <Button
                    key={d}
                    variant="outline"
                    size="lg"
                    className="h-12 tabular"
                    onClick={() => setRaw(String(d))}
                  >
                    {d >= 1_000_000 ? `${d / 1_000_000}jt` : `${d / 1000}k`}
                  </Button>
                ))}
              </div>

              <div className="space-y-2">
                <Label htmlFor="note">Catatan (opsional)</Label>
                <Input
                  id="note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="mis. termasuk kembalian hari sebelumnya"
                />
              </div>

              <Button
                size="xl"
                className="w-full"
                onClick={handleOpen}
                disabled={submitting || amount <= 0}
              >
                {submitting ? "Membuka…" : `Buka Shift — ${formatIDR(amount)}`}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Input Nominal</CardTitle>
              <CardDescription>Ketik nominal uang tunai awal kas.</CardDescription>
            </CardHeader>
            <CardContent>
              <Numpad value={raw} onChange={setRaw} maxLength={10} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <AuthGuard>
      <OpenShiftInner />
    </AuthGuard>
  );
}

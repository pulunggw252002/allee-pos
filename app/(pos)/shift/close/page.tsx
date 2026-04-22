"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Banknote, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Numpad, parseNumpadValue } from "@/components/pos/numpad";
import { closeShift, getShiftSummary } from "@/lib/api/shifts";
import { useShiftStore } from "@/lib/stores/shift-store";
import { useAuthStore } from "@/lib/stores/auth-store";
import type { ShiftSummary } from "@/lib/types";
import { formatDateTime, formatDuration, formatIDR } from "@/lib/format";
import { cn } from "@/lib/utils";

export default function CloseShiftPage() {
  const router = useRouter();
  const shift = useShiftStore((s) => s.shift);
  const clearShift = useShiftStore((s) => s.clear);
  const logout = useAuthStore((s) => s.logout);

  const [raw, setRaw] = useState("0");
  const [preview, setPreview] = useState<ShiftSummary | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [closedSummary, setClosedSummary] = useState<ShiftSummary | null>(null);

  useEffect(() => {
    if (!shift) return;
    void getShiftSummary(shift.id).then(setPreview);
  }, [shift]);

  const actual = parseNumpadValue(raw);

  const displaySummary = useMemo<ShiftSummary | null>(() => {
    if (closedSummary) return closedSummary;
    if (!preview) return null;
    const expected = preview.expectedCash;
    return { ...preview, actualCash: actual, cashDifference: actual - expected };
  }, [preview, actual, closedSummary]);

  const handleClose = async () => {
    if (!shift) return;
    setSubmitting(true);
    try {
      const summary = await closeShift({ shiftId: shift.id, actualCash: actual });
      setClosedSummary(summary);
      // NOTE: TIDAK memanggil clearShift() di sini. Kalau shift di-clear sekarang,
      // ShiftGuard di layout (pos) akan melihat !shift dan redirect ke /shift/open
      // SEBELUM card konfirmasi summary sempat dilihat user. clearShift() di-tunda
      // ke handler tombol Logout / Buka Shift Baru di bawah (yang navigasinya keluar
      // dari (pos) route group).
      toast.success("Shift berhasil ditutup");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal tutup shift");
    } finally {
      setSubmitting(false);
    }
  };

  if (closedSummary) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <Card>
          <CardHeader className="items-center text-center">
            <CheckCircle2 className="h-12 w-12 text-emerald-500" />
            <CardTitle>Shift Ditutup</CardTitle>
            <CardDescription>
              Shift telah tersimpan. Selisih kas:{" "}
              <span
                className={cn(
                  "font-semibold tabular",
                  closedSummary.cashDifference === 0 && "text-emerald-600",
                  closedSummary.cashDifference < 0 && "text-destructive",
                  closedSummary.cashDifference > 0 && "text-amber-600"
                )}
              >
                {formatIDR(closedSummary.cashDifference)}
              </span>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <SummaryBlock summary={closedSummary} />
            <div className="flex gap-2">
              <Button
                className="flex-1"
                onClick={() => {
                  clearShift();
                  logout();
                  router.replace("/login");
                }}
              >
                Logout
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  clearShift();
                  router.replace("/shift/open");
                }}
              >
                Buka Shift Baru
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!shift || !preview) {
    return (
      <div className="flex h-full items-center justify-center py-20 text-muted-foreground">
        <p className="text-sm">Memuat ringkasan shift…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto grid max-w-6xl gap-4 p-4 lg:grid-cols-[1.1fr_1fr]">
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => router.push("/order")} className="w-fit">
          <ArrowLeft className="h-4 w-4" /> Kembali
        </Button>

        <Card>
          <CardHeader>
            <CardTitle>Ringkasan Shift</CardTitle>
            <CardDescription>
              {shift.cashierName} · dibuka {formatDateTime(shift.openedAt)} ·{" "}
              berjalan {formatDuration(shift.openedAt)}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SummaryBlock summary={displaySummary ?? preview} />
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Banknote className="h-5 w-5 text-primary" /> Hitung Kas Aktual
            </CardTitle>
            <CardDescription>
              Hitung fisik uang tunai di laci sekarang, lalu masukkan total.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border bg-muted/30 p-4 text-center">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Actual Cash
              </p>
              <p className="mt-1 text-4xl font-semibold tabular">{formatIDR(actual)}</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Expected: <span className="tabular">{formatIDR(preview.expectedCash)}</span>
              </p>
              {actual > 0 && (
                <p
                  className={cn(
                    "mt-1 text-sm font-semibold tabular",
                    actual === preview.expectedCash && "text-emerald-600",
                    actual < preview.expectedCash && "text-destructive",
                    actual > preview.expectedCash && "text-amber-600"
                  )}
                >
                  Selisih: {formatIDR(actual - preview.expectedCash)}
                </p>
              )}
            </div>

            <Numpad value={raw} onChange={setRaw} maxLength={10} />

            <Button
              size="xl"
              className="w-full"
              onClick={handleClose}
              disabled={submitting || actual <= 0}
            >
              {submitting ? "Menutup…" : "Tutup Shift"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function SummaryBlock({ summary }: { summary: ShiftSummary }) {
  const methods: Array<{ key: keyof typeof summary.breakdown; label: string }> = [
    { key: "cash", label: "Tunai" },
    { key: "qris", label: "QRIS" },
    { key: "card", label: "Kartu" },
    { key: "transfer", label: "Transfer" },
  ];

  return (
    <div className="space-y-4 text-sm">
      <div>
        <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Revenue</p>
        <div className="rounded-lg border bg-muted/20 p-3">
          <div className="flex items-end justify-between">
            <span className="text-muted-foreground">Total Pendapatan</span>
            <span className="text-2xl font-bold tabular">
              {formatIDR(summary.totalRevenue)}
            </span>
          </div>
          <div className="mt-1 flex justify-between text-xs text-muted-foreground tabular">
            <span>{summary.orderCount} order</span>
          </div>
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
          Breakdown Pembayaran
        </p>
        <ul className="space-y-1">
          {methods.map(({ key, label }) => (
            <li key={key} className="flex justify-between tabular">
              <span className="text-muted-foreground">{label}</span>
              <span>{formatIDR(summary.breakdown[key])}</span>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
          Perhitungan Kas
        </p>
        <ul className="space-y-1">
          <li className="flex justify-between tabular">
            <span className="text-muted-foreground">Opening Cash</span>
            <span>{formatIDR(summary.shift.openingCash)}</span>
          </li>
          <li className="flex justify-between tabular">
            <span className="text-muted-foreground">+ Penjualan Tunai</span>
            <span>{formatIDR(summary.cashSales)}</span>
          </li>
          <li className="flex justify-between border-t pt-1 font-medium tabular">
            <span>Expected Cash</span>
            <span>{formatIDR(summary.expectedCash)}</span>
          </li>
          <li className="flex justify-between tabular">
            <span className="text-muted-foreground">Actual Cash</span>
            <span>{formatIDR(summary.actualCash)}</span>
          </li>
          <li
            className={cn(
              "flex justify-between border-t pt-1 font-semibold tabular",
              summary.cashDifference === 0 && "text-emerald-600",
              summary.cashDifference < 0 && "text-destructive",
              summary.cashDifference > 0 && "text-amber-600"
            )}
          >
            <span>Selisih Kas</span>
            <span>{formatIDR(summary.cashDifference)}</span>
          </li>
        </ul>
      </div>
    </div>
  );
}

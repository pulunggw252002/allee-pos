"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Check,
  ChefHat,
  Printer as PrinterIcon,
  Receipt,
  RotateCw,
  TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { listPrinters, type PosPrinter } from "@/lib/api/printers";
import { usePrinterStore } from "@/lib/stores/printer-store";
import { cn } from "@/lib/utils";

const TYPE_LABEL: Record<PosPrinter["type"], string> = {
  cashier: "Kasir",
  kitchen: "Dapur",
  bar: "Bar",
  label: "Label",
};

const CONNECTION_LABEL: Record<PosPrinter["connection"], string> = {
  usb: "USB",
  bluetooth: "Bluetooth",
  network: "Network",
  other: "Lainnya",
};

export default function SettingsPage() {
  const [printers, setPrinters] = useState<PosPrinter[]>([]);
  const [loading, setLoading] = useState(true);
  const receiptId = usePrinterStore((s) => s.receiptPrinterId);
  const kitchenId = usePrinterStore((s) => s.kitchenPrinterId);
  const setReceipt = usePrinterStore((s) => s.setReceiptPrinter);
  const setKitchen = usePrinterStore((s) => s.setKitchenPrinter);

  const refresh = async () => {
    setLoading(true);
    try {
      const list = await listPrinters();
      setPrinters(list);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal memuat printer");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const receiptCandidates = useMemo(
    () => printers.filter((p) => p.type === "cashier" || p.type === "label"),
    [printers],
  );
  const kitchenCandidates = useMemo(
    () => printers.filter((p) => p.type === "kitchen" || p.type === "bar"),
    [printers],
  );

  const receiptPicked = printers.find((p) => p.id === receiptId);
  const kitchenPicked = printers.find((p) => p.id === kitchenId);

  // Jika printer terpilih hilang dari list (di-archive di backoffice setelah
  // sync terakhir), beri warning supaya kasir paham kenapa cetak gagal.
  const receiptOrphan = receiptId && !receiptPicked;
  const kitchenOrphan = kitchenId && !kitchenPicked;

  const handlePick = (
    printer: PosPrinter,
    role: "receipt" | "kitchen",
  ) => {
    // Toggle: tap printer yang sudah ke-pick → unpick.
    const currentId = role === "receipt" ? receiptId : kitchenId;
    const next = currentId === printer.id ? null : printer.id;

    if (next) {
      // Mutual exclusive guard: 1 printer fisik tidak boleh dipakai untuk
      // 2 role berbeda — kasir bingung, struk & tiket dapur ke-mix di
      // 1 paper roll.
      const otherId = role === "receipt" ? kitchenId : receiptId;
      if (otherId === next) {
        toast.error(
          `"${printer.code}" sudah dipakai untuk slot lain. Lepas dari sana dulu.`,
        );
        return;
      }
    }

    if (role === "receipt") {
      setReceipt(next);
      toast.success(
        next ? `Printer kasir: ${printer.code}` : "Printer kasir dilepas",
      );
    } else {
      setKitchen(next);
      toast.success(
        next ? `Printer dapur: ${printer.code}` : "Printer dapur dilepas",
      );
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-3 pb-[calc(var(--sa-bottom)+1rem)] sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold sm:text-2xl">Settings POS</h1>
          <p className="text-sm text-muted-foreground">
            Pilih printer yang dipakai device ini — maks. 1 printer struk + 1 printer dapur.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={refresh}>
          <RotateCw className="h-4 w-4" /> Refresh
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <PrinterIcon className="h-4 w-4" /> Status Sambungan Printer
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <SlotStatus
            icon={Receipt}
            label="Printer Struk (Kasir)"
            picked={receiptPicked}
            orphan={Boolean(receiptOrphan)}
            onClear={() => setReceipt(null)}
          />
          <SlotStatus
            icon={ChefHat}
            label="Printer Tiket Dapur"
            picked={kitchenPicked}
            orphan={Boolean(kitchenOrphan)}
            onClear={() => setKitchen(null)}
          />
          <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
            Catatan: POS pakai <span className="font-medium">printer default OS</span> saat tekan
            &quot;Cetak&quot;. Pastikan printer fisik yang Anda pilih di sini sudah di-set sebagai
            default printer di pengaturan OS device ini.
          </p>
        </CardContent>
      </Card>

      <PrinterPicker
        title="Pilih Printer Struk"
        description="Untuk struk pembayaran & cetak ulang dari open bill. Tap untuk pilih, tap lagi untuk lepas."
        candidates={receiptCandidates}
        pickedId={receiptId}
        otherId={kitchenId}
        loading={loading}
        emptyHint={
          printers.length === 0
            ? "Belum ada printer untuk outlet ini. Owner perlu menambahkan printer di backoffice."
            : "Tidak ada printer bertipe Kasir/Label. Tambahkan di backoffice atau pakai tipe lain."
        }
        onPick={(p) => handlePick(p, "receipt")}
      />

      <PrinterPicker
        title="Pilih Printer Dapur"
        description="Untuk tiket order yang dikirim ke dapur/bar. Tap untuk pilih, tap lagi untuk lepas."
        candidates={kitchenCandidates}
        pickedId={kitchenId}
        otherId={receiptId}
        loading={loading}
        emptyHint={
          printers.length === 0
            ? "Belum ada printer untuk outlet ini. Owner perlu menambahkan printer di backoffice."
            : "Tidak ada printer bertipe Dapur/Bar. Tambahkan di backoffice."
        }
        onPick={(p) => handlePick(p, "kitchen")}
      />
    </div>
  );
}

function SlotStatus({
  icon: Icon,
  label,
  picked,
  orphan,
  onClear,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  picked: PosPrinter | undefined;
  orphan: boolean;
  onClear: () => void;
}) {
  return (
    <div className="flex items-start gap-3 rounded-md border p-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        {orphan ? (
          <p className="mt-0.5 flex items-center gap-1.5 text-sm font-medium text-destructive">
            <TriangleAlert className="h-4 w-4" /> Printer terpilih tidak ditemukan
          </p>
        ) : picked ? (
          <p className="mt-0.5 truncate text-sm font-medium">
            <span className="font-mono">{picked.code}</span> · {picked.name}
          </p>
        ) : (
          <p className="mt-0.5 text-sm text-muted-foreground">Belum dipilih</p>
        )}
        {picked && !orphan && (
          <p className="text-xs text-muted-foreground">
            {TYPE_LABEL[picked.type]} · {CONNECTION_LABEL[picked.connection]}
            {picked.address ? ` · ${picked.address}` : ""}
          </p>
        )}
      </div>
      {(picked || orphan) && (
        <Button variant="ghost" size="sm" onClick={onClear}>
          Lepas
        </Button>
      )}
    </div>
  );
}

function PrinterPicker({
  title,
  description,
  candidates,
  pickedId,
  otherId,
  loading,
  emptyHint,
  onPick,
}: {
  title: string;
  description: string;
  candidates: PosPrinter[];
  pickedId: string | null;
  otherId: string | null;
  loading: boolean;
  emptyHint: string;
  onPick: (p: PosPrinter) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{title}</CardTitle>
        <p className="text-xs text-muted-foreground">{description}</p>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Memuat printer…</p>
        ) : candidates.length === 0 ? (
          <p className="rounded-md border border-dashed py-6 text-center text-sm text-muted-foreground">
            {emptyHint}
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {candidates.map((p) => {
              const picked = pickedId === p.id;
              const usedElsewhere = otherId === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onPick(p)}
                  disabled={usedElsewhere}
                  className={cn(
                    "flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition active:scale-[0.99]",
                    picked
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "hover:border-primary/40",
                    usedElsewhere && "opacity-60",
                  )}
                >
                  <div className="flex w-full items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-mono text-xs text-muted-foreground">{p.code}</p>
                      <p className="truncate text-sm font-medium">{p.name}</p>
                    </div>
                    {picked && (
                      <Badge variant="default" className="shrink-0">
                        <Check className="h-3 w-3" /> Aktif
                      </Badge>
                    )}
                    {usedElsewhere && (
                      <Badge variant="secondary" className="shrink-0">
                        Dipakai slot lain
                      </Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
                    <Badge variant="outline" className="text-[10px]">
                      {TYPE_LABEL[p.type]}
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">
                      {CONNECTION_LABEL[p.connection]}
                    </Badge>
                    <span className="text-[10px]">{p.paperWidth} kolom</span>
                  </div>
                  {p.address && (
                    <p className="font-mono text-[10px] text-muted-foreground">{p.address}</p>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

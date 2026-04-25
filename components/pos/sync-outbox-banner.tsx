"use client";

/**
 * Banner pengingat: ada N transaksi/void/shift summary yang gagal di-push ke
 * backoffice. Muncul di bawah header POS, di-hide kalau queue kosong.
 *
 * Polling 30 detik — cukup buat MVP. Untuk real-time bisa upgrade ke SSE
 * nanti, tapi 30s cukup karena queue cuma terisi saat backoffice down
 * (rare event).
 *
 * Action:
 *  - "Coba lagi" → POST /api/sync/retry → drain. Setelah drain, refresh.
 *  - Banner stay sampai queue empty.
 *
 * Kenapa banner di header (bukan toast):
 *  - Toast hilang setelah beberapa detik. Issue ini permanent sampai
 *    di-resolve, jadi UI permanent juga.
 *  - Kasir butuh visibility kalau ada transaksi yang belum masuk laporan
 *    backoffice — supaya bisa lapor admin sebelum end-of-day.
 */

import { useEffect, useState } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api/client";

interface QueueStatus {
  pending: number;
  byKind: {
    transaction?: number;
    void_item?: number;
    void_transaction?: number;
    shift_summary?: number;
  };
  oldestCreatedAt: string | null;
}

interface RetryResult {
  total: number;
  success: number;
  failed: number;
  remaining: number;
}

const POLL_INTERVAL_MS = 30_000;

export function SyncOutboxBanner() {
  const [status, setStatus] = useState<QueueStatus | null>(null);
  const [retrying, setRetrying] = useState(false);

  const refresh = async () => {
    try {
      const data = await apiFetch<QueueStatus>("/api/sync/queue");
      setStatus(data);
    } catch {
      // Endpoint butuh session — kalau user belum login, diam saja.
      setStatus(null);
    }
  };

  useEffect(() => {
    void refresh();
    const id = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  if (!status || status.pending === 0) return null;

  const handleRetry = async () => {
    setRetrying(true);
    try {
      const res = await apiFetch<RetryResult>("/api/sync/retry", {
        method: "POST",
      });
      if (res.success > 0 && res.remaining === 0) {
        toast.success(
          `${res.success} item ter-sync ke backoffice. Queue kosong.`,
        );
      } else if (res.success > 0) {
        toast.success(
          `${res.success}/${res.total} ter-sync. ${res.remaining} masih gagal — coba lagi nanti.`,
        );
      } else {
        toast.error(
          `Gagal sync — ${res.remaining} masih pending. Cek koneksi backoffice.`,
        );
      }
      await refresh();
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Gagal trigger retry sync",
      );
    } finally {
      setRetrying(false);
    }
  };

  // Susun pesan ramah dari breakdown.
  const parts: string[] = [];
  if (status.byKind.transaction)
    parts.push(`${status.byKind.transaction} transaksi`);
  if (status.byKind.void_item) parts.push(`${status.byKind.void_item} void item`);
  if (status.byKind.void_transaction)
    parts.push(`${status.byKind.void_transaction} void order`);
  if (status.byKind.shift_summary)
    parts.push(`${status.byKind.shift_summary} shift summary`);
  const breakdown = parts.length > 0 ? parts.join(" + ") : `${status.pending} item`;

  return (
    <div className="border-b border-amber-300 bg-amber-50 px-3 py-2 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 text-sm">
        <AlertCircle className="h-4 w-4 shrink-0" />
        <p className="flex-1">
          <span className="font-semibold">{breakdown}</span> belum tercatat di
          backoffice — kemungkinan koneksi sempat putus saat transaksi.
        </p>
        <Button
          size="sm"
          variant="outline"
          onClick={handleRetry}
          disabled={retrying}
          className="border-amber-500 text-amber-900 hover:bg-amber-100 dark:border-amber-600 dark:text-amber-100 dark:hover:bg-amber-900"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${retrying ? "animate-spin" : ""}`}
          />
          {retrying ? "Menyinkron…" : "Coba sync lagi"}
        </Button>
      </div>
    </div>
  );
}

const idrFormatter = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const numberFormatter = new Intl.NumberFormat("id-ID", {
  maximumFractionDigits: 0,
});

export function formatIDR(value: number): string {
  if (!Number.isFinite(value)) return "Rp 0";
  return idrFormatter.format(Math.round(value)).replace(/\u00A0/g, " ");
}

export function formatNumber(value: number): string {
  return numberFormatter.format(Math.round(value));
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDuration(fromIso: string, toIso?: string): string {
  const start = new Date(fromIso).getTime();
  const end = (toIso ? new Date(toIso) : new Date()).getTime();
  const diffSec = Math.max(0, Math.floor((end - start) / 1000));
  const h = Math.floor(diffSec / 3600);
  const m = Math.floor((diffSec % 3600) / 60);
  if (h > 0) return `${h}j ${m}m`;
  return `${m}m`;
}

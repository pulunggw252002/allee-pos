/**
 * Konfigurasi runtime untuk integrasi backoffice.
 *
 * Master toggle `BACKOFFICE_MODE` mengontrol apakah POS jalan stand-alone
 * (DB lokal sebagai source of truth) atau read-from / write-to backoffice.
 *
 * Ketika OFF (default), setiap helper di backoffice/* throw `BackofficeDisabledError`
 * — ini eksplisit supaya bug "lupa cek mode" gampang ke-tangkap di test.
 */

export class BackofficeDisabledError extends Error {
  constructor() {
    super(
      "Backoffice mode tidak aktif. Set BACKOFFICE_MODE=true di env untuk menyalakan integrasi."
    );
    this.name = "BackofficeDisabledError";
  }
}

export class BackofficeConfigError extends Error {
  constructor(missing: string) {
    super(
      `Konfigurasi backoffice tidak lengkap: ${missing}. Lihat docs/BACKOFFICE_INTEGRATION.md.`
    );
    this.name = "BackofficeConfigError";
  }
}

export interface BackofficeConfig {
  /** Base URL backoffice API (tanpa trailing slash). Sudah include `/api`. */
  apiUrl: string;
  /** Email service-account untuk POS sign-in ke backoffice. */
  serviceEmail: string;
  /** Password service-account. */
  servicePassword: string;
  /** Outlet override. Kalau null, POS auto-detect dari /api/session. */
  outletIdOverride: string | null;
}

/** Source of truth: env vars. */
export function isBackofficeModeEnabled(): boolean {
  // Default OFF — perlu di-set eksplisit "true" / "1" / "yes".
  const v = (process.env.BACKOFFICE_MODE ?? "").toLowerCase().trim();
  return v === "true" || v === "1" || v === "yes";
}

/**
 * Baca + validasi config dari env. Throw kalau wajib hilang.
 * Ini sengaja tidak di-cache supaya hot-reload env saat dev kelihatan langsung.
 */
export function readBackofficeConfig(): BackofficeConfig {
  if (!isBackofficeModeEnabled()) {
    throw new BackofficeDisabledError();
  }

  const apiUrlRaw = process.env.BACKOFFICE_API_URL?.trim();
  if (!apiUrlRaw) throw new BackofficeConfigError("BACKOFFICE_API_URL");
  // Normalize: hapus trailing slash supaya `${apiUrl}/api/menus` predictable.
  const apiUrl = apiUrlRaw.replace(/\/+$/, "");

  const serviceEmail = process.env.BACKOFFICE_SERVICE_EMAIL?.trim();
  if (!serviceEmail) throw new BackofficeConfigError("BACKOFFICE_SERVICE_EMAIL");

  const servicePassword = process.env.BACKOFFICE_SERVICE_PASSWORD;
  if (!servicePassword) throw new BackofficeConfigError("BACKOFFICE_SERVICE_PASSWORD");

  // NEXT_PUBLIC_OUTLET_ID dibaca server-side juga karena Next inject ke
  // process.env di build time.
  const outletOverride = process.env.NEXT_PUBLIC_OUTLET_ID?.trim() || null;

  return {
    apiUrl,
    serviceEmail,
    servicePassword,
    outletIdOverride: outletOverride,
  };
}

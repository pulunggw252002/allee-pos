/**
 * Static POS config yang TIDAK boleh berubah per outlet (role permission,
 * dst.). Untuk konfig yang dinamis per outlet (brand, tax, footer), pakai
 * `runtime-config.ts` — di-baca dari local DB hasil sync backoffice.
 *
 * Filosofi: SDK ini franchise-ready. Tidak ada hardcoded brand, alamat,
 * pajak, atau footer di sini.
 */
export const SERVER_POS_CONFIG = {
  itemDoneRoles: ["cashier", "supervisor"] as const,
};

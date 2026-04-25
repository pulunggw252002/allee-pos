import { handle, ok } from "@/lib/api-server/response";
import { SERVER_POS_CONFIG } from "@/lib/api-server/pos-config";
import { getOutletConfig, getTaxRates } from "@/lib/api-server/runtime-config";

/**
 * Konfigurasi POS yang dikonsumsi UI saat boot.
 *
 * `outlet` & `taxRate/serviceRate` di-resolve dinamis dari hasil sync
 * backoffice — TIDAK hardcoded supaya satu build POS bisa di-deploy untuk
 * banyak outlet (franchise model).
 */
export async function GET() {
  return handle(async () => {
    const [outlet, tax] = await Promise.all([getOutletConfig(), getTaxRates()]);
    return ok({
      outlet: {
        id: outlet.id,
        brandName: outlet.brandName,
        subtitle: outlet.subtitle,
        address: outlet.address,
        city: outlet.city,
        phone: outlet.phone,
        taxId: outlet.taxId,
        receiptFooter: outlet.receiptFooter,
        taxRate: tax.taxRate,
        serviceRate: tax.serviceRate,
      },
      deliveryProviders: ["Grab", "Gojek", "ShopeeFood", "Joker", "Traveloka Eats"],
      discountPresets: [0, 5_000, 10_000, 20_000],
      cashDenominations: [10_000, 20_000, 50_000, 100_000],
      cashSuggestionSteps: [5_000, 10_000, 20_000, 50_000, 100_000],
      openingCashPresets: [100_000, 200_000, 300_000, 500_000, 1_000_000],
      enabledPaymentMethods: ["cash", "qris", "card", "transfer"],
      itemDoneRoles: SERVER_POS_CONFIG.itemDoneRoles,
    });
  });
}

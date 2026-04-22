import { handle, ok } from "@/lib/api-server/response";
import { SERVER_POS_CONFIG } from "@/lib/api-server/pos-config";

export async function GET() {
  return handle(async () =>
    ok({
      outlet: SERVER_POS_CONFIG.outlet,
      deliveryProviders: ["Grab", "Gojek", "ShopeeFood", "Joker", "Traveloka Eats"],
      discountPresets: [0, 5_000, 10_000, 20_000],
      cashDenominations: [10_000, 20_000, 50_000, 100_000],
      cashSuggestionSteps: [5_000, 10_000, 20_000, 50_000, 100_000],
      openingCashPresets: [100_000, 200_000, 300_000, 500_000, 1_000_000],
      enabledPaymentMethods: ["cash", "qris", "card", "transfer"],
      itemDoneRoles: SERVER_POS_CONFIG.itemDoneRoles,
    })
  );
}

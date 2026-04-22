import type { Cashier } from "@/lib/types";

export const MOCK_CASHIERS: Cashier[] = [
  { id: "c1", name: "Andi", pin: "111111", role: "cashier" },
  { id: "c2", name: "Bella", pin: "222222", role: "cashier" },
  { id: "c3", name: "Sinta (Supervisor)", pin: "999999", role: "supervisor" },
];

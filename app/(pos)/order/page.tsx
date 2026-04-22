import { MenuGrid } from "@/components/pos/menu-grid";
import { CartPanel } from "@/components/pos/cart-panel";

export default function OrderPage() {
  return (
    <div className="grid h-[calc(100vh-4rem)] grid-cols-1 lg:grid-cols-[1fr_22rem] xl:grid-cols-[1fr_26rem]">
      <div className="flex flex-col overflow-hidden p-4">
        <MenuGrid />
      </div>
      <CartPanel />
    </div>
  );
}

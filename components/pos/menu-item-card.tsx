"use client";

import type { Product } from "@/lib/types";
import { formatIDR } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Props {
  product: Product;
  onAdd: (p: Product) => void;
  qtyInCart: number;
}

export function MenuItemCard({ product, onAdd, qtyInCart }: Props) {
  return (
    <button
      type="button"
      onClick={() => onAdd(product)}
      className={cn(
        "group relative flex min-h-[120px] flex-col items-start justify-between rounded-xl border bg-card p-3 text-left transition active:scale-[0.98]",
        "hover:border-primary/50 hover:shadow-sm"
      )}
    >
      {qtyInCart > 0 && (
        <span className="absolute right-2 top-2 flex h-6 min-w-6 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground tabular">
          {qtyInCart}
        </span>
      )}
      <div className="text-3xl">{product.imageEmoji ?? "🍽️"}</div>
      <div className="w-full">
        <p className="line-clamp-2 text-sm font-medium leading-tight">{product.name}</p>
        <p className="mt-1 text-sm font-semibold text-primary tabular">
          {formatIDR(product.price)}
        </p>
      </div>
    </button>
  );
}

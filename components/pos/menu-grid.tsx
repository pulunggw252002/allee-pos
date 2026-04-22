"use client";

import { useEffect, useMemo, useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { MenuItemCard } from "./menu-item-card";
import { listCategories, listProducts } from "@/lib/api/products";
import type { Category, Product } from "@/lib/types";
import { useCartStore } from "@/lib/stores/cart-store";
import { Search } from "lucide-react";

export function MenuGrid() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [activeTab, setActiveTab] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  const addProduct = useCartStore((s) => s.addProduct);
  const items = useCartStore((s) => s.items);

  useEffect(() => {
    let alive = true;
    Promise.all([listCategories(), listProducts()]).then(([cats, prods]) => {
      if (!alive) return;
      setCategories(cats);
      setProducts(prods);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);

  const qtyByProduct = useMemo(() => {
    const map: Record<string, number> = {};
    for (const it of items) map[it.productId] = it.qty;
    return map;
  }, [items]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => {
      if (activeTab !== "all" && p.categoryId !== activeTab) return false;
      if (!q) return true;
      return p.name.toLowerCase().includes(q);
    });
  }, [products, activeTab, query]);

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cari menu…"
          className="pl-9"
        />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-1 flex-col">
        <TabsList className="h-12 flex-wrap justify-start">
          <TabsTrigger value="all" className="h-10 px-4 text-sm">
            Semua
          </TabsTrigger>
          {categories.map((c) => (
            <TabsTrigger key={c.id} value={c.id} className="h-10 px-4 text-sm">
              {c.name}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value={activeTab} className="flex-1">
          {loading ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Memuat menu…</p>
          ) : filtered.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Tidak ada menu yang cocok.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {filtered.map((p) => (
                <MenuItemCard
                  key={p.id}
                  product={p}
                  onAdd={addProduct}
                  qtyInCart={qtyByProduct[p.id] ?? 0}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

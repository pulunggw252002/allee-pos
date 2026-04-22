import type { Category, Product, Station } from "@/lib/types";
import { apiFetch } from "./client";

export async function listCategories(): Promise<Category[]> {
  return apiFetch<Category[]>("/api/categories");
}

export async function listProducts(): Promise<Product[]> {
  const all = await apiFetch<Product[]>("/api/products");
  return all.filter((p) => p.active);
}

export async function listStations(): Promise<Station[]> {
  return apiFetch<Station[]>("/api/stations");
}

export async function getProduct(id: string): Promise<Product | undefined> {
  const all = await apiFetch<Product[]>("/api/products");
  return all.find((p) => p.id === id);
}

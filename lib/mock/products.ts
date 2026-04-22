import type { Product } from "@/lib/types";

export const MOCK_PRODUCTS: Product[] = [
  // Coffee
  { id: "p-esp", name: "Espresso", price: 22000, categoryId: "cat-coffee", stationId: "st-bar", imageEmoji: "☕", active: true },
  { id: "p-ame", name: "Americano", price: 25000, categoryId: "cat-coffee", stationId: "st-bar", imageEmoji: "☕", active: true },
  { id: "p-lat", name: "Caffe Latte", price: 32000, categoryId: "cat-coffee", stationId: "st-bar", imageEmoji: "☕", active: true },
  { id: "p-cap", name: "Cappuccino", price: 32000, categoryId: "cat-coffee", stationId: "st-bar", imageEmoji: "☕", active: true },
  { id: "p-moc", name: "Mocha", price: 35000, categoryId: "cat-coffee", stationId: "st-bar", imageEmoji: "🍫", active: true },
  { id: "p-vla", name: "Vanilla Latte", price: 35000, categoryId: "cat-coffee", stationId: "st-bar", imageEmoji: "🍦", active: true },

  // Non-Coffee
  { id: "p-mat", name: "Matcha Latte", price: 35000, categoryId: "cat-non-coffee", stationId: "st-bar", imageEmoji: "🍵", active: true },
  { id: "p-cho", name: "Hot Chocolate", price: 32000, categoryId: "cat-non-coffee", stationId: "st-bar", imageEmoji: "🍫", active: true },
  { id: "p-lem", name: "Lemon Tea", price: 22000, categoryId: "cat-non-coffee", stationId: "st-bar", imageEmoji: "🍋", active: true },
  { id: "p-milk", name: "Fresh Milk", price: 22000, categoryId: "cat-non-coffee", stationId: "st-bar", imageEmoji: "🥛", active: true },

  // Food
  { id: "p-car", name: "Spaghetti Carbonara", price: 55000, categoryId: "cat-food", stationId: "st-kitchen", imageEmoji: "🍝", active: true },
  { id: "p-agl", name: "Aglio e Olio", price: 48000, categoryId: "cat-food", stationId: "st-kitchen", imageEmoji: "🍝", active: true },
  { id: "p-bur", name: "ALLEE Burger", price: 65000, categoryId: "cat-food", stationId: "st-kitchen", imageEmoji: "🍔", active: true },
  { id: "p-sal", name: "Caesar Salad", price: 42000, categoryId: "cat-food", stationId: "st-kitchen", imageEmoji: "🥗", active: true },

  // Snack
  { id: "p-fry", name: "French Fries", price: 28000, categoryId: "cat-snack", stationId: "st-kitchen", imageEmoji: "🍟", active: true },
  { id: "p-cro", name: "Butter Croissant", price: 25000, categoryId: "cat-snack", stationId: "st-kitchen", imageEmoji: "🥐", active: true },
  { id: "p-don", name: "Glazed Donut", price: 18000, categoryId: "cat-snack", stationId: "st-kitchen", imageEmoji: "🍩", active: true },
  { id: "p-cake", name: "Tiramisu Slice", price: 38000, categoryId: "cat-snack", stationId: "st-kitchen", imageEmoji: "🍰", active: true },
];

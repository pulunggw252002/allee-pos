import { eq } from "drizzle-orm";
import { db, schema } from "./index";
import { MOCK_PRODUCTS } from "@/lib/mock/products";
import { MOCK_CATEGORIES } from "@/lib/mock/categories";
import { MOCK_STATIONS } from "@/lib/mock/stations";
import { MOCK_CASHIERS } from "@/lib/mock/cashiers";
import { auth } from "@/lib/auth/server";

async function seedCashiers() {
  for (const c of MOCK_CASHIERS) {
    const email = `${c.id}@pos.local`;
    const existing = await db.query.users.findFirst({
      where: eq(schema.users.email, email),
    });
    if (existing) {
      console.log(`  · ${c.name} already exists, skip`);
      continue;
    }
    try {
      const res = await auth.api.signUpEmail({
        body: {
          name: c.name,
          email,
          password: c.pin,
          username: c.id,
        },
      });
      await db
        .update(schema.users)
        .set({ role: c.role })
        .where(eq(schema.users.id, res.user.id));
      console.log(`  ✓ ${c.name} (${c.role}) — username: ${c.id}, pin: ${c.pin}`);
    } catch (err) {
      console.error(`  ✗ ${c.name}:`, err instanceof Error ? err.message : err);
    }
  }
}

async function seedCatalog() {
  for (const s of MOCK_STATIONS) {
    await db.insert(schema.stations).values(s).onConflictDoNothing();
  }
  console.log(`  ✓ ${MOCK_STATIONS.length} stations`);

  for (const c of MOCK_CATEGORIES) {
    await db.insert(schema.categories).values(c).onConflictDoNothing();
  }
  console.log(`  ✓ ${MOCK_CATEGORIES.length} categories`);

  for (const p of MOCK_PRODUCTS) {
    await db
      .insert(schema.products)
      .values({
        id: p.id,
        name: p.name,
        price: p.price,
        categoryId: p.categoryId,
        stationId: p.stationId,
        imageEmoji: p.imageEmoji,
        active: p.active,
      })
      .onConflictDoNothing();
  }
  console.log(`  ✓ ${MOCK_PRODUCTS.length} products`);
}

async function seedTables() {
  const count = 12;
  for (let i = 1; i <= count; i++) {
    await db
      .insert(schema.tables)
      .values({
        id: `t${i}`,
        number: String(i),
        label: `Meja ${i}`,
        status: "empty",
      })
      .onConflictDoNothing();
  }
  console.log(`  ✓ ${count} tables`);
}

async function main() {
  console.log("→ Seeding database…\n");
  console.log("[cashiers]");
  await seedCashiers();
  console.log("\n[catalog]");
  await seedCatalog();
  console.log("\n[tables]");
  await seedTables();
  console.log("\n✓ Done.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

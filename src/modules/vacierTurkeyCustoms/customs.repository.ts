import { and, asc, desc, eq, ne, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { vacierTurkeyCustomsOverrides } from '@/lib/db/schema';

export type VacierTurkeyCustomsOverrideRow = typeof vacierTurkeyCustomsOverrides.$inferSelect;

export type VacierTurkeyCustomsOverrideInput = {
  sku: string;
  productName?: string | null;
  customsDescription: string;
  customsValue: string | number;
  tariffCode?: string | null;
  currency?: string | null;
  isActive?: boolean;
  source?: string | null;
};

export type VacierTurkeyCustomsOverrideFilters = {
  sku?: string | null;
  isActive?: boolean | null;
  limit?: number;
};

export async function listActiveVacierTurkeyCustomsOverrides(): Promise<VacierTurkeyCustomsOverrideRow[]> {
  return db
    .select()
    .from(vacierTurkeyCustomsOverrides)
    .where(eq(vacierTurkeyCustomsOverrides.isActive, true))
    .orderBy(asc(vacierTurkeyCustomsOverrides.sku));
}

export async function listVacierTurkeyCustomsOverrides(
  filters: VacierTurkeyCustomsOverrideFilters = {},
): Promise<VacierTurkeyCustomsOverrideRow[]> {
  const conditions = [];
  const sku = filters.sku?.trim();
  if (sku) {
    conditions.push(sql`${vacierTurkeyCustomsOverrides.sku} ILIKE ${`%${sku}%`}`);
  }
  if (filters.isActive !== null && filters.isActive !== undefined) {
    conditions.push(eq(vacierTurkeyCustomsOverrides.isActive, filters.isActive));
  }

  return db
    .select()
    .from(vacierTurkeyCustomsOverrides)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(vacierTurkeyCustomsOverrides.updatedAt))
    .limit(Math.min(Math.max(filters.limit ?? 300, 1), 1000));
}

export async function upsertVacierTurkeyCustomsOverride(input: VacierTurkeyCustomsOverrideInput) {
  const normalized = normalizeInput(input);
  const now = new Date();

  const [existing] = await db
    .select({ id: vacierTurkeyCustomsOverrides.id })
    .from(vacierTurkeyCustomsOverrides)
    .where(and(
      eq(vacierTurkeyCustomsOverrides.sku, normalized.sku),
      eq(vacierTurkeyCustomsOverrides.isActive, true),
    ))
    .limit(1);

  if (existing) {
    const [updated] = await db
      .update(vacierTurkeyCustomsOverrides)
      .set({ ...normalized, updatedAt: now })
      .where(eq(vacierTurkeyCustomsOverrides.id, existing.id))
      .returning();
    return updated;
  }

  const [created] = await db
    .insert(vacierTurkeyCustomsOverrides)
    .values({ ...normalized, createdAt: now, updatedAt: now })
    .returning();
  return created;
}

export async function updateVacierTurkeyCustomsOverride(
  id: number,
  input: Partial<VacierTurkeyCustomsOverrideInput>,
) {
  const [existing] = await db
    .select()
    .from(vacierTurkeyCustomsOverrides)
    .where(eq(vacierTurkeyCustomsOverrides.id, id))
    .limit(1);
  if (!existing) throw new Error('Override not found');

  const normalized = normalizeInput({
    sku: input.sku ?? existing.sku,
    productName: input.productName ?? existing.productName,
    customsDescription: input.customsDescription ?? existing.customsDescription,
    customsValue: input.customsValue ?? existing.customsValue,
    tariffCode: input.tariffCode ?? existing.tariffCode,
    currency: input.currency ?? existing.currency,
    isActive: input.isActive ?? existing.isActive,
    source: input.source ?? existing.source,
  });

  if (normalized.isActive) {
    await db
      .update(vacierTurkeyCustomsOverrides)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(
        eq(vacierTurkeyCustomsOverrides.sku, normalized.sku),
        eq(vacierTurkeyCustomsOverrides.isActive, true),
        ne(vacierTurkeyCustomsOverrides.id, id),
      ));
  }

  const [updated] = await db
    .update(vacierTurkeyCustomsOverrides)
    .set({ ...normalized, updatedAt: new Date() })
    .where(eq(vacierTurkeyCustomsOverrides.id, id))
    .returning();
  return updated;
}

export async function deactivateVacierTurkeyCustomsOverride(id: number) {
  const [updated] = await db
    .update(vacierTurkeyCustomsOverrides)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(vacierTurkeyCustomsOverrides.id, id))
    .returning();
  if (!updated) throw new Error('Override not found');
  return updated;
}

function normalizeInput(input: VacierTurkeyCustomsOverrideInput) {
  const sku = String(input.sku ?? '').trim();
  if (!sku) throw new Error('SKU is required');

  const customsDescription = String(input.customsDescription ?? '').trim();
  if (!customsDescription) throw new Error('CustomsDescription is required');

  const numericValue = typeof input.customsValue === 'number'
    ? input.customsValue
    : Number.parseFloat(String(input.customsValue ?? '').trim());
  if (!Number.isFinite(numericValue) || numericValue < 0) {
    throw new Error('CustomsValue must be a non-negative number');
  }

  const currency = String(input.currency ?? 'EUR').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error('Currency must be ISO3');

  return {
    sku,
    productName: input.productName?.trim() || null,
    customsDescription,
    customsValue: numericValue.toFixed(2),
    tariffCode: input.tariffCode?.trim() || null,
    currency,
    isActive: input.isActive ?? true,
    source: input.source?.trim() || null,
  };
}

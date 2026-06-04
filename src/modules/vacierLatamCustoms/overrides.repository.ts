import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { vacierLatamCustomsOverrides } from '@/lib/db/schema';
import {
  normalizeVacierLatamOverrideCountry as normalizeCountry,
  normalizeVacierLatamOverrideCurrency as normalizeCurrency,
  normalizeVacierLatamOverrideCustomsValue as normalizeCustomsValue,
  normalizeVacierLatamOverrideSku as normalizeSku,
} from './overrides.normalize';

export type VacierLatamOverrideInput = {
  sku: string;
  productName?: string | null;
  customsValue: string | number;
  currency?: string | null;
  countryCode: string;
  isActive?: boolean;
  source?: string | null;
  notes?: string | null;
  updatedBy?: string | null;
};

export type VacierLatamOverrideFilters = {
  sku?: string | null;
  countryCode?: string | null;
  isActive?: boolean | null;
  limit?: number;
};

export type VacierLatamOverrideRow = typeof vacierLatamCustomsOverrides.$inferSelect;

function normalizeInput(input: VacierLatamOverrideInput) {
  return {
    sku: normalizeSku(input.sku),
    productName: input.productName?.trim() || null,
    customsValue: normalizeCustomsValue(input.customsValue),
    currency: normalizeCurrency(input.currency),
    countryCode: normalizeCountry(input.countryCode),
    isActive: input.isActive ?? true,
    source: input.source?.trim() || null,
    notes: input.notes?.trim() || null,
    updatedBy: input.updatedBy?.trim() || null,
  };
}

export async function listVacierLatamCustomsOverrides(filters: VacierLatamOverrideFilters = {}) {
  const where = [];
  const sku = filters.sku?.trim();
  const countryCode = filters.countryCode?.trim().toUpperCase();

  if (sku) where.push(sql`${vacierLatamCustomsOverrides.sku} ILIKE ${`%${sku}%`}`);
  if (countryCode && countryCode !== 'ALL_COUNTRIES') where.push(eq(vacierLatamCustomsOverrides.countryCode, countryCode));
  if (filters.isActive !== null && filters.isActive !== undefined) {
    where.push(eq(vacierLatamCustomsOverrides.isActive, filters.isActive));
  }

  return db
    .select()
    .from(vacierLatamCustomsOverrides)
    .where(where.length > 0 ? and(...where) : undefined)
    .orderBy(desc(vacierLatamCustomsOverrides.updatedAt))
    .limit(Math.min(Math.max(filters.limit ?? 200, 1), 1000));
}

export async function resolveVacierLatamCustomsOverride(sku: string, destinationCountry: string) {
  const normalizedSku = normalizeSku(sku);
  const countryCode = normalizeCountry(destinationCountry);
  if (countryCode === 'ALL') throw new Error('Destination country must be ISO2');

  const activeExact = await db
    .select()
    .from(vacierLatamCustomsOverrides)
    .where(and(
      eq(vacierLatamCustomsOverrides.sku, normalizedSku),
      eq(vacierLatamCustomsOverrides.countryCode, countryCode),
      eq(vacierLatamCustomsOverrides.isActive, true),
    ))
    .limit(1);

  if (activeExact[0]) return activeExact[0];

  const activeAll = await db
    .select()
    .from(vacierLatamCustomsOverrides)
    .where(and(
      eq(vacierLatamCustomsOverrides.sku, normalizedSku),
      eq(vacierLatamCustomsOverrides.countryCode, 'ALL'),
      eq(vacierLatamCustomsOverrides.isActive, true),
    ))
    .limit(1);

  return activeAll[0] ?? null;
}

export async function upsertVacierLatamCustomsOverride(input: VacierLatamOverrideInput) {
  const normalized = normalizeInput(input);
  const now = new Date();

  if (normalized.isActive) {
    const [existing] = await db
      .select({ id: vacierLatamCustomsOverrides.id })
      .from(vacierLatamCustomsOverrides)
      .where(and(
        eq(vacierLatamCustomsOverrides.sku, normalized.sku),
        eq(vacierLatamCustomsOverrides.countryCode, normalized.countryCode),
        eq(vacierLatamCustomsOverrides.isActive, true),
      ))
      .limit(1);

    if (existing) {
      const [updated] = await db
        .update(vacierLatamCustomsOverrides)
        .set({ ...normalized, updatedAt: now })
        .where(eq(vacierLatamCustomsOverrides.id, existing.id))
        .returning();
      return updated;
    }
  }

  const [created] = await db
    .insert(vacierLatamCustomsOverrides)
    .values({ ...normalized, createdAt: now, updatedAt: now })
    .returning();
  return created;
}

export async function updateVacierLatamCustomsOverride(id: number, input: Partial<VacierLatamOverrideInput>) {
  const existing = await db
    .select()
    .from(vacierLatamCustomsOverrides)
    .where(eq(vacierLatamCustomsOverrides.id, id))
    .limit(1);
  if (!existing[0]) throw new Error('Override not found');

  const merged = normalizeInput({
    sku: input.sku ?? existing[0].sku,
    productName: input.productName ?? existing[0].productName,
    customsValue: input.customsValue ?? existing[0].customsValue,
    currency: input.currency ?? existing[0].currency,
    countryCode: input.countryCode ?? existing[0].countryCode,
    isActive: input.isActive ?? existing[0].isActive,
    source: input.source ?? existing[0].source,
    notes: input.notes ?? existing[0].notes,
    updatedBy: input.updatedBy ?? existing[0].updatedBy,
  });

  const [updated] = await db
    .update(vacierLatamCustomsOverrides)
    .set({ ...merged, updatedAt: new Date() })
    .where(eq(vacierLatamCustomsOverrides.id, id))
    .returning();
  return updated;
}

export async function deactivateVacierLatamCustomsOverride(id: number, updatedBy?: string | null) {
  const [updated] = await db
    .update(vacierLatamCustomsOverrides)
    .set({ isActive: false, updatedAt: new Date(), updatedBy: updatedBy?.trim() || null })
    .where(eq(vacierLatamCustomsOverrides.id, id))
    .returning();
  if (!updated) throw new Error('Override not found');
  return updated;
}

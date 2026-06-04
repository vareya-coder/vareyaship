import assert from 'node:assert/strict';
import {
  buildLineItemCustomsUpdates,
  processVacierLatamOrder,
} from './customs.service';
import { resolveLatamOverrideFromRows } from './overrides.service';
import type { VacierLatamConfig } from './customs.types';
import type { Order } from '@/modules/shiphero/types';

const baseConfig: VacierLatamConfig = {
  enabled: true,
  dryRun: true,
  countries: ['EC', 'BR', 'AR'],
  referenceValueEur: 50,
  processedTag: 'vacier_latam_customs_adjusted_v1',
  processingStartDate: '2026-05-01T00:00:00.000Z',
  orderNumberFilter: [],
  fulfillmentStatuses: ['Vacier'],
  customerAccountId: '123',
};

const overrideRows = [
  { sku: 'SKU1', customsValue: '4.00', currency: 'EUR', countryCode: 'ALL', isActive: true },
  { sku: 'SKU1', customsValue: '2.50', currency: 'EUR', countryCode: 'EC', isActive: true },
  { sku: 'SKU2', customsValue: '0.00', currency: 'EUR', countryCode: 'ALL', isActive: true },
  { sku: 'SKU3', customsValue: '9.99', currency: 'EUR', countryCode: 'ALL', isActive: false },
];

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 'order-1',
    order_number: 'LATAM_Test_1',
    order_date: '2026-05-25T10:00:00.000Z',
    total_price: '100.00',
    tags: [],
    shipping_address: { country_code: 'EC' },
    line_items: {
      edges: [
        {
          node: {
            id: 'li-1',
            sku: 'SKU1',
            quantity: 2,
            price: '29.00',
            customs_value: '29.00',
          },
        },
        {
          node: {
            id: 'li-2',
            sku: 'SKU2',
            quantity: 1,
            price: '0.00',
            customs_value: '0.00',
          },
        },
      ],
    },
    ...overrides,
  };
}

async function main() {
  const countrySpecific = resolveLatamOverrideFromRows(' SKU1 ', 'EC', overrideRows);
  assert.equal(countrySpecific?.customsValueFormatted, '2.50');

  const allFallback = resolveLatamOverrideFromRows('SKU1', 'BR', overrideRows);
  assert.equal(allFallback?.customsValueFormatted, '4.00');

  const inactiveIgnored = resolveLatamOverrideFromRows('SKU3', 'EC', overrideRows);
  assert.equal(inactiveIgnored, null);

  const zeroValue = resolveLatamOverrideFromRows('SKU2', 'AR', overrideRows);
  assert.equal(zeroValue?.customsValueFormatted, '0.00');
  assert.equal(zeroValue?.customsValue, 0);

  const resolver = async (sku: string, country: string) => {
    const resolved = resolveLatamOverrideFromRows(sku, country, overrideRows);
    if (!resolved) throw new Error(`Missing active LATAM customs override for SKU ${sku} and country ${country}`);
    return resolved;
  };

  const updateResult = await buildLineItemCustomsUpdates(makeOrder(), 'EC', resolver);
  assert.deepEqual(updateResult.updates, [
    { id: 'li-1', customs_value: '2.50' },
    { id: 'li-2', customs_value: '0.00' },
  ]);
  assert.equal(updateResult.total, 5);

  await assert.rejects(
    async () => buildLineItemCustomsUpdates(makeOrder({
      line_items: {
        edges: [{ node: { id: 'li-1', sku: 'MISSING', quantity: 1 } as any }],
      },
    }), 'EC', resolver),
    /Missing active LATAM customs override/,
  );

  const dryRunResult = await processVacierLatamOrder(makeOrder(), {
    batchId: 'batch-test',
    config: baseConfig,
    resolveOverride: resolver,
    updateLineItemsCustomsValue: async () => { throw new Error('mutation should not run in dry-run'); },
  });
  assert.equal(dryRunResult.status, 'dry_run');
  assert.equal(dryRunResult.copiedCustomsTotal, '5.00');
  assert.equal(dryRunResult.aboveReferenceValue, false);

  let mutationCalls = 0;
  const missingResult = await processVacierLatamOrder(
    makeOrder({
      line_items: {
        edges: [
          { node: { id: 'li-1', sku: 'SKU1', quantity: 1 } as any },
          { node: { id: 'li-2', sku: 'MISSING', quantity: 1 } as any },
        ],
      },
    }),
    {
      batchId: 'batch-test',
      config: { ...baseConfig, dryRun: false },
      resolveOverride: resolver,
      updateLineItemsCustomsValue: async () => { mutationCalls += 1; return { success: true, complexity: 1 }; },
      addOrderTag: async () => { mutationCalls += 1; return { success: true, complexity: 1 }; },
    },
  );
  assert.equal(missingResult.status, 'error');
  assert.match(missingResult.reason ?? '', /Missing active LATAM customs override/);
  assert.equal(mutationCalls, 0);

  const aboveReference = await processVacierLatamOrder(
    makeOrder({
      line_items: {
        edges: [{ node: { id: 'li-1', sku: 'HIGH', quantity: 2 } as any }],
      },
    }),
    {
      batchId: 'batch-test',
      config: baseConfig,
      resolveOverride: async () => ({ customsValue: 34, customsValueFormatted: '34.00' }),
    },
  );
  assert.equal(aboveReference.status, 'dry_run');
  assert.equal(aboveReference.aboveReferenceValue, true);
  assert.equal(aboveReference.copiedCustomsTotal, '68.00');

  const skippedCountry = await processVacierLatamOrder(
    makeOrder({ shipping_address: { country_code: 'NL' } }),
    { batchId: 'batch-test', config: baseConfig, resolveOverride: resolver },
  );
  assert.equal(skippedCountry.status, 'skipped');
  assert.equal(skippedCountry.reason, 'not_latam_country');

  console.log('Vacier LATAM customs tests passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

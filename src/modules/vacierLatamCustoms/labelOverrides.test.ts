import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildVacierLatamLabelOverrideMap,
  resolveVacierLatamLabelOverride,
  validateVacierLatamShipmentOverrides,
} from './labelOverrides.service';
import { isVacierLatamShipment } from './latamConfig';

process.env.VACIER_LATAM_CUSTOMS_ENABLED = 'true';
process.env.VACIER_LATAM_COUNTRIES = 'EC,BR,AR';

const map = buildVacierLatamLabelOverrideMap([
  {
    sku: 'SKU1',
    productName: 'All Product',
    customsValue: '4.00',
    currency: 'USD',
    countryCode: 'ALL',
    source: 'test',
  },
  {
    sku: 'SKU1',
    productName: 'Ecuador Product',
    customsValue: '2.50',
    currency: 'USD',
    countryCode: 'EC',
    source: 'test',
  },
  {
    sku: 'ZERO',
    productName: 'Zero Product',
    customsValue: '0.00',
    currency: 'USD',
    countryCode: 'ALL',
    source: 'test',
  },
]);

assert.equal(resolveVacierLatamLabelOverride(' SKU1 ', 'EC', map).customsValue, 2.5);
assert.equal(resolveVacierLatamLabelOverride('SKU1', 'BR', map).customsValue, 4);
assert.equal(resolveVacierLatamLabelOverride('ZERO', 'AR', map).customsValue, 0);
assert.throws(
  () => resolveVacierLatamLabelOverride('MISSING', 'EC', map),
  /Missing active LATAM customs override/,
);

assert.equal(isVacierLatamShipment({
  account_id: 73982,
  to_address: { country: 'EC' } as any,
}), true);
assert.equal(isVacierLatamShipment({
  account_id: 85552,
  to_address: { country: 'EC' } as any,
}), false);
assert.equal(isVacierLatamShipment({
  account_id: 73982,
  to_address: { country: 'US' } as any,
}), false);

const validation = validateVacierLatamShipmentOverrides({
  order_id: 1,
  order_number: '#TEST-1',
  to_address: { country: 'EC' } as any,
  packages: [{
    weight_in_oz: 1,
    line_items: [{
      sku: 'SKU1',
      tariff_code: '1',
      price: 1,
      customs_value: '1',
      line_item_id: 1,
      quantity: 2,
      weight: 1,
      partner_line_item_id: '1',
      id: '1',
      country_of_manufacture: 'US',
      product_name: 'Product',
      name: 'Product',
      customs_description: 'Description',
      ignore_on_customs: false,
    }],
  }],
}, map);
assert.deepEqual(validation, { currency: 'USD', lineItemCount: 1 });

const csvPath = path.join(process.cwd(), 'docs/vacier-latam-sku-data/latam-overrides-normalized.csv');
const csvLines = fs.readFileSync(csvPath, 'utf8').trim().split(/\r?\n/);
assert.equal(csvLines.length, 133);
assert.equal(csvLines.some((line) => line.startsWith('VROPSSP01,')), true);
assert.equal(csvLines.some((line) => line.includes('/H01')), false);
assert.equal(csvLines.slice(1).every((line) => line.includes(',USD,ALL,')), true);

console.log('Vacier LATAM label override tests passed.');

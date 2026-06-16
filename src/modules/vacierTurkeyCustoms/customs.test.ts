import assert from 'node:assert/strict';
import {
  buildVacierTurkeyCustomsOverrideMap,
  isVacierTurkeyShipment,
  resolveVacierTurkeyCustomsOverride,
} from './customs.service';

function main() {
  const overrides = buildVacierTurkeyCustomsOverrideMap([
    {
      sku: ' SKU1 ',
      productName: 'Product One',
      customsDescription: 'Imitation jewelry',
      customsValue: '0.00',
      tariffCode: '711719',
      currency: 'eur',
      source: 'test',
    },
    {
      sku: 'SKU2',
      productName: 'Product Two',
      customsDescription: 'Sterling silver jewelry',
      customsValue: '10',
      tariffCode: '711311',
      currency: 'EUR',
      source: 'test',
    },
  ]);

  const zeroValue = resolveVacierTurkeyCustomsOverride('SKU1', overrides);
  assert.equal(zeroValue?.customsValue, 0);
  assert.equal(zeroValue?.customsValueFormatted, '0.00');
  assert.equal(zeroValue?.currency, 'EUR');
  assert.equal(zeroValue?.customsDescription, 'Imitation jewelry');

  const exactSku = resolveVacierTurkeyCustomsOverride('SKU2', overrides);
  assert.equal(exactSku?.customsValue, 10);
  assert.equal(exactSku?.tariffCode, '711311');

  assert.equal(resolveVacierTurkeyCustomsOverride('sku2', overrides), null);
  assert.equal(resolveVacierTurkeyCustomsOverride('MISSING', overrides), null);

  assert.equal(isVacierTurkeyShipment({ account_id: 73982, to_address: { country: 'TR' } as any }), true);
  assert.equal(isVacierTurkeyShipment({ account_id: 73982, to_address: { country: 'US' } as any }), false);
  assert.equal(isVacierTurkeyShipment({ account_id: 85552, to_address: { country: 'TR' } as any }), false);

  console.log('Vacier Turkey customs tests passed.');
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exit(1);
}

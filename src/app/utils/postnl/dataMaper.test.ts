import assert from 'node:assert/strict';
import { mapShipHeroToPostNL } from './dataMaper';
import type { ShipHeroWebhook } from '../types';
import { buildVacierLatamLabelOverrideMap } from '@/modules/vacierLatamCustoms/labelOverrides.service';

process.env.VACIER_LATAM_CUSTOMS_ENABLED = 'true';
process.env.VACIER_LATAM_COUNTRIES = 'EC,BR,AR';

const latamOverrides = buildVacierLatamLabelOverrideMap([
  {
    sku: 'SKU1',
    productName: 'Workbook Product',
    customsValue: '4.50',
    currency: 'USD',
    countryCode: 'ALL',
    source: 'test',
  },
]);

function makeWebhook(country: string, overrides: Partial<ShipHeroWebhook> = {}): ShipHeroWebhook {
  return {
    shipping_method: 'postnl',
    order_id: 1,
    profile: 'default',
    fulfillment_status: 'pending',
    order_number: '#LATAM-1001',
    shop_name: 'Vacier',
    account_id: 73982,
    partner_order_id: 'p1',
    shipping_name: 'PostNL',
    tax_type: null,
    tax_id: null,
    incoterms: null,
    currency: 'EUR',
    from_address: { name: 'Vareya', company_name: 'Vareya', address_1: 'Bagven Park 6', address_2: '', email: '', city: 'Breda', state: '', zip: '4838EH', country: 'NL', phone: '' },
    to_address: { name: 'Jane Doe', company_name: '', address_1: 'Main 1', address_2: '', email: 'jane@example.com', city: 'Quito', state: '', zip: '17000', country, phone: '123' },
    packages: [{
      weight_in_oz: 2,
      line_items: [{
        sku: 'SKU1',
        tariff_code: '6109',
        price: 29,
        customs_value: '29.00',
        line_item_id: 1,
        quantity: 2,
        weight: 1,
        partner_line_item_id: 'pli1',
        id: 'li1',
        country_of_manufacture: 'US',
        product_name: 'ShipHero Product Name',
        name: 'Fallback Name',
        customs_description: 'Imitation jewelry',
        ignore_on_customs: false,
      }],
    }],
    ...overrides,
  };
}

async function main() {
  const latam = await mapShipHeroToPostNL(
    makeWebhook('EC'),
    'barcode',
    '6550',
    'CUST',
    '123',
    undefined,
    { vacierLatamCustomsBySku: latamOverrides },
  );
  assert.equal(latam.Shipments[0].Customs?.Currency, 'USD');
  assert.equal(latam.Shipments[0].Customs?.Content?.[0].Value, 9);
  assert.equal(latam.Shipments[0].Customs?.Content?.[0].Description, 'ShipHero Product Name');
  assert.equal(latam.Shipments[0].Customs?.Content?.[0].HSTariffNr, '6109');
  assert.equal(latam.Shipments[0].Customs?.Content?.[0].CountryOfOrigin, 'US');

  await assert.rejects(
    async () => mapShipHeroToPostNL(
      makeWebhook('EC', {
        packages: [{
          weight_in_oz: 1,
          line_items: [{ ...makeWebhook('EC').packages[0].line_items![0], sku: 'MISSING' }],
        }],
      }),
      'barcode',
      '6550',
      'CUST',
      '123',
      undefined,
      { vacierLatamCustomsBySku: latamOverrides },
    ),
    /Missing active LATAM customs override/,
  );

  const nonLatam = await mapShipHeroToPostNL(makeWebhook('US'), 'barcode', '6550', 'CUST', '123');
  assert.equal(nonLatam.Shipments[0].Customs?.Currency, 'EUR');
  assert.equal(nonLatam.Shipments[0].Customs?.Content?.[0].Value, 58);
  assert.equal(nonLatam.Shipments[0].Customs?.Content?.[0].Description, 'Imitation jewelry');

  console.log('PostNL LATAM mapper tests passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

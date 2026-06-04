import assert from 'node:assert/strict';
import { mapShipHeroToPostNL } from './dataMaper';
import type { ShipHeroWebhook } from '../types';

process.env.VACIER_LATAM_COUNTRIES = 'EC,BR,AR';

function makeWebhook(country: string, overrides: Partial<ShipHeroWebhook> = {}): ShipHeroWebhook {
  return {
    shipping_method: 'postnl',
    order_id: 1,
    profile: 'default',
    fulfillment_status: 'pending',
    order_number: '#LATAM-1001',
    shop_name: 'Vacier',
    account_id: 85552,
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
        sku: 'SKU1', tariff_code: '6109', price: 29, customs_value: '4.50', line_item_id: 1, quantity: 2, weight: 1, partner_line_item_id: 'pli1', id: 'li1', country_of_manufacture: 'NL', product_name: 'Shirt', name: 'Shirt', customs_description: 'Shirt', ignore_on_customs: false,
      }],
    }],
    ...overrides,
  };
}

async function main() {
  const latam = await mapShipHeroToPostNL(makeWebhook('EC'), 'barcode', '4945', 'CUST', '123');
  assert.equal(latam.Shipments[0].Customs?.Content?.[0].Value, 9);

  await assert.rejects(
    async () => mapShipHeroToPostNL(makeWebhook('EC', {
      packages: [{ weight_in_oz: 1, line_items: [{ ...makeWebhook('EC').packages[0].line_items![0], customs_value: '' }] }],
    }), 'barcode', '4945', 'CUST', '123'),
    /Missing or invalid LATAM customs_value/,
  );

  const nonLatam = await mapShipHeroToPostNL(makeWebhook('US'), 'barcode', '4945', 'CUST', '123');
  assert.equal(nonLatam.Shipments[0].Customs?.Content?.[0].Value, 58);

  console.log('PostNL LATAM mapper tests passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

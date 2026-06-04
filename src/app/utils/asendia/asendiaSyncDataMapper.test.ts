import assert from 'node:assert/strict';
import { mapShipHeroToAsendia } from './asendiaSyncDataMapper';
import type { ShipHeroWebhook } from '../types';
import type { ResolvedAsendiaCustomerMapping } from '@/modules/asendia/customers/customer.service';

process.env.VACIER_LATAM_COUNTRIES = 'EC,BR,AR';
process.env.VACIER_LATAM_ASENDIA_TAX_ID_COUNTRIES = 'EC,BR,AR';

const mapping: ResolvedAsendiaCustomerMapping = {
  accountId: 85552,
  customerName: 'Vareya',
  crmId: 'CRM1',
  senderTaxCode: 'NL123',
};

function makeWebhook(country: string, overrides: Partial<ShipHeroWebhook> = {}): ShipHeroWebhook {
  return {
    shipping_method: 'epaqpls boxable',
    order_id: 1,
    profile: 'default',
    fulfillment_status: 'pending',
    order_number: '#LATAM-1001',
    shop_name: 'Vacier',
    account_id: 85552,
    partner_order_id: 'p1',
    shipping_name: 'Asendia',
    tax_type: null,
    tax_id: 'TAX123',
    incoterms: null,
    currency: 'EUR',
    from_address: { name: 'Vareya', company_name: 'Vareya', address_1: 'Bagven Park 6', address_2: '', email: '', city: 'Breda', state: '', zip: '4838EH', country: 'NL', phone: '' },
    to_address: { name: 'Jane Doe', company_name: '', address_1: 'Main 1', address_2: '', email: 'jane@example.com', city: 'Quito', state: '', zip: '17000', country, phone: '123' },
    packages: [{
      weight_in_oz: 2,
      line_items: [{
        sku: 'SKU1', tariff_code: '6109.10', price: 29, customs_value: '4.50', line_item_id: 1, quantity: 2, weight: 1, partner_line_item_id: 'pli1', id: 'li1', country_of_manufacture: 'NL', product_name: 'Shirt', name: 'Shirt', customs_description: 'Shirt', ignore_on_customs: false,
      }],
    }],
    ...overrides,
  };
}

function main() {
  const latam = mapShipHeroToAsendia(makeWebhook('EC'), mapping);
  assert.equal(latam.customsInfo?.items[0].unitValue, 4.5);
  assert.equal(latam.receiverTaxId, 'TAX123');

  assert.throws(
    () => mapShipHeroToAsendia(makeWebhook('EC', { tax_id: null }), mapping),
    /Missing required receiverTaxId/,
  );

  const nonLatam = mapShipHeroToAsendia(makeWebhook('US', { tax_id: 'DO_NOT_MAP' }), mapping);
  assert.equal(nonLatam.customsInfo?.items[0].unitValue, 29);
  assert.equal(nonLatam.receiverTaxId, undefined);

  console.log('Asendia Sync LATAM mapper tests passed.');
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exit(1);
}

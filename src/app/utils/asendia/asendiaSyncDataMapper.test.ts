import assert from 'node:assert/strict';
import { mapShipHeroToAsendia } from './asendiaSyncDataMapper';
import type { ShipHeroWebhook } from '../types';
import type { ResolvedAsendiaCustomerMapping } from '@/modules/asendia/customers/customer.service';
import { buildVacierTurkeyCustomsOverrideMap } from '@/modules/vacierTurkeyCustoms/customs.service';

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
        sku: 'SKU1', tariff_code: '6109.10', price: 29, customs_value: '4.50', line_item_id: 1, quantity: 2, weight: 1, partner_line_item_id: 'pli1', id: 'li1', country_of_manufacture: 'NL', product_name: 'Product Shirt', name: 'Shirt', customs_description: 'Customs Shirt', ignore_on_customs: false,
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
  assert.equal(nonLatam.customsInfo?.items[0].articleDescription, 'Product Shirt');

  const vacierTurkeyOverrides = buildVacierTurkeyCustomsOverrideMap([
    {
      sku: 'WRRISP01',
      productName: 'VEER RING IN SILVER Silver',
      customsDescription: 'Sterling silver jewelry',
      customsValue: '10.00',
      tariffCode: '711311',
      currency: 'EUR',
      source: 'test',
    },
  ]);
  const vacierTurkey = mapShipHeroToAsendia(makeWebhook('TR', {
    account_id: 73982,
    packages: [{
      weight_in_oz: 2,
      line_items: [{
        ...makeWebhook('TR').packages[0].line_items![0],
        sku: 'WRRISP01',
        price: 89,
        product_name: 'Webhook Product Name',
        name: 'Webhook Name',
        customs_description: 'Webhook Customs Description',
        tariff_code: '9999.99',
      }],
    }],
  }), mapping, { vacierTurkeyCustomsBySku: vacierTurkeyOverrides });
  assert.equal(vacierTurkey.customsInfo?.items[0].unitValue, 10);
  assert.equal(vacierTurkey.customsInfo?.items[0].articleDescription, 'Sterling silver jewelry');
  assert.equal(vacierTurkey.customsInfo?.items[0].harmonizationCode, '711311');

  const vacierTurkeyMissingSku = mapShipHeroToAsendia(makeWebhook('TR', {
    account_id: 73982,
    packages: [{
      weight_in_oz: 2,
      line_items: [{
        ...makeWebhook('TR').packages[0].line_items![0],
        sku: 'MISSING',
        product_name: 'Webhook Product Name',
        name: 'Webhook Name',
        customs_description: 'Webhook Customs Description',
      }],
    }],
  }), mapping, { vacierTurkeyCustomsBySku: vacierTurkeyOverrides });
  assert.equal(vacierTurkeyMissingSku.customsInfo?.items[0].unitValue, 0);
  assert.equal(vacierTurkeyMissingSku.customsInfo?.items[0].articleDescription, 'Webhook Product Name');

  const nonVacierTurkey = mapShipHeroToAsendia(makeWebhook('TR', {
    account_id: 85552,
    packages: [{
      weight_in_oz: 2,
      line_items: [{
        ...makeWebhook('TR').packages[0].line_items![0],
        sku: 'WRRISP01',
        product_name: 'Webhook Product Name',
        customs_description: 'Webhook Customs Description',
      }],
    }],
  }), mapping, { vacierTurkeyCustomsBySku: vacierTurkeyOverrides });
  assert.equal(nonVacierTurkey.customsInfo?.items[0].articleDescription, 'Webhook Product Name');

  console.log('Asendia Sync mapper tests passed.');
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exit(1);
}

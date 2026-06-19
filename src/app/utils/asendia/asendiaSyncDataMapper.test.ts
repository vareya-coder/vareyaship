import assert from 'node:assert/strict';
import { mapShipHeroToAsendia } from './asendiaSyncDataMapper';
import type { ShipHeroWebhook } from '../types';
import type { ResolvedAsendiaCustomerMapping } from '@/modules/asendia/customers/customer.service';
import { buildVacierTurkeyCustomsOverrideMap } from '@/modules/vacierTurkeyCustoms/customs.service';
import { buildVacierLatamLabelOverrideMap } from '@/modules/vacierLatamCustoms/labelOverrides.service';

process.env.VACIER_LATAM_CUSTOMS_ENABLED = 'true';
process.env.VACIER_LATAM_COUNTRIES = 'EC,BR,AR';
process.env.VACIER_LATAM_ASENDIA_TAX_ID_COUNTRIES = 'EC,BR,AR';

const mapping: ResolvedAsendiaCustomerMapping = {
  accountId: 73982,
  customerName: 'Vacier',
  crmId: 'CRM1',
  senderTaxCode: 'NL123',
};

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
    shipping_method: 'epaqpls boxable',
    order_id: 1,
    profile: 'default',
    fulfillment_status: 'pending',
    order_number: '#LATAM-1001',
    shop_name: 'Vacier',
    account_id: 73982,
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
        sku: 'SKU1',
        tariff_code: '6109.10',
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

function main() {
  const latam = mapShipHeroToAsendia(
    makeWebhook('EC'),
    mapping,
    { vacierLatamCustomsBySku: latamOverrides },
  );
  assert.equal(latam.customsInfo?.currency, 'USD');
  assert.equal(latam.customsInfo?.items[0].unitValue, 4.5);
  assert.equal(latam.customsInfo?.items[0].currency, 'USD');
  assert.equal(latam.customsInfo?.items[0].articleDescription, 'ShipHero Product Name');
  assert.equal(latam.customsInfo?.items[0].harmonizationCode, '610910');
  assert.equal(latam.customsInfo?.items[0].originCountry, 'US');
  assert.equal(latam.receiverTaxId, 'TAX123');

  assert.throws(
    () => mapShipHeroToAsendia(
      makeWebhook('EC', { tax_id: null }),
      mapping,
      { vacierLatamCustomsBySku: latamOverrides },
    ),
    /Missing required receiverTaxId/,
  );

  assert.throws(
    () => mapShipHeroToAsendia(
      makeWebhook('EC', {
        packages: [{
          weight_in_oz: 1,
          line_items: [{ ...makeWebhook('EC').packages[0].line_items![0], sku: 'MISSING' }],
        }],
      }),
      mapping,
      { vacierLatamCustomsBySku: latamOverrides },
    ),
    /Missing active LATAM customs override/,
  );

  const nonLatam = mapShipHeroToAsendia(makeWebhook('US', { tax_id: 'DO_NOT_MAP' }), mapping);
  assert.equal(nonLatam.customsInfo?.currency, 'EUR');
  assert.equal(nonLatam.customsInfo?.items[0].unitValue, 29);
  assert.equal(nonLatam.receiverTaxId, undefined);

  const nonVacierLatam = mapShipHeroToAsendia(
    makeWebhook('EC', { account_id: 85552, tax_id: null }),
    mapping,
  );
  assert.equal(nonVacierLatam.customsInfo?.items[0].unitValue, 29);
  assert.equal(nonVacierLatam.receiverTaxId, undefined);

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
    packages: [{
      weight_in_oz: 2,
      line_items: [{
        ...makeWebhook('TR').packages[0].line_items![0],
        sku: 'WRRISP01',
        price: 89,
        product_name: 'Webhook Product Name',
        customs_description: 'Webhook Customs Description',
        tariff_code: '9999.99',
      }],
    }],
  }), mapping, { vacierTurkeyCustomsBySku: vacierTurkeyOverrides });
  assert.equal(vacierTurkey.customsInfo?.items[0].unitValue, 10);
  assert.equal(vacierTurkey.customsInfo?.items[0].articleDescription, 'Sterling silver jewelry');
  assert.equal(vacierTurkey.customsInfo?.items[0].harmonizationCode, '711311');
  assert.equal(vacierTurkey.customsInfo?.currency, 'EUR');

  console.log('Asendia Sync mapper tests passed.');
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exit(1);
}

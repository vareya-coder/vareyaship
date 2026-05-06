import { config } from 'dotenv';
import assert from 'node:assert/strict';
import { ShipHeroWebhook } from '@/app/utils/types';
import { mapShipHeroToPostNL } from '@/app/utils/postnl/dataMaper';
import { PostNLPickupDecision } from '@/modules/postnl/pickup/pickup.service';

config({ path: '.env' });

function makeShipment(overrides: Partial<ShipHeroWebhook> = {}): ShipHeroWebhook {
  return {
    shipping_method: 'postnl:nl-standard-3085',
    order_id: 123,
    profile: 'default',
    fulfillment_status: 'pending',
    order_number: '#S2M-123',
    shop_name: 'Ship2me',
    account_id: 85552,
    partner_order_id: 'partner-123',
    shipping_name: 'Jane Buyer',
    tax_type: null,
    tax_id: null,
    incoterms: null,
    currency: 'EUR',
    from_address: {
      name: 'Vareya',
      company_name: 'Vareya',
      address_1: 'Bagven Park',
      address_2: '6',
      email: 'ops@example.com',
      city: 'Breda',
      state: '',
      zip: '4838EH',
      country: 'NL',
      phone: '+31000000000',
    },
    to_address: {
      name: 'Jane Buyer',
      company_name: 'Readshop Lisse',
      address_1: 'Kanaalstraat 55',
      address_2: '',
      email: 'buyer@example.com',
      city: 'Lisse',
      state: '',
      zip: '2161 JA',
      country: 'NL',
      phone: '+31600000000',
    },
    packages: [
      {
        weight_in_oz: 8,
        line_items: [
          {
            sku: 'SKU-1',
            tariff_code: '123456',
            price: 10,
            customs_description: 'Item',
            customs_value: '10',
            line_item_id: 1,
            quantity: 1,
            weight: 8,
            partner_line_item_id: 'pli-1',
            id: 'li-1',
            country_of_manufacture: 'NL',
            product_name: 'Item',
            name: 'Item',
            ignore_on_customs: false,
          },
        ],
      },
    ],
    ...overrides,
  };
}

async function main() {
  process.env.AXIOM_DATASET ||= 'test';
  process.env.AXIOM_TOKEN ||= 'test';
  process.env.AXIOM_ORGANIZATION ||= 'test';

  const {
    inferPickupLocation,
    normalizePostNLOrder,
    parseDutchStreetAddress,
    decidePostNLPickupHandling,
  } = await import('@/modules/postnl/pickup/pickup.service');

  const flags = {
    postnl_pickup_strict_address_match_required: true,
    postnl_pickup_max_distance_meters: 500,
  };

  const normalized = normalizePostNLOrder(makeShipment());
  const validLocation = {
    Name: 'Readshop Lisse',
    LocationCode: '398100',
    RetailNetworkID: 'PNPNL-01',
    Street: 'Kanaalstraat',
    HouseNr: '55',
    Zipcode: '2161JA',
    City: 'Lisse',
    Countrycode: 'NL',
    Distance: 100,
    DeliveryOptions: ['PG'],
  };

  assert.deepEqual(parseDutchStreetAddress('Kanaalstraat 55 A'), {
    street: 'Kanaalstraat',
    houseNumber: '55',
    houseNumberExt: 'A',
  });

  const inferred = inferPickupLocation(normalized, [validLocation], flags);
  assert.equal(inferred.location?.locationCode, '398100');
  assert.equal(inferred.confidence, 100);
  assert.deepEqual(inferred.rulesPassed, [
    'name_match',
    'pg_supported',
    'address_match',
    'postal_code_match',
    'distance_ok',
  ]);

  assert.equal(
    inferPickupLocation(normalized, [{ ...validLocation, Name: 'Gamma' }], flags).location,
    undefined,
  );
  assert.equal(
    inferPickupLocation(normalized, [{ ...validLocation, Street: 'Heereweg' }], flags).location,
    undefined,
  );
  assert.equal(
    inferPickupLocation(normalized, [{ ...validLocation, Distance: 501 }], flags).location,
    undefined,
  );
  assert.equal(
    inferPickupLocation(normalized, [{ ...validLocation, DeliveryOptions: ['PU'] }], flags).location,
    undefined,
  );

  const disabledDecision = await decidePostNLPickupHandling(makeShipment(), 'test-key', {
    cutoff_time: '17:00',
    cutoff_timezone: 'Europe/Amsterdam',
    manifest_trigger_time: '17:00',
    manifest_trigger_timezone: 'Europe/Amsterdam',
    batch_interval_hours: 24,
    shipment_threshold: 1000,
    enable_service_separation: false,
    enable_client_separation: false,
    late_shipment_mode: 'assign_to_next_day',
    retention_days: 30,
    dry_run_manifest: false,
    dry_run_manifest_send_email: false,
    manifest_enabled_crm_ids: [],
    enable_postnl_pickup_inference: false,
    postnl_pickup_account_ids: [85552],
    postnl_pickup_confidence_threshold: 85,
    enable_postnl_pickup_address_fallback: true,
    postnl_pickup_strict_address_match_required: true,
    postnl_pickup_max_distance_meters: 500,
    postnl_pickup_log_only: true,
  });
  assert.equal(disabledDecision, null);

  const pickupDecision: PostNLPickupDecision = {
    decision: 'pickup_inferred',
    applyPickup: true,
    applyAddressFallback: false,
    confidence: 100,
    location: {
      city: 'Lisse',
      countryCode: 'NL',
      distance: 100,
      houseNr: '55',
      locationCode: '398100',
      name: 'Readshop Lisse',
      retailNetworkId: 'PNPNL-01',
      street: 'Kanaalstraat',
      zipcode: '2161JA',
    },
    matchedName: 'Readshop Lisse',
    rulesPassed: ['name_match', 'pg_supported', 'address_match', 'postal_code_match', 'distance_ok'],
    companyValue: 'Readshop Lisse',
    logOnly: false,
  };
  const pickupPayload = await mapShipHeroToPostNL(makeShipment(), '', '3085', 'CUST', '123', pickupDecision);
  assert.equal(
    pickupPayload.Shipments[0].Addresses?.some((address) => (
      address.AddressType === '09'
      && address.DownPartnerLocation === '398100'
      && address.DownPartnerID === 'PNPNL-01'
    )),
    true,
  );

  const logOnlyPayload = await mapShipHeroToPostNL(
    makeShipment(),
    '',
    '3085',
    'CUST',
    '123',
    { ...pickupDecision, applyPickup: false, logOnly: true },
  );
  assert.equal(
    logOnlyPayload.Shipments[0].Addresses?.some((address) => address.AddressType === '09'),
    false,
  );

  const fallbackPayload = await mapShipHeroToPostNL(makeShipment(), '', '3085', 'CUST', '123', {
    decision: 'fallback',
    applyPickup: false,
    applyAddressFallback: true,
    confidence: 0,
    reason: 'no_valid_inference',
    rulesPassed: [],
    companyValue: 'Readshop Lisse',
    logOnly: false,
  });
  assert.match(
    fallbackPayload.Shipments[0].Addresses?.[0].StreetHouseNrExt ?? '',
    /Readshop Lisse$/,
  );

  console.log('PostNL pickup tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

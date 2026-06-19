# Vacier LATAM Customs Override - Implementation Plan

> **Superseded:** Use `docs/plans/vacier-latam-label-time-customs-plan.md`. This earlier plan mutates
> ShipHero line-item customs values through a cron; the approved implementation applies overrides at
> carrier label generation time so ShipHero invoice values remain unchanged.

## Summary

Update the already-started Vacier LATAM customs implementation so LATAM customs values come from a Vacier-provided SKU override table, not ShipHero warehouse-product customs values.

The workflow remains DB-driven and carrier-agnostic:

* Vacier provides LATAM SKU customs values in CSV/Excel format.
* VareyaShip stores those values in a LATAM override table and exposes an internal UI to manage them.
* The 10-minute Vercel cron updates ShipHero order line item `customs_value` for configured LATAM countries.
* PostNL and Asendia Sync REST label mappers use the adjusted `lineItem.customs_value` for configured LATAM countries only.
* Non-LATAM markets continue using the existing process.

Requirement source: `docs/requirements/vacier-latam-customs-adjustment.md`

## Key Implementation Changes

### 1. LATAM SKU Override Storage And UI

Add a new DB table for active/inactive LATAM SKU customs override rows:

```text
vacier_latam_customs_overrides
```

Columns:

```text
id serial primary key
sku varchar not null
product_name varchar
customs_value numeric/string-compatible decimal not null
currency varchar default 'EUR'
country_code varchar not null -- ISO2 or ALL
is_active boolean default true
source varchar
notes text
created_at timestamp
updated_at timestamp
updated_by varchar
```

Indexes/constraints:

* index `sku`
* index `country_code`
* index `is_active`
* unique active semantic target: `(sku, country_code)` should not have more than one active row. Implement with a partial unique index if practical in migration SQL; otherwise enforce in repository upsert logic.

Add repository/service behavior:

* normalize SKU with trim;
* normalize `country_code` to uppercase;
* allow `country_code='ALL'`;
* allow `customs_value=0`;
* country-specific override wins over `ALL`;
* inactive rows are ignored;
* missing override returns a clear failure reason, not a fallback.

Add internal UI route/page for the override table:

* list/filter by SKU, country, active status;
* create/edit row;
* activate/deactivate row;
* bulk import CSV/Excel or CSV-first if Excel parsing would add unnecessary dependency.

Recommended first implementation: CSV import with required columns:

```text
SKU,ProductName,CustomsValue,Currency,CountryCode,Notes
```

If Vacier sends Excel, convert to CSV operationally for v1 unless a parser dependency is deliberately added.

### 2. Cron Processing Changes

Keep the existing Vercel cron route and state model:

```text
GET /api/cron/vacier-latam-customs
schedule */10 * * * *
```

Keep these existing/new DB tables:

* `vacier_latam_customs_runs`
* `vacier_latam_customs_cursor`
* `vacier_latam_customs_order_results`

Modify the customs service:

* stop resolving values from `product.warehouse_products.customs_value`;
* resolve every customs-included SKU from `vacier_latam_customs_overrides` using `(sku, destination_country)` then `(sku, ALL)`;
* if any SKU in an order lacks an active override, do not update any line item for that order;
* record missing override in order result and leave the order retryable;
* update ShipHero order line item `customs_value` from override values;
* add processed tag only after successful ShipHero update;
* preserve existing cursor behavior copied from the Turkey production job.

Keep feature/env flags:

```text
VACIER_LATAM_CUSTOMS_ENABLED=false
VACIER_LATAM_DRY_RUN=true
VACIER_LATAM_COUNTRIES=EC,BR,AR,...
VACIER_LATAM_REFERENCE_VALUE_EUR=50.00
VACIER_LATAM_PROCESSED_TAG=vacier_latam_customs_adjusted_v1
VACIER_LATAM_PROCESSING_START_DATE
VACIER_LATAM_FULFILLMENT_STATUSES=Vacier,unfulfilled
VACIER_CUSTOMER_ACCOUNT_ID
```

### 3. Carrier Mapper Changes

#### PostNL

Modify the existing PostNL mapper for configured LATAM countries only:

* when destination is in `VACIER_LATAM_COUNTRIES`, customs `Content[].Value` must be calculated from `lineItem.customs_value * quantity`, not `lineItem.price * quantity`;
* if `lineItem.customs_value` is missing/invalid for a configured LATAM country, fail before calling PostNL;
* keep existing non-LATAM PostNL behavior unchanged;
* keep PostNL DAP assumption; no DDP handling.

#### Asendia Sync REST

Modify the Asendia Sync REST mapper, not the legacy SOAP/XML mapper:

* when destination is in `VACIER_LATAM_COUNTRIES`, customs item value must use `lineItem.customs_value`;
* only for configured LATAM countries where `receiverTaxId` is required, map webhook `tax_id` to Asendia Sync REST `receiverTaxId`;
* if that required LATAM `tax_id` is missing, fail before calling Asendia;
* do not apply `tax_id -> receiverTaxId` globally for non-LATAM Asendia shipments;
* add DAP/format/service behavior only as confirmed for the selected Asendia product path.

### 4. Invoice / Document Handling

No VareyaShip invoice-generation work in v1.

Document handling assumptions:

* original full-value invoice/packing slip remains the existing ShipHero/warehouse print operation;
* if ShipHero sometimes omits that invoice, Lorenzo/Vareya should investigate ShipHero/warehouse operations separately;
* outside customs declaration is the carrier CN22/customs/commercial invoice data on the PostNL/Asendia label output;
* no separate outside customs PDF unless Vacier later requests it.

## Implementation Order

1. Add `vacier_latam_customs_overrides` schema and migration.
2. Add override repository/service with CSV import parser.
3. Add UI/API endpoints for list/create/update/deactivate/import.
4. Update `vacierLatamCustoms` cron service to resolve from overrides instead of warehouse product values.
5. Update PostNL mapper to use `lineItem.customs_value` for configured LATAM countries.
6. Update Asendia Sync REST mapper to use `lineItem.customs_value` for configured LATAM countries and map `tax_id -> receiverTaxId` only where required.
7. Update tests and docs.
8. Run TypeScript/build checks.
9. Test with order-number filter before broad enablement.

## Test Plan

Add/adjust tests for:

* country-specific override wins over `ALL`;
* `ALL` override fallback works;
* inactive override is ignored;
* zero-value override is valid;
* missing override blocks the whole order update;
* no partial ShipHero line item updates when one SKU is missing;
* above-EUR-50 total is logged/persisted but does not block;
* dry-run does not call ShipHero mutations and does not advance cursor;
* PostNL LATAM uses `customs_value` instead of `price`;
* PostNL non-LATAM behavior remains unchanged;
* Asendia Sync REST LATAM uses `customs_value` instead of price;
* Asendia Sync REST maps `tax_id` to `receiverTaxId` only for configured LATAM destinations where required;
* Asendia non-LATAM shipments do not receive LATAM `receiverTaxId` behavior.

Manual verification sequence:

1. Import Vacier-provided override CSV with `CountryCode=ALL`.
2. Run cron in dry-run with fresh test orders.
3. Verify proposed values match override table.
4. Enable mutation for filtered test orders.
5. Verify ShipHero order line item `customs_value` changed.
6. Generate PostNL label and verify CN22 values are lowered.
7. If Asendia is used later, verify `receiverTaxId` behavior only for configured LATAM countries.

## Assumptions And Defaults

* `VACIER_LATAM_COUNTRIES` is the only country allowlist for LATAM behavior.
* `CountryCode=ALL` applies to all configured LATAM countries unless a country-specific row exists.
* No fallback to ShipHero warehouse-product customs values in v1; missing override is a data error.
* DAP is accepted for LATAM shipments.
* PostNL is likely the first test route, but Asendia Sync REST remains supported in design.
* Brazil bank account handling is out of scope until a carrier provides a supported field/process.
* Original full-value invoice remains a ShipHero/warehouse operation.

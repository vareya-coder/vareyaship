# Vacier LATAM Customs Value Adjustment

> **Superseded:** This requirement records the earlier ShipHero mutation-cron design. The approved
> implementation is the label-time override design in
> `docs/plans/vacier-latam-label-time-customs-plan.md`. It keeps ShipHero values unchanged and applies
> database overrides only to carrier payloads.

## 1. Objective

Implement a Vercel-deployed, DB-driven workflow for Vacier orders shipping to configured Latin American countries.

The workflow applies Vacier-provided LATAM SKU customs override values to ShipHero order line items before label generation, so carrier customs declarations use the intended lowered LATAM values while non-LATAM markets continue using the existing process.

This task is separate from the previous Vacier Turkey customs cron. The Turkey job is stopped and must not be restarted as-is.

## 2. Current Business Context

Vacier requested lowered customs values for Latin American shipments. The current direction is:

* Vacier accepts DAP shipping for LATAM.
* PostNL and Asendia may both be supported carrier options.
* PostNL is currently the likely test path because Asendia has additional onboarding/data requirements.
* Vacier will provide a LATAM customs value file, likely as Excel/CSV, with preferred customs values per SKU.
* The LATAM SKU values may differ from the ShipHero warehouse-product customs values previously finalized for Vacier SKUs.
* The LATAM override values apply only to configured LATAM destination countries.

Vacier also requested:

* the original full-value invoice/packing slip to be placed inside the package using the existing ShipHero warehouse operation;
* the outside customs declaration/label to show the lowered LATAM declared values;
* a standardized SKU-level customs value source for LATAM.

Important operational note: Vacier/Vareya are responsible for accepting the risk and process implications of a full-value invoice inside the parcel while the outside customs declaration uses lowered LATAM values.

## 3. Carrier Direction

### PostNL

PostNL is expected to be supported for LATAM DAP shipments.

For non-EU destinations, the current PostNL mapper creates customs/CN22 data, but it currently calculates customs item value from `lineItem.price`. For LATAM, the mapper must use the adjusted ShipHero order-line `customs_value` instead.

Open confirmations from Lorenzo/Vareya/PostNL:

* final LATAM country list;
* whether recipient tax ID is required for any PostNL LATAM destination;
* whether Brazil has any PostNL-specific tax ID or bank account requirement;
* exact PostNL product/service choices for the selected LATAM countries, if different from current mappings.

### Asendia Sync REST

Asendia may also be supported, but the implementation target is Asendia Sync REST, not the legacy SOAP/XML mapper.

Known Asendia requirements from support/account-manager communication:

* EC, BR, and AR require `receiverTaxId` for goods shipments.
* `receiverTaxId` is the correct Asendia Sync REST field for recipient tax ID.
* DDP is not available for these countries through Asendia; Asendia path is DAP.
* Peter indicated `format=N`, `service=CUP` for the relevant Asendia path.
* Brazil bank account visibility is not currently supported by Asendia and is not in scope for the current implementation unless Asendia later provides an accepted field/process.

If Asendia is used, Vareya/Vacier must ensure the ShipHero webhook payload has non-null recipient tax information, expected as:

```text
tax_id -> receiverTaxId
```

If the tax ID is missing for an Asendia LATAM shipment, label generation must fail clearly before calling Asendia.

## 4. Scope

### In Scope

* Maintain LATAM SKU customs override values in a database table.
* Provide an internal UI page to view, create, edit, and disable LATAM SKU customs override rows.
* Support bulk import/update from Vacier-provided Excel/CSV data.
* Use configured LATAM destination countries from environment variables.
* For matching Vacier LATAM orders, update ShipHero order line item `customs_value` from the LATAM override table.
* Use the adjusted ShipHero order-line `customs_value` in PostNL customs/CN22 payloads.
* Use the adjusted ShipHero order-line `customs_value` in Asendia Sync REST customs item values where applicable.
* For configured LATAM countries only, send Asendia Sync REST `receiverTaxId` from webhook `tax_id` when required.
* Persist cron state, cursor, runs, and per-order outcomes in database tables.
* Log and persist orders whose copied customs total exceeds the EUR 50 reference value, but do not block by default.

### Out of Scope

* Restarting the old Turkey cron unchanged.
* Changing normal ShipHero SKU/product customs values for non-LATAM markets.
* Generating the original full-value invoice inside the parcel; this remains an existing ShipHero/warehouse operation unless separately requested.
* Generating a separate outside customs PDF beyond the carrier customs/CN22/commercial invoice data, unless Vacier later requires it.
* Brazil bank account handling for Asendia until Asendia provides supported REST field/process.
* DDP support for PostNL or Asendia LATAM shipments.

## 5. Core Data Model

### LATAM SKU Customs Override

Create a DB table for LATAM-specific SKU customs values.

Required fields:

```text
id
sku
product_name
customs_value
currency
country_code
is_active
source
notes
created_at
updated_at
updated_by
```

Rules:

* `country_code` may be a two-letter ISO country code or `ALL`.
* A country-specific row overrides an `ALL` row for the same SKU.
* `customs_value = 0` is valid.
* inactive rows are ignored.
* SKU matching should be exact after trim.
* currency defaults to `EUR` unless Vacier provides otherwise.

Expected Vacier import file columns:

```text
SKU
ProductName
CustomsValue
Currency
CountryCode
Notes
```

`CountryCode` may be `ALL` when the same value applies to all configured LATAM countries.

## 6. Core Implementation Model

```text
Vacier LATAM SKU override file
  -> import/save overrides in DB table
  -> UI can view/edit active override values

Vercel cron every 10 minutes
  -> query new Vacier ShipHero orders since DB cursor
  -> destination country allowlist check from env
  -> resolve SKU override value from DB (country-specific first, then ALL)
  -> update ShipHero order line item customs_value
  -> add idempotency tag
  -> persist run/order outcome

Label generation
  -> existing carrier label endpoint receives ShipHero webhook payload
  -> for configured LATAM countries, carrier mapper uses lineItem.customs_value
  -> PostNL renders lowered value in CN22/customs data
  -> Asendia Sync REST sends lowered customs item values and receiverTaxId when required
```

## 7. ShipHero Customs Data Rule

ShipHero order line item `customs_value` must be treated as the value used by LATAM carrier customs payloads.

For LATAM orders, the canonical customs source is the LATAM SKU override table, not the ShipHero warehouse-product customs value.

Fallback policy:

* primary: active LATAM override for `(sku, destination country)`;
* secondary: active LATAM override for `(sku, ALL)`;
* no fallback to warehouse-product customs value unless explicitly enabled later;
* if no active override exists for a SKU, the order should fail/skip clearly and remain retryable.

Implementation should update ShipHero order line items through:

```text
order_update_line_items
```

Fields to update:

* `line_item.id`
* `customs_value`

## 8. Runtime And State Requirements

### Deployment

The customs sync job must be deployed as a Vercel cron endpoint and configured to run every 10 minutes.

The cron endpoint must be protected consistently with existing cron endpoints.

### State Persistence

Cron state must be kept in the database, not memory.

Required persisted state:

* last processed cursor/date;
* cron run metadata: run ID, start time, end time, status, processed count, skipped count, error count;
* per-order processing outcome: order ID, order number, destination country, copied customs total, status, error message;
* above-EUR-50 reference flag;
* SKU override import/update audit where practical.

Cursor behavior follows the previous Vacier Turkey customs processing model:

* read stored cursor;
* process new matching orders since cursor;
* advance cursor only for successfully processed or intentionally skipped orders;
* orders with errors remain eligible for retry.

### Feature Flags / Env

Required or recommended config:

```text
VACIER_LATAM_CUSTOMS_ENABLED
VACIER_LATAM_COUNTRIES=EC,BR,AR,...
VACIER_LATAM_REFERENCE_VALUE_EUR=50.00
VACIER_LATAM_PROCESSED_TAG=vacier_latam_customs_adjusted_v1
VACIER_LATAM_DRY_RUN
VACIER_LATAM_PROCESSING_START_DATE
VACIER_LATAM_FULFILLMENT_STATUSES=Vacier,unfulfilled
VACIER_CUSTOMER_ACCOUNT_ID
```

Label-mapper behavior must also be gated by the same configured LATAM country list and Vacier account/customer context where possible.

## 9. Customs Value Rules

For each matching LATAM order:

* resolve every customs-included line item's SKU from the LATAM override table;
* use country-specific override first, then `ALL`;
* copy the resolved value to ShipHero order-line `customs_value`;
* keep `0.00` when the override value is `0`;
* calculate copied customs total as `override value * quantity`;
* log/persist `above_latam_reference_value` if total exceeds EUR 50;
* do not apply random or proportional value distribution;
* do not change non-LATAM orders.

If any SKU lacks an active override:

* do not partially update the order;
* record a clear failure/skip reason;
* leave the order eligible for retry after the override table is corrected.

## 10. Carrier Label Rules

### PostNL

For configured LATAM countries:

* customs item `Value` must come from `lineItem.customs_value`, not `lineItem.price`;
* if `lineItem.customs_value` is missing/invalid, fail clearly before calling PostNL;
* existing PostNL CN22/customs section is considered sufficient as the outside customs declaration unless Vacier later requests a separate PDF.

### Asendia Sync REST

For configured LATAM countries:

* customs item values must use `lineItem.customs_value`;
* for configured LATAM countries only, if the destination requires `receiverTaxId`, map webhook `tax_id` to Asendia Sync REST `receiverTaxId`;
* if required `tax_id` is missing, fail clearly before calling Asendia;
* send DAP, not DDP, for LATAM countries;
* add `format=N` and `service=CUP` only when confirmed/needed by the selected Asendia product/service path.

## 11. Invoice / Document Handling

Original full-value invoice inside parcel:

* expected to remain the existing ShipHero invoice/packing-slip warehouse operation;
* VareyaShip does not generate this document in the current scope;
* if ShipHero sometimes omits this invoice, Lorenzo/Vareya should investigate warehouse/ShipHero operational settings separately.

Outside customs declaration:

* PostNL/Asendia carrier customs/CN22/commercial invoice data should show lowered LATAM values;
* no separate external customs PDF is required unless Vacier later asks for one.

## 12. Required TODOs

### Business / Carrier TODOs

* Confirm final LATAM country allowlist as two-letter ISO country codes.
* Confirm whether PostNL is the preferred first test route, while keeping Asendia as a future/parallel option.
* Confirm whether PostNL requires recipient tax ID for any LATAM countries.
* Confirm whether PostNL has Brazil-specific tax ID or bank account requirements.
* If Asendia is used, ensure webhook `tax_id` is non-null for required LATAM countries.
* Vacier must provide LATAM SKU customs override file in the agreed format.
* Vacier/Vareya must confirm that the original full-value invoice inside parcel remains an operational ShipHero print process.

### Engineering TODOs

* Add LATAM SKU customs override DB table.
* Add import/update workflow for Vacier-provided CSV/Excel data.
* Add UI page for viewing/editing/disabling override rows.
* Update customs cron to resolve values from the LATAM override table instead of warehouse-product customs values.
* Update PostNL mapper to use `lineItem.customs_value` for configured LATAM countries.
* Update Asendia Sync REST mapper to use `lineItem.customs_value` for configured LATAM countries.
* Add Asendia Sync REST `receiverTaxId` mapping from webhook `tax_id` only for configured LATAM countries where required.
* Keep existing cron cursor/idempotency behavior.
* Add tests for:
  * country-specific override wins over `ALL`;
  * `ALL` override fallback;
  * missing override blocks order update;
  * zero-value override is valid;
  * PostNL LATAM customs value uses `customs_value`;
  * Asendia LATAM customs value uses `customs_value`;
  * Asendia required `receiverTaxId` failure when `tax_id` is missing.

## 13. Failure Handling

### Override Missing

If an order contains a customs-included SKU without an active LATAM override:

* do not update any line item on that order;
* record order failure/skip reason;
* leave order eligible for retry after data correction.

### ShipHero Update Failure

If ShipHero line item update fails:

* do not add processed tag;
* log order number, order ID, line item IDs, and error;
* leave order eligible for retry.

### Carrier Label Failure

If PostNL or Asendia label generation fails due to missing required LATAM fields:

* do not treat customs cron as failed if the cron already updated ShipHero successfully;
* report label failure as carrier/data readiness;
* require data/config correction before retrying label generation.

## 14. Acceptance Criteria

* Active LATAM SKU override rows can be stored and managed separately from ShipHero product/warehouse customs values.
* For configured LATAM countries, Vacier order line item `customs_value` is set from the override table.
* Country-specific override rows take precedence over `ALL` rows.
* Missing override values prevent partial order updates and leave the order retryable.
* PostNL LATAM customs/CN22 values use `lineItem.customs_value` instead of full item price.
* Asendia Sync REST LATAM customs item values use `lineItem.customs_value`.
* Asendia Sync REST maps `tax_id` to `receiverTaxId` only for configured LATAM destinations where that field is required.
* Non-LATAM markets continue using the existing process.
* Original full-value invoice inside parcel remains an existing ShipHero/warehouse operation.
* Feature flags/env config can disable rollout without code changes.

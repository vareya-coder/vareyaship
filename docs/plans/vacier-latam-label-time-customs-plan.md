# Vacier LATAM Label-Time Customs Overrides

## Summary

Replace the disabled LATAM ShipHero line-item mutation workflow with carrier label-time overrides, matching the newer Vacier Turkey architecture.

For Vacier account `73982` shipping to configured LATAM countries, VareyaShip will load SKU values from its own database/cache and apply them only to PostNL or Asendia customs payloads. ShipHero order data remains unchanged so its invoice can retain original values.

## Confirmed Decisions

- Initial countries come from `VACIER_LATAM_COUNTRIES`, currently `EC,BR,AR`.
- PostNL is the initial rollout carrier; Asendia Sync REST receives equivalent support for later use.
- Shipping is DAP.
- The supplied Excel values are per-unit USD values and apply to every configured LATAM country.
- Customs descriptions use the ShipHero line-item `product_name`.
- Tariff code and country of origin remain from the ShipHero webhook.
- Excel SKUs containing `/H01` are normalized to the portion before `/`.
- Missing override data blocks label creation before calling the carrier.
- The LATAM cron must not update ShipHero line items.

## Implementation

1. Normalize all three Excel sheets into one 132-SKU dataset, storing `country_code=ALL` and `currency=USD`.
2. Add a cached LATAM override-map service backed by the existing database table, with cache invalidation after UI/API mutations.
3. Scope LATAM behavior to Vacier account `73982`, the configured country allowlist, and the LATAM feature flag.
4. Update PostNL to use override unit value, USD, and ShipHero product name.
5. Update Asendia Sync REST to use the same override value, USD, and product name while preserving destination tax-ID validation.
6. Disable the ShipHero mutation cron path and remove its active Vercel schedule while retaining historical tables.
7. Add structured logs for applied and missing overrides.
8. Add a Turkey override management UI/API with list/filter, create/edit, activate/deactivate, CSV import, and cache invalidation.

## Rollout

- Keep LATAM disabled by default.
- Apply migration `0013_vacier_latam_label_time_customs` before enabling the feature.
- Configure `VACIER_LATAM_COUNTRIES=EC,BR,AR`.
- Configure `VACIER_LATAM_ASENDIA_TAX_ID_COUNTRIES` only for destinations where the selected Asendia product requires receiver tax ID.
- Enable for the configured Vacier account and LATAM country allowlist, then use fresh test orders for verification.
- Verify the PostNL CN22 shows ShipHero product names and lowered USD values.
- Verify the untouched ShipHero order/invoice retains original values.
- Remove the order filter only after operational confirmation.

## Testing

- Account, country, and feature-flag scoping.
- Workbook normalization, including `/H01` handling and all 132 unique SKUs.
- Missing override blocks the entire carrier request.
- PostNL and Asendia use per-unit override values, USD, and ShipHero product names.
- Non-Vacier, non-LATAM, and Turkey behavior remain unchanged.
- Turkey UI/API CRUD, import, and cache invalidation.

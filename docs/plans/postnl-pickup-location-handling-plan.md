# PostNL Pickup Location Handling Plan

## Summary

Add a PostNL pickup normalization and inference layer for Ship2me account `85552`, controlled by environment feature flags. Default behavior remains unchanged unless explicitly enabled. In shadow mode, the system logs decisions without changing the PostNL label payload.

## Key Changes

- Extend `src/modules/featureFlags/featureFlag.service.ts` with PostNL pickup flags:
  - `ENABLE_POSTNL_PICKUP_INFERENCE=false`
  - `POSTNL_PICKUP_ACCOUNT_IDS=85552`
  - `POSTNL_PICKUP_CONFIDENCE_THRESHOLD=85`
  - `ENABLE_POSTNL_PICKUP_ADDRESS_FALLBACK=true`
  - `POSTNL_PICKUP_STRICT_ADDRESS_MATCH_REQUIRED=true`
  - `POSTNL_PICKUP_MAX_DISTANCE_METERS=500`
  - `POSTNL_PICKUP_LOG_ONLY=true`
- Add a stateless module under `src/modules/postnl/pickup/` for:
  - Normalizing ShipHero shipment address and company data.
  - Parsing `address_1` into street, house number, and extension.
  - Fetching nearest PostNL pickup locations from `/shipment/v2_1/locations/nearest`.
  - Scoring candidates with required name match, exact address match, PG support, and max-distance guard.
  - Producing `pickup_inferred`, `fallback`, or `home_delivery` decisions with structured logs.
- Update `src/app/utils/postnl/dataMaper.tsx` to accept an optional pickup decision and apply it after the base payload is built:
  - For inferred pickup, add PostNL pickup-compatible address data using `AddressType: "09"` and location fields from the matched location.
  - For address fallback, copy degraded `company_name` into receiver address fallback only when safe and no pickup is inferred.
  - Preserve existing home-delivery behavior when disabled, out of account scope, non-NL, low confidence, API failure, or shadow mode.
- Update `src/app/api/postnl/label/route.ts` to call the pickup decision service before mapping and pass the decision into the mapper.

## Logging

- Emit structured logs with event names:
  - `postnl_pickup_inference_result`
  - `postnl_pickup_inference_failed`
- Include `order_id`, `account_id`, `decision`, `confidence`, `location_code`, `matched_name`, `rules_passed`, `reason`, and raw `company_value`.

## Test Plan

- Add lightweight TypeScript test scripts or pure function tests for:
  - Flag disabled returns no behavior change.
  - Account allowlist excludes non-Ship2me shipments.
  - Valid Ship2me NL pickup candidate infers only when all strict guards pass.
  - Name-only match does not infer.
  - Address mismatch does not infer.
  - Distance over threshold does not infer.
  - `POSTNL_PICKUP_LOG_ONLY=true` logs but does not mutate payload.
  - Address fallback applies only when enabled and no pickup is inferred.
- Run `pnpm lint` and `pnpm build`.

## Assumptions

- Ship2me account id is `85552`, found in `drizzle/0002_wet_madame_hydra.sql`.
- The first rollout should use `POSTNL_PICKUP_LOG_ONLY=true`.
- Official PostNL docs confirm the Location API supports nearest pickup points, PG delivery option, `LocationCode`, `RetailNetworkID`, and that labelling uses `AddressType: "09"` for pickup delivery addresses.

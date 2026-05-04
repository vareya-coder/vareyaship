# 📦 PostNL Pickup Handling — Production Spec (v2)

## 1. Objective

Build a **Normalization & Decision Layer** in your API that:

* Reconstructs pickup intent from degraded data
* Safely enriches orders with `locationCode` when possible
* Falls back without breaking flows
* Prepares system for PostNL v4 strict schema

---

# 🧱 2. System Architecture

```text
ShipHero Order
    ↓
Normalization Layer (THIS IMPLEMENTATION)
    ↓
Decision Engine
    ↓
PostNL Payload Builder (v2.2 / v4 ready)
```

---

# ⚙️ 3. Feature Flags (MANDATORY)

```python
ENABLE_PICKUP_INFERENCE = True
INFERENCE_CONFIDENCE_THRESHOLD = 85
ENABLE_ADDRESS_FALLBACK = True
STRICT_ADDRESS_MATCH_REQUIRED = True
MAX_PICKUP_DISTANCE_METERS = 500
LOG_INFERENCE_ONLY = False   # Phase 1 = True, Phase 2 = False
```

---

# 🧾 4. Internal Unified Schema

Normalize ALL orders into:

```json
{
  "order_id": "...",
  "recipient": {
    "name": "...",
    "address1": "...",
    "address2": "...",
    "city": "...",
    "postal_code": "...",
    "country": "NL"
  },
  "raw": {
    "company": "...",
    "original_address": {}
  },
  "derived": {
    "delivery_type": "HOME | PG | UNKNOWN",
    "location_code": null,
    "inference_confidence": 0
  }
}
```

---

# 🧠 5. Decision Engine (Core Logic)

## 5.1 Main Flow

```pseudo
function processOrder(order):

    normalized = normalize(order)

    # STEP 1 — Explicit Structured Data
    if normalized.derived.delivery_type == "PG" AND location_code exists:
        return buildPickupPayload(normalized)

    # STEP 2 — Inference (Controlled)
    if ENABLE_PICKUP_INFERENCE:
        inference = inferPickup(normalized)

        logInference(order.id, inference)

        if NOT LOG_INFERENCE_ONLY AND inference.confidence >= THRESHOLD:
            normalized.derived.delivery_type = "PG"
            normalized.derived.location_code = inference.locationCode
            return buildPickupPayload(normalized)

    # STEP 3 — Address Fallback
    if ENABLE_ADDRESS_FALLBACK:
        applyAddressFallback(normalized)

    # STEP 4 — Default
    normalized.derived.delivery_type = "HOME"
    return buildHomePayload(normalized)
```

---

# 🔍 6. Pickup Inference Engine

## 6.1 API Call

```http
GET /shipment/v2_1/locations/nearest
```

Inputs:

* postalCode
* city
* street
* houseNumber

---

## 6.2 Scoring Model (STRICT)

```pseudo
function inferPickup(normalized):

    locations = fetchPostNLLocations(normalized)

    best = null
    bestScore = 0

    for loc in locations:

        if "PG" not in loc.deliveryOptions:
            continue

        score = 0

        # 1. Name Matching (REQUIRED)
        if fuzzyMatch(normalized.raw.company, loc.name):
            score += 50
        else:
            continue   # HARD FILTER

        # 2. Address Matching (CRITICAL SAFEGUARD)
        if STRICT_ADDRESS_MATCH_REQUIRED:
            if loc.street != normalized.recipient.address1.street:
                continue
            if loc.houseNumber != normalized.recipient.address1.number:
                continue
            score += 30

        # 3. Postal Code Match
        if loc.zipcode == normalized.recipient.postal_code:
            score += 10

        # 4. Distance Check
        if loc.distance <= MAX_PICKUP_DISTANCE_METERS:
            score += 10
        else:
            continue

        if score > bestScore:
            best = loc
            bestScore = score

    return {
        locationCode: best.locationCode,
        confidence: bestScore,
        matchedName: best.name
    }
```

---

# 🛡️ 7. Critical Safeguards (DO NOT SKIP)

## MUST conditions for inference:

* ✅ Name match (company ↔ location.name)
* ✅ Address match (street + house number EXACT)
* ✅ PG supported
* ✅ Distance ≤ threshold

👉 If ANY fails → DO NOT infer

---

# 🔧 8. Address Fallback Logic

```pseudo
function applyAddressFallback(normalized):

    if normalized.recipient.address2 is empty AND normalized.raw.company not empty:

        normalized.recipient.address2 = normalized.raw.company

        normalized.flags.address_fallback_applied = true
```

---

# 📦 9. Payload Builders

## 9.1 Pickup Payload (v2.2 compatible)

```json
{
  "deliveryType": "PG",
  "locationCode": "<derived>",
  "receiver": {
    "name": "...",
    "city": "...",
    "postalCode": "..."
  }
}
```

---

## 9.2 Home Delivery Payload

```json
{
  "deliveryType": "HOME",
  "address": {
    "name": "...",
    "address1": "...",
    "address2": "...",
    "city": "...",
    "postalCode": "..."
  }
}
```

---

# 📊 10. Logging (MANDATORY)

## 10.1 Inference Log

```json
{
  "order_id": "...",
  "decision": "pickup_inferred | fallback | home_delivery",
  "confidence": 92,
  "location_code": 398100,
  "matched_name": "Readshop Lisse",
  "rules_passed": [
    "name_match",
    "address_match",
    "distance_ok",
    "pg_supported"
  ]
}
```

---

## 10.2 Failure Log

```json
{
  "order_id": "...",
  "decision": "home_delivery",
  "reason": "no_valid_inference",
  "company_value": "Readshop Lisse"
}
```

---

# 🧪 11. Rollout Plan

## Phase 1 — Shadow Mode

```python
LOG_INFERENCE_ONLY = True
```

* No behavior change
* Collect metrics

---

## Phase 2 — Controlled Activation

```python
LOG_INFERENCE_ONLY = False
```

* Only high-confidence inference applied

---

## Phase 3 — Full Deployment

* Enable for all NL shipments
* Monitor logs

---

# 🚀 12. v4 Readiness (Future Switch)

## Internal Schema already supports:

```json
{
  "deliveryType": "PG",
  "pickupLocation": {
    "locationCode": "..."
  }
}
```

---

## Migration Toggle

```pseudo
IF POSTNL_API_VERSION == "v4":
    enforce locationCode presence
```

---

# ⚠️ 13. Explicit Non-Goals

* ❌ No guessing based on name only
* ❌ No inference without address match
* ❌ No overwriting valid structured data
* ❌ No dependency on client-side fixes

---

# 🧭 Final Outcome

After implementation:

| Before                 | After                |
| ---------------------- | -------------------- |
| Pickup intent lost     | Reconstructed safely |
| Labels missing info    | Corrected            |
| Random PostNL behavior | Deterministic        |
| No observability       | Full traceability    |

---

# 💡 Final Instruction to Coding Assistant

Implement this as:

> **A stateless, deterministic decision engine with strict guards and full logging**

No shortcuts on:

* safeguards
* scoring
* logging


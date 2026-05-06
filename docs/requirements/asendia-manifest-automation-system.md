# 📦 Asendia Manifest Automation System

## Requirements Specification (Vareya BV) — Final (v4)

---

## 1. 🎯 Objective

Design and implement a **headless, automated manifesting system** for shipments processed via ShipHero and handed over to Asendia.

---

### Primary Goal

* **Compliance accuracy**
  (manifest must match physically shipped parcels)

---

### Secondary Goals

* Deterministic batching
* Full traceability (audit-ready)
* High scalability (thousands/day)
* Future multi-carrier extensibility

---

## 2. 📌 Scope

### In Scope

* Shipment ingestion (webhook-driven)
* Parcel ID tracking (from Asendia API)
* Internal batch management
* Explicit manifest creation (parcel list-based)
* Manifest verification
* Document handling (manifest-level)
* Feature-flag-driven configuration
* Logging via Axiom

---

### Out of Scope (Phase 1)

* UI (optional Phase 2)
* Automated retry engine (manual intervention preferred)
* Parcel-level document bulk storage

---

## 3. 🧠 Core System Model (FINAL)

```text
Create Parcel → get parcel_id
Group parcel_ids internally (batch)
POST /manifests with parcel_ids
→ manifest created ONLY for those parcels
```

---

### Key Principle

> Manifest contents are **explicitly controlled** by the system using `parcel_id` list.

---

## 4. 🧱 Core Entities

---

### 4.1 Shipment

Represents a fulfilled order from ShipHero.

**Attributes:**

* shipment_id (internal)
* order_id
* carrier = Asendia
* parcel_id (from Asendia)
* batch_id
* is_manifested (boolean)

---

### 4.2 Parcel (Asendia)

Returned from:

```text
POST /api/parcels
```

**Critical Field:**

```json
"id": "parcel_id"
```

---

### 4.3 Internal Batch

Logical grouping of shipments/parcels.

---

#### Purpose:

* Control manifest grouping
* Align with physical shipment batches

---

#### Attributes:

* batch_id
* grouping_key
* operational_date
* status:

  * OPEN
  * CLOSING
  * MANIFESTED
* parcel_ids (derived)
* shipment_count

---

---

### 4.4 Manifest

Created via:

```text
POST /api/manifests
```

---

#### Attributes:

* manifest_id
* batch_id
* status
* created_at
* parcel_count_expected
* parcel_count_actual
* verification_status (matched / mismatch)
* document_location

---

---

## 5. 🔄 Batch Lifecycle

```text
OPEN → CLOSING → MANIFESTED
```

---

### Rules:

* **OPEN**

  * accepts new shipments

* **CLOSING**

  * no new shipments allowed
  * ready for manifest

* **MANIFESTED**

  * completed
  * immutable

---

---

## 6. ⚙️ Functional Requirements

---

## 6.1 Shipment Ingestion

---

### Source:

* ShipHero webhook (label generation event)

---

### Behavior:

1. Receive webhook
2. Validate payload
3. Ensure idempotency
4. Extract:

   * order data
   * shipment details
5. Store shipment

---

### Integration:

* Existing Asendia label generation already returns:

  * `parcel_id`
  * `trackingNumber`

---

---

## 6.2 Parcel ID Tracking (CRITICAL)

---

### Requirement:

System MUST store:

```text
parcel_id from Asendia API
```

---

### Reason:

* Required for manifest API
* Primary linkage between shipment and manifest

---

---

## 6.3 Batch Assignment

---

### Rule:

```text
Assign shipment to OPEN batch matching grouping_key + operational_date
Else create new batch
```

---

### Grouping (Feature Flag Driven)

* service/product (EPAQPLS, EPAQSCT, etc.)
* packaging type
* delivery options (mailbox, signature)
* client (optional)

---

### Default:

* single batch per operational_date

---

---

## 6.4 Batch Creation Rules

---

```text
Batch is created when first shipment arrives
```

---

### Constraints:

* No pre-creation of batches
* No reuse across operational dates

---

---

## 6.5 Dispatch Windows

---

### Requirement:

* Support 1 or 2 dispatches per day
* Dynamically determined (not fixed)

---

---

## 6.6 Manifest Triggering (Hybrid Model)

---

### Trigger Conditions:

```text
(time interval reached)
OR
(shipment threshold reached)
OR
(cutoff time reached)
```

---

### Precedence:

```text
cutoff_time overrides all
```

---

---

## 6.7 Cutoff Handling

---

### Feature Flag:

```text
cutoff_time (default: 17:00 Europe/Amsterdam)
```

---

### Behavior:

* Force all OPEN batches → CLOSING
* Trigger manifest creation

---

---

## 6.8 Late Shipment Handling

---

### Feature Flag Modes:

1. Assign to last OPEN batch
2. Create new batch (next operational date)

---

### Constraint:

* NEVER assign to MANIFESTED batch

---

---

## 6.9 Manifest Creation (EXPLICIT MODEL)

---

### API:

```text
POST /api/manifests
Body: [parcel_ids]
```

---

### Behavior:

* Manifest created ONLY for provided parcel_ids

---

### System Responsibility:

* Collect correct parcel_ids from batch
* Ensure only physically shipped parcels are included

---

---

## 6.10 Partial Failure Handling

---

### API Response:

```json
"errorParcelIds": []
```

---

### Required Behavior:

* Exclude failed parcel_ids
* Log failure
* Retry via manual intervention
* Do NOT mark batch fully manifested

---

---

## 6.11 Manifest Verification (MANDATORY)

---

### After manifest:

```text
GET /api/manifests/{id}/parcels
```

---

### Validate:

```text
expected_parcel_ids == actual_parcel_ids
```

---

### Outcome:

* matched → success
* mismatch → log + flag

---

---

## 6.12 Document Handling

---

### Manifest Document (REQUIRED)

```text
GET /api/manifests/{id}/document
```

---

### Behavior:

* Fetch PDF
* Store in Vercel Blob (or equivalent)

---

---

### Parcel-Level Documents (OPTIONAL)

Available via:

```text
GET /api/parcels/{id}/customs-document
GET /api/parcels/{id}/commercial-invoice-document
```

---

### Rule:

* NOT required for normal operations
* CN22 included in label

---

---

## 6.13 Logging (Axiom)

---

### Tool:

* Axiom

---

### Requirements:

* Structured logging (JSON)
* Log all critical events:

  * ingestion
  * batch assignment
  * batch closing
  * manifest trigger
  * manifest success/failure
  * verification result

---

---

## 6.14 Notifications

---

### Trigger:

* manifest created
* manifest failed

---

---

## 6.15 Retention

---

### Feature Flag:

```text
retention_days (default: 30)
```

---

### Applies to:

* manifests
* shipment metadata
* logs (via Axiom policies)

---

---

## 7. 🚩 Feature Flags

---

```text
enable_service_separation
enable_client_separation

cutoff_time (default 17:00)
cutoff_timezone (Europe/Amsterdam)

batch_interval_hours
shipment_threshold

late_shipment_mode:
  - assign_to_next_day
  - create_new_batch

manifest_enabled_crm_ids
retention_days (default 30)
```

---

---

## 8. 📊 Non-Functional Requirements

---

* Scale: thousands of shipments/day
* Idempotent ingestion
* No data loss
* Deterministic batching
* Fast webhook response (<500ms)
* No blocking external calls in ingestion

---

---

## 9. 🔐 Compliance Rules

---

* Manifest MUST match physical shipment
* No pre-manifesting of unshipped parcels
* Parcel IDs must be accurate
* CN22 included in label is sufficient
* Manifest document must be available at handover

---

---

## 10. ⚠️ Operational Constraints

---

* Manifest should be triggered **after packing is complete**
* System must align with real warehouse flow
* Avoid early batching or pre-manifesting

---

---

## 11. ❓ Assumptions (Validated)

---

* Manifest API requires explicit parcel_id list
* No implicit shipment inclusion
* Parcel-level documents generated automatically
* Manifest document is single PDF

---

---

## 12. ❗ Pending Questions

---

(From Asendia, if any remain)

* Manifest status lifecycle (async vs sync)
* Filtering capabilities (if any)

---

---

## 13. 🔮 Future Readiness

---

* Multi-carrier support (e.g., Deutsche Post)
* UI for operations
* Rule engine for advanced batching
* Automated retries

---

---

## 14. ✅ Acceptance Criteria

---

* All shipments correctly batched
* Manifest contains ONLY intended parcel_ids
* No mismatch between expected and actual parcels
* Manifest document successfully stored
* Full traceability maintained
* System operates without UI dependency

---

# 🚀 Final Status

✅ Fully aligned with Asendia API
✅ No ambiguity remaining
✅ Ready for architecture + implementation

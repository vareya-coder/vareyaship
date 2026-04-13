# 🏗️ Asendia Manifest Automation System

## Architecture Specification (Vareya BV) — Final (v3)

---

# 1. 🎯 Architecture Goals

* **Deterministic control** over manifest contents (parcel_id driven)
* **Compliance-first design** (physical shipment alignment)
* **High throughput** (thousands/day)
* **Low latency ingestion**
* **Operational observability without UI**
* **Minimal moving parts (monolithic service approach)**

---

# 2. 🧠 Core Architecture Principle

```text
Batch = controlled collection of parcel_ids
Manifest = explicit submission of parcel_ids
```

---

## 🔑 System Identity

```text
Batch Builder + Parcel Aggregator + Manifest Dispatcher + Verification Engine
```

---

# 3. 🧭 High-Level Architecture

```text
ShipHero Webhook
        ↓
Vercel Function (Ingestion)
        ↓
Neon DB (Source of Truth)
        ↓
Batch Assignment Engine
        ↓
----------------------------------
| Trigger Engine (Vercel Cron)   |
----------------------------------
        ↓
Batch Closing (CLOSING state)
        ↓
Manifest Service (Asendia API)
        ↓
Verification Layer
        ↓
Document Fetcher
        ↓
Storage (Vercel Blob)
        ↓
Observability (Axiom)
```

---

# 4. 🧩 System Components

---

## 4.1 Ingestion Layer

### Technology:

* Vercel Serverless Function

### Source:

* ShipHero webhook

---

### Responsibilities:

* Receive shipment/label event
* Ensure idempotency
* Extract `parcel_id`
* Persist shipment
* Assign to batch

---

### Constraints:

* <500ms execution
* No external blocking calls (except DB)

---

---

## 4.2 Batch Assignment Engine

---

### Purpose:

* Assign shipments to correct batch

---

### Logic:

```text
Find OPEN batch by:
(grouping_key + operational_date)

Else:
Create new batch
```

---

### Grouping Inputs:

* service/product
* packaging type
* delivery options
* client (optional)

---

---

## 4.3 Data Store (Neon DB)

---

### Role:

👉 **Single source of truth**

---

### Core Tables:

---

### shipments

```sql
shipment_id
order_id
parcel_id
batch_id
is_manifested
created_at
```

---

### batches

```sql
batch_id
grouping_key
operational_date
status (OPEN, CLOSING, MANIFESTED)
shipment_count
created_at
closing_at
```

---

### manifests

```sql
manifest_id
batch_id
status
parcel_count_expected
parcel_count_actual
verification_status
document_url
created_at
```

---

### feature_flags

```sql
key
value
updated_at
```

---

---

## 4.4 Trigger Engine (Cron)

---

### Technology:

* Vercel Cron Jobs

---

### Frequency:

* Every 10–15 minutes

---

### Responsibilities:

1. Fetch OPEN batches

2. Evaluate:

   * batch age
   * shipment count
   * cutoff time

3. Select batches for closing

---

---

## 4.5 Batch Closing Mechanism

---

### Purpose:

* Prevent further assignment before manifest

---

### Flow:

```text
1. Set batch → CLOSING
2. Block further assignment
3. Capture final parcel_ids
```

---

### Implementation:

* Single DB update with condition:

```sql
WHERE status = 'OPEN'
```

---

---

## 4.6 Manifest Service

---

### Integration:

* Asendia API

---

### Endpoint:

```text
POST /api/manifests
Body: [parcel_ids]
```

---

### Responsibilities:

* Build payload from batch
* Call API
* Handle response:

  * manifest_id
  * errorParcelIds

---

---

## 4.7 Partial Failure Handler

---

### Problem:

* Some parcel_ids may fail

---

### Solution:

* Identify failed IDs
* Log via Axiom
* Exclude from success count
* Keep batch in recoverable state

---

---

## 4.8 Verification Engine (CRITICAL)

---

### Purpose:

* Ensure manifest correctness

---

### Endpoint:

```text
GET /api/manifests/{id}/parcels
```

---

### Flow:

```text
expected_parcel_ids (DB)
vs
actual_parcel_ids (API)
```

---

### Output:

* matched → success
* mismatch → flagged

---

---

## 4.9 Document Fetcher

---

### Endpoint:

```text
GET /api/manifests/{id}/document
```

---

### Responsibilities:

* Fetch manifest PDF
* Store in blob storage

---

---

## 4.10 Storage Layer

---

### Technology:

* Vercel Blob

---

### Stored:

* manifest documents (required)

---

### Optional:

* parcel-level documents (future)

---

---

## 4.11 Observability Layer

---

### Tool:

* Axiom

---

### Responsibilities:

* Structured logging
* Error tracking
* Event tracing

---

### Events:

* shipment_ingested
* batch_created
* batch_closed
* manifest_triggered
* manifest_success
* manifest_failed
* verification_result

---

---

# 5. 🔄 Data Flow

---

## 5.1 Shipment Flow

```text
Webhook received
  ↓
Store shipment
  ↓
Assign batch
  ↓
Store parcel_id
```

---

## 5.2 Manifest Flow

```text
Cron triggers
  ↓
Select batch
  ↓
Set batch = CLOSING
  ↓
Collect parcel_ids
  ↓
POST manifest
  ↓
Store manifest_id
  ↓
Fetch document
  ↓
Verify parcels
  ↓
Update DB
```

---

---

# 6. ⚙️ Feature Flag Integration

---

### Source:

* DB (`feature_flags`)

---

### Cached:

* in-memory (short TTL)

---

### Used in:

* batch grouping
* cutoff logic
* trigger conditions

---

---

# 7. ⚡ Performance Design

---

## Principles:

* No microservices
* No internal APIs
* Direct DB access
* Stateless functions

---

## Outcome:

* Low latency
* High scalability
* Minimal overhead

---

---

# 8. 🔐 Concurrency & Safety

---

## Risks:

* duplicate ingestion
* double manifest calls
* batch mutation during closing

---

## Controls:

---

### 1. Idempotency

* unique shipment_id

---

### 2. Batch Status Locking

```text
Only OPEN → CLOSING allowed
```

---

### 3. Manifest Guard

* ensure batch not already manifested

---

---

# 9. 📄 Document Strategy

---

## Required:

* manifest PDF (always stored)

---

## Optional:

* customs docs
* commercial invoices

---

## Access:

* fetched via API when needed

---

---

# 10. 🔌 External Integrations

---

## ShipHero

* webhook ingestion

---

## Asendia

* parcel creation (existing)
* manifest creation
* document retrieval
* parcel verification

---

## Axiom

* logging & observability

---

---

# 11. 🔮 Future Extensions

---

* multi-carrier abstraction (e.g., Deutsche Post)
* queue-based processing (Upstash)
* UI dashboard
* retry engine

---

---

# 12. 🧠 Final Architectural Insight

```text
This system is NOT a manifest generator.
It is a controlled parcel aggregation + explicit submission system.
```

---

# 13. ✅ Architecture Readiness

---

| Area               | Status     |
| ------------------ | ---------- |
| API alignment      | ✅ complete |
| Data model         | ✅ complete |
| concurrency safety | ✅ covered  |
| observability      | ✅ strong   |
| scalability        | ✅ ready    |

---

# 🚀 Final Status

✅ Fully aligned with real Asendia API
✅ No legacy assumptions
✅ Production-grade design
✅ Ready for implementation

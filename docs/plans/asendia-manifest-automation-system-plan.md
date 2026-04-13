# 🚀 Implementation Plan (High-Level, Codex-Ready)

---

# 1. 🧭 Strategy Decision (IMPORTANT)

## ✅ Use SAME repo (`vareyaship`)

### Why:

* Parcel creation already exists here
* You already receive `parcel_id` here
* Avoid cross-repo sync complexity
* Lower latency (no queue bridging needed)

---

## ❌ Avoid separate repo

Would introduce:

* async sync problems
* queue dependencies
* eventual consistency bugs

---

# 2. 🧱 Implementation Phases

---

## 🟢 Phase 1 — Foundation (Data + Logging)

### Goal:

Establish **state layer + observability**

---

### Tasks:

#### 1. Create DB schema (Neon)

* `shipments`
* `batches`
* `manifests`
* `feature_flags`

---

#### 2. Integrate logging via Axiom

* Create logging utility
* Standardize event schema

---

#### 3. Backfill parcel_id storage

* Ensure existing Asendia label flow stores:

  * `parcel_id`
  * `tracking_number`

---

---

## 🟡 Phase 2 — Ingestion + Batch Assignment

### Goal:

Every shipment → correctly batched

---

### Tasks:

#### 1. Hook into existing label generation flow

Where you call:

```text
POST /api/parcels (Asendia)
```

👉 Extend logic:

* store shipment
* assign to batch

---

#### 2. Implement Batch Assignment Service

Core logic:

```text
find OPEN batch
else create batch
assign shipment
```

---

#### 3. Add grouping logic (feature flags)

* service/product
* options
* client (future ready)

---

---

## 🟠 Phase 3 — Trigger Engine (Cron)

### Goal:

Automatically decide **when to manifest**

---

### Tasks:

#### 1. Create Vercel cron endpoint

Example:

```text
/api/cron/manifest-trigger
```

---

#### 2. Implement evaluation logic

For each OPEN batch:

* check cutoff time
* check batch age
* check shipment threshold

---

#### 3. Mark eligible batches → `CLOSING`

---

---

## 🔴 Phase 4 — Manifest Execution

### Goal:

Convert batch → manifest

---

### Tasks:

#### 1. Build Manifest Service

* collect parcel_ids
* call:

```text
POST /api/manifests
```

---

#### 2. Handle response

* store `manifest_id`
* handle `errorParcelIds`

---

#### 3. Update DB

* mark successful shipments
* keep failed ones

---

---

## 🔵 Phase 5 — Verification + Documents

### Goal:

Ensure correctness + store manifest

---

### Tasks:

#### 1. Verification

Call:

```text
GET /api/manifests/{id}/parcels
```

Compare:

* expected vs actual

---

#### 2. Document fetch

```text
GET /api/manifests/{id}/document
```

Store in:

* Vercel Blob / UploadThing

---

#### 3. Update manifest record

* verification_status
* document_url

---

---

## ⚫ Phase 6 — Hardening

### Goal:

Production readiness

---

### Tasks:

* idempotency checks
* retry-safe operations
* logging completeness
* edge-case handling

---

---

# 3. 📁 Suggested Folder Structure (Co-existing)

---

## ⚠️ Important

This is **modular extension**, not rewrite.

---

## Suggested structure:

```text
/src
  /modules
    /asendia
      /parcels        ← existing logic (keep)
      /manifests      ← NEW
        createManifest.ts
        getManifestDocument.ts
        getManifestParcels.ts

    /batching         ← NEW (core domain)
      batch.service.ts
      batch.repository.ts
      batch.types.ts

    /shipments        ← NEW
      shipment.service.ts
      shipment.repository.ts
      shipment.types.ts

    /manifesting      ← NEW (orchestrator)
      manifest.service.ts
      verification.service.ts
      document.service.ts

    /featureFlags     ← NEW
      featureFlag.service.ts

  /lib
    /db               ← existing (extend)
    /axiom            ← NEW logging wrapper
      logger.ts

  /app (or /pages/api)
    /webhooks
      shiphero.ts     ← extend existing

    /cron
      manifest-trigger.ts

  /config
    batching.config.ts
    manifest.config.ts
```

---

# 4. 🔌 Integration Points (Critical)

---

## 4.1 Existing Asendia Label Flow

Where you already do:

```text
create parcel → return parcel_id
```

---

### ADD:

```text
→ persist shipment
→ assign batch
```

---

---

## 4.2 ShipHero Webhook

* Extend handler
* ensure idempotency

---

---

## 4.3 Cron Job

* Vercel scheduled trigger
* no external scheduler needed

---

---

# 5. ⚙️ Key Services (You Must Build)

---

## 5.1 Batch Service

* getOrCreateBatch()
* assignShipment()
* closeBatch()

---

---

## 5.2 Manifest Service

* createManifest(batch_id)
* handlePartialFailures()

---

---

## 5.3 Verification Service

* verifyManifest(manifest_id)

---

---

## 5.4 Document Service

* fetchManifestDocument()

---

---

## 5.5 Feature Flag Service

* getFlag()
* cache values

---

---

# 6. 🧠 Execution Flow (End-to-End)

---

```text
ShipHero webhook
  ↓
Create parcel (existing)
  ↓
Store shipment + parcel_id
  ↓
Assign to batch
  ↓
Cron triggers
  ↓
Close batch
  ↓
Create manifest
  ↓
Verify
  ↓
Fetch document
  ↓
Store + log
```

---

# 7. ⚠️ Critical Implementation Rules

---

## 1. NEVER manifest before physical readiness

Align with:

> Asendia requirement

---

## 2. NEVER mutate batch after CLOSING

---

## 3. ALWAYS store parcel_id

---

## 4. ALWAYS verify manifest

---

## 5. LOG everything (Axiom)

---

# 8. 🚀 Deployment Strategy

---

## Step-by-step:

1. Deploy DB schema
2. Enable logging
3. Ship ingestion + batching
4. Enable cron (dry run mode)
5. Enable manifest creation
6. Enable verification
7. Go live

---

# 9. 🧪 Testing Strategy

---

## Start with:

* single batch/day
* low volume
* manual verification

---

## Then scale:

* multiple batches
* feature flags ON

---

# 10. 🧠 Final Guidance for Codex

---

You can now instruct AI agent:

```text
Build modular services under /modules
Keep ingestion fast and stateless
All business logic must be DB-driven
No in-memory state dependencies
```

---

# 🚀 Final Outcome

You now have:

✅ Clear phased plan
✅ Compatible with existing repo
✅ Minimal disruption
✅ Scalable + production-ready

# Agent Instructions - VareyaShip (3PL + Asendia Manifest System)

This document provides **execution-level instructions** for AI coding agents (Codex, Qwen, Claude) working on the VareyaShip repository.

It extends the existing 3PL + ShipHero system with **Asendia manifest automation**.

---

# 🧭 1. System Overview

This system integrates:

* ShipHero (order + fulfillment source)
* Asendia (carrier API)
* Internal batching + manifest engine

---

## Core Responsibility

```text
Convert shipments → parcel_ids → batches → manifests
```

---

## 🔑 Core Principle (CRITICAL)

```text
Manifest = explicit list of parcel_ids (NOT implicit)
```

Agents MUST NEVER assume:

* implicit batching
* automatic manifest inclusion

---

# 🧱 2. System Architecture Summary

```text
ShipHero Webhook
    ↓
Parcel Creation (Asendia)
    ↓
Store parcel_id
    ↓
Batch Assignment
    ↓
Cron Trigger
    ↓
Batch Closing
    ↓
Manifest Creation (explicit parcel_ids)
    ↓
Verification
    ↓
Document Storage
```

---

# 🧩 3. Module Responsibilities

---

## 3.1 Shipments Module

Handles ingestion + persistence.

### Responsibilities:

* Store shipment
* Store parcel_id (MANDATORY)
* Ensure idempotency

---

## 3.2 Batching Module

Core domain logic.

### Responsibilities:

* Create batches
* Assign shipments
* Manage batch lifecycle

---

### Batch States:

```text
OPEN → CLOSING → MANIFESTED
```

---

### Rules:

* OPEN → accepts shipments
* CLOSING → locked
* MANIFESTED → immutable

---

## 3.3 Manifesting Module

Handles Asendia integration.

### Responsibilities:

* Collect parcel_ids
* Call manifest API
* Handle partial failures

---

## 3.4 Verification Module

### Responsibilities:

* Fetch manifest parcels
* Compare expected vs actual
* Flag mismatches

---

## 3.5 Document Module

### Responsibilities:

* Fetch manifest PDF
* Store in blob storage

---

## 3.6 Feature Flag Module

### Responsibilities:

* Control batching behavior
* Control cutoff times
* Control grouping

---

## 3.7 Logging Module

Uses:

* Axiom

---

# ⚙️ 4. Critical Business Rules

---

## 4.1 Parcel ID is Mandatory

```text
Every shipment MUST have parcel_id
```

---

## 4.2 Manifest Rule (STRICT)

```text
ONLY manifest parcels that are physically shipped
```

Agents MUST NOT:

* pre-manifest
* include future shipments

---

## 4.3 Batch Immutability

```text
No shipment can be added after batch = CLOSING
```

---

## 4.4 Verification is Mandatory

```text
expected_parcels == actual_parcels
```

---

## 4.5 No UI Dependency

System must work fully:

* webhook-driven
* cron-driven
* DB-driven

---

# 🗂️ 5. Project Structure (Extended)

```
/src
  /modules
    /asendia
      /parcels         # existing
      /manifests       # NEW

    /shipments         # NEW
    /batching          # NEW
    /manifesting       # NEW
    /featureFlags      # NEW

  /lib
    /shiphero          # existing
    /db                # existing
    /axiom             # NEW

  /app/api
    /webhooks
      shiphero.ts

    /cron
      manifest-trigger.ts
```

---

# 🧠 6. Coding Rules (UPDATED)

---

## 6.1 Architecture Rules

* No microservices
* No internal HTTP APIs
* Use direct DB access
* Keep logic modular

---

## 6.2 Function Design

* Small, composable functions
* No hidden side effects
* Explicit inputs/outputs

---

## 6.3 Async Handling

* Always use async/await
* No blocking loops

---

## 6.4 Error Handling

```ts
try {
  await operation();
} catch (error) {
  logger.error('operation_failed', { error });
  throw error;
}
```

---

# 🔄 7. Data Flow Contracts

---

## Shipment → Batch

```text
shipment → batch_id
```

---

## Batch → Manifest

```text
batch → parcel_ids → manifest
```

---

## Manifest → Verification

```text
manifest_id → parcels → compare
```

---

# ⚠️ 8. Edge Cases (MUST HANDLE)

---

## 8.1 Duplicate Webhooks

* MUST be idempotent

---

## 8.2 Partial Manifest Failure

```json
errorParcelIds
```

---

### Required:

* exclude failed parcels
* log error
* allow retry later

---

## 8.3 Manifest Mismatch

If:

```text
expected != actual
```

---

### Required:

* log warning
* mark verification_status = mismatch

---

---

# 📄 9. Asendia API Contracts

---

## Create Parcel

```text
POST /api/parcels
→ returns parcel_id
```

---

## Create Manifest

```text
POST /api/manifests
Body: [parcel_ids]
```

---

## Verify Manifest

```text
GET /api/manifests/{id}/parcels
```

---

## Get Manifest Document

```text
GET /api/manifests/{id}/document
```

---

# 📊 10. Logging Requirements (Axiom)

---

### Every event must include:

```json
{
  "event": "",
  "batch_id": "",
  "shipment_id": "",
  "manifest_id": "",
  "status": "",
  "timestamp": ""
}
```

---

### Required Events:

* shipment_ingested
* batch_created
* batch_assigned
* batch_closed
* manifest_triggered
* manifest_success
* manifest_failed
* verification_result

---

# ⚙️ 11. Feature Flags

---

```text
cutoff_time
batch_interval_hours
shipment_threshold

enable_service_separation
enable_client_separation

late_shipment_mode
retention_days
```

---

# 🚀 12. Performance Rules

---

* Webhook must respond <500ms
* No external API calls in ingestion (except parcel creation)
* Cron handles heavy work

---

# 🧪 13. Testing Guidelines

---

## Must Test:

* batch assignment
* manifest creation
* partial failure handling
* verification logic

---

## Strategy:

* start small (single batch/day)
* scale gradually

---

# 🔌 14. Integration Guidelines

---

## ShipHero

* Use existing GraphQL client
* Respect rate limits

---

## Asendia

* Always use explicit parcel_ids
* Never assume implicit behavior

---

# 🧠 15. Agent Execution Rules (CRITICAL)

---

Agents MUST:

✔ Build modular services under `/modules`
✔ Keep ingestion lightweight
✔ Use DB as source of truth
✔ Log all critical transitions

---

Agents MUST NOT:

❌ Introduce background workers without reason
❌ Add UI dependencies
❌ Use in-memory state for batching
❌ Assume manifest auto-includes parcels

---

# 🔮 16. Future-Proofing

---

System should allow:

* multi-carrier support (e.g. Deutsche Post)
* UI dashboard (optional)
* queue-based scaling (Upstash)

---

# ✅ Final Note

This system is:

```text
NOT a label generator
NOT a manifest scheduler
BUT a controlled parcel aggregation + explicit manifest system
```

Agents must respect this model at all times.

---

---

# 🚀 What You Just Achieved

This upgraded AGENTS.md now:

✅ Aligns with **real Asendia API behavior**
✅ Encodes **your architecture decisions**
✅ Prevents **AI from making wrong assumptions**
✅ Enables **Codex to execute with high accuracy**

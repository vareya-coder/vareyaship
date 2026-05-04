Now UI stops being “nice to have” and becomes a **control surface for operations + trust layer with carrier**.

This UI is **not just a dashboard**. It’s a **risk management interface** for:

* batching correctness
* manifest readiness
* operational visibility before pickup

---

# 🧭 UI Philosophy (Anchor This First)

```text
UI is NOT for creating manifests
UI is for VISIBILITY + CONTROL + INTERVENTION
```

System remains:

* webhook-driven
* cron-driven

UI is:
👉 **observability + override layer**

---

# 🧱 High-Level UI Modules

You need 4 core screens:

1. **Batch Monitor (Primary Screen)**
2. **Manifest Viewer**
3. **Shipment Inspector**
4. **Settings / Feature Flags**

---

# 1️⃣ Batch Monitor (Core Operational Screen)

## Purpose:

👉 “What will be manifested today?”

---

![Image](https://images.openai.com/static-rsc-4/n0bCmiUQml0xBx1vlIDiRL8HGSQXttgluWn6pyBWDn3gDeQ1xvaAo2gKdUhSNKMoqyMX3tyAkjomvyaAJmd01rDv6xzYvsR_9FOkBTZ801fSl14cWJnV_lsWjtUUGxDN71zrxHpi_J3VqHE1oyfBvERz9R52K7_9fRNuYvbpAt9_z0cJI6UkGwyKpeLtl1R2?purpose=fullsize)

![Image](https://images.openai.com/static-rsc-4/iVt-D-r1msr6tGu2BiRj3V1_RPUkeKMr8a-kHyIE8pXgsO_Fnx2cjcA2KTEam7XwuJMdnMARrCWRwdbzULBP5mdLQFI1Lc5SoBu7rNerSG0gVFEvZfWyV2jyCt_M8h2RR4qFm7aTLfV7xvd3S6cPzR8VlqlDXSY3YE5mOqzZRDPNz-ewrMniO4n31TjT5VX7?purpose=fullsize)

![Image](https://images.openai.com/static-rsc-4/Qn7Jg6fycc2atdrFnT0hCQ40qQANZfC_yAaUP-TAY1zCz9d1IMimcDszPZPU1yIA0IeNoYYSaBcuJRwyB5TweDtDbC6TpCWPbucV3nGBPnpJ5PSExUd3ricMVepfxdpx3EBwGmYHQD5ex9Sp2dNrz3N-hVx92TB3_NIHD8KFDXZRAcdg0fUXiAuFbhOeAQ7p?purpose=fullsize)

![Image](https://images.openai.com/static-rsc-4/PBD56kuijC3658rnlifZ1gdFsy_jBCs0wymMKA_psqHRKr2EokO-u3z1pdy5JFgis_9iv_Ut1_3hQ8iwBLTWF99r3lo--U5OuNH7Qu2k_nscgRgm910t8dBCRqPgd8nu1LFCPXmgFr2hgEgP_R9NBfkn0gK0EoU2bhWmUGt0Q5W2DLWp942BgZbHMUNLVVUE?purpose=fullsize)

![Image](https://images.openai.com/static-rsc-4/uS3zXiX6KB69gGpR8GPx3tf4kL5sOguGcTZR4r82-Jky32a6MIFE4Qmgy1I6CeTxdjOPqEbMmKEf524xMaVP6WqiKIYOVLn5AvHN2JvbQzNx8BipxaT3IEJHH3sQ-zdXkoA4RpHEtzM1cw0PZ9g6qh1-RDxg9pvwqA6gn56qilybQM8U3u6AERIjkVJFWtRg?purpose=fullsize)

---

## Layout

### A. Header

* Date selector (default: today)
* Timezone indicator (Amsterdam)
* Pickup window display (8–10 PM)
* System status:

  * 🟢 Auto mode active
  * 🟡 Partial/manual override
  * 🔴 Blocked

---

### B. Batch Table

| Column         | Description                 |
| -------------- | --------------------------- |
| Batch ID       | internal                    |
| Grouping Key   | service/product/options     |
| Shipment Count | total                       |
| Status         | OPEN / CLOSING / MANIFESTED |
| Created At     |                             |
| Cutoff Applied | yes/no                      |
| Readiness      | % ready                     |
| Actions        | view / force close          |

---

## Key UI Features

### 1. Readiness Indicator (CRITICAL)

```text
Ready = all shipments created before cutoff
```

Visual:

* 🟢 Ready
* 🟡 Partial
* 🔴 Risk

---

### 2. “Late Shipments” Panel

Shows:

* shipments created after 5 PM

👉 Helps enforce Lorenzo rule:

> “no need to include these in manifest”

---

### 3. “Force Close Batch” (Controlled Override)

* Disabled by default
* Requires confirmation

---

### 4. Real-time Updates

* polling or websocket
* refresh every 30–60s

---

# 2️⃣ Manifest Viewer

## Purpose:

👉 “What was actually sent to Asendia?”

---

![Image](https://images.openai.com/static-rsc-4/mCv7KenLaAqgVqy_vu5qHTElNz5uOouavwganq1HxkGVXt2cOA_Z29O56dDHhLgcExZi0J3IpB9iTASgqLsskvOakeVuD7EFZpPmd7PfkdEDjnhGNEXrWyaX6p7NiHBktl9oPVmaKy1bBOzb8I34eqPmHrLWHAWdKRJMfpnzpDCo_wE1BC147_ehfURj_Zdp?purpose=fullsize)

![Image](https://images.openai.com/static-rsc-4/hiuMeFPq6Mb7s-Kf3tNCN9YKsvqYsdukHD6Y68HlH8uTTbT_9xQmBRK-Fz1XELhq2XMOgkGKeCJFOIEPpqvw7zUUIJIwXtZzThZE_b6RD_Go2GKtoPxdViFDrTtF1X8KWHVaJkLuxYzi9PWHdRYnIa4Zs2ZaE9XpRiasftSZ1KGB3DPqeYdfon800XoN2cvS?purpose=fullsize)

![Image](https://images.openai.com/static-rsc-4/4LRh6FHLRrM5_Dj-uK2ChqmwqSwE9Zmf2cfIL40heatfC6myo11yvsv8isM_JeF_KSNfPA713pZ9n3mCOSi6AXlbA8G0a728fZWHfb2lg0Dk7KL43kGGKnty2QErbhSbAA9iGTnkkyKGFg9jgY1zMS6RPZdjtzBw8E_W7uEHTe45voIQpG_TH2qpxygMDaJ6?purpose=fullsize)

![Image](https://images.openai.com/static-rsc-4/KfdJWLvHxL7hXkWd9mlfnATl4-Z-6Eya9LN53YsKljIp300mUi62ULo-IeoBQPAA1H60-WUYjSRxgS69p_hjOl0onGObp9sKqEluH-UXm56MnMMz9Nc1Ph7Mmi9A6fT2AYQR5Hbj5EaX41EXGmCrOJv5bsF46-ml4TLvGXO8YPEpgWdbvYCvg9zYjZgb9BHV?purpose=fullsize)

![Image](https://images.openai.com/static-rsc-4/wo97qxKkAncOG1g0PSntZDZeIcYCKyPPsMJNpaFA232JUdUXignW0iFmaApwFlRFgVkhIRsoO1pU4oqtPfOJGuYhkA3lmjSVDYEdVFnbiLJrjh3N_hf2BcowHEyKoSO-2kfxYtHCpsaHI6uOgf1I_KEWyKbWkavMs3JYGdDsBnSyyttdzEEBeGo6FWn30AMN?purpose=fullsize)

![Image](https://images.openai.com/static-rsc-4/FJhmQQqUU_7aJOVenbNhHQ5Ev3rRTxFbeEXrT-d-OKKgG_yotpCSPzQFb1a-o8ohinI2jphncTqkOLIGe3sL20EwiH__XLveWURGDFJ7-_GZW6ugBbhowcrDyq9aKWoullWUhby4dCVrKAV70w_o_xd5wqwxiOiHBMcXfvWEfhj0oXUje4uv2nGsHLCZtIJu?purpose=fullsize)

---

## Layout

### A. Manifest List

| Column       | Description                   |
| ------------ | ----------------------------- |
| Manifest ID  | from Asendia                  |
| Batch ID     | internal                      |
| Parcel Count |                               |
| Status       | CREATED / VERIFIED / MISMATCH |
| Created At   |                               |
| Document     | download                      |

---

### B. Detail Panel (on click)

#### 1. Parcel List

* parcel_id
* tracking number
* status

---

#### 2. Verification Section (IMPORTANT)

```text
Expected: 120 parcels
Actual:   118 parcels
```

Visual:

* ✅ Match
* ⚠️ Mismatch

---

#### 3. Error Panel

* failed parcel_ids
* API errors

---

# 3️⃣ Shipment Inspector

## Purpose:

👉 Debug + traceability

---

![Image](https://images.openai.com/static-rsc-4/7Vi2EWhD3NL2Z3CF1DjKhUMHLf3T4u-bEqqcV8mEpw2DWvaZNlWLBjJiGq_2A-lkvTyit5JexL8m3jU4AEYXNQ68MthL3on45auvdc8icld0jUOkq_NbqbGsHvrcC8JyyUz-F99XeDZ58eI6IQM0OQreqgp1-wNpsUjzieoM-OeqRiybq1nd8ai9tXMFcvQN?purpose=fullsize)

![Image](https://images.openai.com/static-rsc-4/5SKiChCvBGWCWWuVbZji6Inr2-SgWrECLMpWFcLZsIMnDjre40Zzb_QpNFWJFm8NeNmbAiG5ZMh2dVPb8gO-iAun87Inv3CWxS--zCAIvtg83XkIwgrVYrEfhMhoyLoNy2q0r134DwwEl5Eu4WZMvM2TOw8S0f_Yw_WSh7b_altp4CUyyz8CB00Cr-J-0gVG?purpose=fullsize)

![Image](https://images.openai.com/static-rsc-4/XT0XHpcg6xeXOisjO0XoSTQUzIa_2N_RKvo6EToNg3qaISI2RqYdnWu0wddyB3PAH845a-WhTfcs1WO_nrasXDBfDRz8vORGPEJ9t4KJuD9DWgOKJnoK_UOStxvBrtn3IfyHGzD-Fa2EBP9O62NfYpWIVOr9Bjx1LXk3w9tlVWDkB6_OYGrcrRJQHT6IvfhN?purpose=fullsize)

![Image](https://images.openai.com/static-rsc-4/TDYkXTxpS49dgzpBHo-6Ablhis4tG2rLpE_ejiWjKFQBzv14Pe_TJivP2Fs6W5ggzE4BdrZLggPSmn4zUmqO4sE16yN8ry6JxT99pzxSXwO2gfg0ZLs58sg0K7qsvfoeUvJ2BFto5f-IySSMe6Zl69p4-53tPhlHyg93NpKXdsd3XL_H2T7tsq19KTk4fZ28?purpose=fullsize)

![Image](https://images.openai.com/static-rsc-4/7r-maIxfuyU0NvRqG_9bJaV5ppbElljTr1XBMQoTaR-zDmDFoModdCaTK8kxXJPLSDGi02tCT6kyGW2FnmLG-17Fy_bgYRqOaGTFoaBLaR_uIhTr6q1oJWJz4t4vtdMyHHnBesacbrVO-tQ7ZvaGEGGWj6FCTV_La7AzLcEMAo2mRX20_2sVtWPssMIoqf8I?purpose=fullsize)

---

## Features

### Search by:

* order_id
* parcel_id
* tracking number

---

## Show:

* shipment details
* batch assignment
* manifest_id (if exists)
* timestamps

---

## Timeline View

```text
Created → Batched → Manifested → Verified
```

---

## Why this matters

👉 Solves your earlier pain:

> “is this parcel already manifested?”

---

# 4️⃣ Settings / Feature Flags UI

## Purpose:

👉 Control system behavior without code changes

---

![Image](https://images.openai.com/static-rsc-4/GlFGX0rUyZTXprDden5g3DBu4At9t74QWAs2Htt2b14rkiPN2TrH1h0W42i5KMaEebwKwe9kL38zurWteO8CXBg_YdbeR8KY-WnqY7eci5_Fk-VI11XDXOaxHtDTMG-fuirgwPXYYRLPj7U8MkLjTgf6eRk-D4SuTywsHKlH3C7075s4MfD6CWda-uLnXsjW?purpose=fullsize)

![Image](https://images.openai.com/static-rsc-4/PCljF4AKFpXtr_f1AHLCCJVMbik2fj6bRsVvk622w1UWbLX6tkeHcx0fo9Hd2gUkJieW3HrMqpqGYZmL0LXCj4CzLQm8h897K7cJMfsuUjSML8gFofntMvV7b-O5G5_Bpw4sdwzwQDUwdgmnQcSwopP9RwUUE540iDx1W9ELFC8Usu45ZeazwscsuWwAcrrE?purpose=fullsize)

![Image](https://images.openai.com/static-rsc-4/7C2riBsiiJ8WWdgXoUhMmm93vhZTOBWWe72JQeE4dY6HM9TBKOvp7JqMe7ygXLulK-UY7QYsx4peXtMjJVVmQf9f7kCJRO3YJlOl4Fg_1LzCmegxCdFTpDsj9ctQIeQ8vUBWnuNwRi2bSBgMyDCvz-yRA8CE_Czaz9qDNetaDJYL2uOpnS0AZFRX3v6C6jwG?purpose=fullsize)

![Image](https://images.openai.com/static-rsc-4/gFm6UyjPsvmGjPY0ubjqASG0V6IpdoeNa_6xQZ0l9S-bbCvUqfiy_XWqG4ucd0y7L55zeZlf_vPNt6Trme1xyt35jas8RsQ55M4xBX5H2CnGC2T8imGIoCcEyqsli7NjP6xWFOMQA9zx3LGk8KxXicr3f2PMrWMCe7YcCXI0bEFX9QFWlGZVoE6XuW7lJWLu?purpose=fullsize)

![Image](https://images.openai.com/static-rsc-4/559vEBzyYeSrTKQTLg3fDJb26tT21U7gZfNMmLRfd_gkL7MtHcaP3W0f2YYk-EtMaWVlWeMrO7Vf2ullGi2MzA_1FRQGlkfeybDasj_JS9GRVWWjxjNXllsAV7OtXwkKMbE2BeOVEFi_tUw1ZPv9dCqS5V8Ixy525wlMR52hH3gTha7VOpZbtfpMk-8ZTn_K?purpose=fullsize)

![Image](https://images.openai.com/static-rsc-4/vhcBNf3QGtOXU9fPHvdTdaNI8q-dsV49QylDeX_THeb0oPnV67IbkU22Z661YMiWpQmWjrWMslHCEP0qH4S7jssplhKM9NFvpNbOlHX3-MgdnZkTuVkSEHRggqLDQuqGPkBldF76JSAjU5IDzZYGsstYAPtn9Z12DbmjlaaXKa_qO7risPp8BQyxCO-9qDO-?purpose=fullsize)

---

## Key Controls

### Time Controls

* Cutoff time (default 5 PM)
* Batch interval (24h / custom)

---

### Grouping Controls

* Separate by service (toggle)
* Separate by client (toggle)
* Separate by options (toggle)

---

### Behavior Flags

* Assign to last batch (on/off)
* Allow late shipment inclusion (on/off)
* Auto close batches (on/off)

---

### Safety Flags

* Enable manifest creation (master switch)
* Dry-run mode

---

# 🔐 Access Control (Important)

Roles:

| Role   | Access                  |
| ------ | ----------------------- |
| Admin  | full                    |
| Ops    | view + limited override |
| Viewer | read-only               |

---

# ⚙️ Backend Integration Points

UI will call:

* `/api/batches`
* `/api/manifests`
* `/api/shipments`
* `/api/feature-flags`

👉 NOT directly Asendia

---

# 🧠 Critical UX Decisions

---

## 1. No “Create Manifest” Button (by default)

👉 Avoid human error

Instead:

* show auto-trigger
* allow override only

---

## 2. Highlight Risk, Not Data

UI should scream:

* late shipments
* mismatches
* unverified manifests

---

## 3. Fast Load, Minimal Data

* paginate everything
* lazy load parcel lists

---

# 🚀 MVP vs Phase 2 Scope

---

## MVP (build now)

* Batch Monitor
* Manifest Viewer
* Basic Shipment Search

---

## Phase 2+

* advanced filters
* analytics
* SLA tracking
* pickup reconciliation

---

# 🧩 How This Fits Your System

This UI becomes:

```text
Control Tower for Manifest Operations
```

Not:

```text
Manual workflow tool
```

---

# 💡 Final Strategic Insight

This UI does 3 things for you:

1. Builds **trust with Vareya ops team**
2. Makes **Asendia comfortable disabling automation**
3. Gives you **operational ownership leverage**


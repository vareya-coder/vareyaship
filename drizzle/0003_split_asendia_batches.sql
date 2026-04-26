UPDATE "shipments" AS s
SET
	"crm_id" = m."crm_id",
	"sender_tax_code" = NULLIF(m."sender_tax_code", '')
FROM "asendia_customer_mappings" AS m
WHERE s."account_id" = m."account_id"
  AND m."is_active" = true
  AND (
    s."crm_id" IS DISTINCT FROM m."crm_id"
    OR s."sender_tax_code" IS DISTINCT FROM NULLIF(m."sender_tax_code", '')
  );
--> statement-breakpoint
WITH pure_batches AS (
	SELECT
		b."batch_id",
		MIN(s."crm_id") AS "crm_id",
		CASE
			WHEN b."grouping_key" IS NULL OR b."grouping_key" = '' THEN 'crm:' || MIN(s."crm_id")
			WHEN b."grouping_key" LIKE '%crm:%' THEN b."grouping_key"
			ELSE b."grouping_key" || '|crm:' || MIN(s."crm_id")
		END AS "new_grouping_key"
	FROM "batches" AS b
	JOIN "shipments" AS s ON s."batch_id" = b."batch_id"
	WHERE b."status" IN ('OPEN', 'CLOSING')
	  AND s."is_manifested" = false
	  AND s."crm_id" IS NOT NULL
	GROUP BY b."batch_id", b."grouping_key"
	HAVING COUNT(DISTINCT s."crm_id") = 1
)
UPDATE "batches" AS b
SET
	"crm_id" = p."crm_id",
	"grouping_key" = p."new_grouping_key"
FROM pure_batches AS p
WHERE b."batch_id" = p."batch_id";
--> statement-breakpoint
CREATE TEMP TABLE "_mixed_batch_groups" AS
WITH mixed_batches AS (
	SELECT
		b."batch_id"
	FROM "batches" AS b
	JOIN "shipments" AS s ON s."batch_id" = b."batch_id"
	WHERE b."status" IN ('OPEN', 'CLOSING')
	  AND s."is_manifested" = false
	  AND s."crm_id" IS NOT NULL
	GROUP BY b."batch_id"
	HAVING COUNT(DISTINCT s."crm_id") > 1
)
SELECT
	b."batch_id" AS "old_batch_id",
	b."operational_date",
	b."status",
	b."created_at",
	b."closing_at",
	s."crm_id",
	CASE
		WHEN b."grouping_key" IS NULL OR b."grouping_key" = '' THEN 'crm:' || s."crm_id"
		WHEN b."grouping_key" LIKE '%crm:%' THEN b."grouping_key"
		ELSE b."grouping_key" || '|crm:' || s."crm_id"
	END AS "new_grouping_key"
FROM "batches" AS b
JOIN mixed_batches AS mb ON mb."batch_id" = b."batch_id"
JOIN "shipments" AS s ON s."batch_id" = b."batch_id"
WHERE s."is_manifested" = false
  AND s."crm_id" IS NOT NULL
GROUP BY
	b."batch_id",
	b."operational_date",
	b."status",
	b."created_at",
	b."closing_at",
	b."grouping_key",
	s."crm_id";
--> statement-breakpoint
INSERT INTO "batches" ("grouping_key", "operational_date", "status", "crm_id", "shipment_count", "created_at", "closing_at")
SELECT
	mg."new_grouping_key",
	mg."operational_date",
	mg."status",
	mg."crm_id",
	0,
	mg."created_at",
	CASE WHEN mg."status" = 'CLOSING' THEN mg."closing_at" ELSE NULL END
FROM "_mixed_batch_groups" AS mg
WHERE NOT EXISTS (
	SELECT 1
	FROM "batches" AS existing
	WHERE existing."operational_date" IS NOT DISTINCT FROM mg."operational_date"
	  AND existing."status" = mg."status"
	  AND existing."crm_id" = mg."crm_id"
	  AND existing."grouping_key" IS NOT DISTINCT FROM mg."new_grouping_key"
);
--> statement-breakpoint
UPDATE "shipments" AS s
SET "batch_id" = target."batch_id"
FROM "_mixed_batch_groups" AS mg
JOIN "batches" AS target
	ON target."operational_date" IS NOT DISTINCT FROM mg."operational_date"
	AND target."status" = mg."status"
	AND target."crm_id" = mg."crm_id"
	AND target."grouping_key" IS NOT DISTINCT FROM mg."new_grouping_key"
WHERE s."batch_id" = mg."old_batch_id"
  AND s."crm_id" = mg."crm_id"
  AND s."is_manifested" = false;
--> statement-breakpoint
UPDATE "batches" AS b
SET "shipment_count" = counts."shipment_count"
FROM (
	SELECT
		s."batch_id",
		COUNT(*)::integer AS "shipment_count"
	FROM "shipments" AS s
	WHERE s."batch_id" IS NOT NULL
	GROUP BY s."batch_id"
) AS counts
WHERE b."batch_id" = counts."batch_id";
--> statement-breakpoint
UPDATE "batches" AS b
SET "shipment_count" = 0
WHERE NOT EXISTS (
	SELECT 1
	FROM "shipments" AS s
	WHERE s."batch_id" = b."batch_id"
);
--> statement-breakpoint
DELETE FROM "batches" AS b
WHERE b."status" IN ('OPEN', 'CLOSING')
  AND b."shipment_count" = 0
  AND NOT EXISTS (
    SELECT 1
    FROM "manifests" AS m
    WHERE m."batch_id" = b."batch_id"
  );
--> statement-breakpoint
DROP TABLE "_mixed_batch_groups";

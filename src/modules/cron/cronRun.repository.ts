import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { cronRuns } from '@/lib/db/schema';
import { getPositiveIntFromEnv } from '@/utils/timeout';

type AcquireCronRunResult =
  | { state: 'acquired'; runId: number }
  | { state: 'completed'; runId: number }
  | { state: 'in_progress'; runId: number };

function getCronRunStaleMinutes(): number {
  return getPositiveIntFromEnv(process.env.CRON_RUN_STALE_MINUTES, 30);
}

function isStartedRunStale(startedAt: Date | null): boolean {
  if (!startedAt) return false;
  const staleMs = getCronRunStaleMinutes() * 60_000;
  return Date.now() - startedAt.getTime() >= staleMs;
}

export async function acquireDailyCronRun(jobName: string, operationalDateISO: string): Promise<AcquireCronRunResult> {
  const startedAt = new Date();
  const inserted = await db
    .insert(cronRuns)
    .values({
      job_name: jobName,
      operational_date: operationalDateISO as any,
      status: 'started',
      started_at: startedAt,
      completed_at: null,
      error_message: null,
    })
    .onConflictDoNothing()
    .returning({ id: cronRuns.id });

  if (inserted[0]) {
    return { state: 'acquired', runId: inserted[0].id };
  }

  const rows = await db
    .select()
    .from(cronRuns)
    .where(and(
      eq(cronRuns.job_name, jobName),
      eq(cronRuns.operational_date, operationalDateISO as any),
    ));

  const existing = rows[0];
  if (!existing) {
    throw new Error(`Cron run record missing for ${jobName} on ${operationalDateISO}`);
  }

  if (existing.status === 'started' && isStartedRunStale(existing.started_at ?? null)) {
    await db
      .update(cronRuns)
      .set({
        status: 'failed',
        completed_at: startedAt,
        error_message: `Marked stale after exceeding ${getCronRunStaleMinutes()} minutes without completion`,
      })
      .where(and(eq(cronRuns.id, existing.id), eq(cronRuns.status, 'started')));
    existing.status = 'failed';
  }

  if (existing.status === 'failed') {
    const retried = await db
      .update(cronRuns)
      .set({
        status: 'started',
        started_at: startedAt,
        completed_at: null,
        error_message: null,
      })
      .where(and(eq(cronRuns.id, existing.id), eq(cronRuns.status, 'failed')))
      .returning({ id: cronRuns.id });

    if (retried[0]) {
      return { state: 'acquired', runId: retried[0].id };
    }
  }

  return {
    state: existing.status === 'completed' ? 'completed' : 'in_progress',
    runId: existing.id,
  };
}

export async function completeCronRun(runId: number) {
  await db
    .update(cronRuns)
    .set({
      status: 'completed',
      completed_at: new Date(),
      error_message: null,
    })
    .where(eq(cronRuns.id, runId));
}

export async function failCronRun(runId: number, errorMessage: string) {
  await db
    .update(cronRuns)
    .set({
      status: 'failed',
      completed_at: new Date(),
      error_message: errorMessage,
    })
    .where(eq(cronRuns.id, runId));
}

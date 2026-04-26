import { config } from 'dotenv';

config({ path: '.env' });

function printUsage() {
  console.log('Usage: pnpm manifest:manual-process --batch-id <batch-id> [--manifest-id <manifest-id>]');
  console.log('   or: pnpm manifest:manual-process <batch-id> [manifest-id]');
}

function getArgValue(args: string[], flag: string): string | null {
  const index = args.findIndex((arg) => arg === flag);
  return index >= 0 ? (args[index + 1] ?? null) : null;
}

function isFlag(value: string): boolean {
  return value.startsWith('--');
}

function parseBatchId(args: string[]): number | null {
  const fromFlag = getArgValue(args, '--batch-id');
  const candidate = fromFlag ?? args.find((arg) => !isFlag(arg)) ?? null;
  if (!candidate) return null;

  const batchId = Number.parseInt(candidate, 10);
  return Number.isFinite(batchId) ? batchId : null;
}

function parseManifestId(args: string[]): string | null {
  const fromFlag = getArgValue(args, '--manifest-id');
  if (fromFlag) return fromFlag;

  const positionals = args.filter((arg) => !isFlag(arg));
  return positionals[1] ?? null;
}

async function main() {
  const args = process.argv.slice(2);
  const batchId = parseBatchId(args);
  const manifestId = parseManifestId(args);

  if (!batchId) {
    printUsage();
    process.exit(1);
  }

  try {
    const { manualProcessBatchManifest } = await import('@/modules/manifesting/manifest.service');
    const result = await manualProcessBatchManifest({
      batchId,
      manifestIdOverride: manifestId,
    });

    console.log(JSON.stringify({
      ok: true,
      batchId,
      manifestIdOverride: manifestId,
      result,
    }, null, 2));
  } catch (error: any) {
    console.error(JSON.stringify({
      ok: false,
      batchId,
      manifestIdOverride: manifestId,
      status: error?.response?.status,
      error: error?.message ?? 'unknown error',
      response: error?.response?.data ?? null,
      recoveredManifestIds: error?.recoveredManifestIds ?? null,
      unrecoveredParcelIds: error?.unrecoveredParcelIds ?? null,
    }, null, 2));
    process.exit(1);
  }
}

main();

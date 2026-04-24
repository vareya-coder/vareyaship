import { config } from 'dotenv';
import { recreateManifest } from '@/modules/asendia/manifests/recreateManifest';

config({ path: '.env' });

function printUsage() {
  console.log('Usage: pnpm manifest:recreate --manifest-id <manifest-id>');
  console.log('   or: pnpm manifest:recreate <manifest-id>');
}

function getManifestId(argv: string[]): string | null {
  const positional = argv.filter((arg) => !arg.startsWith('--'));
  const flagIndex = argv.findIndex((arg) => arg === '--manifest-id');

  if (flagIndex >= 0) {
    return argv[flagIndex + 1] ?? null;
  }

  return positional[0] ?? null;
}

async function main() {
  const args = process.argv.slice(2);
  const manifestId = getManifestId(args);

  if (!manifestId) {
    printUsage();
    process.exit(1);
  }

  try {
    const result = await recreateManifest(manifestId);
    console.log(JSON.stringify({
      ok: true,
      manifestId,
      result,
    }, null, 2));
  } catch (error: any) {
    const responseData = error?.response?.data;
    const status = error?.response?.status;

    console.error(JSON.stringify({
      ok: false,
      manifestId,
      status,
      error: error?.message ?? 'unknown error',
      response: responseData ?? null,
    }, null, 2));
    process.exit(1);
  }
}

main();

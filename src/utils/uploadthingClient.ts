import { UTApi } from "uploadthing/server";
 
export const utapi = new UTApi({
  token: process.env.UPLOADTHING_TOKEN,
});

const deprecatedUploadThingWarnings = [
  "[uploadthing][deprecated] `file.url` is deprecated",
  "[uploadthing][deprecated] `file.appUrl` is deprecated",
];

export async function withUploadThingWarningSuppressed<T>(
  callback: () => Promise<T>,
): Promise<T> {
  const originalWarn = console.warn;

  console.warn = (...args: unknown[]) => {
    const firstArg = args[0];
    if (
      typeof firstArg === "string" &&
      deprecatedUploadThingWarnings.some((warning) => firstArg.includes(warning))
    ) {
      return;
    }

    originalWarn(...(args as Parameters<typeof console.warn>));
  };

  try {
    return await callback();
  } finally {
    console.warn = originalWarn;
  }
}

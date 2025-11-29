// Import necessary libraries and initialize clients (e.g., Drizzle for PostgreSQL)
import { NextRequest, NextResponse } from 'next/server';
// Other Imports
import { utapi } from '@/utils/uploadthingClient';

export async function GET(request: NextRequest) {
  let files = await utapi.listFiles({limit: 500, offset:1280}); // Last deleted on November 25, 2025
  // Find new zero and max offsets - listFiles() return files from new to old
  // Then delete from end offset (oldest first) in chunks of 500 until only 7 days files remain
  // To check date of last file, need to get file name, extract order and check in shiphero

  // console.log(files);
  console.log(files.length);
  console.log((new Date).toISOString());

  const fileKeysToDelete = files.map(({ key }) => key)
  // console.log(fileKeysToDelete);
  console.log(fileKeysToDelete.length);
  // await utapi.deleteFiles(fileKeysToDelete);
  console.log('done');

  return NextResponse.json({ message: 'Deleted Uploadthing old files.' }, {status: 200});
}

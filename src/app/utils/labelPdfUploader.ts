import { config } from 'dotenv';
import { UTFile } from 'uploadthing/server';
import { logError, logInfo } from '@/utils/logger'; // Assuming you have these utils
import {
    utapi,
    withUploadThingWarningSuppressed,
} from '@/utils/uploadthingClient';
import { getPositiveIntFromEnv, withTimeout } from '@/utils/timeout';

config();

/**
 * Uploads a PDF file, provided as a Buffer, to UploadThing.
 * @param pdfBuffer The binary buffer of the PDF file.
 * @param filename The desired filename (without extension) for the uploaded file.
 * @returns The public URL of the uploaded file.
 */
export async function uploadPdfBuffer(pdfBuffer: Buffer, filename: string): Promise<string | undefined> {
    // if (!process.env.UPLOADTHING_TOKEN) {
    //     logger.error('UPLOADTHING_TOKEN is not defined in environment variables.');
    //     throw new Error('UploadThing API Key is not configured.');
    // }
    logInfo('Starting PDF upload process...');
    
    try {
        const fileToUpload = {
            name: `label-${filename}.pdf`,
            size: pdfBuffer.length,
            type: 'application/pdf',
        };
        const pdfBytes = Uint8Array.from(pdfBuffer);
        const utFile = new UTFile([pdfBytes], fileToUpload.name, {
            type: fileToUpload.type,
        });

        logInfo(`Uploading file: ${fileToUpload.name} (${fileToUpload.size} bytes)`, {
            fileName: fileToUpload.name,
            fileSize: fileToUpload.size,
        });

        const uploadTimeoutMs = getPositiveIntFromEnv(process.env.UPLOADTHING_TIMEOUT_MS, 30000);
        const response = await withUploadThingWarningSuppressed(() =>
            withTimeout(
                () => utapi.uploadFiles([utFile]),
                uploadTimeoutMs,
                `UploadThing upload for ${fileToUpload.name}`,
            ),
        );
        const uploadedFile = Array.isArray(response) ? response[0] : response;
        const url = uploadedFile?.data?.ufsUrl;

        if (url) {
            logInfo(`Upload successful. Label URL: ${url}`, { url });
            return url;
        } else {
            logError('Upload to UploadThing completed but no URL was returned.', { response });
            throw new Error('Failed to get URL from UploadThing response.');
        }

    } catch (error: any) {
        logError('Error uploading label file to UploadThing.', { error: error.message });
        throw error; // Re-throw the error to be handled by the caller
    }
}

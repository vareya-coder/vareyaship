import { config } from 'dotenv';
import { UTFile } from 'uploadthing/server';
import { logger } from '@/utils/logger'; // Assuming you have these utils
import {
    utapi,
    withUploadThingWarningSuppressed,
} from '@/utils/uploadthingClient';

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
    console.log('Starting PDF upload process...');
    
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

        logger.info(`Uploading file: ${fileToUpload.name} (${fileToUpload.size} bytes)`);
        console.log(`Uploading file: ${fileToUpload.name} (${fileToUpload.size} bytes)`);

        const response = await withUploadThingWarningSuppressed(() =>
            utapi.uploadFiles([utFile]),
        );
        const uploadedFile = Array.isArray(response) ? response[0] : response;
        const url = uploadedFile?.data?.ufsUrl;

        if (url) {
            logger.info(`Upload successful. Label URL: ${url}`);
            console.log(`Upload successful. Label URL: ${url}`);
            return url;
        } else {
            logger.error('Upload to UploadThing completed but no URL was returned.', response);
            console.error('Upload to UploadThing completed but no URL was returned.', response);
            throw new Error('Failed to get URL from UploadThing response.');
        }

    } catch (error: any) {
        logger.error('Error uploading label file to UploadThing:', error.message);
        console.error('Error uploading label file to UploadThing:', error.message);
        throw error; // Re-throw the error to be handled by the caller
    }
}

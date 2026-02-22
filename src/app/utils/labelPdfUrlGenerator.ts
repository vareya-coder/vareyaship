import { config } from 'dotenv';
import { UTFile } from 'uploadthing/server';
import { logger } from '@/utils/logger';
import {
    utapi,
    withUploadThingWarningSuppressed,
} from '@/utils/uploadthingClient';

config();

export async function uploadPdf(
    labelBase64: string,
    filename: string,
): Promise<string | undefined> {
    try {
        const pdfBuffer = Buffer.from(labelBase64, 'base64');
        const pdfBytes = Uint8Array.from(pdfBuffer);
        const utFile = new UTFile([pdfBytes], `label-${filename}.pdf`, {
            type: 'application/pdf',
        });

        const response = await withUploadThingWarningSuppressed(() =>
            utapi.uploadFiles([utFile]),
        );
        const uploadedFile = Array.isArray(response) ? response[0] : response;
        const uploadedUrl = uploadedFile?.data?.ufsUrl;

        if (!uploadedUrl) {
            logger.error('Upload to UploadThing completed but no URL was returned.');
        }

        return uploadedUrl;
    } catch (error: any) {
        logger.error(
            'Error uploading label file:',
            error.response ? JSON.stringify(error.response.data) : error.message,
        );
        throw error;
    }
}

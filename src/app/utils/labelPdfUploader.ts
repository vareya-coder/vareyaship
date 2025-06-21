import { config } from 'dotenv';
import { FormData, Blob } from 'formdata-node';
import { logger } from '@/utils/logger'; // Assuming you have these utils
import { utapi } from '@/utils/uploadthingClient';

config();

/**
 * Uploads a PDF file, provided as a Buffer, to UploadThing.
 * @param pdfBuffer The binary buffer of the PDF file.
 * @param filename The desired filename (without extension) for the uploaded file.
 * @returns The public URL of the uploaded file.
 */
export async function uploadPdfBuffer(pdfBuffer: Buffer, filename: string): Promise<string | undefined> {
    // if (!process.env.UPLOADTHING_SECRET) {
    //     logger.error('UPLOADTHING_SECRET is not defined in environment variables.');
    //     throw new Error('UploadThing API Key is not configured.');
    // }
    console.log('Starting PDF upload process...');
    
    try {
        // The UploadThing SDK can often work with Blobs or Files.
        // We convert the buffer to a Blob, which is a standard representation.
        const pdfBlob = new Blob([pdfBuffer]);

        // The utapi SDK expects a File object or an array of them.
        // We can create a "file-like" object that the SDK understands.
        const fileToUpload = {
            name: `label-${filename}.pdf`,
            size: pdfBuffer.length,
            type: 'application/pdf',
            // The SDK magic happens here, it needs the content as a Blob/File.
            // When using FormData, we pass the blob directly. When using the SDK's abstraction,
            // we pass the file object and the SDK handles the upload stream.
            // For simplicity and compatibility with your previous code, we'll use FormData.
        };

        const formData = new FormData();
        // The third argument to append is the filename.
        formData.append('files', pdfBlob, fileToUpload.name);
        
        // The utapi.uploadFiles method is designed to take an array of File objects or FormData.
        // We get all file entries from our FormData object.
        const filesFromFormData = formData.getAll('files');

        logger.info(`Uploading file: ${fileToUpload.name} (${fileToUpload.size} bytes)`);
        console.log(`Uploading file: ${fileToUpload.name} (${fileToUpload.size} bytes)`);

        const response = await utapi.uploadFiles(filesFromFormData);

        if (response && Array.isArray(response) && response[0]?.data?.url) {
            const url = response[0].data.url;
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
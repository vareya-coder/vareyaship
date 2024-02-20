import axios from 'axios';
import { config } from 'dotenv';

config();



export async function uploadPdf(labelBase64 : any , filename : any) {
    // Decode base64 to get the binary size
    const decodedData = Buffer.from(labelBase64, 'base64');
    const originalSize = decodedData.length;


    // Calculate increased size
    const increasedSize = increaseSizeByPercentage(originalSize, 50);


    try {
        // Prepare the request body for the initial API call
        const body = {
            files: [
                {
                    name: `label-${filename}.pdf`,
                    size: increasedSize,
                    type: 'application/pdf',
                    customsid: `label-${filename}`,
                },
            ],
        };

        // Initial API call to get the presigned URL and other details
        const response = await axios.post('https://uploadthing.com/api/uploadFiles', body, {
            headers: {
                'Content-Type': 'application/json',
                'X-Uploadthing-Api-Key': process.env.UPLOADTHING_SECRET,
            },
        });

        // Destructure necessary data from response
        const { fileUrl, presignedUrl, fields } = response.data.data[0];

        // Convert the base64 string to a binary Blob
        const pdfBlob =  Buffer.from(labelBase64, 'base64');

        // Create FormData to append fields and file for S3 upload
        const FormData = require('form-data');
        const formData = new FormData();
        Object.entries(fields).forEach(([key, value]) => {
            formData.append(key, value);
        });
        formData.append('file', pdfBlob);

        // Upload the file to the presigned URL
        await axios.post(presignedUrl, formData, {
            headers: {
                // FormData will set the Content-Type to 'multipart/form-data' with the correct boundary
                // Do not manually set Content-Length here, let axios and FormData handle it
                'X-Uploadthing-Api-Key': process.env.UPLOADTHING_SECRET,
            },
        });

        console.log('File uploaded successfully:', fileUrl);
        return fileUrl;
    } catch (error : any) {
        console.error('Error uploading file:', error.response ? error.response.data : error.message);
    }
}

function increaseSizeByPercentage(size : any, percentage : number) {
    return Math.ceil(size * (1 + percentage / 100));
}

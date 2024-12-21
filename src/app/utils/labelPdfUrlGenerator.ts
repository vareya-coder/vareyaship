// import axios from 'axios';
import { config } from 'dotenv';

import { FormData, Blob } from 'formdata-node'

import { logger } from '@/utils/logger';
import { utapi } from '@/utils/uploadthingClient';


// import { error } from 'console';

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
        // const response = await axios.post('https://uploadthing.com/api/uploadFiles', body, {
        //     headers: {
        //         'Content-Type': 'application/json',
        //         'X-Uploadthing-Api-Key': process.env.UPLOADTHING_SECRET,
        //         'X-Uploadthing-Version': '6.4.0'
        //     },
        // });

        // console.log(response);
        
        // const { fileUrl, presignedUrl, fields } = response.data.data[0];
        // if(!fileUrl){
        //     logger.error("Error occurred when creating Url for Label");
        //     throw new Error('Error occurred creating pre-signed url');
        // }

        // Convert the base64 string to a binary Blob
        const pdfBuffer =  Buffer.from(labelBase64, 'base64');
        const pdfBlob = new Blob([pdfBuffer]);

        // Create FormData to append fields and file for S3 upload
        // const FormData = require('form-data');
        const formData = new FormData();
        // Object.entries(fields).forEach(([key, value]) => {
        //     formData.append(key, value);
        // });
        formData.append('files', pdfBlob, `label-${filename}.pdf`);

        // Upload the file to the presigned URL
        // let res = await axios.post(presignedUrl, formData, {
        //     headers: {
        //         // FormData will set the Content-Type to 'multipart/form-data' with the correct boundary
        //         // Do not manually set Content-Length here, let axios and FormData handle it
        //         'X-Uploadthing-Api-Key': process.env.UPLOADTHING_SECRET,
        //         'X-Uploadthing-Version': '6.4.0'
        //     },
        // });

        const response = await utapi.uploadFiles(formData.getAll('files'));
        //    ^? UploadedFileResponse[]

        logger.info(response && Array.isArray(response) ? response[0].data?.url : response.data?.url)

        return response && Array.isArray(response) ? response[0].data?.url : response.data?.url;

    } catch (error : any) {
        // console.error('Error uploading label file:', error.response ? error.response.data : error.message);
        logger.error('Error uploading label file:', error.response ? JSON.stringify(error.response.data) : error.message);
        throw error;
    }
}

function increaseSizeByPercentage(size : any, percentage : number) {
    return Math.ceil(size * (1 + percentage / 100));
}

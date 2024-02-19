import axios from 'axios';
import { config } from 'dotenv';

config();

export async function uploadPdf(label: any) {
    const encoded_labal = await compressAndEncodeData(label)
    try {
        const body = {
            files: [
                {
                    name: 'def',
                    size: 10,
                    type: 'pdf',
                    customsid: 'def',
                }
            ]
        };

        const response = await axios.post('https://uploadthing.com/api/uploadFiles', JSON.stringify(body), {
            headers: {
                'Content-Type': 'application/json',
                'X-Uploadthing-Api-Key': process.env.UPLOADTHING_SECRET,
            },
        });
        const FormData = require('form-data');
        const fileUrl = response.data.data[0].fileUrl;
        const responseData = response.data.data[0];
        const key = responseData.key;
        const presignedUrl = responseData.presignedUrl;
        const fields = responseData.fields;

        const formData = new FormData();
        Object.entries(fields).forEach(([name, value]) => {
            formData.append(name, value);
        });

        formData.append('file', encoded_labal);

        try {
            const response2 = await axios.post(presignedUrl, formData, {
                headers: {
                    'Content-Type': 'multipart/form-data'
                }
            });
            console.log('File uploaded successfully:', response2.data);
        } catch (error : any ) {
            if (error.response) {
                console.log('Error uploading file to presigned URL:', error.response.data);
            } else {
                console.log('Error uploading file to presigned URL:', error.message);
            }
           
        }
        console.log(fileUrl)

        return fileUrl;
    } catch (error :any) {
        if(error.response)
        console.log('Error uploading file:', error.response.data);
        
    }
}

import { gzip } from 'zlib';
import { promisify } from 'util';


const gzipAsync = promisify(gzip);

async function compressAndEncodeData(data: string): Promise<string> {
    try {
        // Compress data using gzip
        const compressedData = await gzipAsync(data);

        // Encode compressed data to base64
        const encodedData = compressedData.toString('base64');

        return encodedData;
    } catch (error) {
        console.error('Error compressing and encoding data:', error);
        throw error;
    }
}

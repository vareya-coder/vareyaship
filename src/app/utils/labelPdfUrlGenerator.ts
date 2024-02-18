import axios from 'axios';
import { config } from 'dotenv';

config()
export  async function uploadPdf(label : any) {


    const body = {
      files :[
                {
                    name: 'def',
                    size: 75248 ,
                    type: 'pdf',
                    customsid: 'def',

                }
      ]
    };
    

    const response = await axios.post('https://uploadthing.com/api/uploadFiles', JSON.stringify(body) , {
      headers: {
        'Content-Type': 'application/json',
        'X-Uploadthing-Api-Key': process.env.UPLOADTHING_SECRET,
      },
    });
    const key = response.data.data[0].key;
    console.log(key)
    const presignedUrl = response.data.data[0].presignedUrl;
    const fileUrl = response.data.data[0].fileUrl;
    const formData = new FormData();
    formData.append('key', key);
    formData.append('file',label);
    const response2 = await axios.post(presignedUrl, formData, {
      headers: {
          'Content-Type': 'multipart/form-data'
      }
  });
    console.log(key)
    console.log(response2)
    return fileUrl




 
}

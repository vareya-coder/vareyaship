// dbOperations.ts
import { Logger } from 'next-axiom';
import { db } from '@/lib/db';
import { ShipmentDetailsType,
       
        shipmentDetails,
        customerDetails,
        shipmentItems,
        shipmentStatus,
        CustomerDetailsType,
        ShipmentStatusType,
        ShipmentItemsType
     } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { Pool } from 'pg';
import { error } from 'console';

const log = new Logger();
const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL,
  ssl: true
});

export const revalidate = 0;
export async function getAllShipmentDetails() {
  const client = await pool.connect();
  try {
    const response = await client.query('SELECT * from shipment_details');
    log.info("fetched data successfully : ",{ data: response.rows })
    return response.rows;
  }catch(error : any ) {

    log.error("Error fetching data", { error: error.message });
    throw error; 
  } finally {
    await log.flush();
    client.release();
  }
}

// export async function insertAddress(addressData: AddressType): Promise<void> {
//   try {
//     await db.insert(addresses).values(addressData);
//     // console.log('Address inserted successfully.');
//   } catch (error) {
//     console.error('Error inserting address:', error);
//     throw error;
//   }
// }

export async function insertShipmentDetails(shipmentDetailsData : ShipmentDetailsType): Promise<void> {
  try {
    await db.insert(shipmentDetails).values(shipmentDetailsData);
    log.info("A new shipment is added to database :",{shipment : shipmentDetails} )
    log.debug("new shipment added debug message")
    await log.flush();
  } catch (error) {
    console.error('Error inserting shipment details:', error);
    log.error("an error occur while inserting new shipment to database :" ,{errors : error})
    await log.flush();
    throw error;
  }
}

export async function insertCustomerDetails(customerDetailsData : CustomerDetailsType): Promise<void> {
  try {
    await db.insert(customerDetails).values(customerDetailsData);
    // console.log('Customer details inserted successfully.');
  } catch (error) {
    console.error('Error inserting customer details:', error);
    throw error;
  }
}

export async function insertShipmentStatus(shipmentStatusData  : ShipmentStatusType): Promise<void> {
  try {
    await db.insert(shipmentStatus).values(shipmentStatusData);
    // console.log('Shipment status inserted successfully.');
  } catch (error) {
    console.error('Error inserting shipment status:', error);
    throw error;
  }
}

export async function insertShipmentItems(shipmentItemsData : ShipmentItemsType): Promise<void> {
  try {
    await db.insert(shipmentItems).values(shipmentItemsData);
    // console.log('Shipment items inserted successfully.');
  } catch (error) {
    console.error('Error inserting shipment items:', error);
    throw error;
  }
}

// export async function getAllShipmentDetails() {
  
//   try {
    
//     const result  = await db.select().from(shipmentDetails)

//     return result;
//   } catch (error) {
//     console.error('Error fetching shipment details:', error);
//     throw error; // You can handle the error as per your application's requirements
//   }
// }

export async function getOrderDetails() {
  try {
    const result = await db
      .select()
      .from(shipmentDetails)
      .fullJoin(customerDetails, eq(shipmentDetails.order_id , customerDetails.order_id))
      
      
    // console.log(result);
    return result; // Return the fetched data
  } catch (error) {
    console.error("Error fetching order details:", error);
    throw error; // Re-throw the error or handle it as needed
  }
}
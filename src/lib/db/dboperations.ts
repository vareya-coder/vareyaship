// dbOperations.ts
import { useRouter } from 'next/navigation';
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
    const router = useRouter()
    router.refresh()
  } catch (error) {
    console.error('Error inserting shipment details:', error);
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

export async function getAllShipmentDetails() {
  try {
    
    const result  = await db.select().from(shipmentDetails)

    return result;
  } catch (error) {
    console.error('Error fetching shipment details:', error);
    throw error; // You can handle the error as per your application's requirements
  }
}

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
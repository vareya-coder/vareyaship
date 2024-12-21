import { db } from '@/lib/db';
import {
  ShipmentDetailsType,
  shipmentDetails,
  customerDetails,
  shipmentItems,
  shipmentStatus,
  CustomerDetailsType,
  ShipmentStatusType,
  ShipmentItemsType,
} from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { Pool } from '@neondatabase/serverless';
import { logger } from '@/utils/logger'


const client = new Pool()


export async function getAllShipmentDetails(): Promise<ShipmentDetailsType[]> {
  try {
    // Assume db.select().from() is an async operation and await its result.
    const response = await db.select().from(shipmentDetails);

    // Check if response is truthy and not empty. Adjust based on your ORM's response structure.
    if (!response || response.length === 0) {
      // Option 1: Return an empty array if no data found.
      return [];

    }

    return response as ShipmentDetailsType[];
  } catch (error: unknown) {
    if (error instanceof Error) {
      logger.error(error.message);
    }
    throw error;
  }
}


export async function insertShipmentDetails(shipmentDetailsData: ShipmentDetailsType): Promise<void> {
  try {
    let id = await db.insert(shipmentDetails).values(shipmentDetailsData).returning({ insertedId: shipmentDetails.shipment_id });

    logger.info("added new shipment with Id:",id );

    return id as any


  } catch (error: unknown) {
    if (error instanceof Error) {
      logger.error("An error occurred while inserting a new shipment into the database:", { errors: error.message });
    }
    throw error;
  }
}

export async function insertCustomerDetails(customerDetailsData: CustomerDetailsType): Promise<void> {
  try {
    await db.insert(customerDetails).values(customerDetailsData);
  } catch (error: unknown) {
    logger.error('Error inserting customer details:', error);
    throw error;
  }
}

export async function insertShipmentStatus(shipmentStatusData: ShipmentStatusType): Promise<void> {
  try {
    await db.insert(shipmentStatus).values(shipmentStatusData);
  } catch (error: unknown) {
    logger.error('Error inserting shipment status:', error);
    throw error;
  }
}

export async function insertShipmentItems(shipmentItemsData: ShipmentItemsType[]): Promise<void> {
  try {
    await db.insert(shipmentItems).values(shipmentItemsData);
  } catch (error: unknown) {
    logger.error('Error inserting shipment items:', error);
    throw error;
  }
}


// export async function getOrderDetails(): Promise<any> { // Consider defining a more specific return type
//   try {
//     const result = await db
//       .select()
//       .from(shipmentDetails)
//       .fullJoin(customerDetails, eq(shipmentDetails.order_id, customerDetails.order_id));
//     return result; 
//   } catch (error: unknown) {

      // logger.error("Error fetching order details:", error);
//     throw error;
//   }
// }


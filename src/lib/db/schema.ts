

import { Table ,sql } from "drizzle-orm";
import { pgTable, serial, timestamp, text, integer, varchar, decimal , real} from "drizzle-orm/pg-core";




//address table
// export const addresses = pgTable('addresses', {
//     address_id: serial('address_id').primaryKey(),
//     address_type: serial('address_type'),
//     street: varchar('street'),
//     city: varchar('city'),
//     postal_code: varchar('postal_code'),
//     country: varchar('country'),
    
// });
// export const User=pgTable('User',{
//     id: serial('id'),
//     name: varchar('name').primaryKey(),
//     company: varchar('company'),
//     address_id: integer('address_id').references(() => addresses.address_id)
// })

export const shipmentDetails = pgTable('shipment_details', {
    shipment_id : serial('shipment_id').primaryKey(),
    barcode: varchar('barcode'),
    order_id: integer('order_id'),
    name : varchar('name'),
    company : varchar('company'),
    label_announced_at: timestamp('label_announced_at').default(sql`CURRENT_TIMESTAMP`),
    cancel_deadline: timestamp('cancel_deadline'),
    shipping_method: varchar('shipping_method'),
    from_address: varchar('from_address'),
    label_url : varchar('label_url'),
   
});

// Customer details table
export const customerDetails = pgTable('customer_details', {
    customer_id: serial('customer_id').primaryKey(),
    customer_name: varchar('customer_name'),
    customer_email: varchar('customer_email'),
    to_address: varchar('to_address'),
    shipment_id: integer('shipment_id').references(() => shipmentDetails.shipment_id, { onDelete: 'cascade' })
});

// Shipment status table
export const shipmentStatus = pgTable('shipment_status', {
    status_id: serial('status_id').primaryKey(),
    shipment_id: integer('shipment_id').references(() => shipmentDetails.shipment_id, { onDelete: 'cascade' }),
    status_code: varchar('status_code'),
    status_description: text('status_description'),
    carrier_message: text('carrier_message'),
});

// Shipment items table
export const shipmentItems = pgTable('shipment_items', {
    item_id: serial('item_id').primaryKey(),
    shipment_id: integer('shipment_id').references(() => shipmentDetails.shipment_id, { onDelete: 'cascade' }),
    item_description: text('item_description'),
    quantity: integer('quantity'),
    shipment_weight: real('shipment_weight'),
    unit_price: decimal('unit_price'),
});

export type ShipmentDetailsType = typeof shipmentDetails.$inferInsert;
export type CustomerDetailsType = typeof customerDetails.$inferInsert;
export type ShipmentStatusType = typeof shipmentStatus.$inferInsert;
export type ShipmentItemsType = typeof shipmentItems.$inferInsert;
//export type AddressType = typeof addresses.$inferInsert;
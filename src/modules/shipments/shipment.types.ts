export type IngestAsendiaShipmentInput = {
  external_shipment_id: string; // Asendia parcel id
  order_id: number;
  account_id: number;
  crm_id: string;
  shipping_method: string;
  parcel_id: string;
  sender_tax_code?: string | null;
  tracking_number?: string;
  label_url?: string;
};

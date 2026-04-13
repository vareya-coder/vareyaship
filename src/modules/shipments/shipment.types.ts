export type IngestAsendiaShipmentInput = {
  external_shipment_id: string; // Asendia parcel id
  order_id: number;
  account_id: number;
  shipping_method: string;
  parcel_id: string;
  tracking_number?: string;
  label_url?: string;
};


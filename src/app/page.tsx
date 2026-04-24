import Hero from './screens/Hero'
import { listRecentAsendiaShipments } from '@/modules/shipments/shipment.service';


export const dynamic = 'force-dynamic'
export default async  function Home() {
  const shipments = await listRecentAsendiaShipments();
  const labelData = shipments.map((shipment) => ({
    id: shipment.id,
    orderId: shipment.order_id,
    shippingMethod: shipment.shipping_method,
    trackingNumber: shipment.tracking_number,
    parcelId: shipment.parcel_id,
    labelUrl: shipment.label_url,
    createdAt: shipment.created_at ? new Date(shipment.created_at).toISOString() : null,
    isManifested: shipment.is_manifested ?? false,
  }));

  return (
    <Hero labelData={labelData} />

  )
}

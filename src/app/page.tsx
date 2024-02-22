import Image from 'next/image'
import Hero from './screens/Hero'
import { getAllShipmentDetails, getOrderDetails } from '@/lib/db/dboperations'
import { ShipmentDetailsType } from '@/lib/db/schema'

export const dynamic = 'force-dynamic'
export default async  function Home() {
 
  return (
    <Hero/ >

  )
}
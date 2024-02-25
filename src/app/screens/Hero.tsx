"use client"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuItem, DropdownMenuContent, DropdownMenu } from "@/components/ui/dropdown-menu"
import { TabsTrigger, TabsList, TabsContent, Tabs } from "@/components/ui/tabs"
import { TableHead, TableRow, TableHeader, TableCell, TableBody, Table } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { ShipmentDetailsType } from "@/lib/db/schema"
import { getAllShipmentDetails } from "@/lib/db/dboperations"
import { CardTitle, CardHeader, CardContent, Card } from "@/components/ui/card"
import { Tag } from "lucide-react"
import { useEffect, useState } from "react"

export const revalidate = 0;
export default async function Hero() {
  // const [labelData, setLabelData] = useState<ShipmentDetailsType[]>([]);
  const labelData = await getAllShipmentDetails()
  // useEffect(() => {
  //   const fetchData = async () => {
  //     try {
  //       const result = await getAllShipmentDetails();
  //       setLabelData(result.reverse());
  //     } catch (error) {
  //       console.error('Error fetching shipment details:', error);
  //     }
  //   };

  //   fetchData();
  // }, []);
  
  return (
    <div key="1" className="bg-white p-8">
      <Tabs  defaultValue="labels">
        <TabsList className="border-b 
 ">
          <TabsTrigger className="px-4 py-2 focus:font-bold "  value="labels" >
            Created labels
          </TabsTrigger>
          <TabsTrigger className="px-4 py-2 focus:font-bold" value="shipped">
            Shipped
          </TabsTrigger>
          <TabsTrigger className="px-4 py-2 focus:font-bold " value="canceled">
            Canceled Orders
          </TabsTrigger>
        </TabsList>
        <TabsContent value="labels">
              <div className="flex justify-between items-center mb-4">
            <h1 className="text-2xl font-semibold">Labeled Orders</h1>
            <div>
              <Button className="mr-2" variant="secondary">
                New shipment
              </Button>
              <Button>Upload file</Button>
            </div>
          </div>
              <div className="rounded-lg border">
                <Table>
                <TableHeader>
              <TableRow>
                <TableHead>Label</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Order Id</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Shipping Method</TableHead>
                <TableHead>Tracking Number</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {
                labelData.map((item : any)=>(

              <TableRow key={item.order_id}>
                <a target="_blank" href={item.label_url} rel="noopener noreferrer">
   
                <TableCell className="   text-green-600 flex flex-row " >   <Tag /><h1 className="pl-2 text-black font-bold">Print</h1> </TableCell>
              </a>

                <TableCell>At sorting centre</TableCell>
                <TableCell>{item.order_id}</TableCell>
                <TableCell>{item.name}</TableCell>
                <TableCell>{item.shipping_method}</TableCell>
                <TableCell>{item.barcode}</TableCell>
                <TableCell>{item.label_announced_at.toLocaleString()}</TableCell>
              </TableRow>
                ))
              }
                    
                   
                    
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
        <TabsContent className="pt-4" value="shipped">
          <div className="flex justify-between items-center mb-4">
            <h1 className="text-2xl font-semibold">Shipped</h1>
            <div>
              <Button className="mr-2" variant="secondary">
                New shipment
              </Button>
              <Button>Upload file</Button>
            </div>
          </div>
          <Button className="mb-4" variant="ghost">
            Hide Parcel Monitor
          </Button>
          <div className="flex items-center justify-between mb-4">
            <Badge variant="secondary">Last 14 days</Badge>
            <Button variant="ghost">+ add filter</Button>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-2 mb-4 rounded-sm text-xs sm:text-sm md:text-base lg:text-lg xl:text-xl">
  <Card className="bg-blue-100">
    <CardHeader>
      <CardTitle>All shipments</CardTitle>
    </CardHeader>
    <CardContent>7,063 shipments</CardContent>
  </Card>
  <Card className="bg-blue-100">
    <CardHeader>
      <CardTitle>Address invalid</CardTitle>
    </CardHeader>
    <CardContent>7 shipments</CardContent>
  </Card>
  <Card className="bg-blue-100">
    <CardHeader>
      <CardTitle>Exception</CardTitle>
    </CardHeader>
    <CardContent>1 shipment</CardContent>
  </Card>
  <Card className="bg-green-100">
    <CardHeader>
      <CardTitle>Delivered</CardTitle>
    </CardHeader>
    <CardContent>5,019 shipments</CardContent>
  </Card>
  <Card className="bg-yellow-100">
    <CardHeader>
      <CardTitle>Delivery delayed</CardTitle>
    </CardHeader>
    <CardContent>25 shipments</CardContent>
  </Card>
  <Card className="bg-red-100">
    <CardHeader>
      <CardTitle>Returned to sender</CardTitle>
    </CardHeader>
    <CardContent>25 shipments</CardContent>
  </Card>
</div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Status</TableHead>
                <TableHead>Order Number</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Shipping Method</TableHead>
                <TableHead>Country</TableHead>
                <TableHead>Tracking Number</TableHead>
                <TableHead>Label</TableHead>
              </TableRow>
            </TableHeader>
            {/* <TableBody>
              <TableRow>
                <TableCell>At sorting centre</TableCell>
                <TableCell>#25434</TableCell>
                <TableCell>Fabio Fernandez</TableCell>
                <TableCell>DHL Parcel Connect 0-2kg</TableCell>
                <TableCell>ES</TableCell>
                <TableCell>JVGL06235370900170548719</TableCell>
                <TableCell>28/01/2024 14:29</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Parcel on route</TableCell>
                <TableCell>#8BPSY-1347550-1</TableCell>
                <TableCell>Alessia Tullio</TableCell>
                <TableCell>PostNL Priority Packet Tracked Bulk</TableCell>
                <TableCell>IT</TableCell>
                <TableCell>LA826677859NL</TableCell>
                <TableCell>26/01/2024 15:01</TableCell>
              </TableRow>
            </TableBody> */}
          </Table>
        </TabsContent>
        <TabsContent value="canceled">
        <div className="flex justify-between items-center mb-4">
            <h1 className="text-2xl font-semibold">Canceled Orders</h1>
            
          </div>
              <div className="rounded-lg border">
                <h2 className="sr-only">Canceled Orders</h2>
                <Table>
                <TableHeader>
              <TableRow>
                <TableHead>Status</TableHead>
                <TableHead>Order Number</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Shipping Method</TableHead>
                <TableHead>Country</TableHead>
                <TableHead>Tracking Number</TableHead>
                <TableHead>Label</TableHead>
              </TableRow>
            </TableHeader>
                  {/* <TableBody>
                    <TableRow>
                      <TableCell className="font-semibold">O-2102</TableCell>
                      <TableCell>Olivia Martin</TableCell>
                      <TableCell className="hidden md:table-cell">1234 Elm Street</TableCell>
                      <TableCell className="hidden sm:table-cell">February 20, 2022</TableCell>
                    </TableRow>
                    
                  </TableBody> */}
                </Table>
              </div>
            </TabsContent>
      </Tabs>
    </div>
  )
}
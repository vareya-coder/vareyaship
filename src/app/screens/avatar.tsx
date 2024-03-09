
"use client"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuItem, DropdownMenuContent, DropdownMenu } from "@/components/ui/dropdown-menu"
import { TabsTrigger, TabsList, TabsContent, Tabs } from "@/components/ui/tabs"
import { TableHead, TableRow, TableHeader, TableCell, TableBody, Table } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { UsersRound } from 'lucide-react';
import { useRouter } from "next/navigation"
import { logger } from "@/utils/logger"

export default function Avatar() {
  const router = useRouter();

  async function logoutclick(){
    try {
      const response = await fetch('/api/logout',{
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
      });
      
      logger.info("logout triggered");
      router.refresh(); // Refreshing the page
    } catch (error) {
      logger.info("error loging out");
      console.error("Logout error:", error);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          className="rounded-full border border-gray-800 w-8 h-8 dark:border-gray-800"
          size="icon"
          variant="ghost"
        >
          <UsersRound
            className="rounded-full"
            height="32"
            style={{
              aspectRatio: "32/32",
              objectFit: "cover",
            }}
            width="32"
          />
          <span className="sr-only">Toggle user menu</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="bg-white">
        <DropdownMenuLabel>My Account</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem>Settings</DropdownMenuItem>
        <DropdownMenuItem>Support</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={logoutclick}>Logout</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

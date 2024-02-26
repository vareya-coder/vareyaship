"use client"

import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { Label } from "@/components/ui/label";


export default function Page() {
  const router = useRouter();

  const [isauth , setisauth]= useState(false)
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false); // State to hold error message

  const handleLogin = async (e : any) => {
    e.preventDefault(); // Prevent default form submission

    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          password,
        }),
      });

      if (!response.ok) {
        throw new Error("Login failed");
      }

      const { token } = await response.json();
      

        const expiryDate = new Date();
        expiryDate.setTime(expiryDate.getTime() + 7 * 24 * 60 * 60 * 1000);
        const expires = `expires=${expiryDate.toUTCString()}`;
  
        const secure = window.location.protocol === "https:" ? "Secure;" : "";
  
        document.cookie = `token=${token}; path=/; SameSite=Lax; ${expires} ${secure}`;
        setisauth(true)
        router.refresh()
    
    } catch (error) {
      setError(true); // Set error message
    }
  };
  if(isauth){
    router.push('/')
  }

  return (
    <div className="flex flex-col gap-4 min-h-screen items-center justify-center p-6 sm:gap-8 bg-gray-100 dark:bg-gray-800">
      <div className="w-full max-w-[400px] space-y-4 bg-white dark:bg-gray-900 rounded-lg shadow-md p-6 transform transition-all duration-300 hover:scale-105">
        <div className="text-center">
          <FlagIcon className="mx-auto h-10 w-10 text-blue-600 dark:text-blue-400" />
          <div className="text-lg font-bold text-gray-800 dark:text-gray-200">Sign in to your account</div>
          <p className="text-gray-500 dark:text-gray-400">Enter your email below to login to your account</p>
        </div>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-gray-800 dark:text-gray-200" htmlFor="email">
              Email
            </Label>
            <Input className="w-full" id="email" placeholder="m@example.com"value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label className="text-gray-800 dark:text-gray-200" htmlFor="password">
              Password
            </Label>
            <Input className="w-full" id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          {error && <div className="text-red-500 text-sm">invalid email or password</div>} 
          <form onSubmit={handleLogin}>
            <Button type="submit" className="w-full bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-400 dark:hover:bg-blue-500">
              Login
            </Button>
          </form>
        </div>
        <div className="text-center text-sm">
          <Link className="underline text-blue-600 dark:text-blue-400" href="#">
            Forgot your password?
          </Link>
        </div>
      </div>
    </div>
  );
}

function FlagIcon(props : any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
      <line x1="4" x2="4" y1="22" y2="15" />
    </svg>
  )
}
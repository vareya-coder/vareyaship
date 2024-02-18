"use client"

import React, { useState } from 'react';
import Link from 'next/link';
import Avatar from './avatar';
import Image from 'next/image';
import Logo from '@/app/Assets/vareyaLogo.png'
import { PanelTopClose, XCircle } from 'lucide-react';
interface INavLink {
  href: string;
  label: string;
}

const navLinks: INavLink[] = [
  { href: '/', label: 'Home' },
  { href: '/services', label: 'Services' },
  { href: '/tracking', label: 'Track Shipment' },
  { href: '/faq', label: 'FAQ' },
];

const Header: React.FC = () => {
  const [navOpen, setNavOpen] = useState(false);

  const handleMenuToggle = () => setNavOpen(!navOpen);

  return (
    <nav className="   bg-gray-800 text-white">
      <div className=" mx-auto flex items-center justify-start px-4 py-2">
        <Image src={Logo} alt="LOGO" width={60} height={50}></Image>
        <Link href="/" className="font-bold text-2xl pl-2">VareyaShip</Link>

        {/* Desktop navigation */}
        <div className="hidden md:flex md:space-x-4 ml-4">
          {navLinks.map((link) => (
            <Link key={link.href} href={link.href} className="px-3 py-2 rounded-md hover:bg-gray-900 hover:text-gray-300">{link.label}</Link>
          ))}
        </div>

        {/* Rest of the content including Avatar and mobile menu button aligned to the right */}
        <div className="flex-grow"></div>
        <div className="flex items-center pr-4">
          
          <Avatar  />
          {/* Mobile menu button */}
          <button className="md:hidden block focus:outline-none ml-4" onClick={handleMenuToggle}>
            <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              {navOpen ? (
               ""//<path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16"/>
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {navOpen && (
        <div className="md:hidden fixed top-0 left-0 flex-col right-0 bg-gray-800 text-white pt-20 z-20">
          <div className='w-full   justify-end flex '>

          <XCircle onClick={handleMenuToggle} width={90} height={30} className='' />

          </div>
          <ul className="space-y-2 px-4 py-2">
            {navLinks.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="block py-2 pl-4 text-lg hover:text-gray-300">{link.label}</Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </nav>
  );
};

export default Header;

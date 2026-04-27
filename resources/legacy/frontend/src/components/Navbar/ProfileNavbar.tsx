'use client';
import { Bell, Menu } from 'lucide-react';
import Image from 'next/image';
import { useState } from 'react';
import Sidebar from './Sidebar';

const ProfileNavbar: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <nav className="h-16 fixed w-full z-[100] bg-gray-900 flex items-center px-4 gap-4">
      {isOpen && <Sidebar close={() => setIsOpen(false)}></Sidebar>}
      <Image
        className="rounded-full"
        src={'/full-logo.png'}
        width={50}
        height={50}
        alt="logo"
      ></Image>
      <div className="flex h-full gap-2 items-center ">
        <h1 className="text-lg font-semibold text-gray-300">John Doe</h1>
      </div>
      <div className="flex-grow-1"></div>
      <div>
        <Bell />
      </div>
      <button onClick={() => setIsOpen(!isOpen)}>
        {' '}
        <Menu />
      </button>
    </nav>
  );
};
export default ProfileNavbar;

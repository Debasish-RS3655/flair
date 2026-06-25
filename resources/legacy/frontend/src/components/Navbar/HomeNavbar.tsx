'use client';
import { Bell, Menu } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import Sidebar from './Sidebar';
import { useUser } from '../store';

const HomeNavbar: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const { user } = useUser();

  // const storedUser = localStorage.getItem('user');
  // const username = storedUser ? JSON.parse(storedUser).username : '';
  // const profileImage = storedUser ? JSON.parse(storedUser).profileImage : '';
  return (
    <nav className="h-16 fixed w-full z-[100] bg-gray-900 flex items-center px-4 gap-4">
      {isOpen && <Sidebar close={() => setIsOpen(false)}></Sidebar>}
      <Image className="rounded-full" src={'/logo.jpeg'} width={50} height={50} alt="logo"></Image>
      <h1 className="text-lg font-bold tracking-wider">Flair</h1>
      <input
        className="focus:outline-none border-[#A0A0A0] border-1 rounded-md px-2 py-1 ml-4"
        name="search"
        type="text"
        id="search"
        placeholder="Search"
      />
      <div className="flex-grow-1"></div>
      <div>
        <Bell />
      </div>
      <Link href={`/${user?.username}`} className="flex items-center gap-2">
        {''}
        <Image
          className="rounded-full h-8 w-8"
          src={user?.profileImage ?? '/dummy/profile.png'}
          width={50}
          height={50}
          alt="profile"
        ></Image>
      </Link>
      <button onClick={() => setIsOpen(!isOpen)}>
        {' '}
        <Menu />
      </button>
    </nav>
  );
};
export default HomeNavbar;

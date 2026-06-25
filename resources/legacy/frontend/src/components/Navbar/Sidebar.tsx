'use client';
import { House, X } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import React, { useEffect, useState } from 'react';
import { LocalStorageTokenGen } from '@/lib/auth/general';
import { useRouter } from 'next/navigation';
import { useUser } from '../store';

type SidebarProps = {
  close: (isOpen: boolean) => void;
};

const Sidebar: React.FC<SidebarProps> = ({ close }) => {
  const [sidebarWidth, setSidebarWidth] = useState(0);
  const router = useRouter();
  const { user } = useUser();
  useEffect(() => {
    const timer = setTimeout(() => setSidebarWidth(280), 10);
    return () => clearTimeout(timer);
  }, []);

  const handleClose = () => {
    setSidebarWidth(0);
    setTimeout(() => {
      close(false);
    }, 300);
  };

  const logout = () => {
    LocalStorageTokenGen.clearToken();
    router.push('/');
  };
  return (
    <div
      className="fixed top-0 right-0 h-full bg-gray-900 overflow-hidden transition-all duration-300 ease-linear"
      style={{ width: sidebarWidth }}
    >
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-start pl-4 h-16 bg-gray-800 gap-4">
          <Image
            className="rounded-full h-10 w-10"
            src={user?.profileImage ?? '/dummy/profile.png'}
            width={50}
            height={50}
            alt="avater"
          ></Image>
          <h4 className="flex-grow-1">{user?.username}</h4>
          <button onClick={handleClose} className="p-2 pr-4 rounded">
            <X />{' '}
          </button>
        </div>
        <div className="flex flex-col pl-8 py-4 gap-4">
          <Link className="flex items-center justify-start gap-2" href={'/' + user?.username}>
            {' '}
            <House size={20} />
            Profile
          </Link>

          <button className="flex items-center justify-start gap-2" onClick={logout}>
            {' '}
            Logout
          </button>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;

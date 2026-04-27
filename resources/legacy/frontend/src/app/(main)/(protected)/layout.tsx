'use client';

import FinalNavbar from '@/components/Navbar/FinalNavbar';
import { useUser } from '@/components/store';
import { LocalStorageTokenGen } from '@/lib/auth/general';
import { request } from '@/lib/requests';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

const Layout = ({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) => {
  const router = useRouter();
  // const [username, setUsername] = useState<string | null>(null);
  const { user, setUser } = useUser();
  useEffect(() => {
    // if not logged in, redirect to login
    if (LocalStorageTokenGen.getToken() === null) {
      router.push('/login');
    }
  }, []);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const response = await request({
          method: 'GET',
          url: `${process.env.NEXT_PUBLIC_API_URL}/user/profile`,
          action: 'signin',
        });

        const data = await response.json();
        // setUsername(data.data.username);
        // console.log('Profile data:', data);
        const _user = {
          username: data.data.username,
          profileImage: data.data.metadata.profileImage,
        };
        // console.log('User:', _user);
        setUser(_user);
        // localStorage.setItem(
        //   'user',
        //   JSON.stringify({
        //     username: data.data.username,
        //     ...data.data.metadata,
        //   }),
        // );
        // localStorage.setItem('myUsername', data.data.username);
      } catch (err) {
        console.error('Request failed:', err);
      }
    };

    fetchProfile();
  }, []);

  if (user === null) {
    return <div>Loading...</div>;
  }
  return (
    <>
      <FinalNavbar />

      <main>{children}</main>
    </>
  );
};
export default Layout;

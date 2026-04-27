'use client';
import LeftPanel from './LeftPanel';
import RightPanel from './RightPanel';
import { useEffect } from 'react';
import { request } from '@/lib/requests';
import { useOtherUser } from '../store';

const Dashboard: React.FC<{ username: string }> = ({ username }) => {
  const { otherUser, setOtherUser, clearOtherUser } = useOtherUser();
  // useEffect(() => {
  //   localStorage.removeItem('curUser');
  // }, []);
  useEffect(() => {
    const fetchData = async () => {
      // localStorage.removeItem('curUser');
      try {
        clearOtherUser();
        const response = await request({
          method: 'GET',
          url: `${process.env.NEXT_PUBLIC_API_URL}/user/username/${username}`,
          action: 'signin',
        });
        const data = await response.json();
        console.log('Data:', data);
        const curUser = {
          name: data.data.metadata.name as string,
          username: data.data.username as string,
          bio: data.data.metadata.bio as string,
          email: data.data.metadata.email as string,
          profileImage: data.data.metadata.profileImage as string,
          displayText: data.data.metadata.displayText as string,
        };
        // console.log('Current User:', curUser);
        setOtherUser(curUser);
        // localStorage.setItem('curUser', JSON.stringify(curUser));
      } catch (error) {
        console.error('Error fetching data:', error);
      }
    };
    fetchData();
  }, [username]);
  console.log(otherUser);

  return (
    <div className="min-h-screen bg-[#0d1117] text-white px-40 pt-20">
      {otherUser ? (
        <div className="w-full flex gap-20 justify-center ">
          <LeftPanel />
          <RightPanel />
        </div>
      ) : (
        <div>Loading</div>
      )}
    </div>
  );
};

export default Dashboard;

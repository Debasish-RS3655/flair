'use client';
import Image from 'next/image';
import EditProfile from './EditProfile';
import { useEffect, useState } from 'react';
import { useOtherUser, useUser } from '../store';

// const data = {
//   fullName: 'John Doe',
//   username: 'johndoe123',
//   bio: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
//   website: 'myportfolio.com',
//   twitter: '@twitter_username',
//   linkedin: 'my_linkedin_profile',
//   phone: '+000000000',
//   email: 'johndoe@example.com',
// };

const LeftPanel: React.FC = () => {
  const { user } = useUser();
  const { otherUser } = useOtherUser();

  const [data, setData] = useState<{
    name: string;
    username: string;
    bio: string;
    email: string;
    profileImage: string;
    displayText: string;
  }>({
    name: '',
    username: '',
    bio: '',
    email: '',
    profileImage: '',
    displayText: '',
  });

  useEffect(() => {
    if (otherUser != null) setData(otherUser);
  }, []);

  const [isEditProfile, setIsEditProfile] = useState(false);
  if (isEditProfile) {
    return <EditProfile close={() => setIsEditProfile(false)} data={data} />;
  } else {
    return (
      <div className="flex flex-col gap-4 min-w-72 w-72">
        <div className="flex justify-center ">
          <Image
            className="rounded-full border-4 h-60 w-60 border-gray-700"
            src={data?.profileImage !== '' ? data.profileImage : '/dummy/profile.png'}
            width={100}
            height={100}
            alt="Profile Picture"
          />
        </div>

        <div className="flex flex-col text-center gap-2 items-center">
          <div className="flex flex-col leading-4">
            <h2 className="text-xl font-semibold">{data.name}</h2>
            <h6 className="text-gray-400">{data.username}</h6>
          </div>
          <p className="text-gray-300 text-sm">{data.bio}</p>
          {user?.username === data.username && (
            <button
              onClick={() => setIsEditProfile(true)}
              className="px-4 mt-2 py-2 text-xs bg-gray-600 text-white font-semibold rounded-lg hover:bg-gray-500 transition"
            >
              Edit Profile
            </button>
          )}
        </div>

        {/* Links */}
        <div className="text-sm text-gray-400 space-y-2 mt-4 px-4">
          {/* <p>{data.website}</p>
          <p>{data.twitter}</p>
          <p>{data.linkedin}</p>
          <p>{data.phone}</p> */}
          <p>{data.email}</p>
        </div>
      </div>
    );
  }
};

export default LeftPanel;

'use client';
import { request } from '@/lib/requests';
import { useEffect, useState } from 'react';
import { useOtherUser, useUser } from '../store';

type Repo = {
  name: string;
  description: string;
  updateAt: string;
  repoHash: string;
};

type RepositoriesProps = {
  repos: Repo[];
};
const About: React.FC<RepositoriesProps> = ({ repos }) => {
  const [displayText, setDisplayText] = useState('');
  const [editing, setEditing] = useState(false);
  const [editedText, setEditedText] = useState('');

  const { user } = useUser();
  const { otherUser } = useOtherUser();

  const handleSave = async () => {
    const username = otherUser?.username ?? '';
    const name = otherUser?.name ?? '';
    const bio = otherUser ?? '';
    const profileImage = otherUser?.profileImage ?? '';
    try {
      const res = await request({
        method: 'PUT',
        url: `${process.env.NEXT_PUBLIC_API_URL}/user/update`,
        data: JSON.stringify({
          username: username,
          metadata: {
            name: name,
            displayText: editedText,
            bio: bio,
            profileImage: profileImage,
          },
        }),
        action: 'signin',
      });

      const data = await res.json();
      console.log('Response:', data);
      setEditing(false);
      window.location.reload();
    } catch (err) {
      console.log('Error in submiting form', err);
    }
  };
  useEffect(() => {
    setDisplayText(otherUser?.displayText || '');
    setEditedText(displayText);
  }, [displayText]);

  return (
    <div className="flex flex-col gap-8">
      <div className="bg-[#161b22] p-4">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-semibold">About me</h3>
          {user?.username === otherUser?.username && (
            <button className="text-sm text-gray-400" onClick={() => setEditing(true)}>
              ✏️
            </button>
          )}
        </div>
        {editing ? (
          <>
            <textarea
              placeholder={'Write something about yourself...'}
              className="bg-[#161b22] text-gray-300 mt-2 text-sm p-2 border border-gray-700 w-full"
              value={editedText}
              onChange={e => setEditedText(e.target.value)}
            />
            <div className="flex justify-end mt-2">
              <button className="text-sm text-blue-400" onClick={handleSave}>
                Save
              </button>
              <button
                className="text-sm text-red-400 ml-2"
                onClick={() => {
                  setEditing(false);
                  setEditedText(displayText);
                }}
              >
                Cancel
              </button>
            </div>
          </>
        ) : (
          <p className="text-gray-300 mt-2 text-sm">{displayText}</p>
        )}
      </div>

      {/* Attendance Chart (Static) */}
      {/* <div className="bg-[#161b22] p-4">
        <h3 className="text-lg font-semibold mb-2">Attended 30% of sessions and events in 2021</h3>
        <div className="grid grid-cols-12 gap-2 text-xs text-gray-400">
          {'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ').map(month => (
            <div key={month} className="text-center">
              {month}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-52 gap-1 mt-2">
          {[...Array(52)].map((_, i) => (
            <div
              key={i}
              className={`w-3 h-3 rounded-sm ${i % 10 === 0 ? 'bg-green-500' : 'bg-gray-700'}`}
              title="Session"
            />
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-1">Hover to see the event or session</p>
      </div> */}

      {/* Pinned Projects */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {repos.map((repo: Repo, index: number) => (
          <div key={index} className="bg-[#161b22] p-4">
            <h4 className="text-md text-blue-400 font-semibold">📁{repo.name}</h4>
            <p className="text-gray-400 text-sm">{repo.description}</p>
            <div className="mt-2 flex justify-between text-sm text-gray-400">
              <span>{repo.updateAt}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default About;

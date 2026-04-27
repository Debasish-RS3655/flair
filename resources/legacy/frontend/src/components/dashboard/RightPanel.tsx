'use client';

import { useEffect, useState } from 'react';
import About from './About';
import Repositories from './Repositories';
import Settings from './Settings';
import { request } from '@/lib/requests';

const tabs = ['Overview', 'Repositories', 'Logs', 'Settings'];

type Repo = {
  name: string;
  description: string;
  updateAt: string;
  repoHash: string;
};

const RightPanel: React.FC = () => {
  const [tabNo, setTabNo] = useState(1);
  const [repos, setRepos] = useState<Repo[]>([]);


  interface repoMetadata {
    description: string;
  }
  interface repository {
    name: string;
    metadata: repoMetadata;
    updatedAt: string;
    repoHash: string;
  }

  // fetching the repo of the my account not the user which is searched
  useEffect(() => {
    const fetchRepos = async () => {
      try {
        const response = await request({
          method: 'GET',
          url: `${process.env.NEXT_PUBLIC_API_URL}/repo`,
          action: 'signin',
        });
        const data = await response.json();
        setRepos(
          data.data.map((repo: repository) => ({
            name: repo.name,
            description: repo.metadata.description,
            updatedAt: repo.updatedAt,
            repoHash: repo.repoHash,
          })),
        );
      } catch (error) {
        console.error('Error fetching repositories:', error);
      }
    };

    fetchRepos();
  }, []);

  return (
    <div className="flex flex-col flex-grow-1 gap-4">
      {/* Nav */}
      <div className="flex gap-8 border-b border-gray-700 pb-2">
        {tabs.map((tab, index) => (
          <button
            className={`${index + 1 === tabNo ? 'font-semibold text-[#0000FF] scale-110' : ''} min-w-10 cursor-pointer transistion-all duration-200 ease-in-out`}
            onClick={() => setTabNo(index + 1)}
            key={index}
          >
            {tab}
          </button>
        ))}
      </div>
      {tabNo === 1 && <About repos={repos} />}
      {tabNo === 2 && <Repositories repos={repos} />}
      {tabNo === 3 && <div>Logs</div>}
      {tabNo === 4 && <Settings />}
    </div>
  );
};

export default RightPanel;

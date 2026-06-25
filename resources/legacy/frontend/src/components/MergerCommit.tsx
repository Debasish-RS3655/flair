'use client';
import type { TypeMergerCommitGroup } from '@/lib/types';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import Commit from './Commit';
import { formatDate, formatTime, getMergedRejectedAndPendingCount } from '@/lib';
import { Unlink2 } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

type MergerCommitProps = {
  mergerCommit: TypeMergerCommitGroup['mergerCommit'];
  commits: TypeMergerCommitGroup['commits'];
  mergerCommitNo: number;
};

const MergerCommit: React.FC<MergerCommitProps> = ({ mergerCommit, commits, mergerCommitNo }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const { mergedCount, rejectedCount, pendingCount } = getMergedRejectedAndPendingCount(commits);

  const pathname = usePathname();
  const [username, setUsername] = useState('');
  const [repoName, setRepoName] = useState('');
  useEffect(() => {
    const parts = pathname.split('/');
    setUsername(parts[1]);
    setRepoName(parts[2]);
    console.log('Username:', username, 'Repo Name:', repoName);
  }, [pathname]);

  return (
    <div onClick={() => setIsExpanded(!isExpanded)} className="w-full h-full px-4 flex flex-col">
      <div className="flex items-center justify-between w-full font-semibold text-gray-100">
        <h3>{formatDate(mergerCommit.createdAt)}</h3>
      </div>
      <div className=" h-auto w-full ml-8  border-l-2 px-4 border-gray-400 ">
        <div className="hover:bg-gray-900 rounded-lg flex  justify-between h-full  py-4 px-4">
          <div className="flex flex-col gap-1 ">
            <h2 className="text-gray-300 text-base flex items-center gap-2">
              {mergerCommitNo + '. ' + mergerCommit.message}
              <Link
                className="relative z-30"
                href={`/${username}/${repoName}/commits/` + mergerCommit.commitHash}
              >
                <Unlink2 size={16} />
              </Link>
            </h2>
            <span className="flex gap-2 items-center">
              <Image
                className="rounded-full h-5 w-5"
                src={'/dummy/profile.png'}
                width={16}
                height={16}
                alt="avater"
              ></Image>{' '}
              <p className="text-gray-400 text-sm">{` username at ${formatTime(mergerCommit.createdAt)}`}</p>
            </span>
          </div>
          <div className="flex flex-col items-end gap-1 h-full">
            <p className="text-sm flex gap-1 text-gray-400">
              <span>{`Merged: ${mergedCount}`}</span>
              {rejectedCount != 0 && <span>{`Rejected: ${rejectedCount}`}</span>}
              {pendingCount != 0 && <span>{`Pending: ${pendingCount}`}</span>}
            </p>
            {/* <button
              className="text-white flex items-center text-xs bg-green-500 hover:bg-green-400 py-1 px-2 rounded-lg "
              onClick={() => setIsExpanded(!isExpanded)}
            >
              View <ChevronRight size={12} />
            </button> */}
          </div>
        </div>
        <div className={`${isExpanded ? 'h-auto' : 'h-0 overflow-hidden'} ml-16 `}>
          {commits.map((commit, index) => (
            <Commit key={index} commit={commit} />
          ))}
        </div>
      </div>
    </div>
  );
};

export default MergerCommit;

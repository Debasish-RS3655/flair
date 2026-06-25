'use client';
import ModelStats from '@/components/ModelStats';
import { formatDate } from '@/lib';
import { request } from '@/lib/requests';
import { Unlink2 } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

type Commit = {
  metrics: {
    accuracy: number;
    loss: number;
  };
  status: string;
  message: string;
  committerAddress: string;
  committer: {
    address: string;
    username: string;
    profileImage: string;
  };
  createdAt: string;
};

const Page: React.FC = () => {
  const [commits, setCommits] = useState<Commit[]>([]);

  const path = usePathname();
  useEffect(() => {
    const ownerName = path.split('/')[1];
    const repoName = path.split('/')[2];
    const fetchAll = async () => {
      try {
        const response = await request({
          method: 'GET',
          url: `${process.env.NEXT_PUBLIC_API_URL}/user/username/${ownerName}`,
          action: 'signin',
        });
        const ownerData = await response.json();
        console.log('Owner Data', ownerData);
        const response1 = await request({
          method: 'GET',
          url: `${process.env.NEXT_PUBLIC_API_URL}/repo/owner/${ownerData.data.wallet}/name/${repoName}`,
          action: 'signin',
        });
        const repoData = await response1.json();
        console.log('Repo data:', repoData.data.matchRepo);
        const repoHash = repoData.data.matchRepo.repoHash;
        const response2 = await request({
          method: 'GET',
          url: `${process.env.NEXT_PUBLIC_API_URL}/repo/hash/${repoHash}/branch/`,
          action: 'signin',
        });
        const branchData = await response2.json();
        console.log('Branch data:', branchData);

        const branchHash = branchData.data[0].branchHash;
        const response3 = await request({
          method: 'GET',
          url: `${process.env.NEXT_PUBLIC_API_URL}/repo/hash/${repoHash}/branch/hash/${branchHash}/commit`,
          action: 'signin',
        });
        const commitsData = await response3.json();
        console.log('Commits data:', commitsData);

        const filteredCommits = await Promise.all(
          commitsData.data.map(async (commit: Commit) => {
            const res = await request({
              method: 'GET',
              url: `${process.env.NEXT_PUBLIC_API_URL}/user/user/${commit.committerAddress}`,
              action: 'signin',
            });
            const data = await res.json();

            return {
              metrics: commit.metrics,
              status: commit.status,
              message: commit.message,
              committerAddress: commit.committerAddress,
              committer: {
                address: commit.committerAddress,
                username: data.data.username,
                profileImage: data.data.metadata.profileImage,
              },
              createdAt: commit.createdAt,
            };
          }),
        );
        setCommits(filteredCommits);
        console.log('Filtered', filteredCommits);
      } catch (err) {
        console.log(err);
      }
    };
    fetchAll();
  }, []);

  const [expandedStates, setExpandedStates] = useState<boolean[]>([]);

  useEffect(() => {
    setExpandedStates(new Array(commits.length).fill(false));
  }, [commits]);
  const toggleExpanded = (index: number) => {
    setExpandedStates(prev => {
      const newStates = [...prev];
      newStates[index] = !newStates[index];
      return newStates;
    });
  };
  // const groups = createMergerCommitGroups(commits.data);
  return (
    <section className="min-h-screen w-full pt-28 px-32 bg-gray-950">
      <div className="flex flex-col items-center justify-center h-full w-full p-4 ">
        {/* {groups.map((group, index) => (
          <MergerCommit
            key={index}
            mergerCommitNo={index + 1}
            mergerCommit={group.mergerCommit}
            commits={group.commits}
          />
        ))} */}
        {commits.map((commit: Commit, index: number) => {
          const isExpanded = expandedStates[index];

          return (
            <div key={index} className="w-full h-full px-4 flex flex-col">
              <div className="flex items-center justify-between w-full font-semibold text-gray-100">
                <h3>{formatDate(commit.createdAt)}</h3>
              </div>
              <div className=" h-auto w-full ml-8  border-l-2 px-4 border-gray-400 ">
                <div className="hover:bg-gray-900 rounded-lg flex  justify-between h-full  py-4 px-4">
                  <div className="flex flex-col gap-1 ">
                    <h2 className="text-gray-300 text-base flex items-center gap-2">
                      {index + 1 + '. ' + commit.message}
                      <Link className="relative z-30" href={''}>
                        <Unlink2 size={16} />
                      </Link>
                    </h2>
                    <span className="flex gap-2 items-center">
                      <Image
                        className="rounded-full h-5 w-5"
                        src={commit.committer.profileImage ?? '/dummy/profile.png'}
                        width={16}
                        height={16}
                        alt="avatar"
                      />
                      <p className="text-gray-400 text-sm">{commit.committer.username}</p>
                    </span>
                  </div>
                  <button onClick={() => toggleExpanded(index)} className="text-sm text-blue-400">
                    {isExpanded ? 'Hide' : 'Show'} Details
                  </button>
                </div>
              </div>
              <div className={`${isExpanded ? 'h-auto' : 'h-0 overflow-hidden'} ml-16`}>
                <ModelStats
                  accuracy={commit.metrics.accuracy}
                  loss={commit.metrics.loss}
                ></ModelStats>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};

export default Page;

// const commits = {
//   data: [
//     // === MERGER 1 ===
//     {
//       id: 'm1',
//       commitHash: 'hash_m1',
//       status: 'MERGERCOMMIT',
//       previousMergerCommit: '_GENESIS_',
//       message: 'First merger commit',
//       createdAt: '2025-04-10T10:00:00Z',
//       paramHash: 'phash_m1',
//       architecture: 'architectureofmodel',
//       branchId: 'branch1',
//       committerId: 'user1',
//       committerAddress: 'addr1',
//       isDeleted: false,
//       verified: false,
//       nftId: null,
//       relatedMergerCommit: null,
//       rejectedMessage: null,
//       statusUpdatedAt: null,
//       metrics: { accuracy: 0.94, loss: 0.15 },
//     },
//     {
//       id: 'm1_r',
//       commitHash: 'hash_m1_r',
//       status: 'REJECTED',
//       previousMergerCommit: 'hash_m1',
//       message: 'Rejected commit for m1',
//       createdAt: '2025-04-10T10:10:00Z',
//       paramHash: 'phash_m1_r',
//       architecture: 'architectureofmodel',
//       branchId: 'branch1',
//       committerId: 'user1',
//       committerAddress: 'addr1',
//       isDeleted: false,
//       verified: false,
//       nftId: null,
//       relatedMergerCommit: null,
//       rejectedMessage: 'did not want to merge',
//       statusUpdatedAt: null,
//       metrics: { accuracy: 0.92, loss: 0.18 },
//     },
//     {
//       id: 'm1_m',
//       commitHash: 'hash_m1_m',
//       status: 'MERGED',
//       previousMergerCommit: 'hash_m1',
//       message: 'Merged commit for m1',
//       createdAt: '2025-04-10T10:15:00Z',
//       paramHash: 'phash_m1_m',
//       architecture: 'architectureofmodel',
//       branchId: 'branch1',
//       committerId: 'user1',
//       committerAddress: 'addr1',
//       isDeleted: false,
//       verified: true,
//       nftId: null,
//       relatedMergerCommit: null,
//       rejectedMessage: null,
//       statusUpdatedAt: null,
//       metrics: null,
//     },

//     // === MERGER 2 ===
//     {
//       id: 'm2',
//       commitHash: 'hash_m2',
//       status: 'MERGERCOMMIT',
//       previousMergerCommit: 'hash_m1',
//       message: 'Second merger commit',
//       createdAt: '2025-04-11T11:00:00Z',
//       paramHash: 'phash_m2',
//       architecture: 'architectureofmodel',
//       branchId: 'branch1',
//       committerId: 'user1',
//       committerAddress: 'addr1',
//       isDeleted: false,
//       verified: false,
//       nftId: null,
//       relatedMergerCommit: null,
//       rejectedMessage: null,
//       statusUpdatedAt: null,
//       metrics: { accuracy: 0.96, loss: 0.12 },
//     },
//     {
//       id: 'm2_r',
//       commitHash: 'hash_m2_r',
//       status: 'REJECTED',
//       previousMergerCommit: 'hash_m2',
//       message: 'Rejected commit for m2',
//       createdAt: '2025-04-11T11:10:00Z',
//       paramHash: 'phash_m2_r',
//       architecture: 'architectureofmodel',
//       branchId: 'branch1',
//       committerId: 'user1',
//       committerAddress: 'addr1',
//       isDeleted: false,
//       verified: false,
//       nftId: null,
//       relatedMergerCommit: null,
//       rejectedMessage: 'performance drop',
//       statusUpdatedAt: null,
//       metrics: { accuracy: 0.89, loss: 0.2 },
//     },
//     {
//       id: 'm2_m',
//       commitHash: 'hash_m2_m',
//       status: 'MERGED',
//       previousMergerCommit: 'hash_m2',
//       message: 'Merged commit for m2',
//       createdAt: '2025-04-11T11:15:00Z',
//       paramHash: 'phash_m2_m',
//       architecture: 'architectureofmodel',
//       branchId: 'branch1',
//       committerId: 'user1',
//       committerAddress: 'addr1',
//       isDeleted: false,
//       verified: true,
//       nftId: null,
//       relatedMergerCommit: null,
//       rejectedMessage: null,
//       statusUpdatedAt: null,
//       metrics: null,
//     },

//     // === MERGER 3 ===
//     {
//       id: 'm3',
//       commitHash: 'hash_m3',
//       status: 'MERGERCOMMIT',
//       previousMergerCommit: 'hash_m2',
//       message: 'Third merger commit',
//       createdAt: '2025-04-12T12:00:00Z',
//       paramHash: 'phash_m3',
//       architecture: 'architectureofmodel',
//       branchId: 'branch1',
//       committerId: 'user1',
//       committerAddress: 'addr1',
//       isDeleted: false,
//       verified: false,
//       nftId: null,
//       relatedMergerCommit: null,
//       rejectedMessage: null,
//       statusUpdatedAt: null,
//       metrics: { accuracy: 0.97, loss: 0.1 },
//     },
//     {
//       id: 'm3_r',
//       commitHash: 'hash_m3_r',
//       status: 'REJECTED',
//       previousMergerCommit: 'hash_m3',
//       message: 'Rejected commit for m3',
//       createdAt: '2025-04-12T12:05:00Z',
//       paramHash: 'phash_m3_r',
//       architecture: 'architectureofmodel',
//       branchId: 'branch1',
//       committerId: 'user1',
//       committerAddress: 'addr1',
//       isDeleted: false,
//       verified: false,
//       nftId: null,
//       relatedMergerCommit: null,
//       rejectedMessage: 'minor bug',
//       statusUpdatedAt: null,
//       metrics: { accuracy: 0.93, loss: 0.13 },
//     },
//     {
//       id: 'm3_m',
//       commitHash: 'hash_m3_m',
//       status: 'MERGED',
//       previousMergerCommit: 'hash_m3',
//       message: 'Merged commit for m3',
//       createdAt: '2025-04-12T12:10:00Z',
//       paramHash: 'phash_m3_m',
//       architecture: 'architectureofmodel',
//       branchId: 'branch1',
//       committerId: 'user1',
//       committerAddress: 'addr1',
//       isDeleted: false,
//       verified: true,
//       nftId: null,
//       relatedMergerCommit: null,
//       rejectedMessage: null,
//       statusUpdatedAt: null,
//       metrics: null,
//     },

//     // === MERGER 4 ===
//     {
//       id: 'm4',
//       commitHash: 'hash_m4',
//       status: 'MERGERCOMMIT',
//       previousMergerCommit: 'hash_m3',
//       message: 'Fourth merger commit',
//       createdAt: '2025-04-13T13:00:00Z',
//       paramHash: 'phash_m4',
//       architecture: 'architectureofmodel',
//       branchId: 'branch1',
//       committerId: 'user1',
//       committerAddress: 'addr1',
//       isDeleted: false,
//       verified: false,
//       nftId: null,
//       relatedMergerCommit: null,
//       rejectedMessage: null,
//       statusUpdatedAt: null,
//       metrics: { accuracy: 0.98, loss: 0.07 },
//     },
//     {
//       id: 'm4_r',
//       commitHash: 'hash_m4_r',
//       status: 'REJECTED',
//       previousMergerCommit: 'hash_m4',
//       message: 'Rejected commit for m4',
//       createdAt: '2025-04-13T13:10:00Z',
//       paramHash: 'phash_m4_r',
//       architecture: 'architectureofmodel',
//       branchId: 'branch1',
//       committerId: 'user1',
//       committerAddress: 'addr1',
//       isDeleted: false,
//       verified: false,
//       nftId: null,
//       relatedMergerCommit: null,
//       rejectedMessage: 'failing test cases',
//       statusUpdatedAt: null,
//       metrics: { accuracy: 0.9, loss: 0.2 },
//     },
//     {
//       id: 'm4_m',
//       commitHash: 'hash_m4_m',
//       status: 'MERGED',
//       previousMergerCommit: 'hash_m4',
//       message: 'Merged commit for m4',
//       createdAt: '2025-04-13T13:20:00Z',
//       paramHash: 'phash_m4_m',
//       architecture: 'architectureofmodel',
//       branchId: 'branch1',
//       committerId: 'user1',
//       committerAddress: 'addr1',
//       isDeleted: false,
//       verified: true,
//       nftId: null,
//       relatedMergerCommit: null,
//       rejectedMessage: null,
//       statusUpdatedAt: null,
//       metrics: null,
//     },
//     {
//       id: 'm4_p1',
//       commitHash: 'hash_m4_p1',
//       status: 'PENDING',
//       previousMergerCommit: 'hash_m4',
//       message: 'Pending commit 1 after m4',
//       createdAt: '2025-04-13T13:30:00Z',
//       paramHash: 'phash_m4_p1',
//       architecture: 'architectureofmodel',
//       branchId: 'branch1',
//       committerId: 'user1',
//       committerAddress: 'addr1',
//       isDeleted: false,
//       verified: false,
//       nftId: null,
//       relatedMergerCommit: null,
//       rejectedMessage: null,
//       statusUpdatedAt: null,
//       metrics: { accuracy: 0.91, loss: 0.14 },
//     },
//     {
//       id: 'm4_p2',
//       commitHash: 'hash_m4_p2',
//       status: 'PENDING',
//       previousMergerCommit: 'hash_m4',
//       message: 'Pending commit 2 after m4',
//       createdAt: '2025-04-13T13:40:00Z',
//       paramHash: 'phash_m4_p2',
//       architecture: 'architectureofmodel',
//       branchId: 'branch1',
//       committerId: 'user1',
//       committerAddress: 'addr1',
//       isDeleted: false,
//       verified: false,
//       nftId: null,
//       relatedMergerCommit: null,
//       rejectedMessage: null,
//       statusUpdatedAt: null,
//       metrics: { accuracy: 0.92, loss: 0.13 },
//     },
//   ],
// };

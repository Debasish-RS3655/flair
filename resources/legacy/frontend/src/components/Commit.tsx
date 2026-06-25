import { formatDate, formatTime } from '@/lib'
import type { TypeCommit } from '@/lib/types'
import { Check, Loader, X } from 'lucide-react'
import Image from 'next/image'

type CommitProps = {
  commit: TypeCommit
}

const Commit: React.FC<CommitProps> = ({ commit }) => {
  return (
    <div className="w-full h-full flex items-center border-l-2 border-gray-400">
      <hr className="border-1 w-6 border-gray-400 z-10" />
      <div className="flex gap-2 items-center w-full p-2 -ml-2 hover:bg-gray-900 rounded-lg">
        {commit.status === 'MERGED' ? (
          <div className="flex items-center justify-center w-6 h-6 bg-green-400 p-1 rounded-full">
            <Check size={20} color="white" />
          </div>
        ) : commit.status === 'REJECTED' ? (
          <div className="flex items-center justify-center w-6 h-6 bg-red-400 p-1 rounded-full">
            <X size={20} color="white" />
          </div>
        ) : (
          <div className="flex items-center justify-center w-6 h-6 bg-blue-400 p-1 rounded-full">
            <Loader size={20} color="white" />
          </div>
        )}
        <div>
          <h2 className="text-gray-300 text-sm">{commit.message}</h2>
          <span className="flex gap-2 items-center">
            <Image
              className="rounded-full h-3 w-3"
              src={'/dummy/profile.png'}
              width={16}
              height={16}
              alt="avater"
            ></Image>{' '}
            <p className="text-gray-400 text-xs">{` username at ${formatTime(commit.createdAt)} on ${formatDate(commit.createdAt)}`}</p>
          </span>
        </div>
      </div>
    </div>
  )
}

export default Commit

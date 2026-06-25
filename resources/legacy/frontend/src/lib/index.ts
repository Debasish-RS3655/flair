import { TypeCommit, TypeMergerCommitGroup } from './types'

export const formatDate = (dateString: string): string => {
  const date = new Date(dateString)
  const day: number = date.getUTCDate()
  const month: string = date.toLocaleString('default', { month: 'long', timeZone: 'UTC' })
  const year: number = date.getUTCFullYear()
  return `${day} ${month.substring(0, 3)}, ${year}`
}

export const formatTime = (dateString: string): string => {
  const date = new Date(dateString)
  const hours: number = date.getUTCHours()
  const minutes: number = date.getUTCMinutes()
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
}

export const getMergedRejectedAndPendingCount = (commits: TypeCommit[]) => {
  const mergedCount = commits.filter(commit => commit.status === 'MERGED').length
  const rejectedCount = commits.filter(commit => commit.status === 'REJECTED').length
  const pendingCount = commits.filter(commit => commit.status === 'PENDING').length
  return { mergedCount, rejectedCount, pendingCount }
}

export const createMergerCommitGroups = (commits: TypeCommit[]): TypeMergerCommitGroup[] => {
  const groups: TypeMergerCommitGroup[] = []
  let currentGroup: TypeMergerCommitGroup | null = null

  for (const commit of commits) {
    if (commit.status === 'MERGERCOMMIT') {
      if (currentGroup) {
        groups.push(currentGroup)
      }
      currentGroup = { mergerCommit: commit, commits: [] }
    } else if (currentGroup) {
      currentGroup.commits.push(commit)
    }
  }
  groups.push(currentGroup!)

  return groups
}

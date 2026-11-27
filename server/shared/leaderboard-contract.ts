export interface LeaderboardDepartment {
  id: string;
  name: string;
}

export interface LeaderboardEntry {
  rank: number;
  employeeId: string;
  name: string;
  title: string;
  departmentId: string;
  amount: number;
  rankChange: number;
  isCurrentUser: boolean;
}

export interface LeaderboardResponse {
  departmentId: string | null;
  departments: LeaderboardDepartment[];
  topTen: LeaderboardEntry[];
  aroundCurrentUser: LeaderboardEntry[];
  currentUser: LeaderboardEntry | null;
  totalUsers: number;
  topTenThreshold: number;
  generatedAt: string;
}

export interface LeaderboardCandidate {
  employeeId: string;
  name: string;
  title: string;
  departmentId: string;
  amount: number;
  previousAmount: number;
}

const byScore = (score: 'amount' | 'previousAmount') =>
  (left: LeaderboardCandidate, right: LeaderboardCandidate) =>
    right[score] - left[score] ||
    left.name.localeCompare(right.name, 'en', { sensitivity: 'base' }) ||
    left.employeeId.localeCompare(right.employeeId);

export const createLeaderboardResponse = (
  candidates: readonly LeaderboardCandidate[],
  currentEmployeeId: string,
  departmentId: string | null,
  departments: LeaderboardDepartment[] = [],
  generatedAt = new Date().toISOString(),
): LeaderboardResponse => {
  const ranked = [...candidates].sort(byScore('amount'));
  const previousRanks = new Map(
    [...candidates]
      .sort(byScore('previousAmount'))
      .map((candidate, index) => [candidate.employeeId, index + 1]),
  );
  const entries: LeaderboardEntry[] = ranked.map((candidate, index) => {
    const rank = index + 1;
    return {
      rank,
      employeeId: candidate.employeeId,
      name: candidate.name,
      title: candidate.title,
      departmentId: candidate.departmentId,
      amount: Math.max(0, candidate.amount),
      rankChange: (previousRanks.get(candidate.employeeId) ?? rank) - rank,
      isCurrentUser: candidate.employeeId === currentEmployeeId,
    };
  });
  const currentIndex = entries.findIndex((entry) => entry.isCurrentUser);
  const topTen = entries.slice(0, 10);
  return {
    departmentId,
    departments,
    topTen,
    aroundCurrentUser: currentIndex < 0
      ? []
      : entries.slice(Math.max(0, currentIndex - 1), Math.min(entries.length, currentIndex + 2)),
    currentUser: currentIndex < 0 ? null : entries[currentIndex]!,
    totalUsers: entries.length,
    topTenThreshold: topTen.length === 10 ? topTen[9]!.amount : 0,
    generatedAt,
  };
};

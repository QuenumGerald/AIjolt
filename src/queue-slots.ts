export function usableQueueSlots(capacity: number, reserve: number): number {
  if (capacity <= 0) return Number.POSITIVE_INFINITY;
  return Math.max(0, capacity - reserve);
}

export function jobSlotsToday(input: {
  capacity: number;
  reserve: number;
  jobQueued: number;
  newsQueued: number;
  jobsToday: number;
  newsToday?: number;
  maxJobsPerDay: number;
  maxXPostsPerDay?: number;
  maxPerCycle?: number;
  emittedThisCycle?: number;
}): number {
  const usable = usableQueueSlots(input.capacity, input.reserve);
  const roomInQueue = Number.isFinite(usable) ? Math.max(0, usable - input.jobQueued - input.newsQueued) : Number.POSITIVE_INFINITY;
  const roomInDay = Math.max(0, input.maxJobsPerDay - input.jobsToday);
  const roomOnChannel = Math.max(0, (input.maxXPostsPerDay ?? Number.POSITIVE_INFINITY) - input.jobsToday - (input.newsToday ?? 0));
  const cycleCap = input.maxPerCycle ?? Number.POSITIVE_INFINITY;
  const roomInCycle = Math.max(0, cycleCap - (input.emittedThisCycle ?? 0));
  return Math.min(roomInQueue, roomInDay, roomOnChannel, roomInCycle);
}

export function newsSlotsToday(input: {
  capacity: number;
  reserve: number;
  jobQueued: number;
  newsQueued: number;
  jobsToday?: number;
  newsToday: number;
  maxNewsPerDay: number;
  maxXPostsPerDay?: number;
  maxPerCycle?: number;
}): number {
  const usable = usableQueueSlots(input.capacity, input.reserve);
  const roomInQueue = Number.isFinite(usable) ? Math.max(0, usable - input.jobQueued - input.newsQueued) : Number.POSITIVE_INFINITY;
  const newsCap = Math.max(0, input.maxNewsPerDay - input.newsToday);
  const roomOnChannel = Math.max(0, (input.maxXPostsPerDay ?? Number.POSITIVE_INFINITY) - (input.jobsToday ?? 0) - input.newsToday);
  const cycleCap = input.maxPerCycle ?? Number.POSITIVE_INFINITY;
  return Math.min(roomInQueue, newsCap, roomOnChannel, cycleCap);
}

export function newsToEvictForJobs(input: {
  capacity: number;
  reserve: number;
  jobQueued: number;
  newsQueued: number;
  jobsWanted: number;
}): number {
  if (input.capacity <= 0) return 0;
  const usable = usableQueueSlots(input.capacity, input.reserve);
  const room = Math.max(0, usable - input.jobQueued - input.newsQueued);
  const shortfall = Math.max(0, input.jobsWanted - room);
  return Math.min(input.newsQueued, shortfall);
}

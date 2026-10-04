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
  maxJobsPerDay: number;
  maxPerCycle?: number;
  emittedThisCycle?: number;
}): number {
  const usable = usableQueueSlots(input.capacity, input.reserve);
  const roomInQueue = Number.isFinite(usable) ? Math.max(0, usable - input.jobQueued - input.newsQueued) : Number.POSITIVE_INFINITY;
  const roomInDay = Math.max(0, input.maxJobsPerDay - input.jobsToday);
  const cycleCap = input.maxPerCycle ?? Number.POSITIVE_INFINITY;
  const roomInCycle = Math.max(0, cycleCap - (input.emittedThisCycle ?? 0));
  return Math.min(roomInQueue, roomInDay, roomInCycle);
}

export function newsSlotsToday(input: {
  capacity: number;
  reserve: number;
  jobQueued: number;
  newsQueued: number;
  newsToday: number;
  maxNewsPerDay: number;
}): number {
  const usable = usableQueueSlots(input.capacity, input.reserve);
  const roomInQueue = Number.isFinite(usable) ? Math.max(0, usable - input.jobQueued - input.newsQueued) : Number.POSITIVE_INFINITY;
  const newsCap = Math.max(0, input.maxNewsPerDay - input.newsToday);
  return Math.min(roomInQueue, newsCap);
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

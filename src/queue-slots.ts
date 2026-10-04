export function usableQueueSlots(capacity: number, reserve: number): number {
  return Math.max(0, capacity - reserve);
}

export function jobSlotsToday(input: {
  capacity: number;
  reserve: number;
  jobQueued: number;
  newsQueued: number;
  jobsToday: number;
  maxJobsPerDay: number;
}): number {
  const usable = usableQueueSlots(input.capacity, input.reserve);
  const roomInQueue = Math.max(0, usable - input.jobQueued - input.newsQueued);
  const roomInDay = Math.max(0, input.maxJobsPerDay - input.jobsToday);
  return Math.min(roomInQueue, roomInDay);
}

export function newsSlotsToday(input: {
  capacity: number;
  reserve: number;
  jobQueued: number;
  newsQueued: number;
  jobsToday: number;
  newsToday: number;
  maxNewsPerDay: number;
  maxXPostsPerDay: number;
}): number {
  const usable = usableQueueSlots(input.capacity, input.reserve);
  const roomInQueue = Math.max(0, usable - input.jobQueued - input.newsQueued);
  const roomInDay = Math.max(0, input.maxXPostsPerDay - input.jobsToday - input.newsToday);
  const newsCap = Math.max(0, input.maxNewsPerDay - input.newsToday);
  return Math.min(roomInQueue, roomInDay, newsCap);
}

export function newsToEvictForJobs(input: {
  capacity: number;
  reserve: number;
  jobQueued: number;
  newsQueued: number;
  jobsWanted: number;
}): number {
  const usable = usableQueueSlots(input.capacity, input.reserve);
  const room = Math.max(0, usable - input.jobQueued - input.newsQueued);
  const shortfall = Math.max(0, input.jobsWanted - room);
  return Math.min(input.newsQueued, shortfall);
}

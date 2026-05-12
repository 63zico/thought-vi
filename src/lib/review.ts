import type { Difficulty } from "@/types/card";

const minuteMs = 60 * 1000;

export function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * minuteMs).toISOString();
}

export function calculateNextReview(difficulty: Difficulty, reviewCount: number) {
  const count = Math.max(1, reviewCount);
  const intervals: Record<Difficulty, number[]> = {
    hard: [5, 30, 180, 1440, 2880, 4320],
    normal: [10, 60, 360, 1440, 4320, 10080],
    easy: [60, 360, 1440, 4320, 10080, 20160]
  };
  const bucket = intervals[difficulty];
  const minutes = bucket[Math.min(count - 1, bucket.length - 1)];

  return addMinutes(new Date(), minutes);
}

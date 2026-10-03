export interface TehranTimeInfo {
  iranianDayOfWeek: number; // 0 = Saturday (شنبه), 1 = Sunday ... 6 = Friday (جمعه)
  currentTimeStr: string;   // HH:mm:ss
  dayNameFa: string;
}

const IRANIAN_WEEKDAYS: Record<string, { day: number; nameFa: string }> = {
  Sat: { day: 0, nameFa: 'شنبه' },
  Sun: { day: 1, nameFa: 'یک‌شنبه' },
  Mon: { day: 2, nameFa: 'دوشنبه' },
  Tue: { day: 3, nameFa: 'سه‌شنبه' },
  Wed: { day: 4, nameFa: 'چهارشنبه' },
  Thu: { day: 5, nameFa: 'پنج‌شنبه' },
  Fri: { day: 6, nameFa: 'جمعه' },
};

export function getTehranTimeInfo(date: Date = new Date()): TehranTimeInfo {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tehran',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });

  const parts = fmt.formatToParts(date);
  const weekdayPart = parts.find(p => p.type === 'weekday')?.value || 'Sat';
  const hourPart = parts.find(p => p.type === 'hour')?.value.padStart(2, '0') || '00';
  const minutePart = parts.find(p => p.type === 'minute')?.value.padStart(2, '0') || '00';
  const secondPart = parts.find(p => p.type === 'second')?.value.padStart(2, '0') || '00';

  const weekdayInfo = IRANIAN_WEEKDAYS[weekdayPart] || { day: 0, nameFa: 'شنبه' };

  return {
    iranianDayOfWeek: weekdayInfo.day,
    currentTimeStr: `${hourPart}:${minutePart}:${secondPart}`,
    dayNameFa: weekdayInfo.nameFa,
  };
}

export interface SansTimeRecord {
  day_of_week?: number;
  dayOfWeek?: number;
  start_time?: string;
  startTime?: string;
  end_time?: string;
  endTime?: string;
}

/**
 * Checks whether a gym sans (session) is active at a given day of week and time.
 * Correctly handles overnight sessions (e.g. 14:30 to 05:00) that start before midnight
 * and continue past midnight into the next calendar day.
 */
export function isSansActiveAt(
  sans: SansTimeRecord,
  currentDayOfWeek: number,
  currentTimeStr: string,
): boolean {
  const day = sans.day_of_week ?? sans.dayOfWeek;
  if (day === undefined) return false;

  const rawStart = sans.start_time ?? sans.startTime;
  const rawEnd = sans.end_time ?? sans.endTime;
  if (!rawStart || !rawEnd) return false;

  const start = rawStart.length === 5 ? `${rawStart}:00` : rawStart.slice(0, 8);
  const end = rawEnd.length === 5 ? `${rawEnd}:00` : rawEnd.slice(0, 8);
  const cur = currentTimeStr.length === 5 ? `${currentTimeStr}:00` : currentTimeStr.slice(0, 8);

  const prevDay = (currentDayOfWeek + 6) % 7;

  // Case 1: Session was scheduled for TODAY
  if (day === currentDayOfWeek) {
    if (start < end) {
      // Same-day session (e.g. 08:00:00 to 14:00:00)
      const isInclusiveEnd = end.startsWith('23:59');
      return isInclusiveEnd ? (cur >= start && cur <= end) : (cur >= start && cur < end);
    } else {
      // Overnight session started today (e.g. 14:30:00 to 05:00:00)
      // Active from start_time until midnight
      return cur >= start;
    }
  }

  // Case 2: Session was scheduled for YESTERDAY
  if (day === prevDay) {
    if (start > end) {
      // Overnight session started yesterday afternoon, continuing today until end_time
      return cur < end;
    }
  }

  return false;
}

/**
 * Converts a weekly session into continuous minute intervals in [0, 10080)
 * (7 days * 1440 minutes/day). Handles overnight shifts and Friday-to-Saturday wrap-around.
 */
export function getSessionWeeklyIntervals(
  dayOfWeek: number,
  startTime: string,
  endTime: string,
): Array<[number, number]> {
  const parseMin = (t: string) => {
    const parts = t.split(':').map(Number);
    return parts[0] * 60 + parts[1];
  };
  const sMin = parseMin(startTime);
  const eMin = parseMin(endTime);

  if (sMin < eMin) {
    // Same-day session
    const start = dayOfWeek * 1440 + sMin;
    const end = dayOfWeek * 1440 + eMin;
    return [[start, end]];
  } else {
    // Overnight session (crosses midnight)
    const start = dayOfWeek * 1440 + sMin;
    const endNormal = (dayOfWeek + 1) * 1440 + eMin;
    if (dayOfWeek < 6) {
      return [[start, endNormal]];
    } else {
      // Wraps around Friday (day 6) into Saturday (day 0)
      return [
        [start, 7 * 1440],
        [0, eMin],
      ];
    }
  }
}

/**
 * Checks whether two weekly sessions have any overlapping time windows.
 */
export function doSessionsOverlap(
  s1: { dayOfWeek: number; startTime: string; endTime: string },
  s2: { dayOfWeek: number; startTime: string; endTime: string },
): boolean {
  const intervals1 = getSessionWeeklyIntervals(s1.dayOfWeek, s1.startTime, s1.endTime);
  const intervals2 = getSessionWeeklyIntervals(s2.dayOfWeek, s2.startTime, s2.endTime);

  for (const [start1, end1] of intervals1) {
    for (const [start2, end2] of intervals2) {
      if (Math.max(start1, start2) < Math.min(end1, end2)) {
        return true;
      }
    }
  }
  return false;
}


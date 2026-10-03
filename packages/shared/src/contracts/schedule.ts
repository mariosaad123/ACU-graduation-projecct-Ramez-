import * as z from 'zod/mini';

/** The faculty's time zone: schedules are written and read in Cairo time, whatever the device. */
export const SCHEDULE_TIME_ZONE = 'Africa/Cairo';
export const SCHEDULE_MAX_SLOTS = 21;

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** One weekly window when students may write: day 0 is Sunday, times are "HH:MM", same day. */
export const scheduleSlotSchema = z
  .object({
    day: z.int().check(z.gte(0), z.lte(6)),
    start: z.string().check(z.regex(TIME)),
    end: z.string().check(z.regex(TIME)),
  })
  .check(
    z.refine((slot) => slot.start < slot.end, { message: 'A window must end after it starts' }),
  );
export type ScheduleSlot = z.infer<typeof scheduleSlotSchema>;

/** When set, the chat opens to students inside these windows only. */
export const chatScheduleSchema = z.object({
  slots: z.array(scheduleSlotSchema).check(z.minLength(1), z.maxLength(SCHEDULE_MAX_SLOTS)),
});
export type ChatSchedule = z.infer<typeof chatScheduleSchema>;

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

const cairoParts = new Intl.DateTimeFormat('en-US', {
  timeZone: SCHEDULE_TIME_ZONE,
  weekday: 'short',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

interface Wall {
  year: number;
  month: number;
  day: number;
  weekday: number;
  minutes: number;
}

/** The wall-clock date and time in Cairo at an instant. */
function wallTime(at: Date): Wall {
  const parts = Object.fromEntries(cairoParts.formatToParts(at).map((p) => [p.type, p.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    weekday: WEEKDAYS[parts.weekday ?? 'Sun'] ?? 0,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

const toMinutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

/** True when the instant falls inside one of the windows, in Cairo time. */
export function isWithinSchedule(schedule: ChatSchedule, at: Date): boolean {
  const now = wallTime(at);
  return schedule.slots.some(
    (slot) =>
      slot.day === now.weekday &&
      toMinutes(slot.start) <= now.minutes &&
      now.minutes < toMinutes(slot.end),
  );
}

/**
 * The instant a Cairo wall-clock time happens. Egypt's offset changes with daylight saving, so the
 * offset is read at a first guess and the guess corrected once.
 */
function instantOf(year: number, month: number, day: number, minutes: number): Date {
  const naive = Date.UTC(year, month - 1, day, Math.floor(minutes / 60), minutes % 60);
  let guess = naive;
  for (let pass = 0; pass < 2; pass += 1) {
    const wall = wallTime(new Date(guess));
    const wallUtc = Date.UTC(wall.year, wall.month - 1, wall.day, 0, wall.minutes);
    guess += naive - wallUtc;
  }
  return new Date(guess);
}

/**
 * The next time the chat opens or closes under the schedule, within a week, or null when the
 * windows cover nothing (which validation prevents).
 */
export function nextScheduleChange(
  schedule: ChatSchedule,
  at: Date,
): { at: Date; opens: boolean } | null {
  const open = isWithinSchedule(schedule, at);
  const today = wallTime(at);
  for (let offset = 0; offset <= 7; offset += 1) {
    const date = new Date(Date.UTC(today.year, today.month - 1, today.day + offset));
    const weekday = (today.weekday + offset) % 7;
    const edges = schedule.slots
      .filter((slot) => slot.day === weekday)
      .flatMap((slot) => [toMinutes(open ? slot.end : slot.start)])
      .sort((a, b) => a - b);
    for (const minutes of edges) {
      const instant = instantOf(
        date.getUTCFullYear(),
        date.getUTCMonth() + 1,
        date.getUTCDate(),
        minutes,
      );
      // An edge where another window carries straight on is not a change.
      if (instant > at && isWithinSchedule(schedule, instant) !== open) {
        return { at: instant, opens: !open };
      }
    }
  }
  return null;
}

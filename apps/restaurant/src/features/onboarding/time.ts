import type { LocalTime } from '@hungerly/types';
import { formatLocalTime, parseLocalTime } from '@hungerly/utils';

/** Opening hours move in half-hour steps; finer times are rare and slow to enter. */
const TIME_STEP_MINUTES = 30;

/** Moves a time by `steps` half hours, wrapping around midnight. */
export function shiftTime(value: LocalTime, steps: number): LocalTime {
  return formatLocalTime(parseLocalTime(value) + steps * TIME_STEP_MINUTES);
}

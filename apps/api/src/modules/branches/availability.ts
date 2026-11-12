import { and, eq, gte } from 'drizzle-orm';

import type { Availability } from '@hungerly/api-client';
import type { DayOfWeek } from '@hungerly/types';
import { evaluateAvailability } from '@hungerly/utils';

import type { Db } from '../../db/client';
import { branchClosures, branchHours, type branches } from '../../db/schema';
import { addDays, iso, istDate } from '../../lib/time';

type BranchRow = typeof branches.$inferSelect;

/**
 * Authoritative availability for one branch at `now`, from the database. Used by the
 * availability endpoint, the branch DTO and — inside the order transaction — by order
 * placement, so an order is never accepted after closing even if the app thinks it is open.
 */
export async function loadAvailability(db: Db, branch: BranchRow, now: Date): Promise<Availability> {
  const [sessions, closures] = await Promise.all([
    db
      .select({ dayOfWeek: branchHours.dayOfWeek, opensAt: branchHours.opensAt, closesAt: branchHours.closesAt })
      .from(branchHours)
      .where(eq(branchHours.branchId, branch.id)),
    db
      .select({ date: branchClosures.date })
      .from(branchClosures)
      .where(and(eq(branchClosures.branchId, branch.id), gte(branchClosures.date, addDays(istDate(now), -1)))),
  ]);
  const result = evaluateAvailability(
    {
      status: branch.status,
      isAcceptingOrders: branch.isAcceptingOrders,
      pausedUntil: branch.pausedUntil,
      sessions: sessions.map((s) => ({ ...s, dayOfWeek: s.dayOfWeek as DayOfWeek })),
      closedDates: closures.map((c) => c.date),
    },
    now,
  );
  return {
    state: result.state,
    acceptingOrders: result.acceptingOrders,
    reason: result.reason,
    closesAt: iso(result.closesAt),
    nextOpenAt: iso(result.nextOpenAt),
    pausedUntil: branch.pausedUntil && branch.pausedUntil.getTime() > now.getTime() ? branch.pausedUntil.toISOString() : null,
    evaluatedAt: now.toISOString(),
    timezone: branch.timezone,
  };
}

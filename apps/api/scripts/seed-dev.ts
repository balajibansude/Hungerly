/**
 * Development seed data for one owner — clearly labelled, never for production.
 *
 *   pnpm --filter @hungerly/api seed:dev -- --phone +919876543210 [--activate-for-dev]
 *
 * What it does, for the owner signed in with that phone number:
 * - finds their branches; with no *active* branch it explains what to do, or — only with
 *   `--activate-for-dev` and NODE_ENV=development — approves their first branch directly
 *   (bypassing the admin review that real branches must pass) and prints a warning;
 * - adds a small sample menu to each active branch whose menu is empty;
 * - places sample orders through the real `placeOrder` service (so availability, pricing
 *   and the state machine apply): a few delivered in the past days (which posts real
 *   ledger rows through `markDelivered`), and, if the branch is open now, a few live ones;
 * - adds a few reviews on delivered orders.
 *
 * Every order, ledger row and review it creates has `is_dev_fixture = true`, and the app
 * shows that figures include development data. Refuses to run when NODE_ENV=production.
 */
import { and, eq, sql } from 'drizzle-orm';

import type { DayOfWeek } from '@hungerly/types';
import { evaluateAvailability } from '@hungerly/utils';

import { loadConfig } from '../src/config';
import { connectPostgres, type Db } from '../src/db/client';
import {
  branchClosures,
  branchHours,
  branches,
  businesses,
  menuCategories,
  menuItems,
  reviews,
  users,
} from '../src/db/schema';
import { audit } from '../src/lib/audit';
import {
  acceptOrder,
  markDelivered,
  markPickedUp,
  markReady,
  placeOrder,
} from '../src/modules/orders/service';

const config = loadConfig();
if (config.NODE_ENV === 'production') {
  console.error('seed:dev refuses to run with NODE_ENV=production.');
  process.exit(1);
}

const args = process.argv.slice(2);
const phone = args[args.indexOf('--phone') + 1];
const activate = args.includes('--activate-for-dev');
if (!args.includes('--phone') || !phone || !/^\+91[6-9]\d{9}$/.test(phone)) {
  console.error('Usage: seed:dev -- --phone +91XXXXXXXXXX [--activate-for-dev]');
  process.exit(1);
}

const SAMPLE_MENU: {
  category: string;
  items: {
    name: string;
    priceMinor: number;
    foodType: 'veg' | 'non_veg' | 'egg' | 'jain';
    description: string;
  }[];
}[] = [
  {
    category: 'Starters',
    items: [
      {
        name: 'Paneer Tikka',
        priceMinor: 24_900,
        foodType: 'veg',
        description: 'Char-grilled cottage cheese, mint chutney',
      },
      {
        name: 'Chicken 65',
        priceMinor: 27_900,
        foodType: 'non_veg',
        description: 'Spicy fried chicken, curry leaves',
      },
    ],
  },
  {
    category: 'Mains',
    items: [
      {
        name: 'Jain Dal Tadka',
        priceMinor: 18_900,
        foodType: 'jain',
        description: 'No onion, no garlic, no root vegetables',
      },
      {
        name: 'Veg Biryani',
        priceMinor: 22_900,
        foodType: 'veg',
        description: 'Basmati rice, seasonal vegetables',
      },
      {
        name: 'Egg Curry',
        priceMinor: 19_900,
        foodType: 'egg',
        description: 'Boiled eggs in onion-tomato gravy',
      },
    ],
  },
];

const CUSTOMERS = ['Asha Rao', 'Vikram Singh', 'Meera Iyer', 'Rahul Das', 'Fatima Khan'];
const REVIEW_TEXTS: [number, string | null][] = [
  [5, 'Loved the biryani, packed well.'],
  [4, 'Tasty, slightly late.'],
  [2, 'Paneer was cold when it arrived.'],
  [5, null],
];

async function ensureActive(db: Db, branch: typeof branches.$inferSelect, now: Date) {
  if (branch.status === 'active') return branch;
  if (!activate) return null;
  if (config.NODE_ENV !== 'development') {
    console.error('--activate-for-dev only works with NODE_ENV=development.');
    process.exit(1);
  }
  console.warn(
    '\n!!! DEVELOPMENT ONLY: approving branch',
    branch.name,
    'without admin review. !!!\n',
  );
  const [updated] = await db
    .update(branches)
    .set({
      status: 'active',
      isAcceptingOrders: true,
      approvedAt: now,
      commissionBps: branch.commissionBps ?? config.DEFAULT_COMMISSION_BPS,
      updatedAt: now,
    })
    .where(eq(branches.id, branch.id))
    .returning();
  const [hasHours] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(branchHours)
    .where(eq(branchHours.branchId, branch.id));
  if ((hasHours?.n ?? 0) === 0) {
    await db
      .insert(branchHours)
      .values(
        [0, 1, 2, 3, 4, 5, 6].map((d) => ({
          branchId: branch.id,
          dayOfWeek: d,
          opensAt: '08:00',
          closesAt: '23:00',
        })),
      );
  }
  await audit(db, {
    actorUserId: null,
    actorType: 'system',
    action: 'branch.dev_activated',
    entityType: 'branch',
    entityId: branch.id,
    branchId: branch.id,
    metadata: { script: 'seed-dev' },
  });
  return updated!;
}

async function ensureMenu(db: Db, branchId: string) {
  const existing = await db
    .select({ id: menuItems.id })
    .from(menuItems)
    .where(
      and(
        eq(menuItems.branchId, branchId),
        eq(menuItems.isArchived, false),
        eq(menuItems.isAvailable, true),
      ),
    );
  if (existing.length > 0) return existing.map((i) => i.id);
  const ids: string[] = [];
  for (const [index, section] of SAMPLE_MENU.entries()) {
    const [category] = await db
      .insert(menuCategories)
      .values({ branchId, name: section.category, sortOrder: index })
      .returning();
    for (const [i, item] of section.items.entries()) {
      const [row] = await db
        .insert(menuItems)
        .values({ branchId, categoryId: category!.id, sortOrder: index * 10 + i, ...item })
        .returning();
      ids.push(row!.id);
    }
  }
  console.warn(`  added a sample menu (${ids.length} items)`);
  return ids;
}

/** Past instants (newest first) when the branch's schedule was open, for back-dated orders. */
async function pastOpenInstants(
  db: Db,
  branch: typeof branches.$inferSelect,
  now: Date,
  count: number,
) {
  const sessions = await db.select().from(branchHours).where(eq(branchHours.branchId, branch.id));
  const closures = await db
    .select({ date: branchClosures.date })
    .from(branchClosures)
    .where(eq(branchClosures.branchId, branch.id));
  const found: Date[] = [];
  for (
    let t = now.getTime() - 3 * 3_600_000;
    t > now.getTime() - 6 * 86_400_000 && found.length < count;
    t -= 5 * 3_600_000
  ) {
    const at = new Date(t);
    const result = evaluateAvailability(
      {
        status: 'active',
        isAcceptingOrders: true,
        pausedUntil: null,
        sessions: sessions.map((s) => ({
          dayOfWeek: s.dayOfWeek as DayOfWeek,
          opensAt: s.opensAt,
          closesAt: s.closesAt,
        })),
        closedDates: closures.map((c) => c.date),
      },
      at,
    );
    if (result.acceptingOrders && result.closesAt && result.closesAt.getTime() - t > 60 * 60_000)
      found.push(at);
  }
  return found;
}

const database = connectPostgres(config.DATABASE_URL);
const { db } = database;
try {
  const [user] = await db.select().from(users).where(eq(users.phoneE164, phone)).limit(1);
  if (!user)
    throw new Error(`No user with phone ${phone}. Sign in once in the restaurant app first.`);
  const [business] = await db
    .select()
    .from(businesses)
    .where(eq(businesses.ownerUserId, user.id))
    .limit(1);
  if (!business)
    throw new Error(
      'This owner has no business yet. Complete the first onboarding step in the app.',
    );
  const now = new Date();
  const all = await db.select().from(branches).where(eq(branches.businessId, business.id));
  const active = [];
  for (const branch of all) {
    const ready = await ensureActive(db, branch, now);
    if (ready) active.push(ready);
  }
  if (active.length === 0) {
    console.warn(
      'No active branch. Finish onboarding in the app and have an administrator approve the branch\n' +
        '(POST /api/v1/admin/branches/:id/approve), or re-run with --activate-for-dev (development only).',
    );
    process.exit(0);
  }

  for (const branch of active) {
    console.warn(`Seeding ${branch.name} (${branch.id})`);
    const itemIds = await ensureMenu(db, branch.id);
    const pick = (i: number) => [
      { menuItemId: itemIds[i % itemIds.length]!, quantity: 1 + (i % 2) },
      { menuItemId: itemIds[(i + 2) % itemIds.length]!, quantity: 1 },
    ];

    // Past delivered orders: each step runs with a clock at that moment in the past.
    const instants = await pastOpenInstants(db, branch, now, 5);
    let delivered = 0;
    for (const [i, at] of instants.entries()) {
      const at2 = (minutes: number) => ({
        config,
        clock: () => new Date(at.getTime() + minutes * 60_000),
      });
      let order;
      try {
        order = await placeOrder(db, at2(0), {
          branchId: branch.id,
          customerName: CUSTOMERS[i % CUSTOMERS.length]!,
          customerPhoneE164: `+9198765${String(10_000 + i).slice(-5)}`,
          deliveryLocality: branch.locality,
          deliveryDistanceMeters: 1200 + i * 400,
          paymentMethod: i % 2 ? 'cod' : 'online',
          items: pick(i),
          charges: { deliveryFeeMinor: 3_000, platformFeeMinor: 500 },
          isDevFixture: true,
        });
      } catch (error) {
        console.warn(`  skipped a past order: ${(error as Error).message}`);
        continue;
      }
      const accepted = await acceptOrder(db, at2(1), branch.id, order.id, {
        prepMinutes: 20,
        expectedVersion: order.version,
        actorUserId: user.id,
      });
      await markReady(db, at2(20), branch.id, order.id, {
        expectedVersion: accepted.version,
        actorUserId: user.id,
      });
      await markPickedUp(db, at2(25), order.id, { riderFirstName: 'Ravi' });
      await markDelivered(db, at2(45), order.id);
      delivered += 1;
      const review = REVIEW_TEXTS[i];
      if (review) {
        await db
          .insert(reviews)
          .values({
            branchId: branch.id,
            orderId: order.id,
            rating: review[0],
            comment: review[1],
            customerDisplayName: CUSTOMERS[i % CUSTOMERS.length]!.split(' ')[0]!,
            isDevFixture: true,
            createdAt: new Date(at.getTime() + 2 * 3_600_000),
          })
          .onConflictDoNothing();
      }
    }
    console.warn(`  ${delivered} delivered orders (with ledger rows) in the past days`);

    // Live orders only if the branch is genuinely open right now.
    let live = 0;
    for (let i = 0; i < 3; i += 1) {
      try {
        await placeOrder(
          db,
          { config, clock: () => new Date() },
          {
            branchId: branch.id,
            customerName: CUSTOMERS[(i + 2) % CUSTOMERS.length]!,
            deliveryLocality: branch.locality,
            paymentMethod: 'online',
            instructions: i === 0 ? 'Less spicy please' : null,
            items: pick(i + 1),
            isDevFixture: true,
          },
        );
        live += 1;
      } catch (error) {
        console.warn(`  no live orders: ${(error as Error).message}`);
        break;
      }
    }
    if (live) console.warn(`  ${live} new orders waiting on the board`);
  }
  console.warn('Done. All seeded rows are marked is_dev_fixture = true.');
} finally {
  await database.close();
}

import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import {
  AvailabilitySchema,
  BranchDetailSchema,
  BranchSchema,
  BusinessSchema,
  ClosureSchema,
  CreateBranchSchema,
  CreateClosureSchema,
  HoursResponseSchema,
  IdSchema,
  OkSchema,
  paths,
  ReplaceHoursSchema,
  UpdateBranchSchema,
  UpdateBusinessSchema,
  UpdateIntakeSchema,
  UpsertBusinessSchema,
  type UpdateBranch,
} from '@hungerly/api-client';
import type { DayOfWeek } from '@hungerly/types';
import { validateWeeklyHours, type WeeklyHoursIssue } from '@hungerly/utils';

import { requireBusiness, requireOwnedBranch, requirePartner } from '../../auth/guard';
import { branchClosures, branchHours, branches, businesses } from '../../db/schema';
import { audit } from '../../lib/audit';
import { conflict, notFound, unprocessable, validationError } from '../../lib/errors';
import { istDate } from '../../lib/time';
import { loadAvailability } from './availability';
import { loadSessions, onboardingChecklist, toBranchDetail, toBranchDto, type BranchRow } from './service';

const BranchParams = z.object({ branchId: IdSchema });
const ClosureParams = z.object({ branchId: IdSchema, closureId: IdSchema });

/**
 * Which fields an owner may change, by branch status.
 * - draft / rejected: everything (the branch is not live; changes are reviewed on submit).
 * - pending_review / active / suspended: operational fields only. Name, address and map
 *   location identify the kitchen that was reviewed and licensed, so changing them goes
 *   through Swaadone support (re-verification), not a self-service edit.
 * - closed: nothing.
 */
const IDENTITY_FIELDS = ['name', 'address', 'location'] as const satisfies readonly (keyof UpdateBranch)[];

function assertEditable(branch: BranchRow, input: UpdateBranch) {
  if (branch.status === 'closed') {
    throw unprocessable('branch.invalid_transition', 'This branch is closed and can no longer be edited.');
  }
  if (branch.status === 'draft' || branch.status === 'rejected') return;
  const locked = IDENTITY_FIELDS.filter((field) => input[field] !== undefined);
  if (locked.length > 0) {
    const errors = Object.fromEntries(
      locked.map((f) => [f, ['Contact Swaadone support to change this after submitting for review.']]),
    );
    throw unprocessable(
      'branch.invalid_transition',
      'The name, address and map location can only be changed through Swaadone support after submission.',
      errors,
    );
  }
}

const HOURS_MESSAGES: Record<WeeklyHoursIssue['code'], string> = {
  no_open_days: 'Add at least one opening session.',
  invalid_time: 'Use valid times (HH:MM).',
  same_time: 'A session must open and close at different times.',
  overlap: 'Two sessions overlap. Leave a gap (break) between them.',
};
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function toBusinessDto(row: typeof businesses.$inferSelect) {
  return {
    id: row.id,
    displayName: row.displayName,
    legalName: row.legalName,
    entityType: row.entityType,
    gstin: row.gstin,
  };
}

export async function branchRoutes(api: FastifyInstance) {
  const app = api.withTypeProvider<ZodTypeProvider>();
  const now = () => app.deps.clock();

  // --- Business -------------------------------------------------------------------
  app.get(paths.partner.business, { schema: { response: { 200: BusinessSchema } } }, async (req) => {
    const auth = await requireBusiness(req);
    const [row] = await app.deps.db.select().from(businesses).where(eq(businesses.id, auth.businessId)).limit(1);
    if (!row) throw notFound('Create your business profile first.');
    return toBusinessDto(row);
  });

  // PUT creates or replaces; PATCH only edits an existing business.
  app.patch(paths.partner.business, { schema: { body: UpdateBusinessSchema, response: { 200: BusinessSchema } } }, async (req) => {
    const auth = await requireBusiness(req);
    const { db } = app.deps;
    const [row] = await db
      .update(businesses)
      .set({ ...req.body, updatedAt: now() })
      .where(and(eq(businesses.id, auth.businessId), eq(businesses.ownerUserId, auth.userId)))
      .returning();
    if (!row) throw notFound('Create your business profile first.');
    await audit(db, {
      actorUserId: auth.userId,
      actorType: 'owner',
      action: 'business.updated',
      entityType: 'business',
      entityId: row.id,
      metadata: { fields: Object.keys(req.body) },
      ip: req.ip,
    });
    return toBusinessDto(row);
  });

  app.put(paths.partner.business, { schema: { body: UpsertBusinessSchema, response: { 200: BusinessSchema } } }, async (req) => {
    const auth = await requirePartner(req);
    const { db } = app.deps;
    const values = { ...req.body, updatedAt: now() };
    const [existing] = await db.select().from(businesses).where(eq(businesses.ownerUserId, auth.userId)).limit(1);
    const [row] = existing
      ? await db.update(businesses).set(values).where(eq(businesses.id, existing.id)).returning()
      : await db.insert(businesses).values({ ...req.body, ownerUserId: auth.userId }).returning();
    await audit(db, {
      actorUserId: auth.userId,
      actorType: 'owner',
      action: existing ? 'business.updated' : 'business.created',
      entityType: 'business',
      entityId: row!.id,
      metadata: { fields: Object.keys(req.body) },
      ip: req.ip,
    });
    return toBusinessDto(row!);
  });

  // --- Branches --------------------------------------------------------------------
  app.get(paths.partner.branches, { schema: { response: { 200: z.object({ items: z.array(BranchSchema) }) } } }, async (req) => {
    const auth = await requireBusiness(req);
    const rows = await app.deps.db
      .select()
      .from(branches)
      .where(eq(branches.businessId, auth.businessId))
      .orderBy(branches.createdAt);
    return { items: await Promise.all(rows.map((b) => toBranchDto(app.deps.db, b, now()))) };
  });

  app.post(paths.partner.branches, { schema: { body: CreateBranchSchema, response: { 201: BranchDetailSchema } } }, async (req, reply) => {
    const auth = await requireBusiness(req);
    const { db } = app.deps;
    const [branch] = await db.insert(branches).values({ businessId: auth.businessId, name: req.body.name }).returning();
    await audit(db, {
      actorUserId: auth.userId,
      actorType: 'owner',
      action: 'branch.created',
      entityType: 'branch',
      entityId: branch!.id,
      branchId: branch!.id,
      ip: req.ip,
    });
    return reply.status(201).send(await toBranchDetail(db, branch!, now()));
  });

  app.get(paths.partner.branch(':branchId'), { schema: { params: BranchParams, response: { 200: BranchDetailSchema } } }, async (req) => {
    const { branch } = await requireOwnedBranch(req, req.params.branchId);
    return toBranchDetail(app.deps.db, branch, now());
  });

  app.patch(
    paths.partner.branch(':branchId'),
    { schema: { params: BranchParams, body: UpdateBranchSchema, response: { 200: BranchDetailSchema } } },
    async (req) => {
      const { auth, branch } = await requireOwnedBranch(req, req.params.branchId);
      const input = req.body;
      assertEditable(branch, input);
      if (input.location && (input.location.lat < 6 || input.location.lat > 38 || input.location.lng < 68 || input.location.lng > 98)) {
        throw validationError('The location must be in India.', { location: ['Pin a location in India.'] });
      }
      const set: Partial<typeof branches.$inferInsert> = { updatedAt: now() };
      if (input.name !== undefined) set.name = input.name;
      if (input.description !== undefined) set.description = input.description;
      if (input.cuisines !== undefined) set.cuisines = input.cuisines;
      if (input.foodType !== undefined) set.foodType = input.foodType;
      if (input.phoneE164 !== undefined) set.phoneE164 = input.phoneE164;
      if (input.email !== undefined) set.email = input.email?.trim().toLowerCase() ?? null;
      if (input.address !== undefined) {
        set.addressLine1 = input.address.line1;
        set.addressLine2 = input.address.line2;
        set.locality = input.address.locality;
        set.city = input.address.city;
        set.state = input.address.state;
        set.postalCode = input.address.postalCode;
      }
      if (input.location !== undefined) {
        set.latitude = input.location.lat;
        set.longitude = input.location.lng;
        set.locationSource = input.location.source;
      }
      if (input.avgPrepMinutes !== undefined) set.avgPrepMinutes = input.avgPrepMinutes;
      if (input.minimumOrderMinor !== undefined) set.minOrderMinor = input.minimumOrderMinor;
      if (input.packagingFeeMinor !== undefined) set.packagingFeeMinor = input.packagingFeeMinor;

      const { db } = app.deps;
      const [updated] = await db.update(branches).set(set).where(eq(branches.id, branch.id)).returning();
      await audit(db, {
        actorUserId: auth.userId,
        actorType: 'owner',
        action: 'branch.updated',
        entityType: 'branch',
        entityId: branch.id,
        branchId: branch.id,
        metadata: { fields: Object.keys(input) },
        ip: req.ip,
      });
      return toBranchDetail(db, updated!, now());
    },
  );

  app.post(paths.partner.branchSubmit(':branchId'), { schema: { params: BranchParams, response: { 200: BranchDetailSchema } } }, async (req) => {
    const { auth, branch } = await requireOwnedBranch(req, req.params.branchId);
    const { db } = app.deps;
    if (branch.status !== 'draft' && branch.status !== 'rejected') {
      throw unprocessable('branch.invalid_transition', 'Only a draft or rejected branch can be submitted for review.');
    }
    const checklist = await onboardingChecklist(db, branch, now());
    if (!checklist.canSubmit) {
      const missing = checklist.steps.filter((s) => !s.complete);
      throw unprocessable(
        'branch.onboarding_incomplete',
        `Finish these steps first: ${missing.map((s) => s.step).join(', ')}.`,
        Object.fromEntries(missing.map((s) => [s.step, [s.hint ?? 'Incomplete']])),
      );
    }
    const [updated] = await db
      .update(branches)
      .set({ status: 'pending_review', statusReason: null, submittedAt: now(), updatedAt: now() })
      .where(and(eq(branches.id, branch.id), eq(branches.status, branch.status)))
      .returning();
    if (!updated) throw conflict('conflict', 'The branch changed meanwhile. Reload and try again.');
    await audit(db, {
      actorUserId: auth.userId,
      actorType: 'owner',
      action: 'branch.submitted',
      entityType: 'branch',
      entityId: branch.id,
      branchId: branch.id,
      metadata: { from: branch.status },
      ip: req.ip,
    });
    return toBranchDetail(db, updated, now());
  });

  // --- Hours and closures ---------------------------------------------------------------
  async function hoursResponse(branch: BranchRow) {
    const { db } = app.deps;
    const [sessions, closures, availability] = await Promise.all([
      loadSessions(db, branch.id),
      db
        .select()
        .from(branchClosures)
        .where(eq(branchClosures.branchId, branch.id))
        .orderBy(branchClosures.date),
      loadAvailability(db, branch, now()),
    ]);
    return {
      sessions,
      closures: closures
        .filter((c) => c.date >= istDate(now()))
        .map((c) => ({ id: c.id, date: c.date, note: c.note })),
      availability,
    };
  }

  app.get(paths.partner.hours(':branchId'), { schema: { params: BranchParams, response: { 200: HoursResponseSchema } } }, async (req) => {
    const { branch } = await requireOwnedBranch(req, req.params.branchId);
    return hoursResponse(branch);
  });

  app.put(
    paths.partner.hours(':branchId'),
    { schema: { params: BranchParams, body: ReplaceHoursSchema, response: { 200: HoursResponseSchema } } },
    async (req) => {
      const { auth, branch } = await requireOwnedBranch(req, req.params.branchId);
      if (branch.status === 'closed') throw unprocessable('branch.invalid_transition', 'This branch is closed.');
      const sessions = req.body.sessions.map((s) => ({ ...s, dayOfWeek: s.dayOfWeek as DayOfWeek }));
      const issue = validateWeeklyHours(sessions);
      if (issue) {
        const day = 'dayOfWeek' in issue ? `${DAY_NAMES[issue.dayOfWeek]}: ` : '';
        throw validationError(`${day}${HOURS_MESSAGES[issue.code]}`, { sessions: [`${day}${HOURS_MESSAGES[issue.code]}`] });
      }
      const { db } = app.deps;
      await db.transaction(async (tx) => {
        await tx.delete(branchHours).where(eq(branchHours.branchId, branch.id));
        await tx.insert(branchHours).values(sessions.map((s) => ({ ...s, branchId: branch.id })));
        await audit(tx, {
          actorUserId: auth.userId,
          actorType: 'owner',
          action: 'branch.hours_replaced',
          entityType: 'branch',
          entityId: branch.id,
          branchId: branch.id,
          metadata: { sessions: sessions.length },
          ip: req.ip,
        });
      });
      return hoursResponse(branch);
    },
  );

  app.get(
    paths.partner.closures(':branchId'),
    { schema: { params: BranchParams, response: { 200: z.object({ items: z.array(ClosureSchema) }) } } },
    async (req) => {
      const { branch } = await requireOwnedBranch(req, req.params.branchId);
      return { items: (await hoursResponse(branch)).closures };
    },
  );

  app.post(
    paths.partner.closures(':branchId'),
    { schema: { params: BranchParams, body: CreateClosureSchema, response: { 201: ClosureSchema } } },
    async (req, reply) => {
      const { auth, branch } = await requireOwnedBranch(req, req.params.branchId);
      if (req.body.date < istDate(now())) {
        throw validationError('Choose today or a future date.', { date: ['Choose today or a future date.'] });
      }
      const { db } = app.deps;
      const [row] = await db
        .insert(branchClosures)
        .values({ branchId: branch.id, date: req.body.date, note: req.body.note })
        .onConflictDoNothing()
        .returning();
      if (!row) throw conflict('conflict', 'This date is already marked closed.');
      await audit(db, {
        actorUserId: auth.userId,
        actorType: 'owner',
        action: 'branch.closure_added',
        entityType: 'branch',
        entityId: branch.id,
        branchId: branch.id,
        metadata: { date: row.date },
        ip: req.ip,
      });
      return reply.status(201).send({ id: row.id, date: row.date, note: row.note });
    },
  );

  app.delete(
    paths.partner.closure(':branchId', ':closureId'),
    { schema: { params: ClosureParams, response: { 200: OkSchema } } },
    async (req) => {
      const { auth, branch } = await requireOwnedBranch(req, req.params.branchId);
      const { db } = app.deps;
      const [row] = await db
        .delete(branchClosures)
        .where(and(eq(branchClosures.id, req.params.closureId), eq(branchClosures.branchId, branch.id)))
        .returning();
      if (!row) throw notFound('Closure not found.');
      await audit(db, {
        actorUserId: auth.userId,
        actorType: 'owner',
        action: 'branch.closure_removed',
        entityType: 'branch',
        entityId: branch.id,
        branchId: branch.id,
        metadata: { date: row.date },
        ip: req.ip,
      });
      return { ok: true as const };
    },
  );

  // --- Availability and intake -----------------------------------------------------------
  app.get(paths.partner.availability(':branchId'), { schema: { params: BranchParams, response: { 200: AvailabilitySchema } } }, async (req) => {
    const { branch } = await requireOwnedBranch(req, req.params.branchId);
    return loadAvailability(app.deps.db, branch, now());
  });

  // PUT is an alias of PATCH for app compatibility; omitted fields are left unchanged.
  app.route({
    method: ['PATCH', 'PUT'],
    url: paths.partner.intake(':branchId'),
    schema: { params: BranchParams, body: UpdateIntakeSchema, response: { 200: AvailabilitySchema } },
    handler: async (req) => {
      const { auth, branch } = await requireOwnedBranch(req, req.params.branchId);
      const { isAcceptingOrders, pauseMinutes, pauseReason } = req.body;
      const needsActive = isAcceptingOrders === true || (pauseMinutes !== undefined && pauseMinutes !== null);
      if (needsActive && branch.status !== 'active') {
        throw unprocessable('branch.not_active', 'This branch can take orders only after Swaadone approves it.');
      }
      const set: Partial<typeof branches.$inferInsert> = { updatedAt: now() };
      if (isAcceptingOrders !== undefined) set.isAcceptingOrders = isAcceptingOrders;
      if (pauseMinutes !== undefined) {
        set.pausedUntil = pauseMinutes === null ? null : new Date(now().getTime() + pauseMinutes * 60_000);
        set.pauseReason = pauseMinutes === null ? null : (pauseReason ?? null);
      }
      const { db } = app.deps;
      const [updated] = await db.update(branches).set(set).where(eq(branches.id, branch.id)).returning();
      await audit(db, {
        actorUserId: auth.userId,
        actorType: 'owner',
        action: 'branch.intake_changed',
        entityType: 'branch',
        entityId: branch.id,
        branchId: branch.id,
        metadata: { isAcceptingOrders, pauseMinutes },
        ip: req.ip,
      });
      return loadAvailability(db, updated!, now());
    },
  });
}

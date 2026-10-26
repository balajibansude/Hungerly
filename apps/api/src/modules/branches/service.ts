import { and, eq } from 'drizzle-orm';

import type { Branch, BranchDetail, HoursSession, OnboardingChecklist, OnboardingStep } from '@hungerly/api-client';

import type { Db } from '../../db/client';
import { branches, branchHours, businesses, declarationAcceptances, payoutAccounts } from '../../db/schema';
import { inr } from '../../lib/money';
import { iso } from '../../lib/time';
import { DECLARATION_VERSION } from '../documents/declaration';
import { currentByType, documentState, loadBranchDocuments } from '../documents/requirements';
import { loadAvailability } from './availability';

export type BranchRow = typeof branches.$inferSelect;

export async function loadSessions(db: Db, branchId: string): Promise<HoursSession[]> {
  const rows = await db
    .select({ dayOfWeek: branchHours.dayOfWeek, opensAt: branchHours.opensAt, closesAt: branchHours.closesAt })
    .from(branchHours)
    .where(eq(branchHours.branchId, branchId));
  return rows.sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.opensAt.localeCompare(b.opensAt));
}

export async function toBranchDto(db: Db, branch: BranchRow, now: Date): Promise<Branch> {
  const [hours, availability] = await Promise.all([loadSessions(db, branch.id), loadAvailability(db, branch, now)]);
  const hasAddress = branch.addressLine1 && branch.locality && branch.city && branch.state && branch.postalCode;
  return {
    id: branch.id,
    businessId: branch.businessId,
    name: branch.name,
    description: branch.description,
    cuisines: branch.cuisines,
    foodType: branch.foodType,
    phoneE164: branch.phoneE164,
    email: branch.email,
    address: hasAddress
      ? {
          line1: branch.addressLine1!,
          line2: branch.addressLine2,
          locality: branch.locality!,
          city: branch.city!,
          state: branch.state!,
          postalCode: branch.postalCode!,
        }
      : null,
    location:
      branch.latitude !== null && branch.longitude !== null && branch.locationSource
        ? { lat: branch.latitude, lng: branch.longitude, source: branch.locationSource }
        : null,
    timezone: branch.timezone,
    status: branch.status,
    statusReason: branch.statusReason,
    isAcceptingOrders: branch.isAcceptingOrders,
    avgPrepMinutes: branch.avgPrepMinutes,
    minimumOrder: inr(branch.minOrderMinor),
    packagingFee: inr(branch.packagingFeeMinor),
    commissionBps: branch.commissionBps,
    hours,
    availability,
    submittedAt: iso(branch.submittedAt),
    approvedAt: iso(branch.approvedAt),
    createdAt: branch.createdAt.toISOString(),
  };
}

interface ReadinessFacts {
  hasBusiness: boolean;
  hasHours: boolean;
  licenceState: ReturnType<typeof documentState>;
  licenceNumberValid: boolean;
  bankProofState: ReturnType<typeof documentState>;
  payoutStatus: (typeof payoutAccounts.$inferSelect)['status'] | null;
  declarationAccepted: boolean;
}

async function readinessFacts(db: Db, branch: BranchRow, now: Date): Promise<ReadinessFacts> {
  const [business] = await db.select({ id: businesses.id }).from(businesses).where(eq(businesses.id, branch.businessId)).limit(1);
  const [hours, docs, payout, declaration] = await Promise.all([
    loadSessions(db, branch.id),
    loadBranchDocuments(db, branch.id),
    db
      .select({ status: payoutAccounts.status })
      .from(payoutAccounts)
      .where(and(eq(payoutAccounts.branchId, branch.id), eq(payoutAccounts.isCurrent, true)))
      .limit(1),
    db
      .select({ id: declarationAcceptances.id })
      .from(declarationAcceptances)
      .where(and(eq(declarationAcceptances.branchId, branch.id), eq(declarationAcceptances.version, DECLARATION_VERSION)))
      .limit(1),
  ]);
  const current = currentByType(docs);
  const licence = current.get('fssai_license') ?? null;
  return {
    hasBusiness: !!business,
    hasHours: hours.length > 0,
    licenceState: documentState(licence, now),
    licenceNumberValid: !!licence?.documentNumber && /^\d{14}$/.test(licence.documentNumber),
    bankProofState: documentState(current.get('bank_proof') ?? null, now),
    payoutStatus: payout[0]?.status ?? null,
    declarationAccepted: declaration.length > 0,
  };
}

/** What the owner must still do before submitting, step by step. */
export async function onboardingChecklist(db: Db, branch: BranchRow, now: Date): Promise<OnboardingChecklist> {
  const f = await readinessFacts(db, branch, now);
  const step = (s: OnboardingStep, complete: boolean, hint: string) => ({ step: s, complete, hint: complete ? null : hint });
  const licenceOk = (f.licenceState === 'pending_review' || f.licenceState === 'approved') && f.licenceNumberValid;
  const bankOk =
    f.payoutStatus !== null &&
    f.payoutStatus !== 'failed' &&
    f.payoutStatus !== 'disabled' &&
    f.bankProofState !== 'not_submitted' &&
    f.bankProofState !== 'resubmission_required';
  const steps = [
    step('business', f.hasBusiness, 'Add your business details.'),
    step('details', branch.name.length >= 2 && branch.cuisines.length > 0, 'Add the restaurant name and cuisines.'),
    step('location', branch.latitude !== null && !!branch.addressLine1, 'Set the address and pin the location on the map.'),
    step('contact', !!branch.phoneE164, 'Add a phone number customers and riders can reach.'),
    step('hours', f.hasHours, 'Set your opening hours.'),
    step(
      'licence',
      licenceOk,
      f.licenceState === 'resubmission_required'
        ? 'Your FSSAI licence was not accepted. Upload a corrected one.'
        : f.licenceState === 'expired'
          ? 'Your FSSAI licence has expired. Upload the renewed one.'
          : 'Upload your FSSAI licence with its 14-digit number.',
    ),
    step(
      'bank',
      bankOk,
      f.payoutStatus === 'failed'
        ? 'Your bank account could not be verified. Add a different account.'
        : 'Add the bank account for payouts and upload a bank proof.',
    ),
    step('declaration', f.declarationAccepted, 'Read and accept the restaurant declaration.'),
  ];
  return {
    steps,
    canSubmit: steps.every((s) => s.complete),
    approvalBlockers: approvalBlockersFrom(f),
  };
}

function approvalBlockersFrom(f: ReadinessFacts): string[] {
  const blockers: string[] = [];
  if (f.licenceState !== 'approved') blockers.push('FSSAI licence is not approved yet.');
  if (!f.licenceNumberValid) blockers.push('FSSAI licence number is missing or invalid.');
  if (f.bankProofState !== 'approved') blockers.push('Bank proof is not approved yet.');
  if (f.payoutStatus !== 'verified') blockers.push('Payout bank account is not verified yet.');
  if (!f.declarationAccepted) blockers.push('The current restaurant declaration has not been accepted.');
  if (!f.hasHours) blockers.push('Opening hours are not set.');
  return blockers;
}

/** Everything that prevents an administrator from approving this branch. */
export async function approvalBlockers(db: Db, branch: BranchRow, now: Date): Promise<string[]> {
  return approvalBlockersFrom(await readinessFacts(db, branch, now));
}

export async function toBranchDetail(db: Db, branch: BranchRow, now: Date): Promise<BranchDetail> {
  const [dto, onboarding] = await Promise.all([toBranchDto(db, branch, now), onboardingChecklist(db, branch, now)]);
  return { branch: dto, onboarding };
}

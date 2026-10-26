import type { Declaration } from '@hungerly/api-client';

import { sha256Hex } from '../../lib/crypto';

/**
 * The restaurant declaration owners accept during onboarding (one acceptance per branch
 * per version). DRAFT wording: it must be reviewed by a qualified legal professional
 * familiar with Indian law before launch (docs/restaurant/DECLARATION.md). Changing any
 * clause requires a new `DECLARATION_VERSION`, which asks owners to accept again.
 */
export const DECLARATION_VERSION = '2026-10-draft-1';

const TITLE = 'Swaadone restaurant partner declaration';

const CLAUSES: { heading: string; body: string }[] = [
  {
    heading: 'Food safety and licences',
    body:
      'I am responsible for preparing, storing and packing food safely and hygienically at this branch, and for holding a valid FSSAI licence or registration and any other licence the law requires for this branch. I will keep them valid and tell Swaadone promptly if any licence is suspended, cancelled or expires.',
  },
  {
    heading: 'Vegetarian, non-vegetarian and Jain classification',
    body:
      'I will mark every menu item correctly as vegetarian, non-vegetarian, egg or Jain, and prepare it accordingly. A dish marked vegetarian will contain no meat, fish or egg; a dish marked Jain will follow the Jain preparation it claims. For example, if a customer orders a vegetarian biryani, they must receive a vegetarian biryani — never a non-vegetarian one.',
  },
  {
    heading: 'Ingredients and descriptions',
    body:
      'Item names, descriptions, photos, portion information and ingredients (including common allergens where I list them) will be accurate and not misleading, and will reflect how the dish is actually prepared.',
  },
  {
    heading: 'Pricing and charges',
    body:
      'Prices and packaging charges I set on Swaadone will be accurate and will comply with applicable law. I will not add charges at handoff that were not shown to the customer.',
  },
  {
    heading: 'Correct order handoff',
    body:
      'I will prepare the order the customer placed, with the right items and quantities, packed securely, and hand it to the assigned delivery partner against the correct order number.',
  },
  {
    heading: 'Complaints, refunds and quality issues',
    body:
      'I will cooperate with Swaadone on customer complaints about wrong, missing, unsafe or poor-quality food, including by providing information and evidence (such as photos, preparation records or packing details) when asked. Remedies such as refunds or re-delivery, and any amount recovered from my earnings for issues caused by my branch, follow Swaadone’s published partner policy.',
  },
  {
    heading: 'Compliance with law and platform terms',
    body:
      'I will comply with applicable laws, including food safety, consumer protection, tax and labour laws, and with the Swaadone partner terms as updated from time to time.',
  },
  {
    heading: 'Misrepresentation and violations',
    body:
      'I understand that misrepresenting food (including veg/non-veg/Jain status), repeated violations or a serious food-safety incident may lead to an investigation and to proportionate action under the partner terms, such as warnings, removal of items, recovery of refunds, temporary suspension or termination of this branch, in addition to any consequences under law.',
  },
  {
    heading: 'Scope of this declaration',
    body:
      'This declaration records my own commitments as the restaurant partner. It does not remove or limit any responsibility that Swaadone itself has under applicable law.',
  },
];

/** SHA-256 of a canonical JSON encoding of version, title and clauses. */
export function declarationHash(): string {
  return sha256Hex(JSON.stringify({ version: DECLARATION_VERSION, title: TITLE, clauses: CLAUSES }));
}

export function currentDeclaration(): Declaration {
  return {
    version: DECLARATION_VERSION,
    title: TITLE,
    clauses: CLAUSES,
    textSha256: declarationHash(),
    legalReviewStatus: 'draft_pending_legal_review',
  };
}

/**
 * Prototype-mode fetch interceptor. Used when EXPO_PUBLIC_API_URL is not set.
 * Handles every API path the restaurant app calls so all screens work without a backend.
 *
 * Responses are plain objects that match the Zod schemas — no actual network call is made.
 */

import { masalaJunctionOrders, MASALA_JUNCTION_ID } from '@/mock';
import { DEMO_PHONE_E164, PROTOTYPE_OTP } from '@/services/mock';

// ---------------------------------------------------------------------------
// In-memory state (reset on each app launch)
// ---------------------------------------------------------------------------

const orderStore = new Map<string, ReturnType<typeof masalaJunctionOrders>[0]>();
const seedOrders = () => {
  if (orderStore.size === 0) {
    for (const o of masalaJunctionOrders()) orderStore.set(o.id, o);
  }
};

let pendingRequestId: string | null = null;
let pendingPhone: string | null = null;

const DEMO_REFRESH_TOKEN = 'demo-refresh';
const INR = (minor: number) => ({ amountMinor: minor, currency: 'INR' });
const ZERO = INR(0);

const DEMO_SESSION = {
  user: { id: 'user-demo', fullName: 'Demo Owner', phoneE164: DEMO_PHONE_E164, email: null },
  business: {
    id: 'biz-demo',
    displayName: 'Masala Junction',
    legalName: 'Masala Junction Foods Pvt Ltd',
    entityType: 'company',
    gstin: null,
  },
  branches: [
    {
      id: MASALA_JUNCTION_ID,
      name: 'Masala Junction - Main Branch',
      locality: 'Koregaon Park',
      city: 'Pune',
      status: 'active',
      role: 'owner',
    },
  ],
};

const DEMO_BRANCH_DETAIL = {
  branch: {
    id: MASALA_JUNCTION_ID,
    businessId: 'biz-demo',
    name: 'Masala Junction - Main Branch',
    description: 'Authentic North Indian cuisine in the heart of Koregaon Park.',
    cuisines: ['North Indian', 'Mughlai'],
    foodType: 'mixed',
    phoneE164: DEMO_PHONE_E164,
    email: 'masalajunction@demo.swaadone.in',
    address: {
      line1: '12 Dhole Patil Road',
      line2: null,
      locality: 'Koregaon Park',
      city: 'Pune',
      state: 'Maharashtra',
      postalCode: '411001',
    },
    location: { lat: 18.5362, lng: 73.8937, source: 'map_pin' },
    timezone: 'Asia/Kolkata',
    status: 'active',
    statusReason: null,
    isAcceptingOrders: true,
    avgPrepMinutes: 25,
    minimumOrder: INR(9900),
    packagingFee: INR(1000),
    commissionBps: 1800,
    hours: [
      { dayOfWeek: 'monday', opensAt: '11:00', closesAt: '23:00' },
      { dayOfWeek: 'tuesday', opensAt: '11:00', closesAt: '23:00' },
      { dayOfWeek: 'wednesday', opensAt: '11:00', closesAt: '23:00' },
      { dayOfWeek: 'thursday', opensAt: '11:00', closesAt: '23:00' },
      { dayOfWeek: 'friday', opensAt: '11:00', closesAt: '23:30' },
      { dayOfWeek: 'saturday', opensAt: '10:00', closesAt: '23:30' },
      { dayOfWeek: 'sunday', opensAt: '10:00', closesAt: '22:30' },
    ],
    availability: {
      state: 'open',
      acceptingOrders: true,
      reason: 'Open and accepting orders',
      closesAt: null,
      nextOpenAt: null,
      pausedUntil: null,
      evaluatedAt: new Date().toISOString(),
      timezone: 'Asia/Kolkata',
    },
    submittedAt: '2026-09-01T08:00:00.000Z',
    approvedAt: '2026-09-03T10:30:00.000Z',
    createdAt: '2026-09-01T07:30:00.000Z',
  },
  onboarding: {
    steps: [
      { step: 'business', complete: true, hint: null },
      { step: 'details', complete: true, hint: null },
      { step: 'location', complete: true, hint: null },
      { step: 'contact', complete: true, hint: null },
      { step: 'hours', complete: true, hint: null },
      { step: 'licence', complete: true, hint: null },
      { step: 'bank', complete: false, hint: 'Add your bank account to enable withdrawals.' },
      { step: 'declaration', complete: true, hint: null },
    ],
    canSubmit: true,
    approvalBlockers: [],
  },
};

const DEMO_MENU = {
  categories: [
    {
      id: 'cat-mains',
      name: 'Mains',
      sortOrder: 0,
      isActive: true,
      items: [
        {
          id: 'item-dm',
          categoryId: 'cat-mains',
          name: 'Dal Makhani',
          description: 'Slow-cooked black lentils, cream and butter.',
          price: INR(28000),
          foodType: 'veg',
          imageUrl: null,
          isAvailable: true,
          isArchived: false,
          isBestseller: true,
          prepMinutes: 20,
          sortOrder: 0,
          updatedAt: '2026-10-01T12:00:00.000Z',
        },
        {
          id: 'item-cb',
          categoryId: 'cat-mains',
          name: 'Chicken Biryani',
          description: 'Fragrant basmati rice with spiced chicken.',
          price: INR(24000),
          foodType: 'non_veg',
          imageUrl: null,
          isAvailable: true,
          isArchived: false,
          isBestseller: false,
          prepMinutes: 30,
          sortOrder: 1,
          updatedAt: '2026-10-01T12:00:00.000Z',
        },
        {
          id: 'item-pk',
          categoryId: 'cat-mains',
          name: 'Paneer Kadai',
          description: 'Cottage cheese cooked with peppers and spices.',
          price: INR(22000),
          foodType: 'veg',
          imageUrl: null,
          isAvailable: true,
          isArchived: false,
          isBestseller: false,
          prepMinutes: 20,
          sortOrder: 2,
          updatedAt: '2026-10-01T12:00:00.000Z',
        },
      ],
    },
    {
      id: 'cat-breads',
      name: 'Breads',
      sortOrder: 1,
      isActive: true,
      items: [
        {
          id: 'item-bn',
          categoryId: 'cat-breads',
          name: 'Butter Naan',
          description: 'Soft leavened bread with butter.',
          price: INR(5000),
          foodType: 'veg',
          imageUrl: null,
          isAvailable: true,
          isArchived: false,
          isBestseller: false,
          prepMinutes: 10,
          sortOrder: 0,
          updatedAt: '2026-10-01T12:00:00.000Z',
        },
      ],
    },
    {
      id: 'cat-sides',
      name: 'Sides & Drinks',
      sortOrder: 2,
      isActive: true,
      items: [
        {
          id: 'item-raita',
          categoryId: 'cat-sides',
          name: 'Raita',
          description: 'Chilled yogurt with cucumber and herbs.',
          price: INR(6000),
          foodType: 'veg',
          imageUrl: null,
          isAvailable: true,
          isArchived: false,
          isBestseller: false,
          prepMinutes: 5,
          sortOrder: 0,
          updatedAt: '2026-10-01T12:00:00.000Z',
        },
      ],
    },
  ],
};

const DEMO_REVIEWS = [
  {
    id: 'rev-001',
    branchId: MASALA_JUNCTION_ID,
    rating: 5,
    comment: 'Dal Makhani was absolutely amazing. Will order again!',
    customerName: 'Priya',
    orderNumber: 'HGR-6Q4W1Z',
    createdAt: '2026-10-01T14:30:00.000Z',
    reply: null,
    reported: false,
    isDevFixture: true,
  },
  {
    id: 'rev-002',
    branchId: MASALA_JUNCTION_ID,
    rating: 4,
    comment: 'Good food, slightly late delivery but the taste made up for it.',
    customerName: 'Rahul',
    orderNumber: 'HGR-8D9E0F',
    createdAt: '2026-09-29T19:00:00.000Z',
    reply: {
      body: 'Thank you Rahul! We are working on improving delivery times.',
      createdAt: '2026-09-29T20:00:00.000Z',
      updatedAt: '2026-09-29T20:00:00.000Z',
      editableUntil: '2026-09-29T21:00:00.000Z',
    },
    reported: false,
    isDevFixture: true,
  },
  {
    id: 'rev-003',
    branchId: MASALA_JUNCTION_ID,
    rating: 3,
    comment: 'Average. Nothing special.',
    customerName: 'Anita',
    orderNumber: null,
    createdAt: '2026-09-27T12:00:00.000Z',
    reply: null,
    reported: false,
    isDevFixture: true,
  },
];

// ---------------------------------------------------------------------------
// Route matcher
// ---------------------------------------------------------------------------

function mockResponse(body: unknown, status = 200): Response {
  const json = JSON.stringify(body);
  return new Response(json, {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function errorResponse(status: number, code: string, message: string): Response {
  return mockResponse({ code, message, fieldErrors: {} }, status);
}

function parsePath(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    const match = url.match(/^https?:\/\/[^/]+(\/.*?)(\?|$)/);
    return match?.[1] ?? url;
  }
}

/** Mock that mirrors the real API's behaviour. Latency: none (tests run fast). */
export async function mockFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const method = (init?.method ?? 'GET').toUpperCase();
  const path = parsePath(url);

  // Strip /api/v1 prefix if present
  const p = path.replace(/^\/api\/v1/, '');

  const body = init?.body ? JSON.parse(init.body as string) : {};

  // -----------------------------------------------------------------------
  // Auth
  // -----------------------------------------------------------------------
  if (method === 'POST' && p === '/auth/otp/request') {
    pendingRequestId = 'req-mock-001';
    pendingPhone = body.phoneE164 ?? body.email ?? null;
    return mockResponse({
      requestId: pendingRequestId,
      expiresInSeconds: 300,
      resendAfterSeconds: 30,
    });
  }

  if (method === 'POST' && p === '/auth/otp/verify') {
    if (body.requestId !== pendingRequestId || body.code !== PROTOTYPE_OTP) {
      return errorResponse(401, 'auth.otp_invalid', 'Invalid or expired OTP. Use 123456.');
    }
    const isDemo = pendingPhone === DEMO_PHONE_E164 || pendingPhone === '9876543210';
    if (isDemo) {
      return mockResponse({
        tokens: { accessToken: 'demo-access', refreshToken: DEMO_REFRESH_TOKEN, accessExpiresInSeconds: 3600 },
        session: DEMO_SESSION,
      });
    }
    // New account: no branches yet → triggers onboarding wizard
    return mockResponse({
      tokens: { accessToken: 'new-access', refreshToken: 'new-refresh', accessExpiresInSeconds: 3600 },
      session: {
        user: { id: 'user-new', fullName: null, phoneE164: pendingPhone, email: null },
        business: null,
        branches: [],
      },
    });
  }

  if (method === 'POST' && p === '/auth/refresh') {
    if (body.refreshToken === DEMO_REFRESH_TOKEN) {
      return mockResponse({
        accessToken: 'demo-access',
        refreshToken: DEMO_REFRESH_TOKEN,
        accessExpiresInSeconds: 3600,
      });
    }
    return errorResponse(401, 'auth.session_expired', 'Session expired.');
  }

  if (method === 'POST' && p === '/auth/logout') {
    return mockResponse({ ok: true });
  }

  // -----------------------------------------------------------------------
  // Partner session
  // -----------------------------------------------------------------------
  if (method === 'GET' && p === '/partner/me') {
    return mockResponse(DEMO_SESSION);
  }

  if ((method === 'PATCH' || method === 'PUT') && p === '/partner/me') {
    return mockResponse({ ...DEMO_SESSION, user: { ...DEMO_SESSION.user, ...body } });
  }

  if (method === 'GET' && p === '/partner/business') {
    return mockResponse(DEMO_SESSION.business);
  }

  if ((method === 'PUT' || method === 'POST') && p === '/partner/business') {
    return mockResponse({ ...DEMO_SESSION.business, ...body });
  }

  if (method === 'GET' && p === '/partner/declaration') {
    return mockResponse({ acceptedAt: '2026-09-01T08:00:00.000Z', version: 'v2026-09-01' });
  }

  if (method === 'POST' && p === '/partner/declaration') {
    return mockResponse({ acceptedAt: new Date().toISOString(), version: 'v2026-09-01' });
  }

  if (method === 'GET' && p === '/partner/coupons') {
    return mockResponse({ items: [], nextCursor: null });
  }

  if (method === 'POST' && p === '/partner/coupons') {
    return errorResponse(422, 'not_implemented', 'Coupon creation requires the backend.');
  }

  if (method === 'GET' && p === '/partner/coupon-policy') {
    return mockResponse({
      autoApproveMaxPercentBps: 2000,
      autoApproveMaxFlatMinor: 10000,
      autoApproveMaxCapMinor: 15000,
      autoApproveMaxDurationDays: 30,
    });
  }

  // -----------------------------------------------------------------------
  // Branches
  // -----------------------------------------------------------------------
  if (method === 'GET' && p === '/partner/branches') {
    return mockResponse({ items: DEMO_SESSION.branches, nextCursor: null });
  }

  if (method === 'POST' && p === '/partner/branches') {
    return mockResponse({
      id: 'branch-new',
      businessId: 'biz-demo',
      name: body.name ?? 'New Branch',
      description: '',
      cuisines: [],
      foodType: 'mixed',
      phoneE164: null,
      email: null,
      address: null,
      location: null,
      timezone: 'Asia/Kolkata',
      status: 'draft',
      statusReason: null,
      isAcceptingOrders: false,
      avgPrepMinutes: 30,
      minimumOrder: ZERO,
      packagingFee: ZERO,
      commissionBps: null,
      hours: [],
      availability: {
        state: 'not_active',
        acceptingOrders: false,
        reason: 'Branch is not active',
        closesAt: null,
        nextOpenAt: null,
        pausedUntil: null,
        evaluatedAt: new Date().toISOString(),
        timezone: 'Asia/Kolkata',
      },
      submittedAt: null,
      approvedAt: null,
      createdAt: new Date().toISOString(),
    });
  }

  const branchMatch = p.match(/^\/partner\/branches\/([^/]+)(\/(.*))?$/);
  if (branchMatch) {
    const branchId = branchMatch[1];
    const sub = branchMatch[3] ?? '';
    const isDemoB = branchId === MASALA_JUNCTION_ID;

    if (!sub) {
      if (method === 'GET') {
        return isDemoB
          ? mockResponse(DEMO_BRANCH_DETAIL)
          : mockResponse({
              branch: { ...DEMO_BRANCH_DETAIL.branch, id: branchId, status: 'pending_review' },
              onboarding: DEMO_BRANCH_DETAIL.onboarding,
            });
      }
      if (method === 'PATCH' || method === 'PUT') {
        return mockResponse({ ...DEMO_BRANCH_DETAIL.branch, ...body });
      }
    }

    if (sub === 'submit' && method === 'POST') {
      return mockResponse({ submitted: true });
    }

    if (sub === 'declaration') {
      if (method === 'GET') return mockResponse({ acceptedAt: null, version: 'v2026-09-01' });
      if (method === 'POST') return mockResponse({ acceptedAt: new Date().toISOString(), version: 'v2026-09-01' });
    }

    if (sub === 'hours') {
      if (method === 'GET') {
        return mockResponse({
          sessions: DEMO_BRANCH_DETAIL.branch.hours,
          closures: [],
          availability: DEMO_BRANCH_DETAIL.branch.availability,
        });
      }
      if (method === 'PUT') return mockResponse({ sessions: body.sessions ?? [] });
    }

    if (sub === 'closures') {
      if (method === 'GET') return mockResponse([]);
      if (method === 'POST') {
        return mockResponse({ id: `closure-${Date.now()}`, date: body.date, note: body.note ?? null });
      }
    }

    if (sub.startsWith('closures/') && method === 'DELETE') {
      return mockResponse({ deleted: true });
    }

    if (sub === 'availability') {
      return mockResponse(DEMO_BRANCH_DETAIL.branch.availability);
    }

    if (sub === 'intake') {
      return mockResponse({ isAcceptingOrders: body.isAcceptingOrders ?? true });
    }

    if (sub === 'documents') {
      if (method === 'GET') {
        return mockResponse({
          requirements: [
            { type: 'fssai_license', required: true, state: 'not_submitted', current: null, nextAction: 'Upload your FSSAI licence (14-digit number).' },
            { type: 'gst_certificate', required: false, state: 'not_submitted', current: null, nextAction: null },
            { type: 'bank_proof', required: false, state: 'not_submitted', current: null, nextAction: null },
          ],
          history: [],
        });
      }
      if (method === 'POST') return errorResponse(422, 'not_implemented', 'Document upload requires the backend.');
    }

    if (sub === 'payout-account') {
      if (method === 'GET') return mockResponse({ current: null, nextStep: 'Add your bank account to withdraw earnings.' });
      if (method === 'PUT') {
        return mockResponse({
          current: {
            id: 'acct-demo',
            branchId,
            accountHolderName: body.accountHolderName,
            accountNumberLast4: (body.accountNumber as string)?.slice(-4) ?? '0000',
            ifsc: body.ifsc,
            status: 'pending_verification',
            registeredName: null,
            failureReason: null,
            verifiedAt: null,
            verifiedVia: null,
            createdAt: new Date().toISOString(),
          },
          nextStep: 'Finance will verify your bank details within 2 business days.',
        });
      }
    }

    if (sub === 'wallet') {
      return mockResponse({
        branchId,
        available: isDemoB ? INR(123450) : ZERO,
        pending: isDemoB ? INR(45600) : ZERO,
        inFlightPayouts: ZERO,
        minimumWithdrawal: INR(50000),
        settlementHoldDays: 7,
        payoutAccount: null,
        provider: { provider: 'razorpayx', mode: 'test' },
        eligibility: {
          canWithdraw: false,
          blockers: [
            { code: 'no_payout_account', message: 'Add a bank account before you can withdraw.' },
          ],
        },
        includesDevFixtures: isDemoB,
      });
    }

    if (sub === 'wallet/summary') {
      return mockResponse({
        from: '2026-10-01',
        to: '2026-10-07',
        deliveredOrders: isDemoB ? 48 : 0,
        grossSales: isDemoB ? INR(1423500) : ZERO,
        commission: isDemoB ? INR(256230) : ZERO,
        commissionTax: isDemoB ? INR(46121) : ZERO,
        restaurantDiscounts: ZERO,
        refunds: ZERO,
        adjustments: ZERO,
        netEarnings: isDemoB ? INR(1121149) : ZERO,
        paidOut: ZERO,
        daily: isDemoB
          ? ['2026-10-01','2026-10-02','2026-10-03','2026-10-04','2026-10-05','2026-10-06','2026-10-07'].map((date, i) => ({
              date,
              grossSales: INR([120000,195000,210000,180000,225000,300000,193500][i]!),
              netEarnings: INR([94500,153600,165375,141750,177187,236250,152387][i]!),
            }))
          : [],
        includesDevFixtures: isDemoB,
      });
    }

    if (sub === 'wallet/transactions') {
      if (!isDemoB) return mockResponse({ items: [], nextCursor: null });
      return mockResponse({
        items: [
          { id: 'le-001', type: 'order_earning', amount: INR(28700), description: 'Order HGR-6Q4W1Z', orderId: 'ord-6q4w1z', orderNumber: 'HGR-6Q4W1Z', payoutId: null, availableAt: '2026-10-09T00:00:00.000Z', createdAt: '2026-10-02T09:00:00.000Z' },
          { id: 'le-002', type: 'commission', amount: INR(-5166), description: 'Commission HGR-6Q4W1Z', orderId: 'ord-6q4w1z', orderNumber: 'HGR-6Q4W1Z', payoutId: null, availableAt: '2026-10-09T00:00:00.000Z', createdAt: '2026-10-02T09:00:00.000Z' },
          { id: 'le-003', type: 'order_earning', amount: INR(24500), description: 'Order HGR-8D9E0F', orderId: 'ord-8d9e0f', orderNumber: 'HGR-8D9E0F', payoutId: null, availableAt: '2026-10-09T00:00:00.000Z', createdAt: '2026-10-02T07:30:00.000Z' },
        ],
        nextCursor: null,
      });
    }

    if (sub === 'payouts') {
      if (method === 'GET') return mockResponse({ items: [], nextCursor: null });
      if (method === 'POST') return errorResponse(422, 'no_payout_account', 'Add a bank account before requesting a payout.');
    }

    if (sub.startsWith('payouts/') && method === 'GET') {
      return errorResponse(404, 'not_found', 'Payout not found.');
    }

    if (sub === 'menu') {
      if (method === 'GET') return isDemoB ? mockResponse(DEMO_MENU) : mockResponse({ categories: [] });
      if (method === 'POST') return errorResponse(422, 'not_implemented', 'Menu editing requires the backend.');
    }

    if (sub === 'menu/categories') {
      if (method === 'GET') return isDemoB ? mockResponse(DEMO_MENU.categories) : mockResponse([]);
      if (method === 'POST') return errorResponse(422, 'not_implemented', 'Menu editing requires the backend.');
    }

    const menuCatMatch = sub.match(/^menu\/categories\/([^/]+)$/);
    if (menuCatMatch) {
      const cat = DEMO_MENU.categories.find((c) => c.id === menuCatMatch[1]!);
      if (method === 'GET') return cat ? mockResponse(cat) : errorResponse(404, 'not_found', 'Category not found.');
      return mockResponse(cat ?? {});
    }

    if (sub === 'menu/items') {
      if (method === 'GET') {
        const items = DEMO_MENU.categories.flatMap((c) => c.items);
        return mockResponse({ items, nextCursor: null });
      }
      if (method === 'POST') return errorResponse(422, 'not_implemented', 'Menu editing requires the backend.');
    }

    const menuItemMatch = sub.match(/^menu\/items\/([^/]+)(\/.*)?$/);
    if (menuItemMatch) {
      const itemId = menuItemMatch[1]!;
      const itemSub = menuItemMatch[2] ?? '';
      const allItems = DEMO_MENU.categories.flatMap((c) => c.items);
      const item = allItems.find((i) => i.id === itemId);

      if (itemSub === '/availability' && method === 'PUT') {
        if (item !== undefined && item !== null) item.isAvailable = body.isAvailable as boolean ?? item.isAvailable;
        return mockResponse(item ?? null);
      }
      if (method === 'GET') return item ? mockResponse(item) : errorResponse(404, 'not_found', 'Item not found.');
    }

    if (sub === 'dashboard') {
      seedOrders();
      const orders = Array.from(orderStore.values());
      const today = new Date().toISOString().slice(0, 10);
      return mockResponse({
        branchId,
        date: today,
        orderCounts: {
          placed: orders.filter((o) => o.status === 'placed').length,
          preparing: orders.filter((o) => o.status === 'preparing').length,
          ready_for_pickup: orders.filter((o) => o.status === 'ready_for_pickup').length,
          picked_up: orders.filter((o) => o.status === 'picked_up').length,
          delivered: orders.filter((o) => o.status === 'delivered').length,
          cancelled: orders.filter((o) => o.status === 'cancelled').length,
        },
        grossSalesToday: isDemoB ? INR(328750) : ZERO,
        trend: ['2026-10-10','2026-10-11','2026-10-12','2026-10-13','2026-10-14','2026-10-15','2026-10-16'].map((date, i) => ({
          date,
          orders: isDemoB ? [32,45,38,51,44,60,11][i] ?? 0 : 0,
          grossSales: isDemoB ? INR([960000,1350000,1140000,1530000,1320000,1800000,328750][i]!) : ZERO,
        })),
        pendingActions: isDemoB
          ? [{ kind: 'payout_account_missing', message: 'Add a bank account to start earning withdrawals.' }]
          : [{ kind: 'onboarding_incomplete', message: 'Complete your restaurant profile to go live.' }],
        includesDevFixtures: isDemoB,
      });
    }

    if (sub === 'reviews/summary') {
      return mockResponse({
        average: isDemoB ? 4.0 : null,
        count: isDemoB ? 3 : 0,
        distribution: { 1: 0, 2: 0, 3: 1, 4: 1, 5: 1 },
        unanswered: isDemoB ? 2 : 0,
      });
    }

    if (sub === 'reviews') {
      if (method === 'GET') return isDemoB ? mockResponse({ items: DEMO_REVIEWS, nextCursor: null }) : mockResponse({ items: [], nextCursor: null });
    }

    const reviewMatch = sub.match(/^reviews\/([^/]+)(\/.*)?$/);
    if (reviewMatch) {
      const reviewSub = reviewMatch[2] ?? '';
      if (reviewSub === '/reply' && method === 'POST') {
        const review = DEMO_REVIEWS.find((r) => r.id === reviewMatch[1]!);
        if (review) review.reply = { body: body.body, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), editableUntil: new Date(Date.now() + 3600000).toISOString() };
        return mockResponse({ ok: true });
      }
      if (reviewSub === '/report' && method === 'POST') return mockResponse({ ok: true });
    }

    // --- Orders ---
    if (sub === 'orders') {
      if (method !== 'GET') return errorResponse(405, 'method_not_allowed', 'Method not allowed.');
      if (!isDemoB) return mockResponse({ items: [], nextCursor: null });
      seedOrders();
      return mockResponse({ items: Array.from(orderStore.values()), nextCursor: null });
    }

    const orderMatch = sub.match(/^orders\/([^/]+)(\/(.*))?$/);
    if (orderMatch) {
      const orderId = orderMatch[1]!;
      const orderSub = orderMatch[3] ?? '';

      if (!isDemoB) return errorResponse(404, 'not_found', 'Branch not found.');
      seedOrders();

      if (!orderSub) {
        const order = orderStore.get(orderId);
        if (!order) return errorResponse(404, 'not_found', 'Order not found.');
        if (method === 'GET') return mockResponse(order);
      }

      if (orderSub === 'accept' && method === 'POST') {
        const order = orderStore.get(orderId);
        if (!order) return errorResponse(404, 'not_found', 'Order not found.');
        if (order.version !== body.expectedVersion) return errorResponse(409, 'order.version_conflict', 'Order already changed.');
        if (order.status !== 'placed') return errorResponse(422, 'order.invalid_transition', 'Order cannot be accepted.');
        const updated = { ...order, status: 'preparing' as const, prepMinutes: body.prepMinutes as number, acceptedAt: new Date().toISOString(), version: order.version + 1, timeline: [...order.timeline, { status: 'preparing' as const, at: new Date().toISOString(), actor: 'restaurant' as const, note: null }] };
        orderStore.set(orderId, updated);
        return mockResponse(updated);
      }

      if (orderSub === 'reject' && method === 'POST') {
        const order = orderStore.get(orderId);
        if (!order) return errorResponse(404, 'not_found', 'Order not found.');
        if (order.version !== body.expectedVersion) return errorResponse(409, 'order.version_conflict', 'Order already changed.');
        if (order.status !== 'placed') return errorResponse(422, 'order.invalid_transition', 'Order cannot be rejected.');
        const updated = { ...order, status: 'cancelled' as const, cancelledBy: 'restaurant' as const, cancelReason: body.reason as string | null, cancelledAt: new Date().toISOString(), version: order.version + 1, timeline: [...order.timeline, { status: 'cancelled' as const, at: new Date().toISOString(), actor: 'restaurant' as const, note: null }] };
        orderStore.set(orderId, updated);
        return mockResponse(updated);
      }

      if (orderSub === 'ready' && method === 'POST') {
        const order = orderStore.get(orderId);
        if (!order) return errorResponse(404, 'not_found', 'Order not found.');
        if (order.version !== body.expectedVersion) return errorResponse(409, 'order.version_conflict', 'Order already changed.');
        if (order.status !== 'preparing') return errorResponse(422, 'order.invalid_transition', 'Order cannot be marked ready.');
        const updated = { ...order, status: 'ready_for_pickup' as const, readyAt: new Date().toISOString(), version: order.version + 1, timeline: [...order.timeline, { status: 'ready_for_pickup' as const, at: new Date().toISOString(), actor: 'restaurant' as const, note: null }] };
        orderStore.set(orderId, updated);
        return mockResponse(updated);
      }
    }
  }

  // Fallback
  return errorResponse(404, 'not_found', `Mock: no handler for ${method} ${p}`);
}

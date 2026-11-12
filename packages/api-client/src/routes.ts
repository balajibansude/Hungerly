/**
 * Every REST path, in one place, so the server routes and the app client cannot drift.
 * Paths are relative to the API base URL, which ends in `/api/v1`.
 */
type Id = string;

export const paths = {
  health: '/health',

  auth: {
    otpRequest: '/auth/otp/request',
    otpVerify: '/auth/otp/verify',
    refresh: '/auth/refresh',
    logout: '/auth/logout',
    adminLogin: '/admin/auth/login',
  },

  customer: {
    auth: {
      /** OTP request is shared: `auth.otpRequest`. */
      otpVerify: '/customer/auth/otp/verify',
      refresh: '/customer/auth/refresh',
      logout: '/customer/auth/logout',
    },
    me: '/customer/me',
  },

  partner: {
    me: '/partner/me',
    business: '/partner/business',
    declaration: '/partner/declaration',
    couponPolicy: '/partner/coupon-policy',
    coupons: '/partner/coupons',
    couponPreview: '/partner/coupons/preview',
    coupon: (couponId: Id) => `/partner/coupons/${couponId}`,
    couponCancel: (couponId: Id) => `/partner/coupons/${couponId}/cancel`,
    documentFile: (documentId: Id) => `/partner/documents/${documentId}/file`,
    branches: '/partner/branches',
    branch: (branchId: Id) => `/partner/branches/${branchId}`,
    branchSubmit: (branchId: Id) => `/partner/branches/${branchId}/submit`,
    hours: (branchId: Id) => `/partner/branches/${branchId}/hours`,
    closures: (branchId: Id) => `/partner/branches/${branchId}/closures`,
    closure: (branchId: Id, closureId: Id) => `/partner/branches/${branchId}/closures/${closureId}`,
    availability: (branchId: Id) => `/partner/branches/${branchId}/availability`,
    intake: (branchId: Id) => `/partner/branches/${branchId}/intake`,
    documents: (branchId: Id) => `/partner/branches/${branchId}/documents`,
    branchDeclaration: (branchId: Id) => `/partner/branches/${branchId}/declaration`,
    payoutAccount: (branchId: Id) => `/partner/branches/${branchId}/payout-account`,
    payoutAccountRefresh: (branchId: Id) => `/partner/branches/${branchId}/payout-account/refresh`,
    wallet: (branchId: Id) => `/partner/branches/${branchId}/wallet`,
    walletSummary: (branchId: Id) => `/partner/branches/${branchId}/wallet/summary`,
    walletTransactions: (branchId: Id) => `/partner/branches/${branchId}/wallet/transactions`,
    walletStatement: (branchId: Id) => `/partner/branches/${branchId}/wallet/statement.csv`,
    payouts: (branchId: Id) => `/partner/branches/${branchId}/payouts`,
    payout: (branchId: Id, payoutId: Id) => `/partner/branches/${branchId}/payouts/${payoutId}`,
    menu: (branchId: Id) => `/partner/branches/${branchId}/menu`,
    menuCategories: (branchId: Id) => `/partner/branches/${branchId}/menu/categories`,
    menuCategory: (branchId: Id, categoryId: Id) =>
      `/partner/branches/${branchId}/menu/categories/${categoryId}`,
    menuItems: (branchId: Id) => `/partner/branches/${branchId}/menu/items`,
    menuItem: (branchId: Id, itemId: Id) => `/partner/branches/${branchId}/menu/items/${itemId}`,
    menuItemArchive: (branchId: Id, itemId: Id) =>
      `/partner/branches/${branchId}/menu/items/${itemId}/archive`,
    menuItemAvailability: (branchId: Id, itemId: Id) =>
      `/partner/branches/${branchId}/menu/items/${itemId}/availability`,
    menuItemImage: (branchId: Id, itemId: Id) =>
      `/partner/branches/${branchId}/menu/items/${itemId}/image`,
    orders: (branchId: Id) => `/partner/branches/${branchId}/orders`,
    order: (branchId: Id, orderId: Id) => `/partner/branches/${branchId}/orders/${orderId}`,
    orderAccept: (branchId: Id, orderId: Id) =>
      `/partner/branches/${branchId}/orders/${orderId}/accept`,
    orderReject: (branchId: Id, orderId: Id) =>
      `/partner/branches/${branchId}/orders/${orderId}/reject`,
    orderReady: (branchId: Id, orderId: Id) =>
      `/partner/branches/${branchId}/orders/${orderId}/ready`,
    dashboard: (branchId: Id) => `/partner/branches/${branchId}/dashboard`,
    reviews: (branchId: Id) => `/partner/branches/${branchId}/reviews`,
    reviewSummary: (branchId: Id) => `/partner/branches/${branchId}/reviews/summary`,
    reviewReply: (branchId: Id, reviewId: Id) =>
      `/partner/branches/${branchId}/reviews/${reviewId}/reply`,
    reviewReport: (branchId: Id, reviewId: Id) =>
      `/partner/branches/${branchId}/reviews/${reviewId}/report`,
  },

  media: {
    menuImage: (key: string) => `/media/menu/${key}`,
  },

  webhooks: {
    razorpayx: '/webhooks/razorpayx',
  },

  admin: {
    documents: '/admin/documents',
    documentFile: (documentId: Id) => `/admin/documents/${documentId}/file`,
    documentApprove: (documentId: Id) => `/admin/documents/${documentId}/approve`,
    documentReject: (documentId: Id) => `/admin/documents/${documentId}/reject`,
    branches: '/admin/branches',
    branchApprove: (branchId: Id) => `/admin/branches/${branchId}/approve`,
    branchReject: (branchId: Id) => `/admin/branches/${branchId}/reject`,
    branchSuspend: (branchId: Id) => `/admin/branches/${branchId}/suspend`,
    branchReinstate: (branchId: Id) => `/admin/branches/${branchId}/reinstate`,
    branchLedgerAdjustments: (branchId: Id) => `/admin/branches/${branchId}/ledger-adjustments`,
    coupons: '/admin/coupons',
    couponApprove: (couponId: Id) => `/admin/coupons/${couponId}/approve`,
    couponReject: (couponId: Id) => `/admin/coupons/${couponId}/reject`,
    payoutAccounts: '/admin/payout-accounts',
    payoutAccountVerify: (accountId: Id) => `/admin/payout-accounts/${accountId}/verify`,
    payoutAccountReject: (accountId: Id) => `/admin/payout-accounts/${accountId}/reject`,
    payoutsReconcile: '/admin/payouts/reconcile',
  },
} as const;

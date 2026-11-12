/**
 * Why a guest was sent to log in. Shown on the login screen so the request never feels
 * arbitrary; browsing itself never needs an account.
 */
export type LoginReason = 'checkout' | 'favorites' | 'orders' | 'account';

const reasons: Record<LoginReason, { title: string; message: string }> = {
  checkout: {
    title: 'Log in to place your order',
    message:
      'Your cart is saved. We need your mobile number to confirm the order and keep you updated on delivery.',
  },
  favorites: {
    title: 'Log in to save favourites',
    message: 'Favourites are saved to your account so you can find them on any device.',
  },
  orders: {
    title: 'Log in to see your orders',
    message: 'Your order history and live tracking are linked to your account.',
  },
  account: {
    title: 'Log in or sign up',
    message: 'Manage your profile, addresses and favourites in one place.',
  },
};

export function isLoginReason(value: unknown): value is LoginReason {
  return typeof value === 'string' && value in reasons;
}

export function loginCopyFor(reason: LoginReason | undefined) {
  return reasons[reason ?? 'account'];
}

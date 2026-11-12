/**
 * Account destinations that have no backend or content yet. Tapping one explains what is
 * missing instead of opening a blank screen or faking success. Remove an entry when its
 * feature ships and point the row at the real screen.
 */
export type UnavailableFeature =
  | 'notifications'
  | 'payments'
  | 'scratchCards'
  | 'referrals'
  | 'notificationPreferences'
  | 'help'
  | 'privacy'
  | 'terms';

export const unavailableFeatures: Record<UnavailableFeature, { title: string; message: string }> = {
  notifications: {
    title: 'Notifications are coming soon',
    message:
      'Order updates and messages will appear here once notifications are connected to the Swaadone backend.',
  },
  payments: {
    title: 'Payments are coming soon',
    message:
      'Saved payment methods and the Swaadone wallet arrive with online payments in a later phase. Nothing is charged in this prototype.',
  },
  scratchCards: {
    title: 'Scratch cards aren’t available yet',
    message:
      'There is no rewards programme behind scratch cards yet, so there is nothing to scratch.',
  },
  referrals: {
    title: 'Refer & Earn isn’t available yet',
    message: 'A referral programme hasn’t been set up, so invites can’t earn rewards yet.',
  },
  notificationPreferences: {
    title: 'Notification settings are coming soon',
    message:
      'You’ll be able to choose which updates you receive once push notifications are added.',
  },
  help: {
    title: 'Help & Support is coming soon',
    message: 'In-app help and support contacts haven’t been set up for this prototype yet.',
  },
  privacy: {
    title: 'Privacy Policy not published yet',
    message: 'Swaadone’s privacy policy will be linked here before the app launches.',
  },
  terms: {
    title: 'Terms & Conditions not published yet',
    message: 'Swaadone’s terms and conditions will be linked here before the app launches.',
  },
};

import type { FastifyBaseLogger } from 'fastify';

import type { Config } from '../config';

export interface OtpSender {
  /** 'server_log' only for the development sender. */
  readonly kind: 'server_log' | 'provider' | 'none';
  send(channel: 'phone' | 'email', identifier: string, code: string): Promise<void>;
}

/**
 * Chooses how one-time codes are delivered.
 * - production: a real provider is required (MSG91, ADR-004); without one, sign-in fails
 *   with `auth.delivery_unavailable` rather than silently accepting a fixed code.
 * - development/test: codes are written to the server log (and OTP_DEV_FIXED_CODE, if
 *   set, is also accepted). The response says so (`devDelivery: 'server_log'`).
 */
export function createOtpSender(config: Config, log: FastifyBaseLogger): OtpSender {
  if (config.MSG91_AUTH_KEY && config.MSG91_OTP_TEMPLATE_ID) {
    return {
      kind: 'provider',
      async send(channel, identifier, code) {
        if (channel !== 'phone') {
          throw new Error('Email OTP delivery is not configured');
        }
        const response = await fetch('https://control.msg91.com/api/v5/otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', authkey: config.MSG91_AUTH_KEY! },
          body: JSON.stringify({
            template_id: config.MSG91_OTP_TEMPLATE_ID,
            mobile: identifier.replace(/^\+/, ''),
            otp: code,
          }),
        });
        if (!response.ok) throw new Error(`MSG91 responded ${response.status}`);
      },
    };
  }
  if (config.NODE_ENV === 'production') {
    return {
      kind: 'none',
      async send() {
        throw new Error('No OTP delivery provider configured');
      },
    };
  }
  return {
    kind: 'server_log',
    async send(channel, identifier, code) {
      log.warn({ channel, identifier: maskIdentifier(identifier) }, `DEV OTP (not sent): ${code}`);
    },
  };
}

export function maskIdentifier(value: string): string {
  if (value.includes('@')) {
    const [name, domain] = value.split('@');
    return `${name?.slice(0, 2)}***@${domain}`;
  }
  return `${value.slice(0, 3)}******${value.slice(-2)}`;
}

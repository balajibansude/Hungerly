import { importPKCS8, importSPKI, jwtVerify, SignJWT, type CryptoKey } from 'jose';

import { pem, type Config } from '../config';

export type Audience = 'partner' | 'admin';

export interface AccessClaims {
  userId: string;
  sessionId: string;
  audience: Audience;
}

export interface TokenSigner {
  sign(claims: AccessClaims): Promise<string>;
  verify(token: string, audience: Audience): Promise<AccessClaims>;
  ttlSeconds: number;
}

/** Ed25519-signed access JWTs (ADR-004): short-lived, audience-bound, with the session id. */
export async function createTokenSigner(config: Config): Promise<TokenSigner> {
  const privateKey: CryptoKey = await importPKCS8(pem(config.JWT_PRIVATE_KEY), 'EdDSA');
  const publicKey: CryptoKey = await importSPKI(pem(config.JWT_PUBLIC_KEY), 'EdDSA');
  const ttlSeconds = config.ACCESS_TOKEN_TTL_SECONDS;
  return {
    ttlSeconds,
    async sign({ userId, sessionId, audience }) {
      return new SignJWT({ sid: sessionId })
        .setProtectedHeader({ alg: 'EdDSA', typ: 'JWT' })
        .setSubject(userId)
        .setAudience(audience)
        .setIssuer(config.JWT_ISSUER)
        .setIssuedAt()
        .setExpirationTime(`${ttlSeconds}s`)
        .sign(privateKey);
    },
    async verify(token, audience) {
      const { payload } = await jwtVerify(token, publicKey, {
        issuer: config.JWT_ISSUER,
        audience,
        algorithms: ['EdDSA'],
      });
      if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string') {
        throw new Error('Malformed token');
      }
      return { userId: payload.sub, sessionId: payload.sid, audience };
    },
  };
}

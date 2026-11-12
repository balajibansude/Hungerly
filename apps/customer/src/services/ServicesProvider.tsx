import { createServicesContext } from '@hungerly/app-core';

import { IS_MOCK_MODE } from '@/lib/api';

import { createApiAuthService } from './api/auth';
import type { Services } from './contracts';
import { createMockServices } from './mock';

/**
 * Chooses the service implementations.
 *
 * - Mock mode (no `EXPO_PUBLIC_API_URL`, or `EXPO_PUBLIC_USE_MOCK=true`): every service is
 *   the prototype mock, exactly as before.
 * - Otherwise only authentication talks to the Swaadone API; catalog, orders, offers and
 *   the rest stay on the mocks until their endpoints exist.
 */
export function createServices(mockMode: boolean = IS_MOCK_MODE): Services {
  const mock = createMockServices();
  return mockMode ? mock : { ...mock, auth: createApiAuthService() };
}

export const { ServicesProvider, useServices } = createServicesContext<Services>(() =>
  createServices(),
);

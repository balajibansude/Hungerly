import { createServicesContext } from '@hungerly/app-core';

import type { Services } from './contracts';
import { createMockServices } from './mock';

/**
 * Provides the service implementations to the app.
 *
 * Today this always uses the prototype mocks. When the backend is ready, a
 * `createApiServices(apiClient)` implementation is passed in here (chosen by build
 * configuration) — no screen changes are needed.
 */
export const { ServicesProvider, useServices } = createServicesContext<Services>(() =>
  createMockServices(),
);

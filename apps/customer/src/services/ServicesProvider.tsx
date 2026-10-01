import { createContext, useContext, useState, type ReactNode } from 'react';

import type { Services } from './contracts';
import { createMockServices } from './mock';

const ServicesContext = createContext<Services | null>(null);

/**
 * Provides the service implementations to the app.
 *
 * Today this always uses the prototype mocks. When the backend is ready, a
 * `createApiServices(apiClient)` implementation is passed in here (chosen by build
 * configuration) — no screen changes are needed.
 */
export function ServicesProvider({
  children,
  services,
}: {
  children: ReactNode;
  services?: Services;
}) {
  const [value] = useState<Services>(() => services ?? createMockServices());
  return <ServicesContext.Provider value={value}>{children}</ServicesContext.Provider>;
}

export function useServices(): Services {
  const services = useContext(ServicesContext);
  if (!services) {
    throw new Error('useServices must be used inside <ServicesProvider>');
  }
  return services;
}

import { createContext, useContext, useState, type ReactNode } from 'react';

export interface ServicesProviderProps<S> {
  children: ReactNode;
  /** Overrides the default implementation (tests, or the API implementation later). */
  services?: S;
}

/**
 * Creates the provider/hook pair through which an app's screens reach its services.
 *
 * Each app defines its own `Services` contract and passes a factory for the default
 * implementation (today: the prototype mocks). When the backend is ready, an
 * API-backed implementation is passed to the provider instead — no screen changes.
 */
export function createServicesContext<S>(createDefault: () => S) {
  const ServicesContext = createContext<S | null>(null);

  function ServicesProvider({ children, services }: ServicesProviderProps<S>) {
    const [value] = useState<S>(() => services ?? createDefault());
    return <ServicesContext.Provider value={value}>{children}</ServicesContext.Provider>;
  }

  function useServices(): S {
    const services = useContext(ServicesContext);
    if (!services) {
      throw new Error('useServices must be used inside <ServicesProvider>');
    }
    return services;
  }

  return { ServicesProvider, useServices };
}

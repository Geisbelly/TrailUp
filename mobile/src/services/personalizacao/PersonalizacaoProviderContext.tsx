import React, { createContext, ReactNode, useContext } from "react";

import type { IPersonalizacaoProvider } from "@/services/personalizacao/IPersonalizacaoProvider";
import { defaultTrailupApiProvider } from "@/services/personalizacao/TrailupApiProvider";

const PersonalizacaoProviderContext = createContext<IPersonalizacaoProvider>(
  defaultTrailupApiProvider
);

export function PersonalizacaoProviderProvider({
  provider,
  children,
}: {
  provider?: IPersonalizacaoProvider;
  children: ReactNode;
}) {
  return (
    <PersonalizacaoProviderContext.Provider
      value={provider ?? defaultTrailupApiProvider}
    >
      {children}
    </PersonalizacaoProviderContext.Provider>
  );
}

export function usePersonalizacaoProvider(): IPersonalizacaoProvider {
  return useContext(PersonalizacaoProviderContext);
}

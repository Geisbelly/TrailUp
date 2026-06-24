import React, { createContext, ReactNode, useContext, useState } from 'react';

const LoadingContext = createContext({
  loading: false,
  setLoading: (_val: boolean) => {},
});

type LoadingProviderProps = {
  children: ReactNode;
};

export const LoadingProvider = ({ children }: LoadingProviderProps) => {
  const [loading, setLoading] = useState(false);
  return (
    <LoadingContext.Provider value={{ loading, setLoading }}>
      {children}
    </LoadingContext.Provider>
  );
};

export const useLoading = () => useContext(LoadingContext);

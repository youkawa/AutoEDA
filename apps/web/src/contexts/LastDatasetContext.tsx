import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

type DatasetSummary = {
  id: string;
  name?: string;
};

type DatasetContextValue = {
  lastDataset: DatasetSummary | null;
  setLastDataset: (dataset: DatasetSummary | null) => void;
};

const STORAGE_KEY = 'autoeda:last-dataset';

const LastDatasetContext = createContext<DatasetContextValue | undefined>(undefined);

function readInitialDataset(): DatasetSummary | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored) as DatasetSummary;
    if (parsed && typeof parsed.id === 'string') {
      return parsed;
    }
  } catch {
    // ignore corrupted storage
  }
  return null;
}

export function LastDatasetProvider({ children }: { children: React.ReactNode }) {
  const [lastDataset, setLastDatasetState] = useState<DatasetSummary | null>(() => readInitialDataset());

  const setLastDataset = useCallback((dataset: DatasetSummary | null) => {
    setLastDatasetState(dataset);
    if (typeof window === 'undefined') return;
    if (dataset) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(dataset));
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const value = useMemo(
    () => ({ lastDataset, setLastDataset }),
    [lastDataset, setLastDataset]
  );

  return <LastDatasetContext.Provider value={value}>{children}</LastDatasetContext.Provider>;
}

export function useLastDataset() {
  const ctx = useContext(LastDatasetContext);
  if (!ctx) {
    throw new Error('useLastDataset must be used within LastDatasetProvider');
  }
  return ctx;
}

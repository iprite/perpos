"use client";

import React, { createContext, useContext } from "react";

const ModuleContext = createContext<string[]>([]);

export function ModuleProvider({
  children,
  enabledKeys,
}: {
  children: React.ReactNode;
  enabledKeys: string[];
}) {
  return (
    <ModuleContext.Provider value={enabledKeys}>{children}</ModuleContext.Provider>
  );
}

export function useEnabledModules(): string[] {
  return useContext(ModuleContext);
}

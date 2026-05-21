"use client";

import React, { createContext, useContext } from "react";

type ModuleContextValue = {
  enabledKeys: string[];
  orgSlug: string;
};

const ModuleContext = createContext<ModuleContextValue>({ enabledKeys: [], orgSlug: "" });

export function ModuleProvider({
  children,
  enabledKeys,
  orgSlug,
}: {
  children: React.ReactNode;
  enabledKeys: string[];
  orgSlug: string;
}) {
  return (
    <ModuleContext.Provider value={{ enabledKeys, orgSlug }}>{children}</ModuleContext.Provider>
  );
}

export function useEnabledModules(): string[] {
  return useContext(ModuleContext).enabledKeys;
}

export function useOrgSlug(): string {
  return useContext(ModuleContext).orgSlug;
}

"use client";

import React, { createContext, useContext, useEffect } from "react";
import { useSetAtom } from "jotai";
import { enabledModuleKeysAtom, orgSlugAtom } from "./module-atoms";

type ModuleContextValue = {
  enabledKeys: string[];
  orgSlug: string;
};

const ModuleContext = createContext<ModuleContextValue>({ enabledKeys: [], orgSlug: "" });

/** Inner client component that syncs props into Jotai atoms so they're
 *  accessible outside this React context tree (e.g. inside GlobalDrawer). */
function ModuleAtomSync({ enabledKeys, orgSlug }: { enabledKeys: string[]; orgSlug: string }) {
  const setEnabledKeys = useSetAtom(enabledModuleKeysAtom);
  const setOrgSlug     = useSetAtom(orgSlugAtom);

  useEffect(() => { setEnabledKeys(enabledKeys); }, [enabledKeys, setEnabledKeys]);
  useEffect(() => { setOrgSlug(orgSlug); },        [orgSlug, setOrgSlug]);

  return null;
}

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
    <ModuleContext.Provider value={{ enabledKeys, orgSlug }}>
      <ModuleAtomSync enabledKeys={enabledKeys} orgSlug={orgSlug} />
      {children}
    </ModuleContext.Provider>
  );
}

export function useEnabledModules(): string[] {
  return useContext(ModuleContext).enabledKeys;
}

export function useOrgSlug(): string {
  return useContext(ModuleContext).orgSlug;
}

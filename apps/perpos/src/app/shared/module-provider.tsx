"use client";

import React, { createContext, useContext, useEffect } from "react";
import { useSetAtom } from "jotai";
import { enabledModuleKeysAtom, orgSlugAtom, orgRoleAtom } from "./module-atoms";

type ModuleContextValue = {
  enabledKeys: string[];
  orgSlug: string;
  orgRole: string | null;
};

const ModuleContext = createContext<ModuleContextValue>({ enabledKeys: [], orgSlug: "", orgRole: null });

/** Inner client component that syncs props into Jotai atoms so they're
 *  accessible outside this React context tree (e.g. inside GlobalDrawer). */
function ModuleAtomSync({ enabledKeys, orgSlug, orgRole }: { enabledKeys: string[]; orgSlug: string; orgRole: string | null }) {
  const setEnabledKeys = useSetAtom(enabledModuleKeysAtom);
  const setOrgSlug     = useSetAtom(orgSlugAtom);
  const setOrgRole     = useSetAtom(orgRoleAtom);

  useEffect(() => { setEnabledKeys(enabledKeys); }, [enabledKeys, setEnabledKeys]);
  useEffect(() => { setOrgSlug(orgSlug); },        [orgSlug, setOrgSlug]);
  useEffect(() => { setOrgRole(orgRole); },        [orgRole, setOrgRole]);

  return null;
}

export function ModuleProvider({
  children,
  enabledKeys,
  orgSlug,
  orgRole,
}: {
  children: React.ReactNode;
  enabledKeys: string[];
  orgSlug: string;
  orgRole: string | null;
}) {
  return (
    <ModuleContext.Provider value={{ enabledKeys, orgSlug, orgRole }}>
      <ModuleAtomSync enabledKeys={enabledKeys} orgSlug={orgSlug} orgRole={orgRole} />
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

export function useOrgRole(): string | null {
  return useContext(ModuleContext).orgRole;
}

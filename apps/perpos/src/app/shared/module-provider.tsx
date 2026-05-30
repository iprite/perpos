"use client";

import React, { createContext, useContext, useEffect } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { usePathname } from "next/navigation";
import { enabledModuleKeysAtom, orgSlugAtom, orgRoleAtom, moduleMenuLabelsAtom, activeModuleKeyAtom } from "./module-atoms";
import { ALL_MODULES } from "@/lib/modules";

type ModuleContextValue = {
  enabledKeys: string[];
  orgSlug: string;
  orgRole: string | null;
  menuLabels: Record<string, Record<string, string>>;
};

const ModuleContext = createContext<ModuleContextValue>({ enabledKeys: [], orgSlug: "", orgRole: null, menuLabels: {} });

/** Inner client component that syncs props into Jotai atoms so they're
 *  accessible outside this React context tree (e.g. inside GlobalDrawer). */
function ModuleAtomSync({
  enabledKeys, orgSlug, orgRole, menuLabels,
}: { enabledKeys: string[]; orgSlug: string; orgRole: string | null; menuLabels: Record<string, Record<string, string>> }) {
  const pathname        = usePathname() ?? "/";
  const setEnabledKeys  = useSetAtom(enabledModuleKeysAtom);
  const setOrgSlug      = useSetAtom(orgSlugAtom);
  const setOrgRole      = useSetAtom(orgRoleAtom);
  const setMenuLabels   = useSetAtom(moduleMenuLabelsAtom);
  const setActiveModule = useSetAtom(activeModuleKeyAtom);

  useEffect(() => { setEnabledKeys(enabledKeys); }, [enabledKeys, setEnabledKeys]);
  useEffect(() => { setOrgSlug(orgSlug); },          [orgSlug, setOrgSlug]);
  useEffect(() => { setOrgRole(orgRole); },          [orgRole, setOrgRole]);
  useEffect(() => { setMenuLabels(menuLabels); },    [menuLabels, setMenuLabels]);

  // Compute + persist the active (non-personal) module for this org
  const visibleModules = ALL_MODULES.filter((m) => enabledKeys.includes(m.key) && !m.personal);
  const activeModule   = visibleModules.find((m) => m.match(pathname)) ?? visibleModules[0];
  useEffect(() => {
    const key = activeModule?.key ?? "";
    setActiveModule(key);
    if (key && orgSlug) {
      document.cookie = `perpos.activeModule.${orgSlug}=${key};path=/;samesite=lax`;
    }
  }, [activeModule?.key, orgSlug, setActiveModule]);

  return null;
}

export function ModuleProvider({
  children,
  enabledKeys,
  orgSlug,
  orgRole,
  menuLabels = {},
}: {
  children: React.ReactNode;
  enabledKeys: string[];
  orgSlug: string;
  orgRole: string | null;
  menuLabels?: Record<string, Record<string, string>>;
}) {
  return (
    <ModuleContext.Provider value={{ enabledKeys, orgSlug, orgRole, menuLabels }}>
      <ModuleAtomSync enabledKeys={enabledKeys} orgSlug={orgSlug} orgRole={orgRole} menuLabels={menuLabels} />
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
  // Read from atom so this works inside GlobalDrawer (outside ModuleProvider context tree)
  return useAtomValue(orgRoleAtom);
}

/** Returns menu label overrides for all modules: moduleKey → { menuKey → label } */
export function useMenuLabels(): Record<string, Record<string, string>> {
  return useContext(ModuleContext).menuLabels;
}

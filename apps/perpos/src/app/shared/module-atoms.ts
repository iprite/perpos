"use client";

import { atom } from "jotai";

/** Global atoms so module state is readable outside of ModuleProvider's React context tree
 *  (e.g. inside GlobalDrawer which lives in root layout above HydrogenLayout).
 *  ModuleProvider syncs these atoms whenever enabledKeys/orgSlug change.
 */
export const enabledModuleKeysAtom = atom<string[]>([]);
export const orgSlugAtom            = atom<string>("");
export const orgRoleAtom            = atom<string | null>(null);
/** moduleKey → { menuKey → customLabel } */
export const moduleMenuLabelsAtom   = atom<Record<string, Record<string, string>>>({});
/** Key of the currently active (non-personal) module, derived from pathname */
export const activeModuleKeyAtom    = atom<string>("");

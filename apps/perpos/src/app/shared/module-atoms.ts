"use client";

import { atom } from "jotai";

/** Global atoms so module state is readable outside of ModuleProvider's React context tree
 *  (e.g. inside GlobalDrawer which lives in root layout above HydrogenLayout).
 *  ModuleProvider syncs these atoms whenever enabledKeys/orgSlug change.
 */
export const enabledModuleKeysAtom = atom<string[]>([]);
export const orgSlugAtom            = atom<string>("");

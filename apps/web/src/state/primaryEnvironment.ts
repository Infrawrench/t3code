import type { EnvironmentId } from "@t3tools/contracts";
import { Atom } from "effect/unstable/reactivity";

import { environmentCatalog } from "../connection/catalog";
import { activeEnvironmentIdAtom } from "./activeEnvironment";

export const primaryEnvironmentIdAtom = Atom.make((get) => {
  for (const [environmentId, entry] of get(environmentCatalog.catalogValueAtom).entries) {
    if (entry.target._tag === "PrimaryConnectionTarget") {
      return environmentId;
    }
  }
  return null;
}).pipe(Atom.withLabel("web-primary-environment-id"));

export function resolveSettingsEnvironmentId(input: {
  readonly primaryEnvironmentId: EnvironmentId | null;
  readonly activeEnvironmentId: EnvironmentId | null;
}): EnvironmentId | null {
  return input.primaryEnvironmentId ?? input.activeEnvironmentId;
}

/**
 * Environment whose `settings.json` the global settings UI reads and writes.
 *
 * Normally that is the primary environment — the server this client is served
 * from. The hosted site has no primary connection at all: every environment is
 * remote, so `primaryEnvironmentIdAtom` is null there and settings had nowhere
 * to go. Reads silently fell back to the schema defaults and writes were
 * silently dropped, so every server-backed setting bounced straight back to its
 * default the moment it was changed. Falling back to the active environment
 * gives hosted users the one server they are actually working against.
 *
 * Reads and writes must both resolve through this atom, or the UI shows one
 * server's settings while saving to another.
 */
export const settingsEnvironmentIdAtom = Atom.make((get) =>
  resolveSettingsEnvironmentId({
    primaryEnvironmentId: get(primaryEnvironmentIdAtom),
    activeEnvironmentId: get(activeEnvironmentIdAtom),
  }),
).pipe(Atom.withLabel("web-settings-environment-id"));

import type { EnvironmentId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { resolveSettingsEnvironmentId } from "./primaryEnvironment";

const primary = "env-primary" as EnvironmentId;
const active = "env-active" as EnvironmentId;

describe("resolveSettingsEnvironmentId", () => {
  it("prefers the primary environment when this client is served by one", () => {
    expect(
      resolveSettingsEnvironmentId({
        primaryEnvironmentId: primary,
        activeEnvironmentId: active,
      }),
    ).toBe(primary);
  });

  it("falls back to the active environment on the hosted site", () => {
    // The hosted site has no primary connection, so settings used to resolve to
    // no environment at all: reads fell back to schema defaults and writes were
    // dropped, making every server-backed setting snap back to its default.
    expect(
      resolveSettingsEnvironmentId({
        primaryEnvironmentId: null,
        activeEnvironmentId: active,
      }),
    ).toBe(active);
  });

  it("has no target before any environment is connected", () => {
    expect(
      resolveSettingsEnvironmentId({
        primaryEnvironmentId: null,
        activeEnvironmentId: null,
      }),
    ).toBeNull();
  });
});

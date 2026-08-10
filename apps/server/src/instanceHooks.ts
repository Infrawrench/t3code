import * as Effect from "effect/Effect";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";
import { ServerStopHookError, type ServerStopHookResult } from "@t3tools/contracts";

import * as ServerSettings from "./serverSettings.ts";

const STOP_HOOK_TIMEOUT = "20 seconds";

/**
 * Run the configured stop hook: DELETE the management endpoint that stops
 * this instance. A 204 reports the instance as stopping. A 404 means the
 * hook no longer exists, so the setting is cleared and clients drop their
 * stop controls with it.
 */
export const runStopHook = Effect.gen(function* () {
  const serverSettings = yield* ServerSettings.ServerSettingsService;
  const httpClient = yield* HttpClient.HttpClient;
  const settings = yield* serverSettings.getSettings;
  if (settings.stopHookUrl === null) {
    return yield* new ServerStopHookError({ reason: "not-configured" });
  }
  const response = yield* httpClient.execute(HttpClientRequest.delete(settings.stopHookUrl)).pipe(
    Effect.timeout(STOP_HOOK_TIMEOUT),
    Effect.mapError(
      (error) => new ServerStopHookError({ reason: "request-failed", detail: String(error) }),
    ),
  );
  if (response.status === 204) {
    return { outcome: "stopped" } satisfies ServerStopHookResult;
  }
  if (response.status === 404) {
    yield* serverSettings.updateSettings({ stopHookUrl: null });
    return { outcome: "gone" } satisfies ServerStopHookResult;
  }
  return yield* new ServerStopHookError({ reason: "unexpected-status", status: response.status });
});

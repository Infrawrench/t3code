import * as Effect from "effect/Effect";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";
import {
  ServerStopHookNotConfiguredError,
  ServerStopHookRequestError,
  ServerStopHookUnexpectedStatusError,
  type ServerStopHookResult,
} from "@t3tools/contracts";

import * as ServerSettings from "./serverSettings.ts";

const STOP_HOOK_TIMEOUT = "20 seconds";

function isHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Run the configured stop hook: DELETE the management endpoint that stops
 * this instance. A 204 reports the instance as stopping. A 404 means the
 * hook no longer exists, so the setting is cleared and clients drop their
 * stop controls with it.
 */
export const runStopHook = Effect.gen(function* () {
  const serverSettings = yield* ServerSettings.ServerSettingsService;
  const httpClient = yield* HttpClient.HttpClient;
  const stopHookUrl = (yield* serverSettings.getSettings).stopHookUrl;
  if (stopHookUrl === null) {
    return yield* new ServerStopHookNotConfiguredError({});
  }
  if (!isHttpUrl(stopHookUrl)) {
    return yield* new ServerStopHookRequestError({
      cause: new Error("The configured stop hook is not an http(s) URL."),
    });
  }
  const response = yield* httpClient.execute(HttpClientRequest.delete(stopHookUrl)).pipe(
    Effect.timeout(STOP_HOOK_TIMEOUT),
    Effect.mapError((error) => new ServerStopHookRequestError({ cause: error })),
  );
  if (response.status === 204) {
    return { outcome: "stopped" } satisfies ServerStopHookResult;
  }
  if (response.status === 404) {
    // Re-read before clearing: only forget the hook that actually returned
    // the 404, not one reconfigured while the request was in flight.
    if ((yield* serverSettings.getSettings).stopHookUrl === stopHookUrl) {
      yield* serverSettings.updateSettings({ stopHookUrl: null });
    }
    return { outcome: "gone" } satisfies ServerStopHookResult;
  }
  return yield* new ServerStopHookUnexpectedStatusError({ status: response.status });
});

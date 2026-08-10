import { ServerStopHookError } from "@t3tools/contracts";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";

import * as InstanceHooks from "./instanceHooks.ts";
import * as ServerSettings from "./serverSettings.ts";

interface RecordedHookRequest {
  readonly method: string;
  readonly url: string;
}

const makeHookEndpointLayer = (requests: Array<RecordedHookRequest>, status: number) =>
  Layer.succeed(
    HttpClient.HttpClient,
    HttpClient.make((request) =>
      Effect.sync(() => {
        requests.push({ method: request.method, url: request.url });
        return HttpClientResponse.fromWeb(request, new Response(null, { status }));
      }),
    ),
  );

const isStopHookError = Schema.is(ServerStopHookError);

it.effect("DELETEs the stop hook and reports the instance as stopping on 204", () =>
  Effect.gen(function* () {
    const requests: Array<RecordedHookRequest> = [];
    const result = yield* InstanceHooks.runStopHook.pipe(
      Effect.provide(
        Layer.mergeAll(
          makeHookEndpointLayer(requests, 204),
          ServerSettings.layerTest({ stopHookUrl: "https://mgmt.example.test/instances/1/stop" }),
        ),
      ),
    );
    assert.deepEqual(result, { outcome: "stopped" });
    assert.deepEqual(requests, [
      { method: "DELETE", url: "https://mgmt.example.test/instances/1/stop" },
    ]);
  }),
);

it.effect("clears the stop hook setting when the endpoint is gone", () =>
  Effect.gen(function* () {
    const requests: Array<RecordedHookRequest> = [];
    const settingsLayer = ServerSettings.layerTest({
      stopHookUrl: "https://mgmt.example.test/instances/1/stop",
    });
    const result = yield* Effect.gen(function* () {
      const outcome = yield* InstanceHooks.runStopHook.pipe(
        Effect.provide(makeHookEndpointLayer(requests, 404)),
      );
      const settings = yield* (yield* ServerSettings.ServerSettingsService).getSettings;
      return { outcome, stopHookUrl: settings.stopHookUrl };
    }).pipe(Effect.provide(settingsLayer));
    assert.deepEqual(result.outcome, { outcome: "gone" });
    assert.equal(result.stopHookUrl, null);
  }),
);

it.effect("fails when no stop hook is configured", () =>
  Effect.gen(function* () {
    const requests: Array<RecordedHookRequest> = [];
    const failure = yield* InstanceHooks.runStopHook.pipe(
      Effect.provide(
        Layer.mergeAll(makeHookEndpointLayer(requests, 204), ServerSettings.layerTest()),
      ),
      Effect.flip,
    );
    assert.isTrue(isStopHookError(failure));
    assert.equal(isStopHookError(failure) ? failure.reason : null, "not-configured");
    assert.deepEqual(requests, []);
  }),
);

it.effect("surfaces unexpected statuses without clearing the hook", () =>
  Effect.gen(function* () {
    const requests: Array<RecordedHookRequest> = [];
    const settingsLayer = ServerSettings.layerTest({
      stopHookUrl: "https://mgmt.example.test/instances/1/stop",
    });
    const result = yield* Effect.gen(function* () {
      const failure = yield* InstanceHooks.runStopHook.pipe(
        Effect.provide(makeHookEndpointLayer(requests, 500)),
        Effect.flip,
      );
      const settings = yield* (yield* ServerSettings.ServerSettingsService).getSettings;
      return { failure, stopHookUrl: settings.stopHookUrl };
    }).pipe(Effect.provide(settingsLayer));
    assert.isTrue(isStopHookError(result.failure));
    assert.equal(
      isStopHookError(result.failure) ? result.failure.reason : null,
      "unexpected-status",
    );
    assert.equal(result.stopHookUrl, "https://mgmt.example.test/instances/1/stop");
  }),
);

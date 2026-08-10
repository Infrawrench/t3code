import { describe, expect, it } from "vite-plus/test";

import {
  StartHookError,
  isStartHookInputComponent,
  pollStartHookUntilReady,
  requestStartHook,
  submitStartHookForm,
  validateStartHookTextInput,
} from "./startHook";

interface RecordedRequest {
  readonly url: string;
  readonly method: string;
  readonly body: string | null;
}

function makeFetch(responses: Array<Response>, requests: Array<RecordedRequest> = []) {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push({
      url: String(input),
      method: init?.method ?? "GET",
      body: typeof init?.body === "string" ? init.body : null,
    });
    const next = responses.shift();
    if (next === undefined) throw new Error("No stubbed response left.");
    return next;
  }) as typeof fetch;
}

const noSleep = () => Promise.resolve();

const pollResponse = () =>
  new Response(JSON.stringify({ poll_url: "https://mgmt.test/poll/1", retry_secs: 5 }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

describe("requestStartHook", () => {
  it("POSTs with no content and returns the poll state", async () => {
    const requests: Array<RecordedRequest> = [];
    const step = await requestStartHook("https://mgmt.test/start", {
      fetchImpl: makeFetch([pollResponse()], requests),
    });
    expect(step).toEqual({
      kind: "poll",
      poll: { poll_url: "https://mgmt.test/poll/1", retry_secs: 5 },
    });
    expect(requests).toEqual([{ url: "https://mgmt.test/start", method: "POST", body: null }]);
  });

  it("returns the form on a 400 component response", async () => {
    const form = {
      button_text: "Boot",
      components: [
        { text: "Pick a size." },
        {
          type: "select",
          title: "Size",
          description: "Instance size",
          defaultValue: "small",
          values: [
            { userTitle: "Small", userDescription: "2 vCPU", content: "small" },
            { userTitle: "Large", userDescription: "8 vCPU", content: "large" },
          ],
        },
      ],
    };
    const step = await requestStartHook("https://mgmt.test/start", {
      fetchImpl: makeFetch([
        new Response(JSON.stringify(form), {
          status: 400,
          headers: { "content-type": "application/json" },
        }),
      ]),
    });
    expect(step.kind).toBe("form");
    if (step.kind === "form") {
      expect(step.form.button_text).toBe("Boot");
      expect(step.form.components).toHaveLength(2);
      expect(step.form.components.filter(isStartHookInputComponent)).toHaveLength(1);
    }
  });

  it("treats an immediate 204 as already running", async () => {
    const step = await requestStartHook("https://mgmt.test/start", {
      fetchImpl: makeFetch([new Response(null, { status: 204 })]),
    });
    expect(step).toEqual({ kind: "ready" });
  });

  it("fails on unexpected statuses", async () => {
    await expect(
      requestStartHook("https://mgmt.test/start", {
        fetchImpl: makeFetch([new Response("nope", { status: 503 })]),
      }),
    ).rejects.toBeInstanceOf(StartHookError);
  });
});

describe("submitStartHookForm", () => {
  it("POSTs the resolved values as a JSON array", async () => {
    const requests: Array<RecordedRequest> = [];
    const step = await submitStartHookForm("https://mgmt.test/start", ["large", "my-vm"], {
      fetchImpl: makeFetch([pollResponse()], requests),
    });
    expect(step.kind).toBe("poll");
    expect(requests).toEqual([
      { url: "https://mgmt.test/start", method: "POST", body: '["large","my-vm"]' },
    ]);
  });
});

describe("pollStartHookUntilReady", () => {
  it("polls until a 204 arrives", async () => {
    const requests: Array<RecordedRequest> = [];
    await pollStartHookUntilReady(
      { poll_url: "https://mgmt.test/poll/1", retry_secs: 5 },
      {
        fetchImpl: makeFetch(
          [
            new Response(null, { status: 200 }),
            new Response(null, { status: 202 }),
            new Response(null, { status: 204 }),
          ],
          requests,
        ),
        sleep: noSleep,
      },
    );
    expect(requests).toHaveLength(3);
    expect(requests.every((request) => request.method === "GET")).toBe(true);
  });

  it("fails when polling returns an error status", async () => {
    await expect(
      pollStartHookUntilReady(
        { poll_url: "https://mgmt.test/poll/1", retry_secs: 5 },
        { fetchImpl: makeFetch([new Response(null, { status: 500 })]), sleep: noSleep },
      ),
    ).rejects.toBeInstanceOf(StartHookError);
  });
});

describe("validateStartHookTextInput", () => {
  const component = {
    type: "text",
    title: "Name",
    description: "Instance name",
    regex: "^[a-z-]+$",
    validationError: "Lowercase letters and dashes only.",
  } as const;

  it("accepts matching input", () => {
    expect(validateStartHookTextInput(component, "my-vm")).toBeNull();
  });

  it("returns the component's validation error for mismatches", () => {
    expect(validateStartHookTextInput(component, "My VM")).toBe(
      "Lowercase letters and dashes only.",
    );
  });

  it("does not lock the user out on an unparsable pattern", () => {
    expect(validateStartHookTextInput({ ...component, regex: "(" }, "anything")).toBeNull();
  });
});

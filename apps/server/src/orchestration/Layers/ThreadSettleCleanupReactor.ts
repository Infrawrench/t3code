import type { OrchestrationEvent } from "@t3tools/contracts";
import { makeDrainableWorker } from "@t3tools/shared/DrainableWorker";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";

import { isLinkedWorktreePath, removeWorktreeArtifacts } from "../../git/worktreeArtifacts.ts";
import {
  ProjectionThreadRepository,
  type ProjectionThread,
} from "../../persistence/Services/ProjectionThreads.ts";
import { forkParked } from "../../serverActivation.ts";
import * as ServerSettings from "../../serverSettings.ts";
import { OrchestrationEngineService } from "../Services/OrchestrationEngine.ts";
import {
  ThreadSettleCleanupReactor,
  type ThreadSettleCleanupReactorShape,
} from "../Services/ThreadSettleCleanupReactor.ts";

type ThreadSettledEvent = Extract<OrchestrationEvent, { type: "thread.settled" }>;

const normalizeWorktreePath = (path: string | null): string | null => {
  const trimmed = path?.trim();
  return trimmed ? trimmed : null;
};

/**
 * Whether another live thread points at the same worktree, in which case the
 * settling thread does not own the directory and must leave it alone.
 */
export const isWorktreeSharedWithAnotherThread = (
  threads: ReadonlyArray<Pick<ProjectionThread, "threadId" | "worktreePath" | "deletedAt">>,
  target: Pick<ProjectionThread, "threadId" | "worktreePath">,
): boolean => {
  const targetWorktreePath = normalizeWorktreePath(target.worktreePath);
  if (!targetWorktreePath) {
    return false;
  }
  return threads.some(
    (thread) =>
      thread.threadId !== target.threadId &&
      thread.deletedAt === null &&
      normalizeWorktreePath(thread.worktreePath) === targetWorktreePath,
  );
};

const make = Effect.gen(function* () {
  const orchestrationEngine = yield* OrchestrationEngineService;
  const projectionThreads = yield* ProjectionThreadRepository;
  const serverSettings = yield* ServerSettings.ServerSettingsService;

  const processThreadSettled = Effect.fn("processThreadSettled")(function* (
    event: ThreadSettledEvent,
  ) {
    const { threadId } = event.payload;
    const settings = yield* serverSettings.getSettings;
    if (!settings.cleanWorktreeArtifactsOnSettle) {
      return;
    }

    const thread = Option.getOrNull(yield* projectionThreads.getById({ threadId }));
    const worktreePath = normalizeWorktreePath(thread?.worktreePath ?? null);
    if (!thread || thread.deletedAt !== null || !worktreePath) {
      return;
    }

    const projectThreads = yield* projectionThreads.listByProjectId({
      projectId: thread.projectId,
    });
    if (isWorktreeSharedWithAnotherThread(projectThreads, thread)) {
      return;
    }

    // Only linked worktrees are cleaned; a thread running directly in the
    // project's primary checkout keeps its caches.
    if (!(yield* isLinkedWorktreePath(worktreePath))) {
      return;
    }

    const { removed, failed } = yield* removeWorktreeArtifacts(worktreePath);
    if (removed.length > 0 || failed.length > 0) {
      yield* Effect.logInfo("settle cleanup removed worktree build artifacts", {
        threadId,
        worktreePath,
        removed,
        failed,
      });
    }
  });

  const processThreadSettledSafely = (event: ThreadSettledEvent) =>
    processThreadSettled(event).pipe(
      Effect.catchCause((cause) => {
        if (Cause.hasInterruptsOnly(cause)) {
          return Effect.failCause(cause);
        }
        return Effect.logDebug("settle cleanup reactor skipped worktree cleanup", {
          eventType: event.type,
          threadId: event.payload.threadId,
          cause: Cause.pretty(cause),
        });
      }),
    );

  const worker = yield* makeDrainableWorker(processThreadSettledSafely);

  const start: ThreadSettleCleanupReactorShape["start"] = Effect.fn("start")(function* () {
    yield* forkParked(
      Stream.runForEach(orchestrationEngine.streamDomainEvents, (event) => {
        if (event.type !== "thread.settled") {
          return Effect.void;
        }
        return worker.enqueue(event);
      }),
    );
  });

  return {
    start,
    drain: worker.drain,
  } satisfies ThreadSettleCleanupReactorShape;
});

export const ThreadSettleCleanupReactorLive = Layer.effect(ThreadSettleCleanupReactor, make);

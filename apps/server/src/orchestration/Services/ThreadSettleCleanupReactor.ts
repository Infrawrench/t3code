/**
 * ThreadSettleCleanupReactor - Settled-thread worktree cleanup reactor
 * service interface.
 *
 * Owns background workers that react to thread settlement domain events and
 * perform best-effort disk cleanup of regenerable build artifacts in the
 * settled thread's worktree.
 *
 * @module ThreadSettleCleanupReactor
 */
import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type * as Scope from "effect/Scope";

/**
 * ThreadSettleCleanupReactorShape - Service API for settle-time worktree
 * cleanup.
 */
export interface ThreadSettleCleanupReactorShape {
  /**
   * Start reacting to thread.settled orchestration domain events.
   *
   * The returned effect must be run in a scope so all worker fibers can be
   * finalized on shutdown.
   */
  readonly start: () => Effect.Effect<void, never, Scope.Scope>;

  /**
   * Resolves when the internal processing queue is empty and idle.
   * Intended for test use to replace timing-sensitive sleeps.
   */
  readonly drain: Effect.Effect<void>;
}

/**
 * ThreadSettleCleanupReactor - Service tag for settle-time worktree cleanup
 * workers.
 */
export class ThreadSettleCleanupReactor extends Context.Service<
  ThreadSettleCleanupReactor,
  ThreadSettleCleanupReactorShape
>()("t3/orchestration/Services/ThreadSettleCleanupReactor") {}

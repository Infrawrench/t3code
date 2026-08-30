import { ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { isWorktreeSharedWithAnotherThread } from "./ThreadSettleCleanupReactor.ts";

describe("isWorktreeSharedWithAnotherThread", () => {
  const target = {
    threadId: ThreadId.make("thread-settle-cleanup-target"),
    worktreePath: "/tmp/worktrees/repo/branch",
  };
  const otherId = ThreadId.make("thread-settle-cleanup-other");

  it("is false when no other thread uses the worktree", () => {
    const threads = [
      { ...target, deletedAt: null },
      { threadId: otherId, worktreePath: "/tmp/worktrees/repo/other", deletedAt: null },
      { threadId: otherId, worktreePath: null, deletedAt: null },
    ];

    expect(isWorktreeSharedWithAnotherThread(threads, target)).toBe(false);
  });

  it("is true when a live thread shares the worktree", () => {
    const threads = [
      { ...target, deletedAt: null },
      { threadId: otherId, worktreePath: target.worktreePath, deletedAt: null },
    ];

    expect(isWorktreeSharedWithAnotherThread(threads, target)).toBe(true);
  });

  it("ignores deleted threads sharing the worktree", () => {
    const threads = [
      { ...target, deletedAt: null },
      { threadId: otherId, worktreePath: target.worktreePath, deletedAt: "2026-08-30T00:00:00Z" },
    ];

    expect(isWorktreeSharedWithAnotherThread(threads, target)).toBe(false);
  });

  it("is false when the target has no worktree", () => {
    expect(
      isWorktreeSharedWithAnotherThread([], { threadId: target.threadId, worktreePath: null }),
    ).toBe(false);
  });
});

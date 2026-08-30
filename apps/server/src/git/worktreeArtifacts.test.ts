import * as NodeServices from "@effect/platform-node/NodeServices";
import { it, describe, expect } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import {
  findWorktreeArtifactDirectories,
  isLinkedWorktreePath,
  removeWorktreeArtifacts,
} from "./worktreeArtifacts.ts";

const makeTempDir = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  return yield* fileSystem.makeTempDirectoryScoped({ prefix: "t3code-worktree-artifacts-" });
});

const writeFile = Effect.fn("writeFile")(function* (
  cwd: string,
  relativePath: string,
  contents = "",
) {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const absolutePath = path.join(cwd, relativePath);
  yield* fileSystem.makeDirectory(path.dirname(absolutePath), { recursive: true });
  yield* fileSystem.writeFileString(absolutePath, contents);
});

const makeDir = Effect.fn("makeDir")(function* (cwd: string, relativePath: string) {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  yield* fileSystem.makeDirectory(path.join(cwd, relativePath), { recursive: true });
});

const relativeArtifacts = Effect.fn("relativeArtifacts")(function* (cwd: string) {
  const path = yield* Path.Path;
  const found = yield* findWorktreeArtifactDirectories(cwd);
  return found.map((absolute) => path.relative(cwd, absolute)).sort();
});

it.layer(NodeServices.layer, { excludeTestServices: true })("worktreeArtifacts", (it) => {
  describe("findWorktreeArtifactDirectories", () => {
    it.effect("finds node_modules and framework caches at any depth", () =>
      Effect.scoped(
        Effect.gen(function* () {
          const cwd = yield* makeTempDir;
          yield* makeDir(cwd, "node_modules/react");
          yield* makeDir(cwd, "apps/web/node_modules");
          yield* makeDir(cwd, "apps/web/.next");
          yield* makeDir(cwd, ".turbo");
          yield* writeFile(cwd, "apps/web/src/index.ts");

          expect(yield* relativeArtifacts(cwd)).toEqual([
            ".turbo",
            "apps/web/.next",
            "apps/web/node_modules",
            "node_modules",
          ]);
        }),
      ),
    );

    it.effect("only treats target as an artifact next to a Cargo.toml", () =>
      Effect.scoped(
        Effect.gen(function* () {
          const cwd = yield* makeTempDir;
          yield* writeFile(cwd, "native/monitor/Cargo.toml");
          yield* makeDir(cwd, "native/monitor/target/debug");
          yield* makeDir(cwd, "src/target");

          expect(yield* relativeArtifacts(cwd)).toEqual(["native/monitor/target"]);
        }),
      ),
    );

    it.effect("ignores target when the Cargo.toml sibling is a directory", () =>
      Effect.scoped(
        Effect.gen(function* () {
          const cwd = yield* makeTempDir;
          yield* makeDir(cwd, "pkg/Cargo.toml");
          yield* makeDir(cwd, "pkg/target");

          expect(yield* relativeArtifacts(cwd)).toEqual([]);
        }),
      ),
    );

    it.effect("does not descend into matched artifacts or .git", () =>
      Effect.scoped(
        Effect.gen(function* () {
          const cwd = yield* makeTempDir;
          yield* makeDir(cwd, "node_modules/nested/node_modules");
          yield* makeDir(cwd, ".git/modules/node_modules");

          expect(yield* relativeArtifacts(cwd)).toEqual(["node_modules"]);
        }),
      ),
    );

    it.effect("does not follow symlinked directories out of the worktree", () =>
      Effect.scoped(
        Effect.gen(function* () {
          const fileSystem = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const cwd = yield* makeTempDir;
          const outside = yield* makeTempDir;
          yield* makeDir(outside, "node_modules");
          yield* fileSystem.symlink(outside, path.join(cwd, "linked"));

          expect(yield* relativeArtifacts(cwd)).toEqual([]);
        }),
      ),
    );
  });

  describe("removeWorktreeArtifacts", () => {
    it.effect("removes artifacts and keeps source files", () =>
      Effect.scoped(
        Effect.gen(function* () {
          const fileSystem = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const cwd = yield* makeTempDir;
          yield* makeDir(cwd, "node_modules/react");
          yield* writeFile(cwd, "Cargo.toml");
          yield* makeDir(cwd, "target/release");
          yield* writeFile(cwd, "src/main.rs");

          const result = yield* removeWorktreeArtifacts(cwd);

          expect(result.failed).toEqual([]);
          expect(result.removed.map((absolute) => path.relative(cwd, absolute)).sort()).toEqual([
            "node_modules",
            "target",
          ]);
          expect(yield* fileSystem.exists(path.join(cwd, "node_modules"))).toBe(false);
          expect(yield* fileSystem.exists(path.join(cwd, "target"))).toBe(false);
          expect(yield* fileSystem.exists(path.join(cwd, "src/main.rs"))).toBe(true);
        }),
      ),
    );
  });

  describe("isLinkedWorktreePath", () => {
    it.effect("recognizes a linked worktree via its gitdir's commondir file", () =>
      Effect.scoped(
        Effect.gen(function* () {
          const path = yield* Path.Path;
          const repo = yield* makeTempDir;
          yield* writeFile(repo, ".git/worktrees/branch/commondir", "../..\n");
          const cwd = yield* makeTempDir;
          yield* writeFile(cwd, ".git", `gitdir: ${path.join(repo, ".git/worktrees/branch")}\n`);

          expect(yield* isLinkedWorktreePath(cwd)).toBe(true);
        }),
      ),
    );

    it.effect("rejects a separate-git-dir primary checkout", () =>
      Effect.scoped(
        Effect.gen(function* () {
          const path = yield* Path.Path;
          const gitDir = yield* makeTempDir;
          yield* writeFile(gitDir, "HEAD", "ref: refs/heads/main\n");
          const cwd = yield* makeTempDir;
          yield* writeFile(cwd, ".git", `gitdir: ${path.join(gitDir)}\n`);

          expect(yield* isLinkedWorktreePath(cwd)).toBe(false);
        }),
      ),
    );

    it.effect("rejects a malformed .git pointer file", () =>
      Effect.scoped(
        Effect.gen(function* () {
          const cwd = yield* makeTempDir;
          yield* writeFile(cwd, ".git", "not a pointer\n");

          expect(yield* isLinkedWorktreePath(cwd)).toBe(false);
        }),
      ),
    );

    it.effect("rejects a primary checkout with a .git directory", () =>
      Effect.scoped(
        Effect.gen(function* () {
          const cwd = yield* makeTempDir;
          yield* makeDir(cwd, ".git");

          expect(yield* isLinkedWorktreePath(cwd)).toBe(false);
        }),
      ),
    );

    it.effect("rejects a directory without any .git entry", () =>
      Effect.scoped(
        Effect.gen(function* () {
          const cwd = yield* makeTempDir;

          expect(yield* isLinkedWorktreePath(cwd)).toBe(false);
        }),
      ),
    );
  });
});

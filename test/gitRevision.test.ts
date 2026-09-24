import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  type GitCommandRunner,
  readRevisionFileContents,
} from "../src/source/gitRevision";

describe("readRevisionFileContents", () => {
  it("同じrepositoryのbase/target blobを取得する", async () => {
    const runner = createRunner({
      "base-commit:src/file.ts": "before\n",
      "target-commit:src/file.ts": "after\n",
    });

    const contents = await readRevisionFileContents(
      ["/workspace"],
      "base",
      "target",
      "src/file.ts",
      runner,
    );

    assert.deepEqual(contents, {
      repositoryRoot: "/repository",
      baseContent: "before\n",
      targetContent: "after\n",
    });
  });

  it("baseに存在しない新規ファイルは空内容としてDiffに渡す", async () => {
    const runner = createRunner({
      "target-commit:src/new.ts": "new file\n",
    });

    const contents = await readRevisionFileContents(
      ["/workspace"],
      "base",
      "target",
      "src/new.ts",
      runner,
    );

    assert.equal(contents.baseContent, "");
    assert.equal(contents.targetContent, "new file\n");
  });

  it("revisionを解決できない場合は明示的に失敗する", async () => {
    const runner: GitCommandRunner = async (_workingDirectory, args) => {
      if (args[0] === "rev-parse" && args[1] === "--show-toplevel") {
        return "/repository\n";
      }
      throw new Error("unknown revision");
    };

    await assert.rejects(
      readRevisionFileContents(
        ["/workspace"],
        "missing-base",
        "missing-target",
        "src/file.ts",
        runner,
      ),
      /baseRevisionまたはtargetRevisionを解決できません/,
    );
  });
});

function createRunner(blobs: Record<string, string>): GitCommandRunner {
  return async (_workingDirectory, args) => {
    if (args[0] === "rev-parse" && args[1] === "--show-toplevel") {
      return "/repository\n";
    }

    if (args[0] === "rev-parse" && args[1] === "--verify") {
      const revision = args.at(-1);
      return revision?.startsWith("base") ? "base-commit\n" : "target-commit\n";
    }

    if (args[0] === "cat-file" && args[1] === "blob") {
      const content = blobs[args[2]];
      if (content !== undefined) {
        return content;
      }
      throw new Error("missing blob");
    }

    throw new Error(`unexpected git command: ${args.join(" ")}`);
  };
}

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { renderOverview } from "../src/overview/renderOverview";
import type { ChangeReview } from "../src/review/schema";
import { validateChangeReview } from "../src/review/validation";

function loadFixture(): ChangeReview {
  const source = readFileSync(join(process.cwd(), "fixtures", "review.json"), "utf8");
  return JSON.parse(source) as ChangeReview;
}

describe("validateChangeReview", () => {
  it("EmfrpDebugger fixtureを受理する", () => {
    const result = validateChangeReview(loadFixture());
    assert.equal(result.ok, true, result.ok ? undefined : result.errors.join("\n"));
  });

  it("存在しないSourceLocation参照を拒否する", () => {
    const review = loadFixture();
    review.flows[0].steps[0].locationIds = ["missing-location"];

    const result = validateChangeReview(review);

    assert.equal(result.ok, false);
    assert.match(result.ok ? "" : result.errors.join("\n"), /存在しないlocation/);
  });

  it("逆転した行範囲を拒否する", () => {
    const review = loadFixture();
    review.locations[0].startLine = 10;
    review.locations[0].endLine = 9;

    const result = validateChangeReview(review);

    assert.equal(result.ok, false);
    assert.match(result.ok ? "" : result.errors.join("\n"), /startLine 以上/);
  });
});

describe("renderOverview", () => {
  it("OverviewとFlowボタンを描画し、入力値をescapeする", () => {
    const review = loadFixture();
    review.change.title = '<script>alert("x")</script>';

    const html = renderOverview(review, "test-nonce");

    assert.match(html, /Implementation Overview/);
    assert.match(html, /data-flow-id="replay-execution"/);
    assert.match(html, /vscode\.postMessage\(\{ type: "openFlow", flowId \}\)/);
    assert.doesNotMatch(html, /<script>alert/);
    assert.match(html, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;/);
  });
});

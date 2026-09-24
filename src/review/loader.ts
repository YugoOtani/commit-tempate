import * as vscode from "vscode";
import type { ChangeReview } from "./schema";
import { validateChangeReview } from "./validation";

export async function loadBundledReview(extensionUri: vscode.Uri): Promise<ChangeReview> {
  const fixtureUri = vscode.Uri.joinPath(extensionUri, "fixtures", "review.json");
  const bytes = await vscode.workspace.fs.readFile(fixtureUri);
  return parseChangeReviewJson(Buffer.from(bytes).toString("utf8"));
}

export function parseChangeReviewJson(source: string): ChangeReview {
  let value: unknown;

  try {
    value = JSON.parse(source) as unknown;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`review.jsonをJSONとして読み込めません: ${detail}`);
  }

  const result = validateChangeReview(value);
  if (!result.ok) {
    throw new Error(`review.jsonがChangeReview schemaに一致しません:\n${result.errors.join("\n")}`);
  }

  return result.value;
}

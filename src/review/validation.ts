import type { ChangeReview } from "./schema";

export type ValidationResult =
  | { ok: true; value: ChangeReview }
  | { ok: false; errors: string[] };

type JsonObject = Record<string, unknown>;

export function validateChangeReview(value: unknown): ValidationResult {
  const errors: string[] = [];
  const root = readObject(value, "$", errors);

  if (!root) {
    return { ok: false, errors };
  }

  validateChange(root.change, "$.change", errors);
  validateOverview(root.overview, "$.overview", errors);
  validateFlows(root.flows, "$.flows", errors);
  validateLocations(root.locations, "$.locations", errors);
  validateExplanations(root.explanations, "$.explanations", errors);

  if (errors.length === 0) {
    validateRelations(root as ChangeReview, errors);
  }

  return errors.length === 0
    ? { ok: true, value: root as ChangeReview }
    : { ok: false, errors };
}

function validateChange(value: unknown, path: string, errors: string[]): void {
  const object = readObject(value, path, errors);
  if (!object) {
    return;
  }

  readString(object.id, `${path}.id`, errors);
  readString(object.title, `${path}.title`, errors);
  readOptionalString(object.request, `${path}.request`, errors);
  readString(object.baseRevision, `${path}.baseRevision`, errors);
  readString(object.targetRevision, `${path}.targetRevision`, errors);
}

function validateOverview(value: unknown, path: string, errors: string[]): void {
  const object = readObject(value, path, errors);
  if (!object) {
    return;
  }

  readString(object.summary, `${path}.summary`, errors);
  readStringArray(object.implementation, `${path}.implementation`, errors);
}

function validateFlows(value: unknown, path: string, errors: string[]): void {
  const flows = readArray(value, path, errors);
  if (!flows) {
    return;
  }

  flows.forEach((flow, flowIndex) => {
    const flowPath = `${path}[${flowIndex}]`;
    const object = readObject(flow, flowPath, errors);
    if (!object) {
      return;
    }

    readString(object.id, `${flowPath}.id`, errors);
    readString(object.title, `${flowPath}.title`, errors);
    readOptionalString(object.description, `${flowPath}.description`, errors);

    const steps = readArray(object.steps, `${flowPath}.steps`, errors);
    steps?.forEach((step, stepIndex) => {
      const stepPath = `${flowPath}.steps[${stepIndex}]`;
      const stepObject = readObject(step, stepPath, errors);
      if (!stepObject) {
        return;
      }

      readString(stepObject.id, `${stepPath}.id`, errors);
      readString(stepObject.title, `${stepPath}.title`, errors);
      readOptionalString(stepObject.description, `${stepPath}.description`, errors);
      readStringArray(stepObject.locationIds, `${stepPath}.locationIds`, errors);
    });
  });
}

function validateLocations(value: unknown, path: string, errors: string[]): void {
  const locations = readArray(value, path, errors);
  if (!locations) {
    return;
  }

  locations.forEach((location, index) => {
    const locationPath = `${path}[${index}]`;
    const object = readObject(location, locationPath, errors);
    if (!object) {
      return;
    }

    readString(object.id, `${locationPath}.id`, errors);
    readString(object.file, `${locationPath}.file`, errors);
    const startLine = readPositiveInteger(object.startLine, `${locationPath}.startLine`, errors);
    const endLine = readPositiveInteger(object.endLine, `${locationPath}.endLine`, errors);
    if (startLine !== undefined && endLine !== undefined && endLine < startLine) {
      errors.push(`${locationPath}.endLine は startLine 以上である必要があります`);
    }
  });
}

function validateExplanations(value: unknown, path: string, errors: string[]): void {
  const explanations = readArray(value, path, errors);
  if (!explanations) {
    return;
  }

  explanations.forEach((explanation, index) => {
    const explanationPath = `${path}[${index}]`;
    const object = readObject(explanation, explanationPath, errors);
    if (!object) {
      return;
    }

    readString(object.locationId, `${explanationPath}.locationId`, errors);
    readString(object.title, `${explanationPath}.title`, errors);
    readString(object.role, `${explanationPath}.role`, errors);
    readOptionalString(object.why, `${explanationPath}.why`, errors);
    if (object.watch !== undefined) {
      readStringArray(object.watch, `${explanationPath}.watch`, errors);
    }
  });
}

function validateRelations(review: ChangeReview, errors: string[]): void {
  reportDuplicateIds(review.flows.map((flow) => flow.id), "$.flows", errors);
  reportDuplicateIds(review.locations.map((location) => location.id), "$.locations", errors);

  const locationIds = new Set(review.locations.map((location) => location.id));
  review.flows.forEach((flow, flowIndex) => {
    reportDuplicateIds(
      flow.steps.map((step) => step.id),
      `$.flows[${flowIndex}].steps`,
      errors,
    );
    flow.steps.forEach((step, stepIndex) => {
      step.locationIds.forEach((locationId, locationIndex) => {
        if (!locationIds.has(locationId)) {
          errors.push(
            `$.flows[${flowIndex}].steps[${stepIndex}].locationIds[${locationIndex}] が存在しないlocationを参照しています: ${locationId}`,
          );
        }
      });
    });
  });

  review.explanations.forEach((explanation, index) => {
    if (!locationIds.has(explanation.locationId)) {
      errors.push(
        `$.explanations[${index}].locationId が存在しないlocationを参照しています: ${explanation.locationId}`,
      );
    }
  });
}

function reportDuplicateIds(ids: string[], path: string, errors: string[]): void {
  const seen = new Set<string>();
  ids.forEach((id, index) => {
    if (seen.has(id)) {
      errors.push(`${path}[${index}].id が重複しています: ${id}`);
    }
    seen.add(id);
  });
}

function readObject(value: unknown, path: string, errors: string[]): JsonObject | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    errors.push(`${path} はobjectである必要があります`);
    return undefined;
  }
  return value as JsonObject;
}

function readArray(value: unknown, path: string, errors: string[]): unknown[] | undefined {
  if (!Array.isArray(value)) {
    errors.push(`${path} はarrayである必要があります`);
    return undefined;
  }
  return value;
}

function readString(value: unknown, path: string, errors: string[]): string | undefined {
  if (typeof value !== "string") {
    errors.push(`${path} はstringである必要があります`);
    return undefined;
  }
  return value;
}

function readOptionalString(value: unknown, path: string, errors: string[]): void {
  if (value !== undefined) {
    readString(value, path, errors);
  }
}

function readStringArray(value: unknown, path: string, errors: string[]): string[] | undefined {
  const values = readArray(value, path, errors);
  if (!values) {
    return undefined;
  }

  values.forEach((item, index) => readString(item, `${path}[${index}]`, errors));
  return values.every((item) => typeof item === "string") ? (values as string[]) : undefined;
}

function readPositiveInteger(value: unknown, path: string, errors: string[]): number | undefined {
  if (!Number.isInteger(value) || (value as number) < 1) {
    errors.push(`${path} は1以上のintegerである必要があります`);
    return undefined;
  }
  return value as number;
}

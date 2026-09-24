export type ChangeReview = {
  change: {
    id: string;
    title: string;
    request?: string;
    baseRevision: string;
    targetRevision: string;
  };
  overview: {
    summary: string;
    implementation: string[];
  };
  flows: Flow[];
  locations: SourceLocation[];
  explanations: SourceExplanation[];
};

export type Flow = {
  id: string;
  title: string;
  description?: string;
  steps: FlowStep[];
};

export type FlowStep = {
  id: string;
  title: string;
  description?: string;
  locationIds: string[];
};

export type SourceLocation = {
  id: string;
  file: string;
  startLine: number;
  endLine: number;
};

export type SourceExplanation = {
  locationId: string;
  title: string;
  role: string;
  why?: string;
  watch?: string[];
};

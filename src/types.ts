export type InputModel = {
  id: string;
  provider?: string;
};

/** A normalized deprecations.info raw-API record. */
export type DeprecationRecord = {
  provider: string;
  model_id: string;
  shutdown_date?: string;
  deprecation_date?: string;
  announcement_date?: string;
  replacement_models?: string[] | null;
  deprecation_context?: string;
  url?: string;
  first_observed?: string;
  last_observed?: string;
  scraped_at?: string;
};

export type Finding = {
  findingId: string;
  id: string;
  provider: string;
  status: "scheduled" | "shutdown-passed" | "date-unknown";
  shutdownDate: string | null;
  daysUntilShutdown: number | null;
  deprecationDate?: string;
  announcementDate?: string;
  replacementModels: string[];
  url?: string;
  context?: string;
};

export type MatchResult = {
  findings: Finding[];
  matchedModelCount: number;
  unmatchedModels: InputModel[];
};

export type ProviderFreshness = {
  provider: string;
  ageDays: number | null;
  newestTimestamp: number | null;
};

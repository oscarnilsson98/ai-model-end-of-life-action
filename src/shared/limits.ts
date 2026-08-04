/** Shared upper bound for lifecycle warning and enforcement horizons. */
export const MAX_POLICY_DAYS = 36_500;

/**
 * Default upstream-freshness horizon. A feed that stopped updating keeps answering
 * every lookup with a permanent all-clear, so age beyond this makes coverage partial.
 */
export const DEFAULT_MAX_FEED_AGE_DAYS = 30;

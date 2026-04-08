/**
 * Limits and exclusions for DNP3 parsing/graphing so large Turtle files do not OOM the browser.
 * Keep in sync with field names your DER exposes (see solid_devices.json / device TTL).
 */

/** Max points kept per logical series (field + pod device + group + register) after parsing. */
export const MAX_DNP3_POINTS_PER_SERIES = 250;

/**
 * Max (value, timestamp) pairs taken from each RDF subject's parallel arrays.
 * History is truncated to the newest samples only.
 */
export const MAX_DNP3_SAMPLES_PER_SUBJECT = 40;

/** Field names that are non-numeric enums/flags and should not be parsed (add as needed). */
export const DNP3_FIELDS_EXCLUDED_FROM_GRAPH: ReadonlySet<string> = new Set(['VolWatt_Enable']);

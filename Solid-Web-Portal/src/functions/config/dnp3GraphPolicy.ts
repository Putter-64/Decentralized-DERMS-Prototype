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

/**
 * DNP3 fields still parsed and available for UI (e.g. Typhoon panel) but omitted from time-series charts.
 * Match is case-insensitive on the field label.
 */
const DNP3_FIELDS_OMITTED_FROM_TIME_CHART_LC = new Set([
  'state',
  'converter_mode',
  'converter_mode_fb',
  'converter mode',
  'converter mode fb',
]);

export function shouldOmitDnp3FieldFromTimeChart(field: string | undefined): boolean {
  if (!field) return false;
  return DNP3_FIELDS_OMITTED_FROM_TIME_CHART_LC.has(field.trim().toLowerCase());
}

/** Human-readable labels for Typhoon/DNP3 numeric State values. */
export const DNP3_STATE_LABELS: Readonly<Record<number, string>> = Object.freeze({
  1: 'starting',
  2: 'running',
  3: 'disabled',
  4: 'error',
});

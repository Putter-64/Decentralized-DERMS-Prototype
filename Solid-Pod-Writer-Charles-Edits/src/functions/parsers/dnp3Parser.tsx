import {
  DNP3_FIELDS_EXCLUDED_FROM_GRAPH,
  MAX_DNP3_POINTS_PER_SERIES,
  MAX_DNP3_SAMPLES_PER_SUBJECT,
} from '../config/dnp3GraphPolicy';
import { DNP3Data } from '../dataTypes';

/**
 * Parses DNP3 RDF/Turtle from Solid Pod (e.g. .../dnp3/devices/Battery/data.ttl).
 * Uses full IRIs: #accessed, #group, #type, #field, #register, #value, #device.
 */
interface Dnp3Props {
  accessed: string | null;
  accessedList: string[] | null;
  group: number | null;
  typeStr: string | null;
  field: string | null;
  register: number | null;
  value: number | null;
  values: number[] | null;
  device: string | null;
  /** Raw `#value` literal (unquoted content) for graphability checks. */
  valueRawQuoted: string | null;
}

/** Python-style TTL arrays that contain only True/False — not graphed (saves memory). */
function isBooleanOnlyArrayRaw(raw: string): boolean {
  const s = raw.trim();
  if (!s.startsWith('[') || !s.endsWith(']')) return false;
  const inner = s.slice(1, -1).trim();
  if (!inner) return false;
  const parts = inner.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return false;
  return parts.every((p) => /^True$/i.test(p) || /^False$/i.test(p));
}

/** Exported for in-memory caps after merge (e.g. repeated WebSocket fetches). */
export function trimDnp3ResultsBySeries(results: DNP3Data[], maxPerSeries: number): DNP3Data[] {
  const byKey = new Map<string, DNP3Data[]>();
  for (const p of results) {
    const key = `${p.fileDeviceId ?? ''}\0${p.field}\0${p.group}\0${p.register}`;
    let arr = byKey.get(key);
    if (!arr) {
      arr = [];
      byKey.set(key, arr);
    }
    arr.push(p);
  }
  const out: DNP3Data[] = [];
  for (const arr of byKey.values()) {
    arr.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    out.push(...arr.slice(-maxPerSeries));
  }
  return out;
}

function parseOneTriple(part: string, out: Dnp3Props): void {
  if (part.includes('#accessed') || part.includes('accessed')) {
    const m = part.match(/"([^"]+)"/);
    if (m) {
      out.accessed = m[1];
      const list = parseTimestampList(m[1]);
      if (list && list.length) out.accessedList = list;
    }
  } else if (part.includes('#group') || part.includes('group')) {
    const m = part.match(/>\s*(\d+)\s*\.?/) || part.match(/(\d+)\s*\.?$/);
    if (m) out.group = parseInt(m[1], 10);
  } else if (part.includes('#type') || (part.includes('type') && part.includes('"'))) {
    const m = part.match(/"([^"]+)"/);
    if (m) out.typeStr = m[1];
  } else if (part.includes('#field') || part.includes('field')) {
    const m = part.match(/"([^"]+)"/);
    if (m) out.field = m[1];
  } else if (part.includes('#register') || part.includes('register')) {
    const m = part.match(/>\s*(\d+)\s*\.?/) || part.match(/(\d+)\s*\.?$/);
    if (m) out.register = parseInt(m[1], 10);
  } else if (part.includes('#value') || (part.includes('value') && /value\s+[\d"]/.test(part))) {
    // New format can be a quoted array string: "[0, 0, 0]"
    const quoted = part.match(/"([^"]+)"/);
    if (quoted) {
      if (!out.valueRawQuoted) out.valueRawQuoted = quoted[1];
      const arr = parseNumberArray(quoted[1]);
      if (arr && arr.length) {
        out.values = arr;
        out.value = arr[arr.length - 1];
        return;
      }
      const scalar = parseScalarValue(quoted[1]);
      if (scalar !== undefined) out.value = scalar;
      return;
    }

    // Legacy unquoted scalar formats
    const scalar = part.match(/>\s*([^\s.;]+)\s*\.?/) || part.match(/([^\s.;]+)\s*\.?$/);
    if (scalar) {
      const parsed = parseScalarValue(scalar[1]);
      if (parsed !== undefined) out.value = parsed;
    }
  } else if (part.includes('#device') || part.includes('device')) {
    const m = part.match(/"([^"]+)"/);
    if (m) out.device = m[1];
  }
}

export const parseDnp3Data = (content: string, baseUrl?: string): DNP3Data[] => {
  const results: DNP3Data[] = [];
  const bySubject = new Map<string, Dnp3Props>();

  try {
    // Split into entries by SUBJECT lines, not by every <https://...> (predicates are also IRIs).
    // Subjects we care about are the DNP3 device resources under /dnp3/devices/... .
    const cleanContent = content.replace(/@prefix[^.]*\.\s*/g, '');
    const entries = splitDnp3Entries(cleanContent);

    for (let idx = 0; idx < entries.length; idx++) {
      const entry = entries[idx].trim();
      if (!entry) continue;

      const subjectMatch = entry.match(/<https?:\/\/[^>]+\/dnp3\/devices\/[^>]+>/);
      const subject = subjectMatch ? subjectMatch[0] : `_entry_${idx}`;
      const props = bySubject.get(subject) ?? {
        accessed: null,
        accessedList: null,
        group: null,
        typeStr: null,
        field: null,
        register: null,
        value: null,
        values: null,
        device: null,
        valueRawQuoted: null,
      };
      bySubject.set(subject, props);

      // Prefer regex-based extraction (more robust to ordering/formatting), then
      // fall back to the old ';' split parsing for any remaining fields.
      parseFromEntry(entry, props);

      const normalized = entry.replace(/\s*\.\s*$/, '');
      const parts = normalized.split(/\s*;\s*/).map((p) => p.trim()).filter(Boolean);
      for (const part of parts) parseOneTriple(part, props);
    }

    for (const [subject, props] of bySubject.entries()) {
      if (props.field && DNP3_FIELDS_EXCLUDED_FROM_GRAPH.has(props.field)) {
        continue;
      }
      if (props.valueRawQuoted && isBooleanOnlyArrayRaw(props.valueRawQuoted)) {
        continue;
      }

      // Infer group/index from the subject URL path when not explicitly present.
      const inferred = inferGroupAndIndexFromSubject(subject);
      const group = props.group ?? inferred.group ?? 0;
      const register = props.register ?? inferred.index ?? 0;

      // "Family" (file-level device) should come from URL segment /devices/<name>/...
      // Prefer the subject URI (most reliable), fall back to baseUrl if needed.
      const deviceFromSubject = inferDeviceFromSubject(subject);
      const deviceFromUrl = baseUrl ? inferDeviceFromUrl(baseUrl) : null;
      // The data itself usually won't contain a #device literal in the new format.
      const fileDeviceId = props.device || deviceFromSubject || deviceFromUrl || undefined;

      // In the new format, the subject ends with a timestamp segment, so using the last
      // path segment as a "device id" is wrong. Instead, treat the DNP3 "field" as the
      // point id so the charts group/label correctly.
      const pointId = props.field || 'Unknown';

      const values = props.values && props.values.length ? props.values : (props.value != null ? [props.value] : []);
      if (!values.length) continue;

      const accessedList =
        props.accessedList && props.accessedList.length
          ? props.accessedList
          : (props.accessed ? [props.accessed] : []);

      const count = Math.max(values.length, accessedList.length);
      const startIdx = Math.max(0, count - MAX_DNP3_SAMPLES_PER_SUBJECT);
      for (let i = startIdx; i < count; i++) {
        const v = values[i] ?? values[values.length - 1];
        const tsRaw = accessedList[i] ?? accessedList[accessedList.length - 1] ?? inferTimestampFromSubject(subject);
        // If we cannot determine a timestamp, don't emit a point (avoids "random" points at load time).
        if (!tsRaw) continue;
        const tsParsed = parseDnp3TimestampStrict(tsRaw);
        if (!tsParsed) continue;
        results.push({
          dataType: 'dnp3',
          value: v,
          timestamp: tsParsed,
          deviceId: pointId,
          fileUrl: baseUrl,
          fileDeviceId,
          source: 'solid-pod',
          group,
          field: props.field ?? '',
          register,
          type: props.typeStr ?? undefined,
        });
      }
    }
  } catch (e) {
    console.error('Error parsing DNP3 data:', e);
  }

  return trimDnp3ResultsBySeries(results, MAX_DNP3_POINTS_PER_SERIES);
};

function splitDnp3Entries(content: string): string[] {
  // Start of an entry is a line that begins with a DNP3 device subject IRI.
  // Example subject:
  // <https://.../char/dnp3/devices/Battery_0/group_30/index_0/2026-03-18T03:32:45>
  const re = /(^|\n)\s*(<https?:\/\/[^>]+\/dnp3\/devices\/[^>]+>)\s+</g;
  const starts: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    // Find the '<' that starts the subject IRI.
    const lt = content.indexOf('<', m.index);
    starts.push(lt >= 0 ? lt : m.index);
  }
  if (starts.length === 0) return [content];

  const uniqueStarts = Array.from(new Set(starts)).sort((a, b) => a - b);
  const out: string[] = [];
  for (let i = 0; i < uniqueStarts.length; i++) {
    const start = uniqueStarts[i];
    const end = i + 1 < uniqueStarts.length ? uniqueStarts[i + 1] : content.length;
    out.push(content.slice(start, end));
  }
  return out;
}

/**
 * DNP3 timestamps may be:
 * - `2026-03-18T03:31:55` (ISO-like, colons)
 * - `2026-03-23T05-35-15-737` (hyphen-separated time + milliseconds tail)
 */
function parseDnp3TimestampStrict(accessed: string): Date | null {
  const t = accessed.trim();
  const hyphen = t.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d+)$/
  );
  if (hyphen) {
    const ms = Math.min(parseInt(hyphen[7], 10) || 0, 999);
    return new Date(
      +hyphen[1],
      +hyphen[2] - 1,
      +hyphen[3],
      +hyphen[4],
      +hyphen[5],
      +hyphen[6],
      ms
    );
  }
  try {
    const d = new Date(t);
    if (!isNaN(d.getTime())) return d;
  } catch {
    // ignore
  }
  return null;
}

/** e.g. .../dnp3/devices/Battery/data.ttl => "Battery" */
function inferDeviceFromUrl(url: string): string | null {
  const m = url.match(/\/devices\/([^/]+)(?:\/|$)/i);
  return m ? m[1] : null;
}

function inferDeviceFromSubject(subject: string): string | null {
  try {
    const raw = subject.startsWith('<') && subject.endsWith('>') ? subject.slice(1, -1) : subject;
    return inferDeviceFromUrl(raw);
  } catch {
    return null;
  }
}

function inferGroupAndIndexFromSubject(subject: string): { group: number | null; index: number | null } {
  try {
    const raw = subject.startsWith('<') && subject.endsWith('>') ? subject.slice(1, -1) : subject;
    const u = new URL(raw);
    const path = u.pathname;
    const gm = path.match(/\/group_(\d+)\//i);
    const im = path.match(/\/index_(\d+)\//i);
    return {
      group: gm ? parseInt(gm[1], 10) : null,
      index: im ? parseInt(im[1], 10) : null,
    };
  } catch {
    return { group: null, index: null };
  }
}

function parseFromEntry(entry: string, out: Dnp3Props): void {
  // Note: we match on '#<name>' rather than the full IRI so this works for any base URI.
  const getQuoted = (name: string): string | null => {
    const m = entry.match(new RegExp(`#${name}>\\s*\\"([^\\"]+)\\"`, 'i')) || entry.match(new RegExp(`#${name}>\\s*"([^"]+)"`, 'i'));
    return m ? m[1] : null;
  };
  const getNumber = (name: string): number | null => {
    const m = entry.match(new RegExp(`#${name}>\\s*(\\d+)`, 'i'));
    return m ? parseInt(m[1], 10) : null;
  };

  const accessedRaw = getQuoted('accessed');
  if (accessedRaw) {
    out.accessed = accessedRaw;
    const list = parseTimestampList(accessedRaw);
    if (list && list.length) out.accessedList = list;
  }

  const fieldRaw = getQuoted('field');
  if (fieldRaw) out.field = fieldRaw;

  const typeRaw = getQuoted('type');
  if (typeRaw) out.typeStr = typeRaw;

  const valueRaw = getQuoted('value');
  if (valueRaw) {
    out.valueRawQuoted = valueRaw;
    const arr = parseNumberArray(valueRaw);
    if (arr && arr.length) {
      out.values = arr;
      out.value = arr[arr.length - 1];
    } else {
      const scalar = parseScalarValue(valueRaw);
      if (scalar !== undefined) out.value = scalar;
    }
  }

  const groupRaw = getNumber('group');
  if (groupRaw != null) out.group = groupRaw;

  const registerRaw = getNumber('register');
  if (registerRaw != null) out.register = registerRaw;
}

function inferTimestampFromSubject(subject: string): string | null {
  try {
    const raw = subject.startsWith('<') && subject.endsWith('>') ? subject.slice(1, -1) : subject;
    const u = new URL(raw);
    const segments = u.pathname.split('/').filter(Boolean);
    if (!segments.length) return null;
    const last = decodeURIComponent(segments[segments.length - 1]);
    // e.g. 2026-03-18T03:32:45 or 2026-03-23T05-36-16-103 (hyphen time + ms)
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(last)) return last;
    if (/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d+$/.test(last)) return last;
    return null;
  } catch {
    return null;
  }
}

function coerceValueArrayToken(token: string): number | undefined {
  const t = token.trim();
  if (/^true$/i.test(t)) return 1;
  if (/^false$/i.test(t)) return 0;
  const n = Number(t);
  if (Number.isFinite(n)) return n;
  return undefined;
}

function parseScalarValue(raw: string): number | undefined {
  return coerceValueArrayToken(String(raw).trim());
}

function parseNumberArray(raw: string): number[] | null {
  const s = raw.trim();
  if (!s.startsWith('[') || !s.endsWith(']')) return null;

  // Strict JSON: numbers and lowercase booleans only
  try {
    const parsed = JSON.parse(s);
    if (Array.isArray(parsed)) {
      return parsed
        .map((x) => {
          if (typeof x === 'number') return x;
          if (typeof x === 'boolean') return x ? 1 : 0;
          if (typeof x === 'string') return coerceValueArrayToken(x);
          return NaN;
        })
        .filter((x): x is number => Number.isFinite(x));
    }
  } catch {
    // Python-style e.g. [False, True, 209] is not valid JSON
  }

  const inner = s.slice(1, -1).trim();
  if (!inner) return [];
  return inner
    .split(',')
    .map((p) => coerceValueArrayToken(p))
    .filter((n): n is number => n !== undefined);
}

function parseTimestampList(raw: string): string[] | null {
  const s = raw.trim();
  if (!s.startsWith('[') || !s.endsWith(']')) return null;

  // Example: "['2026-03-18T03:31:55', '2026-03-18T03:31:56']" (Python-ish, not JSON)
  // Convert single quotes to double quotes safely for this constrained input.
  const jsonish = s.replace(/'/g, '"');
  try {
    const parsed = JSON.parse(jsonish);
    if (Array.isArray(parsed)) {
      return parsed.map((x) => String(x)).filter(Boolean);
    }
  } catch {
    // manual fallback
  }

  const inner = s.slice(1, -1).trim();
  if (!inner) return [];
  return inner
    .split(',')
    .map((p) => p.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);
}

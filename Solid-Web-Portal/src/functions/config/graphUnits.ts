import { DataPoint } from '../dataTypes';

// Get the units from:
// https://www.typhoon-hil.com/documentation/typhoon-hil-software-manual/concepts/distributed_energy_resources.html#doc__der_diesel

export interface GraphUnitsConfig {
  /**
   * Map any identifier to a unit string.
   * Keys are intentionally free-form so users can
   * choose what they want to match on (field name,
   * function name, sliderId, register number, etc.).
   */
  [key: string]: string | undefined;
}

/**
 * User-editable map of identifiers to display units.
 *
 * Edit or extend this object manually to change how
 * units are shown on graphs. Examples:
 * - 'Voltage': 'V'
 * - 'Current': 'A'
 * - 'ActivePower': 'W'
 */
export const GRAPH_UNITS: GraphUnitsConfig = {
  // Generic engineering quantities
  Voltage: 'V',
  Current: 'A',
  Power: 'W',
  ActivePower: 'W',
  ReactivePower: 'var',
  ApparentPower: 'VA',
  Frequency: 'Hz',
  Energy: 'kWh',
  Temperature: 'degC',
  SOC: '%',
  StateOfCharge: '%',

  // Common DNP3-style field labels from Typhoon/DER datasets
  Vnom: 'V',
  Vref: 'V',
  Irms: 'A',
  Inom: 'A',
  Pnom: 'kW',
  P_kW: 'kW',
  Qnom: 'kVAr',
  Q_kVAr: 'kVAr',
  PF: 'pu',

  // Modbus physical testbed and CSV simulator are raw register values
  READ_HOLDING_REGISTER: 'counts',
  Potentiometer1: 'counts',
  Potentiometer2: 'counts',

  // Battery_1004 explicit DNP3 field mappings (from battery_1004.ttl)
  Enable: 'state',
  Enable_fb: 'state',
  MCB_status: 'state',
  Converter_mode_fb: 'state',
  Lvrt_active_status: 'state',
  State: 'state',
  Alarm_Msg: 'text',

  Pref_fb_kW: 'kW',
  Pnom_kW: 'kW',
  Pmeas_kW: 'kW',
  Pa_meas_kW: 'kW',
  Pb_meas_kW: 'kW',
  Pc_meas_kW: 'kW',

  // Additional Battery_100x fields
  // (Some datasets label this as Min_SOC_pct / Max_SOC_pct; keeping a combined key too for compatibility.)
  'Mini/Max_SOC_pct': '%',
  Min_SOC_pct: '%',
  Max_SOC_pct: '%',
  Fref_pu: 'pu',
  Pref_RoC_pu_s: 'pu/s',

  Qref_fb_kVAr: 'kVAr',
  Qnom_kVAr: 'kVAr',
  Qmeas_kVAr: 'kVAr',
  Qa_meas_kVAr: 'kVAr',
  Qb_meas_kVAr: 'kVAr',
  Qc_meas_kVAr: 'kVAr',

  Snom_kVA: 'kVA',
  Smeas_kVA: 'kVA',

  Vnom_LL_V: 'V',
  Vrms_ref_fb_V: 'V',
  Vconv_rms_meas_V: 'V',
  Vgrid_rms_meas_kV: 'kV',
  Vbatt_V: 'V',

  Fnom_Hz: 'Hz',
  Fref_fb_Hz: 'Hz',
  Fmeas_Hz: 'Hz',

  PFmeas: 'pu',
  SOH: '%',
  Ibatt_A: 'A',
  Batt_cap_nom_Ah: 'Ah',
};

/**
 * Determine the most appropriate unit for a given set of points.
 * Looks at common identifiers on the first data point and matches
 * them against GRAPH_UNITS.
 */
export function getUnitForData(data: DataPoint[]): string {
  if (!data || data.length === 0) return '';

  const first = data[0] as any;

  const candidates: Array<string | undefined> = [
    first.field,
    first.function,
    first.sliderId,
    first.register != null ? String(first.register) : undefined,
    first.dataType,
  ];

  for (const key of candidates) {
    if (key && GRAPH_UNITS[key] != null) {
      return GRAPH_UNITS[key] as string;
    }
  }

  // Best-effort inference for DNP3 field names and Modbus function labels.
  for (const key of candidates) {
    const inferred = inferUnitFromKey(key);
    if (inferred) return inferred;
  }

  // Modbus in this project is typically raw register telemetry.
  if (first.dataType === 'modbus') return 'counts';

  return '';
}

function inferUnitFromKey(key: string | undefined): string {
  if (!key) return '';
  const lower = key.toLowerCase();

  // Generic per-unit inference (covers many DNP3/DER fields without enumerating them).
  // Examples: Fref_pu, Vref_pu, Pref_pu, Qref_pu, PF_pu, etc.
  if (lower.endsWith('_pu')) return 'pu';
  // Common rate-of-change pattern: *_pu_s or *_pu_per_s
  if (lower.endsWith('_pu_s') || lower.endsWith('_pu_per_s') || lower.endsWith('_pu/sec') || lower.endsWith('_pu_per_sec')) {
    return 'pu/s';
  }

  if (lower.includes('frequency') || lower.endsWith('_hz') || lower.includes(' hz')) return 'Hz';
  if (lower.includes('voltage') || lower.startsWith('vnom') || lower.startsWith('vref')) return 'V';
  if (lower.includes('current') || lower.includes('amps') || lower.includes('irms') || lower.includes('inom')) return 'A';
  if (lower.includes('reactive') || lower.includes('kvar') || lower.startsWith('qnom') || lower.startsWith('q_')) return 'kVAr';
  if (lower.includes('apparent') || lower.includes('kva')) return 'kVA';
  if (lower.includes('active') || lower.includes('real power') || lower.startsWith('pnom') || lower.startsWith('p_')) {
    return 'kW';
  }
  if (lower.includes('energy') || lower.includes('kwh')) return 'kWh';
  if (lower.includes('stateofcharge') || lower.includes('state_of_charge') || lower === 'soc' || lower.includes(' soc')) {
    return '%';
  }
  if (lower === 'soh' || lower.includes('stateofhealth') || lower.includes('state_of_health')) return '%';
  if (lower.includes('powerfactor') || lower === 'pf') return 'pu';
  if (lower.includes('ah') || lower.includes('amp-hour') || lower.includes('amp hour')) return 'Ah';
  if (lower.includes('temp')) return 'degC';
  if (lower.includes('status') || lower.includes('mode') || lower.endsWith('_fb') || lower === 'enable' || lower === 'state') {
    return 'state';
  }
  if (lower.includes('alarm') || lower.includes('msg')) return 'text';
  if (lower.includes('potentiometer') || lower.includes('holding_register')) return 'counts';

  return '';
}


// Definitions of TypeScript interfaces for data structures
// ModbusData: Structure for potentiometer readings from RDF
// SliderData: Structure for slider values from text format
// DataPoint: Union type for both data types
// ChartDataPoint: Formatted data for Recharts visualization

// Base interface for all data points
export interface BaseDataPoint {
  dataType: 'modbus' | 'slider' | 'dnp3';
  value: number;
  timestamp: Date;
  deviceId?: string;
  /**
   * Optional context about where this point came from (useful when deviceId is derived from a URI segment).
   * For Solid Pod reads this is typically the fetched file URL.
   */
  fileUrl?: string;
  /** For DNP3, the device/container name from `/dnp3/devices/<name>/...` */
  fileDeviceId?: string;
  source?: string;
}

// Data format that comes from RDF/Modbus readings
export interface ModbusData extends BaseDataPoint {
  dataType: 'modbus';
  register: number;
  function: string;
  accessed?: number; // Unix timestamp from RDF
}

// Data format that this web portal sends to the pod
export interface SliderData extends BaseDataPoint {
  dataType: 'slider';
  sliderId: string;
  rawMessage?: string;
}

// DNP3 format from RDF (e.g. devices/Battery/data.ttl)
export interface DNP3Data extends BaseDataPoint {
  dataType: 'dnp3';
  group: number;
  field: string;
  register: number;
  type?: string; // "Binary", "Int32", etc.
}

// Union type for all data types
export type DataPoint = ModbusData | SliderData | DNP3Data;

// Formatted data for Recharts visualization
export interface ChartDataPoint {
  time: string;                    // Formatted time string for display
  value: number;                   // Numeric value for the chart
  name: string;                    // Display name (e.g., "Register 0" or "Slider 1")
  type: 'modbus' | 'slider' | 'dnp3';
  deviceId: string;               // Device identifier
  source: string;                 // Data source ('solid-pod', 'mqtt')
  fullTimestamp: Date;            // Original timestamp
  originalTime: string;           // Formatted timestamp for tooltips
  // Optional fields based on data type
  register?: number;
  sliderId?: string;
  function?: string;
  field?: string;                 // For DNP3
  group?: number;                 // For DNP3
}

// Type guards for runtime type checking
export function isModbusData(data: DataPoint): data is ModbusData {
  return data.dataType === 'modbus';
}

export function isSliderData(data: DataPoint): data is SliderData {
  return data.dataType === 'slider';
}

export function isDnp3Data(data: DataPoint): data is DNP3Data {
  return data.dataType === 'dnp3';
}

// Helper function to extract device-specific properties
export function getDataPointProperties(data: DataPoint): {
  deviceName: string;
  typeLabel: string;
  detail: string;
} {
  if (isModbusData(data)) {
    return {
      deviceName: data.deviceId || 'Unknown Device',
      typeLabel: 'Modbus Register',
      detail: `Register ${data.register} - ${data.function}`
    };
  }
  if (isDnp3Data(data)) {
    return {
      deviceName: data.deviceId || 'Unknown Device',
      typeLabel: 'DNP3',
      detail: `${data.field} (group ${data.group})`
    };
  }
  return {
    deviceName: data.deviceId || 'Unknown Device',
    typeLabel: 'Slider',
    detail: `Slider ${data.sliderId}`
  };
}
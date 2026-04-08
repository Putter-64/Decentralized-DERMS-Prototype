import { DataPoint, ChartDataPoint } from '../dataTypes';

/** Recharts and stats over huge arrays can OOM; keep chart inputs bounded. */
const MAX_POINTS_PER_CHART = 600;

// Transforms raw data for chart display
// Formats tooltips and axis labels
// Prepares data for Recharts library

export const prepareChartData = (data: DataPoint[]): ChartDataPoint[] => {
  const sortedData = [...data].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  const capped =
    sortedData.length > MAX_POINTS_PER_CHART
      ? sortedData.slice(-MAX_POINTS_PER_CHART)
      : sortedData;

  return capped.map((data) => {
    const name =
      data.dataType === 'modbus'
        ? `Register ${(data as any).register}`
        : data.dataType === 'dnp3'
          ? `${(data as any).field || 'Point'}`
          : `Slider ${(data as any).sliderId}`;
    return {
      time: data.timestamp.toLocaleTimeString(),
      value: data.value,
      name,
      type: data.dataType,
      deviceId: data.deviceId || 'unknown',
      source: data.source || 'solid-pod',
      fullTimestamp: data.timestamp,
      originalTime: data.timestamp.toLocaleString(),
      register: (data as any).register,
      sliderId: (data as any).sliderId,
      function: (data as any).function,
      field: (data as any).field,
      group: (data as any).group,
    };
  });
};

export const formatTooltip = (value: number, name: string, props: any) => {
  if (props.payload && props.payload[0]) {
    const data = props.payload[0].payload;
    return [
      <div key="tooltip">
        <p><strong>Value:</strong> {value}</p>
        <p><strong>Time:</strong> {data.originalTime}</p>
        <p><strong>Device:</strong> {data.deviceId}</p>
        {data.fileDeviceId && (
          <p><strong>Found in file device:</strong> {data.fileDeviceId}</p>
        )}
        <p><strong>Source:</strong> Solid Pod</p>
        {data.fileUrl && (
          <p><strong>File URL:</strong> {data.fileUrl}</p>
        )}
        <p><strong>Type:</strong> {data.type}</p>
        {data.type === 'modbus' && (
          <p><strong>Register:</strong> {data.register}</p>
        )}
        {data.type === 'dnp3' && (
          <p><strong>Field:</strong> {data.field} {data.group != null && `(group ${data.group})`}</p>
        )}
        {data.type === 'slider' && (
          <p><strong>Slider ID:</strong> {data.sliderId}</p>
        )}
      </div>
    ];
  }
  return [value, name];
};

export const prepareChartDataByDevice = (data: DataPoint[]): Record<string, DataPoint[]> => {
  const groupedData: Record<string, DataPoint[]> = {};
  
  data.forEach(item => {
    // For DNP3, distinguish the same point name across different DNP3 files
    // e.g. "Frequency (PV_Power_Plant_0)" vs "Frequency (Battery_0)"
    const device =
      item.dataType === 'dnp3'
        ? `${item.deviceId || 'Unknown'}${item.fileDeviceId ? ` (${item.fileDeviceId})` : ''}`
        : item.deviceId || 'unknown';
    if (!groupedData[device]) {
      groupedData[device] = [];
    }
    groupedData[device].push(item);
  });
  
  // Sort each device's data by time
  Object.keys(groupedData).forEach(device => {
    groupedData[device].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  });
  
  return groupedData;
};

export const groupDataBySource = (data: DataPoint[]): Record<string, DataPoint[]> => {
  const groupedData: Record<string, DataPoint[]> = {};
  
  data.forEach(item => {
    const source = item.source || 'solid-pod:unknown';
    if (!groupedData[source]) {
      groupedData[source] = [];
    }
    groupedData[source].push(item);
  });
  
  // Sort each source's data by time
  Object.keys(groupedData).forEach(source => {
    groupedData[source].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  });
  
  return groupedData;
};

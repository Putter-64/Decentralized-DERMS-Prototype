import React from 'react';
import { DataPoint } from '../dataTypes';

interface DataTableProps {
  data: DataPoint[];
}

const DataTable: React.FC<DataTableProps> = ({ data }) => {
  const MAX_ROWS = 500;
  const rows = React.useMemo(() => {
    const reversed = [...data].reverse();
    return reversed.slice(0, MAX_ROWS);
  }, [data]);

  return (
    <div style={{ marginBottom: '2rem' }}>
      <h3>Recent Data Points</h3>
      <div style={{ fontSize: '0.85rem', color: '#666', marginBottom: '0.5rem' }}>
        Showing newest {Math.min(rows.length, MAX_ROWS)} of {data.length}
      </div>
      <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#928c8cff', position: 'sticky', top: 0 }}>
              <th style={{ padding: '0.5rem', border: '1px solid #5e5b5bff', textAlign: 'left' }}>Time</th>
              <th style={{ padding: '0.5rem', border: '1px solid #5e5b5bff', textAlign: 'left' }}>Type</th>
              <th style={{ padding: '0.5rem', border: '1px solid #5e5b5bff', textAlign: 'left' }}>ID/Register</th>
              <th style={{ padding: '0.5rem', border: '1px solid #5e5b5bff', textAlign: 'left' }}>Function</th>
              <th style={{ padding: '0.5rem', border: '1px solid #5e5b5bff', textAlign: 'left' }}>Value</th>
              <th style={{ padding: '0.5rem', border: '1px solid #5e5b5bff', textAlign: 'left' }}>Raw Message</th>
            </tr>
          </thead>
          
          <tbody>
            {rows.map((data, index) => (
              <tr key={index} style={{ 
                backgroundColor: data.dataType === 'modbus' ? '#84878aff' : data.dataType === 'dnp3' ? '#5e5075ff' : '#666465ff' 
              }}>
                <td style={{ padding: '0.5rem', border: '1px solid #5e5b5bff' }}>
                  {data.timestamp.toLocaleString()}
                </td>
                
                <td style={{ padding: '0.5rem', border: '1px solid #5e5b5bff' }}>
                  <span style={{ 
                    padding: '0.2rem 0.5rem', 
                    borderRadius: '4px', 
                    fontSize: '0.8rem',
                    backgroundColor: data.dataType === 'modbus' ? '#e3f2fd' : data.dataType === 'dnp3' ? '#e8e0f0' : '#fce4ec',
                    color: data.dataType === 'modbus' ? '#1565c0' : data.dataType === 'dnp3' ? '#6f42c1' : '#c2185b'
                  }}>
                    {data.dataType}
                  </span>
                </td>
                
                <td style={{ padding: '0.5rem', border: '1px solid #5e5b5bff' }}>
                  {data.dataType === 'modbus' 
                    ? (data as any).register
                    : data.dataType === 'dnp3'
                      ? (data as any).field || (data as any).register
                      : (data as any).sliderId
                  }
                </td>
                
                <td style={{ padding: '0.5rem', border: '1px solid #5e5b5bff' }}>
                  {data.dataType === 'modbus' 
                    ? (data as any).function
                    : data.dataType === 'dnp3'
                      ? `group ${(data as any).group}`
                      : 'N/A'
                  }
                </td>
                
                <td style={{ padding: '0.5rem', border: '1px solid #5e5b5bff', fontWeight: 'bold' }}>
                  {data.value}
                </td>
                
                <td style={{ padding: '0.5rem', border: '1px solid #5e5b5bff', fontSize: '0.8rem', color: '#c6c1c1ff' }}>
                  {data.dataType === 'slider' 
                    ? (data as any).rawMessage
                    : data.dataType === 'dnp3'
                      ? (data as any).type || ''
                      : `Unix: ${(data as any).accessed}`
                  }
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default DataTable;
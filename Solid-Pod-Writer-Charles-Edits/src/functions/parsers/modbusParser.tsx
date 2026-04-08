import { ModbusData } from '../dataTypes';

// Parser parses RDF/N-Triples format from Modbus data
// Extracts: values, registers, timestamps, function names
// Converts Unix timestamps to JavaScript Date objects
// It also handles multiple entries in a file

export const parseModbusData = (content: string): ModbusData[] => {
  const modbusData: ModbusData[] = [];
  
  try {
    // Remove all @prefix declarations as they're redundant for parsing individual entries
    const cleanContent = content.replace(/@prefix[^.]*\.\s*/g, '');
    
    // Split by the subject URI pattern to get individual entries
    const entries = cleanContent.split(/(?=<https:\/\/[^>]+>)/).filter(entry => entry.trim());
    
    console.log('Found entries after cleaning:', entries.length);
    
    for (const entry of entries) {
      if (!entry.trim()) continue;
      
      try {
        // Parse each triple in the entry
        const triples = entry.split(';').map(t => t.trim()).filter(t => t);
        
        let value: number | null = null;
        let register: number | null = null;
        let func: string = 'Potentiometer1';
        let type: string = 'Uint16';
        let accessed: number | null = null;

        for (const triple of triples) {
          if (triple.includes('ns1:value')) {
            const valueMatch = triple.match(/ns1:value\s+(\d+)\s*\.?/);
            if (valueMatch) value = parseInt(valueMatch[1]);
          } else if (triple.includes('ns1:register')) {
            const registerMatch = triple.match(/ns1:register\s+(\d+)/);
            if (registerMatch) register = parseInt(registerMatch[1]);
          } else if (triple.includes('ns1:function')) {
            const funcMatch = triple.match(/ns1:function\s+"([^"]+)"/);
            if (funcMatch) func = funcMatch[1];
          } else if (triple.includes('ns1:type')) {
            const typeMatch = triple.match(/ns1:type\s+"([^"]+)"/);
            if (typeMatch) type = typeMatch[1];
          } else if (triple.includes('ns1:accessed')) {
            const accessedMatch = triple.match(/ns1:accessed\s+(\d+)/);
            if (accessedMatch) accessed = parseInt(accessedMatch[1]);
          }
        }
        
        console.log('Parsed entry details:', { value, register, func, type, accessed });
        
        // Validate and create ModbusData object
        if (value !== null && register !== null && accessed !== null) {
          const timestamp = new Date(accessed * 1000);
          
          const modbusEntry: ModbusData = {
            dataType: 'modbus',
            value: value,
            timestamp: timestamp,
            register: register,
            function: func,
            accessed: accessed,
            deviceId: 'esp-device', // Default device ID - adjust as needed
            source: 'solid-pod'
          };
          
          modbusData.push(modbusEntry);
        } else {
          console.warn('Incomplete entry, missing field(s):', { value, register, accessed });
        }
      } catch (entryError) {
        console.error('Error parsing modbus entry:', entryError);
        continue;
      }
    }
  } catch (error) {
    console.error('Error parsing modbus data:', error);
  }
  
  console.log('Final modbus data count:', modbusData.length);
  return modbusData;
};
import { SliderData } from '../dataTypes';

// Parses simple text format with timestamped slider values
// Extracts values and timestamps from [timestamp]: value format
// Converts human-readable times to Date objects

export const parseSliderData = (content: string): SliderData[] => {
  const sliderData: SliderData[] = [];
  
  try {
    const lines = content.split('\n').filter(line => line.trim());
    
    for (const line of lines) {
      try {
        const match = line.match(/\[([^\]]+)\]:\s*(.+)/);
        
        if (match) {
          const [, timestampStr, valueStr] = match;
          
          let value: number;
          const numericMatch = valueStr.match(/(\d+(?:\.\d+)?)/);
          if (numericMatch) {
            value = parseFloat(numericMatch[1]);
          } else {
            continue;
          }
          
          let timestamp: Date;
          try {
            const today = new Date();
            const timeParts = timestampStr.match(/(\d+):(\d+):(\d+)\s*(AM|PM)/i);
            
            if (timeParts) {
              let [, hours, minutes, seconds, period] = timeParts;
              let hour = parseInt(hours);
              
              if (period.toUpperCase() === 'PM' && hour < 12) {
                hour += 12;
              } else if (period.toUpperCase() === 'AM' && hour === 12) {
                hour = 0;
              }
              
              timestamp = new Date(
                today.getFullYear(),
                today.getMonth(),
                today.getDate(),
                hour,
                parseInt(minutes),
                parseInt(seconds)
              );
            } else {
              timestamp = new Date(timestampStr);
              if (isNaN(timestamp.getTime())) {
                timestamp = new Date();
              }
            }
          } catch {
            timestamp = new Date();
          }
          
          sliderData.push({
            timestamp,
            value,
            sliderId: 'slider1',
            dataType: 'slider',
            rawMessage: line
          });
        }
      } catch (lineError) {
        console.log('Error parsing slider line:', line, lineError);
        continue;
      }
    }
  } catch (error) {
    console.error('Error parsing slider data:', error);
  }
  
  return sliderData;
};
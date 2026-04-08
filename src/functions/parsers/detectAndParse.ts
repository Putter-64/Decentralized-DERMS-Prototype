import { DataPoint } from '../dataTypes';
import { parseModbusData } from './modbusParser';
import { parseDnp3Data } from './dnp3Parser';
import { parseSliderData } from './sliderParser';

/**
 * Detects format from content (no file type required) and returns parsed DataPoints.
 * Tries Modbus (ns1:value, ns1:register), then DNP3 (#value, #device), then Slider.
 */
export function detectAndParse(content: string, fileUrl?: string): DataPoint[] {
  const trimmed = content.trim();
  if (!trimmed.length) return [];

  // Modbus: ns1:value, ns1:register, ns1:accessed (unix)
  if (/\bns1:value\b/.test(trimmed) && (/\bns1:register\b/.test(trimmed) || /\bns1:accessed\b/.test(trimmed))) {
    const out = parseModbusData(content);
    if (out.length > 0) return out;
  }

  // DNP3: full IRI with #value, #device, #accessed, or URL path contains dnp3 and content has value+device/field
  const looksLikeDnp3 =
    (/#value/.test(trimmed) || /"[^"]*value[^"]*"/.test(trimmed)) &&
    (/#device/.test(trimmed) || /#field/.test(trimmed) || /#accessed/.test(trimmed) || /#group/.test(trimmed) || /device/.test(trimmed));
  const urlSuggestsDnp3 = typeof fileUrl === 'string' && fileUrl.toLowerCase().includes('/dnp3/');
  if (looksLikeDnp3 || (urlSuggestsDnp3 && /value/.test(trimmed) && (/device/.test(trimmed) || /field/.test(trimmed)))) {
    const out = parseDnp3Data(content, fileUrl);
    if (out.length > 0) return out;
  }

  // Slider: [timestamp]: value lines
  if (/\[\s*[^\]]+\]\s*:\s*.+/.test(trimmed)) {
    const out = parseSliderData(content);
    if (out.length > 0) return out;
  }

  return [];
}

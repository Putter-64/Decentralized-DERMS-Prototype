import { getFile, getSolidDataset, getContainedResourceUrlAll, isContainer } from '@inrupt/solid-client';
import { getExpectedWebIdForPod, listDerPodNames } from '../../config/derWebIds';
import { parseModbusData } from '../parsers/modbusParser';
import { detectAndParse } from '../parsers/detectAndParse';
import { parseSliderData } from '../parsers/sliderParser';
import { DataPoint, ModbusData, SliderData } from '../dataTypes';

/** Pod root URL without a trailing slash — avoids `//` when joining `${baseURI}/${podName}/`. */
const baseURI = String(import.meta.env.VITE_BASE_URI ?? '').replace(/\/+$/, '');

export type SolidFetch = typeof fetch;

// Fetches data from Solid Pod using Solid client library
// User can choose between different data sources
// Pass the authenticated `fetch` from the Session for that pod (or portal for listing).

export class DataService {
  /**
   * Fetch a file's text content with optional safeguards.
   * - Checks `Blob.size` before reading to avoid loading huge files into memory.
   */
  async fetchTextFile(
    url: string,
    solidFetch: SolidFetch,
    opts?: { maxBytes?: number }
  ): Promise<{ content: string; sizeBytes?: number }> {
    const file = await getFile(url, { fetch: solidFetch });
    const sizeBytes = typeof (file as any)?.size === 'number' ? ((file as any).size as number) : undefined;
    const maxBytes = opts?.maxBytes;
    if (typeof sizeBytes === 'number' && typeof maxBytes === 'number' && Number.isFinite(maxBytes) && sizeBytes > maxBytes) {
      throw new Error(`File too large (${sizeBytes} bytes > ${maxBytes} bytes)`);
    }
    const content = await file.text();
    return { content, sizeBytes };
  }

  async canAccessPod(podName: string, solidFetch: SolidFetch): Promise<boolean> {
    try {
      const dataset = await getSolidDataset(`${baseURI}/${podName}/`, { fetch: solidFetch });
      return isContainer(dataset);
    } catch {
      return false;
    }
  }

  /**
   * Discover pod-like containers directly under the configured base URI, merged with
   * known DER pod names (see `derWebIds.ts`). Uses the portal session's fetch.
   */
  async listPodsAtBase(portalFetch: SolidFetch): Promise<string[]> {
    const fromManifest = listDerPodNames();
    try {
      const dataset = await getSolidDataset(`${baseURI}/`, { fetch: portalFetch });
      if (!isContainer(dataset)) {
        return fromManifest;
      }
      const contained = getContainedResourceUrlAll(dataset as any);

      const pods = contained
        .filter((url) => url.endsWith('/'))
        .map((url) => {
          const trimmed = url.replace(/\/+$/, '');
          const segments = trimmed.split('/');
          return segments[segments.length - 1] || '';
        })
        .filter((name) => !!name)
        .filter((name) => !name.startsWith('.'))
        .filter((name) => name.toLowerCase() !== 'idp')
        .filter((name) => name.toLowerCase() !== 'accounts')
        // Only treat containers as DER pods when they have an expected WebID in `solid_devices.json` / `DER_POD_WEBIDS`.
        .filter((name) => getExpectedWebIdForPod(name) !== undefined);

      return Array.from(new Set([...fromManifest, ...pods])).sort((a, b) => a.localeCompare(b));
    } catch (error) {
      console.warn('Could not discover pods from base URI:', error);
      return fromManifest;
    }
  }

  async fetchModbusData(podName: string, solidFetch: SolidFetch): Promise<ModbusData[]> {
    try {
      const modbusFile = await getFile(`${baseURI}/${podName}/modbus/`, { fetch: solidFetch });

      if (modbusFile) {
        const content = await modbusFile.text();
        return parseModbusData(content);
      }
    } catch (modbusError) {
      console.error('Error fetching modbus data:', modbusError);
      throw modbusError;
    }

    return [];
  }

  async fetchSliderData(podName: string, solidFetch: SolidFetch): Promise<SliderData[]> {
    try {
      const sliderFile = await getFile(`${baseURI}/${podName}/modbus`, { fetch: solidFetch });

      if (sliderFile) {
        const content = await sliderFile.text();
        return parseSliderData(content);
      }
    } catch (sliderError) {
      console.error('Error fetching slider data:', sliderError);
      throw sliderError;
    }

    return [];
  }

  async listPodDataFiles(podName: string, solidFetch: SolidFetch): Promise<string[]> {
    const urls: string[] = [];
    const baseUrl = `${baseURI}/${podName}/`;

    const collect = async (containerUrl: string): Promise<void> => {
      try {
        const dataset = await getSolidDataset(containerUrl, { fetch: solidFetch });
        if (!isContainer(dataset)) return;
        const contained = getContainedResourceUrlAll(dataset as any);
        for (const url of contained) {
          if (url.endsWith('/')) {
            await collect(url);
          } else {
            const lower = url.toLowerCase();
            const isTtl = lower.endsWith('.ttl');
            const isModbusPath = lower.includes('/modbus') || lower.endsWith('/modbus');
            const isDnp3Path = lower.includes('/dnp3/');
            if (isTtl || isModbusPath || isDnp3Path) {
              urls.push(url);
            }
          }
        }
      } catch (e) {
        console.warn('Could not list container:', containerUrl, e);
      }
    };

    await collect(baseUrl);
    return urls;
  }

  async getPodDataFileUrls(podName: string, solidFetch: SolidFetch): Promise<string[]> {
    const baseUrl = `${baseURI}/${podName}/`;
    const result: string[] = [];
    const seen = new Set<string>();
    const add = (url: string) => {
      const n = url.replace(/\/+$/, '');
      if (seen.has(n)) return;
      seen.add(n);
      result.push(url);
    };

    try {
      const listed = await this.listPodDataFiles(podName, solidFetch);
      listed.forEach((u) => add(u));
    } catch (e) {
      console.warn('Pod listing failed:', e);
    }

    add(`${baseUrl}modbus`);
    add(`${baseUrl}modbus/`);

    const dnp3DevicesUrl = `${baseUrl}dnp3/devices/`;
    try {
      const devicesDataset = await getSolidDataset(dnp3DevicesUrl, { fetch: solidFetch });
      if (isContainer(devicesDataset)) {
        const contained = getContainedResourceUrlAll(devicesDataset as any);

        const collectUnder = async (containerUrl: string, depth: number): Promise<void> => {
          if (depth <= 0) return;
          try {
            const dataset = await getSolidDataset(containerUrl, { fetch: solidFetch });
            if (!isContainer(dataset)) return;
            const children = getContainedResourceUrlAll(dataset as any);
            for (const child of children) {
              if (child.endsWith('/')) {
                await collectUnder(child, depth - 1);
              } else {
                add(child);
              }
            }
          } catch (e) {
            console.warn('Could not list DNP3 container:', containerUrl, e);
          }
        };

        for (const resourceUrl of contained) {
          if (resourceUrl.endsWith('/')) {
            add(`${resourceUrl}data.ttl`);
            await collectUnder(resourceUrl, 4);
          }
        }
      }
    } catch (e) {
      console.warn('Could not list dnp3/devices:', dnp3DevicesUrl, e);
    }

    return result;
  }

  async getAllPodFileContents(
    podName: string,
    solidFetch: SolidFetch
  ): Promise<{ url: string; content: string; error?: string }[]> {
    const urls = await this.getPodDataFileUrls(podName, solidFetch);
    const out: { url: string; content: string; error?: string }[] = [];
    for (const url of urls) {
      try {
        const { content } = await this.fetchTextFile(url, solidFetch);
        out.push({ url, content });
      } catch (e) {
        out.push({ url, content: '', error: e instanceof Error ? e.message : String(e) });
      }
    }
    return out;
  }

  async fetchAllPodData(podName: string, solidFetch: SolidFetch): Promise<DataPoint[]> {
    const allData: DataPoint[] = [];
    let fileUrls: string[] = [];

    try {
      fileUrls = await this.getPodDataFileUrls(podName, solidFetch);
    } catch (e) {
      console.warn('getPodDataFileUrls failed, using minimal fallback:', e);
      fileUrls = [`${baseURI}/${podName}/modbus/`, `${baseURI}/${podName}/modbus`];
    }

    for (const fileUrl of fileUrls) {
      try {
        const file = await getFile(fileUrl, { fetch: solidFetch });
        const text = await file.text();
        const parsed = detectAndParse(text, fileUrl);
        allData.push(...parsed);
      } catch (e) {
        console.warn('Could not fetch or parse:', fileUrl, e);
      }
    }

    return allData;
  }

  async fetchAllData(
    podName: string,
    dataType: 'modbus' | 'slider' | 'dnp3' | 'both',
    solidFetch: SolidFetch
  ): Promise<DataPoint[]> {
    const allData: DataPoint[] = [];

    try {
      const podData = await this.fetchAllPodData(podName, solidFetch);
      if (dataType === 'both') {
        allData.push(...podData);
      } else {
        allData.push(...podData.filter((d) => d.dataType === dataType));
      }
    } catch (error) {
      console.error('Failed to fetch Pod data:', error);
      if (dataType === 'both' || dataType === 'modbus') {
        try {
          const modbusData = await this.fetchModbusData(podName, solidFetch);
          allData.push(...modbusData);
        } catch (e) {
          console.error('Failed to fetch modbus data:', e);
        }
      }
      if (dataType === 'both' || dataType === 'slider') {
        try {
          const sliderData = await this.fetchSliderData(podName, solidFetch);
          allData.push(...sliderData);
        } catch (e) {
          console.error('Failed to fetch slider data:', e);
        }
      }
      if (dataType === 'dnp3') {
        try {
          const podData = await this.fetchAllPodData(podName, solidFetch);
          allData.push(...podData.filter((d) => d.dataType === 'dnp3'));
        } catch (e) {
          console.error('Failed to fetch DNP3 data:', e);
        }
      }
    }

    return allData;
  }
}

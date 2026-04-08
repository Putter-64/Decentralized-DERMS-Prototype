import React from 'react';
import { DataService, SolidFetch } from '../services/dataService';
import { detectAndParse } from './detectAndParse';
import { DataPoint } from '../dataTypes';

// Debug: shows every file read from the Pod (same discovery as the reader) and its raw content.

interface DebugReaderProps {
  /** All selected pods with verified access — each is listed and fetched. */
  podNames: string[];
  dataService?: DataService | null;
  /** Authenticated fetch for this pod (from the pod's Solid Session). */
  solidFetch: SolidFetch;
}

type PodFileRow = { url: string; content: string; error?: string };

const DebugReader: React.FC<DebugReaderProps> = ({ podNames, dataService, solidFetch }) => {
  const [bundles, setBundles] = React.useState<{ podName: string; files: PodFileRow[] }[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({});

  const podNamesKey = podNames.join('\0');

  const summarize = (content: string, url: string): string => {
    try {
      const parsed: DataPoint[] = detectAndParse(content, url);
      const dnp3 = parsed.filter((p) => p.dataType === 'dnp3');
      const modbus = parsed.filter((p) => p.dataType === 'modbus');
      const slider = parsed.filter((p) => p.dataType === 'slider');
      const families = Array.from(new Set(dnp3.map((p) => p.fileDeviceId).filter(Boolean))) as string[];
      const dnp3Fields = Array.from(
        new Set(
          dnp3
            .map((p) => (p as any).field)
            .filter((v): v is string => typeof v === 'string' && v.length > 0)
        )
      );
      const dnp3Groups = Array.from(
        new Set(
          dnp3
            .map((p) => (p as any).group)
            .filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
        )
      ).sort((a, b) => a - b);
      return [
        `Parsed points: ${parsed.length} (dnp3 ${dnp3.length}, modbus ${modbus.length}, slider ${slider.length})`,
        families.length ? `DNP3 families: ${families.join(', ')}` : 'DNP3 families: (none)',
        dnp3Fields.length
          ? `DNP3 fields (${dnp3Fields.length}): ${dnp3Fields.slice(0, 12).join(', ')}${dnp3Fields.length > 12 ? ', ...' : ''}`
          : 'DNP3 fields: (none)',
        dnp3Groups.length ? `DNP3 groups: ${dnp3Groups.join(', ')}` : 'DNP3 groups: (none)',
      ].join('\n');
    } catch (e) {
      return `Parse summary error: ${e instanceof Error ? e.message : String(e)}`;
    }
  };

  type PodFileRowV2 = {
    url: string;
    content?: string;
    sizeBytes?: number;
    loaded?: boolean;
    loading?: boolean;
    error?: string;
    summary?: string;
  };

  const listAllFiles = async () => {
    if (podNames.length === 0) return;
    setLoading(true);
    try {
      const service = dataService ?? new DataService();
      const results = await Promise.all(
        podNames.map(async (name) => ({
          podName: name,
          urls: await service.getPodDataFileUrls(name, solidFetch),
        }))
      );

      const nextBundles = results.map((r) => ({
        podName: r.podName,
        files: r.urls.map((url) => ({ url, loaded: false } as PodFileRowV2)) as any,
      }));

      setBundles(nextBundles as any);
      const firstWithFiles = nextBundles.findIndex((r) => r.files.length > 0);
      if (firstWithFiles >= 0) {
        setExpanded({ [`${firstWithFiles}-0`]: true });
      }
    } catch (error) {
      console.error('Debug fetch error:', error);
      setBundles([{ podName: podNames[0] ?? '', files: [{ url: '', error: String(error), loaded: false } as any] }]);
    } finally {
      setLoading(false);
    }
  };

  const ensureLoaded = async (podName: string, fileIndex: number) => {
    const service = dataService ?? new DataService();

    setBundles((prev: any) =>
      prev.map((b: any) => {
        if (b.podName !== podName) return b;
        const files = b.files.map((f: any, idx: number) => (idx === fileIndex ? { ...f, loading: true } : f));
        return { ...b, files };
      })
    );

    try {
      const url = (bundles as any).find((b: any) => b.podName === podName)?.files?.[fileIndex]?.url;
      if (!url) throw new Error('Missing file URL');
      const { content, sizeBytes } = await service.fetchTextFile(url, solidFetch, { maxBytes: 2_000_000 });
      const summary = summarize(content, url);

      setBundles((prev: any) =>
        prev.map((b: any) => {
          if (b.podName !== podName) return b;
          const files = b.files.map((f: any, idx: number) =>
            idx === fileIndex ? { ...f, content, sizeBytes, summary, loaded: true, loading: false } : f
          );
          return { ...b, files };
        })
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setBundles((prev: any) =>
        prev.map((b: any) => {
          if (b.podName !== podName) return b;
          const files = b.files.map((f: any, idx: number) =>
            idx === fileIndex ? { ...f, error: msg, loading: false, loaded: false } : f
          );
          return { ...b, files };
        })
      );
    }
  };

  React.useEffect(() => {
    if (podNames.length > 0) listAllFiles();
    else {
      setBundles([]);
    }
  }, [podNamesKey, solidFetch]);

  const toggle = (key: string) => {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const totalFiles = bundles.reduce((n, b) => n + b.files.length, 0);

  return (
    <div style={{ marginTop: '2rem', padding: '1rem', backgroundColor: '#676565ff' }}>
      <h3>Debug – every file read from Pod(s)</h3>
      <button onClick={listAllFiles} disabled={loading}>
        {loading ? 'Loading…' : 'Refresh file list'}
      </button>
      <div style={{ marginTop: '0.5rem', fontSize: '0.9rem' }}>
        {podNames.length > 0 && (
          <span style={{ marginRight: '0.75rem' }}>
            <strong>
              {podNames.length} pod{podNames.length !== 1 ? 's' : ''} selected
            </strong>
          </span>
        )}
        {totalFiles > 0 && (
          <strong>
            {totalFiles} file{totalFiles !== 1 ? 's' : ''} discovered
          </strong>
        )}
      </div>
      <div style={{ marginTop: '1rem' }}>
        {bundles.map((bundle, pi) => (
          <div key={bundle.podName} style={{ marginBottom: '1.5rem' }}>
            <h4 style={{ margin: '0 0 0.75rem 0', color: '#eee', fontSize: '1rem' }}>{bundle.podName}</h4>
            {bundle.files.map((f, i) => {
              const key = `${pi}-${i}`;
              const row: any = f;
              return (
                <div
                  key={key}
                  style={{ marginBottom: '1rem', border: '1px solid #555', borderRadius: '4px', overflow: 'hidden' }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      const nextOpen = !expanded[key];
                      toggle(key);
                      if (nextOpen && !row.loaded && !row.loading && !row.error) {
                        void ensureLoaded(bundle.podName, i);
                      }
                    }}
                    style={{
                      width: '100%',
                      padding: '0.5rem 1rem',
                      textAlign: 'left',
                      background: '#555',
                      color: '#eee',
                      border: 'none',
                      cursor: 'pointer',
                      fontFamily: 'monospace',
                      fontSize: '0.85rem',
                    }}
                  >
                    {expanded[key] ? '▼' : '▶'} {f.url || '(error)'}
                    {row.loading && ' – Loading…'}
                    {row.loaded && row.sizeBytes !== undefined && ` – ${(row.sizeBytes / 1024).toFixed(1)} KB`}
                    {f.error && ' – Error'}
                  </button>
                  {expanded[key] && (
                    <pre
                      style={{
                        margin: 0,
                        backgroundColor: '#333',
                        color: '#b5b2b2ff',
                        padding: '1rem',
                        overflow: 'auto',
                        maxHeight: '300px',
                        fontSize: '0.8rem',
                      }}
                    >
                      {f.error
                        ? `Error: ${f.error}`
                        : row.loading
                          ? 'Loading…'
                          : row.loaded
                            ? `${row.summary || summarize(row.content || '', row.url)}\n\n${row.content || '(empty)'}`
                            : 'Not loaded. Expand to fetch.'}
                    </pre>
                  )}
                </div>
              );
            })}
          </div>
        ))}
        {!loading && totalFiles === 0 && podNames.length > 0 && (
          <div style={{ color: '#b5b2b2' }}>No files found. Click “Refresh all Pod files”.</div>
        )}
      </div>
    </div>
  );
};

export default DebugReader;

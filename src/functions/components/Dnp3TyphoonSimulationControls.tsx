import React, { useState } from 'react';
import { overwriteFile } from '@inrupt/solid-client';
import { getDefaultSession } from '@inrupt/solid-client-authn-browser';

const baseURI = import.meta.env.VITE_BASE_URI;
const normalizedBaseUri = String(baseURI || '').replace(/\/+$/, '');
const commandsContainer = String(
  import.meta.env.VITE_DNP3_COMMANDS_CONTAINER || 'dnp3_commands'
).replace(/^\/+|\/+$/g, '');

/**
 * Typhoon HIL simulation on/off for each DNP3 "family" (fileDeviceId), using the same
 * plain-text convention as modbus_commands: the published resource body is a single digit.
 *
 * Default Solid layout (override container with VITE_DNP3_COMMANDS_CONTAINER):
 *   {base}/{podName}/dnp3_commands/{family}
 *   Body: "1" = run simulation, "0" = stop — for a watcher co-located with the DNP3 sender.
 */
interface Dnp3TyphoonSimulationControlsProps {
  podName: string;
  families: string[];
  /** Latest numeric DNP3 "State" field per family (from pod data); shown instead of graphing State. */
  stateByFamily?: Record<string, number | null>;
  onUpdate?: (message: string) => void;
  solidFetch?: typeof fetch;
}

const Dnp3TyphoonSimulationControls: React.FC<Dnp3TyphoonSimulationControlsProps> = ({
  podName,
  families,
  stateByFamily,
  onUpdate,
  solidFetch,
}) => {
  const [workingKey, setWorkingKey] = useState<string | null>(null);

  if (!podName || families.length === 0) {
    return null;
  }

  const sendCommand = async (family: string, run: 0 | 1) => {
    const key = `${family}:${run}`;
    if (workingKey) return;

    const encFamily = encodeURIComponent(family);
    const root = `${normalizedBaseUri}/${podName}/${commandsContainer}`;
    const commandTargets = [
      `${root}/${encFamily}`,
      `${root}/${encFamily}/`,
      `${root}/${encFamily}/command.txt`,
      `${root}/${encFamily}/latest`,
    ];

    const command = String(run);
    const defaultSession = getDefaultSession();
    const fetchCandidates = Array.from(
      new Set([solidFetch, defaultSession.fetch, fetch].filter(Boolean))
    ) as Array<typeof fetch>;

    setWorkingKey(key);

    try {
      let writeSucceeded = false;
      const failureDetails: string[] = [];

      for (const targetUrl of commandTargets) {
        for (const candidateFetch of fetchCandidates) {
          try {
            await overwriteFile(
              targetUrl,
              new File([command], encFamily, { type: 'text/plain' }),
              { fetch: candidateFetch }
            );
            writeSucceeded = true;
            break;
          } catch (writeError) {
            console.warn(`Dnp3TyphoonSimulationControls: failed write to ${targetUrl}`, writeError);
            const errorObj = writeError as { statusCode?: number; statusText?: string; message?: string };
            const statusCode = typeof errorObj.statusCode === 'number' ? errorObj.statusCode : undefined;
            const statusText = typeof errorObj.statusText === 'string' ? errorObj.statusText : '';
            const message = typeof errorObj.message === 'string' ? errorObj.message : String(writeError);
            const statusPart = statusCode ? `HTTP ${statusCode}${statusText ? ` ${statusText}` : ''}` : 'no HTTP status';
            const fetchLabel =
              candidateFetch === solidFetch
                ? 'portalSession.fetch'
                : candidateFetch === defaultSession.fetch
                  ? 'defaultSession.fetch'
                  : 'window.fetch';
            failureDetails.push(`${targetUrl} [${fetchLabel}] -> ${statusPart}; ${message}`);
          }
        }
        if (writeSucceeded) break;
      }

      if (!writeSucceeded) {
        const details =
          failureDetails.length > 0 ? failureDetails.join(' | ') : 'No detailed error information available';
        throw new Error(`Unable to write DNP3 simulation command. Tried: ${details}`);
      }

      if (onUpdate) {
        onUpdate(
          `DNP3 Typhoon HIL: family "${family}" simulation ${run === 1 ? 'ON' : 'OFF'} (wrote ${command} to ${commandsContainer}/...)`
        );
      }
    } catch (error) {
      console.error('DNP3 Typhoon simulation command failed:', error);
      if (onUpdate) {
        const message = error instanceof Error ? error.message : String(error);
        onUpdate(`DNP3 Typhoon HIL error (${family}): ${message}`);
      }
    } finally {
      setWorkingKey(null);
    }
  };

  return (
    <div
      style={{
        padding: '0.65rem 0.85rem',
        backgroundColor: '#2a2633',
        border: '1px solid #6f42c1',
        borderRadius: '8px',
        maxWidth: '100%',
      }}
    >
      <div style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#e9ecef', marginBottom: '0.5rem' }}>
        Typhoon HIL simulation (DNP3 families)
      </div>
      <div style={{ fontSize: '0.75rem', color: '#adb5bd', marginBottom: '0.65rem' }}>
        Writes <code style={{ color: '#ced4da' }}>1</code> = run / <code style={{ color: '#ced4da' }}>0</code> = stop
        to <code style={{ color: '#ced4da' }}>…/{commandsContainer}/&lt;family&gt;</code> (per-family resource, same
        plain-text idea as <code style={{ color: '#ced4da' }}>modbus_commands</code>).
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
        {families.map((family) => {
          const stateVal = stateByFamily?.[family];
          const stateLine =
            stateVal != null && !Number.isNaN(stateVal)
              ? `${family} is currently in State ${stateVal}.`
              : `${family}: no State reading in the current filter.`;

          return (
            <div
              key={family}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.35rem',
                fontSize: '0.85rem',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}
              >
                <span style={{ color: '#e9ecef', fontWeight: 600, minWidth: '7rem' }}>{family}</span>
                <button
                  type="button"
                  onClick={() => void sendCommand(family, 1)}
                  disabled={workingKey !== null}
                  style={{
                    padding: '0.25rem 0.65rem',
                    backgroundColor: workingKey === `${family}:1` ? '#6c757d' : '#198754',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: workingKey !== null ? 'default' : 'pointer',
                    fontSize: '0.78rem',
                    fontWeight: 'bold',
                  }}
                >
                  {workingKey === `${family}:1` ? '…' : 'Sim on'}
                </button>
                <button
                  type="button"
                  onClick={() => void sendCommand(family, 0)}
                  disabled={workingKey !== null}
                  style={{
                    padding: '0.25rem 0.65rem',
                    backgroundColor: workingKey === `${family}:0` ? '#6c757d' : '#dc3545',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: workingKey !== null ? 'default' : 'pointer',
                    fontSize: '0.78rem',
                    fontWeight: 'bold',
                  }}
                >
                  {workingKey === `${family}:0` ? '…' : 'Sim off'}
                </button>
              </div>
              <div
                style={{
                  fontSize: '0.9rem',
                  fontWeight: 500,
                  color: '#e9ecef',
                  paddingLeft: '0.1rem',
                }}
              >
                {stateLine}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default Dnp3TyphoonSimulationControls;

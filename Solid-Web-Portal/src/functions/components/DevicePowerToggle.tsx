import React, { useState } from 'react';
import { overwriteFile } from '@inrupt/solid-client';
import { getDefaultSession } from '@inrupt/solid-client-authn-browser';

const baseURI = import.meta.env.VITE_BASE_URI;
const normalizedBaseUri = String(baseURI || '').replace(/\/+$/, '');

interface DevicePowerToggleProps {
  podName: string;
  deviceId?: string;
  onUpdate?: (message: string) => void;
  solidFetch?: typeof fetch;
}

const DevicePowerToggle: React.FC<DevicePowerToggleProps> = ({
  podName,
  deviceId,
  onUpdate,
  solidFetch,
}) => {
  const [isWorking, setIsWorking] = useState<boolean>(false);

  if (!podName) {
    return null;
  }

  const toggleDevicePower = async () => {
    if (isWorking) return;

    const commandUrl = `${normalizedBaseUri}/${podName}/modbus_commands`;
    const commandUrlWithSlash = `${normalizedBaseUri}/${podName}/modbus_commands/`;
    const fallbackCommandUrl = `${normalizedBaseUri}/${podName}/modbus`;
    const fallbackCommandUrlWithSlash = `${normalizedBaseUri}/${podName}/modbus/`;
    const command = '1';
    const deviceLabel = deviceId || 'Device';
    const defaultSession = getDefaultSession();
    const fetchCandidates = Array.from(
      new Set([solidFetch, defaultSession.fetch, fetch].filter(Boolean))
    ) as Array<typeof fetch>;

    setIsWorking(true);

    try {
      const commandTargets = [
        commandUrl,
        commandUrlWithSlash,
        `${commandUrlWithSlash}command.txt`,
        `${commandUrlWithSlash}latest`,
        fallbackCommandUrl,
        fallbackCommandUrlWithSlash,
      ];
      let writeSucceeded = false;
      const failureDetails: string[] = [];

      for (const targetUrl of commandTargets) {
        for (const candidateFetch of fetchCandidates) {
          try {
            // Pi-side parser expects the last line to be a plain integer.
            // Write just the numeric command value to keep compatibility.
            const newContent = command;

            await overwriteFile(
              targetUrl,
              new File([newContent], 'modbus_commands', { type: 'text/plain' }),
              { fetch: candidateFetch }
            );

            writeSucceeded = true;
            break;
          } catch (writeError) {
            console.warn(`DevicePowerToggle: failed to write command to ${targetUrl}`, writeError);
            const errorObj = writeError as { statusCode?: number; statusText?: string; message?: string };
            const statusCode = typeof errorObj.statusCode === 'number' ? errorObj.statusCode : undefined;
            const statusText = typeof errorObj.statusText === 'string' ? errorObj.statusText : '';
            const message = typeof errorObj.message === 'string' ? errorObj.message : String(writeError);
            const statusPart = statusCode ? `HTTP ${statusCode}${statusText ? ` ${statusText}` : ''}` : 'no HTTP status';
            const fetchLabel = candidateFetch === solidFetch
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
        const details = failureDetails.length > 0
          ? failureDetails.join(' | ')
          : 'No detailed error information available';
        throw new Error(`Unable to write command. Tried: ${details}`);
      }

      if (onUpdate) {
        onUpdate(`${deviceLabel} command value ${command} sent to command resource`);
      }
    } catch (error) {
      console.error('Failed to toggle device power:', error);
      if (onUpdate) {
        const message = error instanceof Error ? error.message : String(error);
        onUpdate(`Error toggling ${deviceLabel} power: ${message}`);
      }
    } finally {
      setIsWorking(false);
    }
  };

  return (
    <button
      onClick={toggleDevicePower}
      disabled={isWorking}
      style={{
        padding: '0.35rem 0.75rem',
        backgroundColor: isWorking ? '#6c757d' : '#dc3545',
        color: 'white',
        border: 'none',
        borderRadius: '4px',
        cursor: isWorking ? 'default' : 'pointer',
        fontSize: '0.8rem',
        fontWeight: 'bold',
        minWidth: '8rem',
        marginLeft: '0.75rem',
      }}
    >
      {isWorking ? 'Sending...' : 'Shut off device'}
    </button>
  );
};

export default DevicePowerToggle;


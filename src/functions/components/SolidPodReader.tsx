// This is the main application that manages the state:
// connection, data, UI preferences

// Coordinates between services and display components

// Timestamps show actual data collection time
// Data updates automatically via WebSocket

import React, { useState, useEffect, useRef } from 'react';

import { DataPoint, isDnp3Data } from '../dataTypes';
import { MAX_DNP3_POINTS_PER_SERIES } from '../config/dnp3GraphPolicy';
import { trimDnp3ResultsBySeries } from '../parsers/dnp3Parser';
import { WebSocketService } from '../services/websocketService';
import { DataService } from '../services/dataService';
import { prepareChartDataByDevice, groupDataBySource } from '../utils/chartUtils';
import DataTable from './DataTable';
import UpdatesLog from './UpdatesLog';
import LoginSection from './LoginSection';
import DebugReader from '../parsers/DebugReader';
import DeviceChart from './DeviceChart';
import { getExpectedWebIdForPod, listDerPodNames, webIdsEqual } from '../../config/derWebIds';
import {
  getPortalSession,
  buildPortalLoginRedirectUrl,
  hasOAuthRedirectParams,
} from '../../session/portalSessions';

const baseURI = import.meta.env.VITE_BASE_URI;
const expectedPortalWebId =
  import.meta.env.VITE_PORTAL_WEBID || `${String(baseURI).replace(/\/+$/, '')}/utility/profile/card#me`;

const SolidPodReader: React.FC = () => {
  const portalSession = getPortalSession();
  const websocketServiceRef = useRef<WebSocketService | null>(null);
  const dataServiceRef = useRef<DataService | null>(null);
  /** Bumps when portal or pod sessions change so we re-read Session.info in render. */
  const [authTick, setAuthTick] = useState(0);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [podNamesInput, setPodNamesInput] = useState<string>('');
  const [discoveredPods, setDiscoveredPods] = useState<string[]>([]);
  const [selectedDiscoveredPods, setSelectedDiscoveredPods] = useState<string[]>([]);
  const [podAccessMap, setPodAccessMap] = useState<Record<string, boolean>>({});
  const [allData, setAllData] = useState<DataPoint[]>([]);
  const [updates, setUpdates] = useState<string[]>([]);
  const [dataType, setDataType] = useState<'modbus' | 'slider' | 'dnp3' | 'both'>('both');
  
  // Chart Display Options
  const [groupingMethod, setGroupingMethod] = useState<'device' | 'source' | 'combined'>('device');
  const [chartHeight, setChartHeight] = useState<number>(250);
  const [showStats, setShowStats] = useState<boolean>(true);
  const [compactView, setCompactView] = useState<boolean>(false);
  const [selectedFamily, setSelectedFamily] = useState<string>('all');
  const userChoseAllRef = useRef<boolean>(false);

  // Initialize services
  useEffect(() => {
    if (!websocketServiceRef.current) {
      websocketServiceRef.current = new WebSocketService();
    }
    if (!dataServiceRef.current) {
      dataServiceRef.current = new DataService();
    }
  }, []);

  /** Utility-first: dashboard unlocks only with the portal (utility) session. */
  void authTick;
  const isAppUnlocked = portalSession.info.isLoggedIn;

  const getFetchForPodListing = (): typeof fetch => portalSession.fetch;

  const loginToSolid = async (): Promise<void> => {
    await portalSession.login({
      oidcIssuer: baseURI,
      redirectUrl: buildPortalLoginRedirectUrl(),
      clientName: 'Solid Pod Reader (portal)',
    });
  };

  const verifyPodAccess = async (podName: string): Promise<void> => {
    if (!dataServiceRef.current) return;
    const ok = await dataServiceRef.current.canAccessPod(podName, portalSession.fetch);
    setPodAccessMap((prev) => ({ ...prev, [podName]: ok }));
    addUpdate(ok ? `Utility has read access to ${podName}` : `Utility cannot read ${podName} (check ACL/ACP)`);
  };

  const logoutFromSolid = async (): Promise<void> => {
    if (websocketServiceRef.current) {
      websocketServiceRef.current.disconnect();
    }

    await portalSession.logout({ logoutType: 'app' });
    setPodAccessMap({});
    setAllData([]);
    setPodNamesInput('');
    setDiscoveredPods([]);
    setSelectedDiscoveredPods([]);
    addUpdate('Logged out from portal and cleared DER pod sessions');
    setAuthTick((t) => t + 1);
  };

  const addUpdate = (message: string) => {
    setUpdates(prev => [...prev, `[${new Date().toLocaleTimeString()}]: ${message}`]);
  };

  const manualPodNames = podNamesInput
    .split(',')
    .map((name) => name.trim())
    .filter((name) => name.length > 0);
  const podNames = Array.from(new Set([...selectedDiscoveredPods, ...manualPodNames]));

  const portalWebId = portalSession.info.webId;

  const podSessionReady = (podName: string): boolean => podAccessMap[podName] === true;

  const accessiblePodNames = podNames.filter(podSessionReady);
  /** Pods with a stored device read token (manifest + your selections / manual names). */
  const provenReaderPods = Array.from(new Set([...listDerPodNames(), ...podNames])).filter(podSessionReady);
  const primaryPod = accessiblePodNames[0] || '';
  const podNamesKey = podNames.join(',');

  const toggleDiscoveredPod = (podName: string): void => {
    setSelectedDiscoveredPods((prev) => {
      if (prev.includes(podName)) {
        return prev.filter((p) => p !== podName);
      }
      return [...prev, podName];
    });
  };

  const pointKey = (point: DataPoint): string => {
    const ts = point.timestamp instanceof Date ? point.timestamp.getTime() : new Date(point.timestamp as any).getTime();
    const anyPoint = point as any;
    return [
      point.dataType,
      Number.isFinite(ts) ? ts : 'NaN',
      point.source || '',
      point.deviceId || '',
      anyPoint.field || '',
      anyPoint.register ?? '',
      point.fileDeviceId || '',
      point.value,
    ].join('|');
  };

  const fetchData = async (): Promise<void> => {
    if (accessiblePodNames.length === 0 || !dataServiceRef.current) {
      return;
    }

    try {
      const fetchedByPod = await Promise.all(
        accessiblePodNames.map(async (podName) => {
          const points = await dataServiceRef.current!.fetchAllData(
            podName,
            dataType,
            portalSession.fetch
          );
          return points.map((point) => ({
            ...point,
            source: `solid-pod:${podName}`,
          }));
        })
      );
      const newData = fetchedByPod.flat();
      
      if (newData.length > 0) {
        setAllData(prev => {
          // Combine and deduplicate in O(n) using a stable key.
          const combined = [...prev];
          const seen = new Set<string>(prev.map(pointKey));
          for (const newPoint of newData) {
            const k = pointKey(newPoint);
            if (seen.has(k)) continue;
            seen.add(k);
            combined.push(newPoint);
          }

          const nonDnp3 = combined.filter((p) => !isDnp3Data(p));
          const dnp3 = combined.filter(isDnp3Data);
          const cappedDnp3 = trimDnp3ResultsBySeries(dnp3, MAX_DNP3_POINTS_PER_SERIES);
          return [...nonDnp3, ...cappedDnp3];
        });

        // Log a compact summary instead of one message per point.
        // Per-point logging can generate tens of thousands of state updates and
        // starve rendering when DNP3 batches are large.
        const modbusCount = newData.filter((d) => d.dataType === 'modbus').length;
        const dnp3Points = newData.filter((d) => d.dataType === 'dnp3');
        const sliderCount = newData.filter((d) => d.dataType === 'slider').length;
        const dnp3Count = dnp3Points.length;
        const dnp3Families = Array.from(new Set(dnp3Points.map((d) => d.fileDeviceId).filter(Boolean))).length;
        const dnp3Fields = Array.from(
          new Set(
            dnp3Points
              .map((d) => (d as any).field)
              .filter((f): f is string => typeof f === 'string' && f.length > 0)
          )
        ).length;

        addUpdate(
          `Fetched ${newData.length} points (modbus ${modbusCount}, dnp3 ${dnp3Count}, slider ${sliderCount})`
        );
        if (dnp3Count > 0) {
          addUpdate(`DNP3 breakdown: ${dnp3Families} families, ${dnp3Fields} fields`);
        }
      }
    } catch (error) {
      console.error('Error fetching data:', error);
          addUpdate(`Error fetching data: ${error}`);
    }
  };

  useEffect(() => {
    const handleSessionState = async () => {
      if (hasOAuthRedirectParams()) {
        await portalSession.handleIncomingRedirect();
        if (portalSession.info.isLoggedIn) {
          addUpdate(`Portal login: ${portalSession.info.webId || 'user'}`);
        }
      } else {
        await portalSession.handleIncomingRedirect({ restorePreviousSession: true });
      }

      setIsLoading(false);

      const portalIn = portalSession.info.isLoggedIn;
      if (dataServiceRef.current && portalIn) {
        const foundPods = await dataServiceRef.current.listPodsAtBase(getFetchForPodListing());
        setDiscoveredPods(foundPods);
        const checks = await Promise.all(
          foundPods.map(async (name) => [name, await dataServiceRef.current!.canAccessPod(name, portalSession.fetch)] as const)
        );
        setPodAccessMap(Object.fromEntries(checks));
        if (foundPods.length > 0) {
          addUpdate(`Listed ${foundPods.length} pods (portal + manifest)`);
        }
      }

      if (
        portalSession.info.isLoggedIn &&
        portalSession.info.webId &&
        !webIdsEqual(portalSession.info.webId, expectedPortalWebId)
      ) {
        const wrong = portalSession.info.webId;
        await portalSession.logout({ logoutType: 'app' });
        addUpdate(
          `Portal identity drifted to ${wrong}. Please sign back in as utility (${expectedPortalWebId}).`
        );
      }
      setAuthTick((t) => t + 1);
    };

    void handleSessionState();
  }, []);

  useEffect(() => {
    const bump = (): void => setAuthTick((t) => t + 1);
    portalSession.events.on('login', bump);
    portalSession.events.on('logout', bump);
    return () => {
      portalSession.events.off('login', bump);
      portalSession.events.off('logout', bump);
    };
  }, [portalSession]);

  useEffect(() => {
    if (isAppUnlocked && accessiblePodNames.length > 0 && websocketServiceRef.current) {
      const subscribeToNotifications = async () => {
        await Promise.all(
          accessiblePodNames.map(async (podName) => {
            try {
              const sliderTopic = `${baseURI}/${podName}/modbus`;
              await websocketServiceRef.current!.connect(
                sliderTopic,
                async () => {
                  await fetchData();
                },
                portalSession
              );
              addUpdate(`WebSocket connected to ${podName}/modbus`);
            } catch (error) {
              console.error("Failed to establish WebSocket connection:", error);
              addUpdate(`Failed to establish WebSocket connection for ${podName}`);
            }
          })
        );
      };

      // Initial data fetch
      fetchData();
      
      // Set up WebSocket subscription
      subscribeToNotifications();
    }

    return () => {
      if (websocketServiceRef.current) {
        websocketServiceRef.current.disconnect();
      }
    };
  }, [isAppUnlocked, podNamesKey, dataType, authTick]);

  const clearUpdates = (): void => {
    setUpdates([]);
  };

  // Filter data based on selected data type
  const filteredData = allData.filter((item) => {
    if (dataType === 'both') {
      return true;
    }
    return item.dataType === dataType;
  });

  // Distinct DNP3 "families" (file-level device such as PV_Power_Plant_0, Battery_0)
  const dnp3Families = Array.from(
    new Set(
      filteredData
        .filter(d => d.dataType === 'dnp3' && d.fileDeviceId)
        .map(d => d.fileDeviceId as string)
    )
  );

  // Ensure that "All" is not the default tab when DNP3 families are available.
  // When data arrives and no specific family has been chosen yet, default to
  // the first available family instead of "All".
  React.useEffect(() => {
    if (!userChoseAllRef.current && selectedFamily === 'all' && dnp3Families.length > 0) {
      setSelectedFamily(dnp3Families[0]);
    }
  }, [selectedFamily, dnp3Families]);

  // Further filter by DNP3 "family" (file-level device such as PV_Power_Plant_0, Battery_0)
  const familyFilteredData = (() => {
    if (selectedFamily === 'all' || !selectedFamily) return filteredData;
    // Only DNP3 points belong to a specific DNP3 family; when a family is selected,
    // hide non-DNP3 data to focus on that group.
    return filteredData.filter(
      (item) => item.dataType === 'dnp3' && item.fileDeviceId === selectedFamily
    );
  })();

  // Prepare chart data based on grouping method
  const getChartData = () => {
    const dnp3 = familyFilteredData.filter((d) => d.dataType === 'dnp3');
    const nonDnp3 = familyFilteredData.filter((d) => d.dataType !== 'dnp3');
    const byDnp3Device = prepareChartDataByDevice(dnp3);

    if (groupingMethod === 'device') {
      return prepareChartDataByDevice(familyFilteredData);
    } else if (groupingMethod === 'source') {
      // Keep DNP3 visible as point-level charts even in "By Source" mode.
      // Source grouping collapses many heterogeneous DNP3 points into one chart,
      // which can look like only Modbus is present.
      const bySource = groupDataBySource(nonDnp3);
      return { ...bySource, ...byDnp3Device };
    } else {
      // In combined mode, still split DNP3 by point so DNP3 never disappears
      // behind a single mixed "All Data" chart.
      const combined: Record<string, DataPoint[]> = {};
      if (nonDnp3.length > 0) combined['All Non-DNP3'] = nonDnp3;
      return { ...combined, ...byDnp3Device };
    }
  };

  const chartData = getChartData();
  const chartGroups = Object.keys(chartData);
  const allDataDnp3Count = allData.filter((d) => d.dataType === 'dnp3').length;
  const filteredDnp3Count = filteredData.filter((d) => d.dataType === 'dnp3').length;
  const familyFilteredDnp3Count = familyFilteredData.filter((d) => d.dataType === 'dnp3').length;

  if (isLoading) {
    return <h2>Loading...</h2>;
  }

  if (!isAppUnlocked) {
    return <LoginSection onLogin={loginToSolid} />;
  }

  return (
    <div style={{ padding: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h1>Solid Pod Reader</h1>
      </div>
      
      <div>
        {/* Header Controls */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          marginBottom: '1.5rem',
          flexWrap: 'wrap',
          gap: '1rem'
        }}>
          <h2>Solid Pod Data Reader</h2>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button 
              onClick={clearUpdates}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: '#6c757d',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Clear Updates
            </button>
            <button 
              onClick={logoutFromSolid}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: '#dc3545',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Logout
            </button>
          </div>
        </div>

        {portalSession.info.isLoggedIn && portalWebId && (
          <div
            style={{
              marginBottom: '1rem',
              padding: '0.75rem 1rem',
              backgroundColor: '#2a3f5f',
              borderRadius: '8px',
              border: '1px solid #4a6fa5',
              fontSize: '0.9rem',
              color: '#e8eef7',
            }}
          >
            <strong>Portal WebID</strong> — you are signed in here as the operator (utility hub). Pod listing uses this
            identity.
            <div style={{ marginTop: '0.5rem', wordBreak: 'break-all' }}>{portalWebId}</div>
          </div>
        )}

        {provenReaderPods.length > 0 && (
          <div
            style={{
              marginBottom: '1rem',
              padding: '0.75rem 1rem',
              backgroundColor: '#1e3a2f',
              borderRadius: '8px',
              border: '1px solid #3d8a6a',
              fontSize: '0.88rem',
              color: '#e8f7f0',
            }}
          >
            <strong>DER read access</strong> — verified pods the utility account can read directly (ACL/ACP granted).
            <ul style={{ margin: '0.5rem 0 0 1.1rem', padding: 0 }}>
              {provenReaderPods.map((p) => (
                <li key={p} style={{ marginBottom: '0.25rem', wordBreak: 'break-all' }}>
                  <code style={{ fontSize: '0.85rem' }}>{p}</code>
                  {getExpectedWebIdForPod(p) && <span style={{ color: '#a8dcc4' }}> — expected owner: {getExpectedWebIdForPod(p)}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div
          style={{
            marginBottom: '1rem',
            padding: '0.75rem 1rem',
            backgroundColor: '#2f3d2f',
            borderRadius: '8px',
            border: '1px solid #4a8a4a',
            fontSize: '0.88rem',
            color: '#e8f7e8',
          }}
        >
          <strong>Hub workflow:</strong> log in as <strong>utility</strong> first. Use <strong>Verify Access</strong>{' '}
          beside each DER pod to confirm utility can read it (via ACL/ACP grants). Select verified pods with checkmarks
          to load data together.
        </div>

        {/* CSV Simulation Controls disabled */}
        
        {/* Data Configuration Panel */}
        <div style={{ 
          marginBottom: '1.5rem', 
          padding: '1rem', 
          backgroundColor: '#4a4b4cff', 
          borderRadius: '8px',
          border: '1px solid #212122ff'
        }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2rem', alignItems: 'center' }}>
            {/* Pod Name Input */}
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                Pod Names
              </label>
              <input
                type="text"
                value={podNamesInput}
                onChange={(e) => setPodNamesInput(e.target.value)}
                placeholder="e.g., PV_Power_Plant_1000, Battery_1004 (comma-separated)"
                style={{ 
                  padding: '0.5rem',
                  border: '1px solid #535354ff',
                  borderRadius: '4px',
                  backgroundColor: 'white',
                  width: '320px',
                  color: 'black'
                }}
              />
              <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: '#d5d6d8' }}>
                Manual entries are combined with selected pods below. Use <strong>Connect</strong> beside each pod to
                add a Solid session for that DER (credentials in <code style={{ fontSize: '0.75rem' }}>solid_devices.json</code>).
              </div>
            </div>

            {/* Data Type Selector */}
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                Data Type
              </label>
              <select
                value={dataType}
                onChange={(e) => setDataType(e.target.value as 'modbus' | 'slider' | 'dnp3' | 'both')}
                style={{ 
                  padding: '0.5rem',
                  border: '1px solid #66696cff',
                  borderRadius: '4px',
                  backgroundColor: 'white',
                  width: '180px',
                  color: 'black'
                }}
              >
                <option value="both">All (discover Pod)</option>
                <option value="modbus">Modbus Only</option>
                <option value="dnp3">DNP3 Only</option>
                <option value="slider">Slider Only</option>
              </select>
            </div>

            {/* Chart Display Options */}
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                Chart View
              </label>
              <select
                value={groupingMethod}
                onChange={(e) => setGroupingMethod(e.target.value as 'device' | 'source' | 'combined')}
                style={{ 
                  padding: '0.5rem',
                  border: '1px solid #888a8dff',
                  borderRadius: '4px',
                  backgroundColor: 'white',
                  width: '150px',
                  color: 'black'
                }}
              >
                <option value="device">By Device</option>
                <option value="source">By Source</option>
                <option value="combined">Combined View</option>
              </select>
            </div>
          </div>

          {/* Chart Settings */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', marginTop: '1rem', alignItems: 'center' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input
                type="checkbox"
                checked={showStats}
                onChange={(e) => setShowStats(e.target.checked)}
              />
              Show Statistics
            </label>
            
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input
                type="checkbox"
                checked={compactView}
                onChange={(e) => setCompactView(e.target.checked)}
              />
              Compact View
            </label>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <label style={{ whiteSpace: 'nowrap' }}>Chart Height:</label>
              <input
                type="range"
                min="150"
                max="400"
                step="50"
                value={chartHeight}
                onChange={(e) => setChartHeight(parseInt(e.target.value))}
                style={{ width: '100px' }}
              />
              <span>{chartHeight}px</span>
            </div>
          </div>
        </div>

        {/* Pod Tabs */}
        {discoveredPods.length > 0 && (
          <div
            style={{
              marginBottom: '1.5rem',
              padding: '1rem',
              backgroundColor: '#4a4b4cff',
              borderRadius: '8px',
              border: '1px solid #212122ff',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
              <strong>Discovered Pods</strong>
              <button
                onClick={async () => {
                  if (!dataServiceRef.current) return;
                  const foundPods = await dataServiceRef.current.listPodsAtBase(getFetchForPodListing());
                  setDiscoveredPods(foundPods);
                  addUpdate(`Refreshed pod list (${foundPods.length} found)`);
                }}
                style={{
                  padding: '0.35rem 0.75rem',
                  borderRadius: '6px',
                  border: '1px solid #6c757d',
                  backgroundColor: '#6c757d',
                  color: 'white',
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                }}
              >
                Refresh Pod List
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.75rem' }}>
              {discoveredPods.map((pod) => {
                const isSelected = selectedDiscoveredPods.includes(pod);
                const ok = podSessionReady(pod);
                const expected = getExpectedWebIdForPod(pod);
                return (
                  <div
                    key={pod}
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      gap: '0.5rem',
                      padding: '0.35rem 0.5rem',
                      borderRadius: '6px',
                      backgroundColor: '#3a3b3cff',
                    }}
                  >
                    <button
                      type="button"
                      title="Include in dashboard"
                      onClick={() => toggleDiscoveredPod(pod)}
                      style={{
                        padding: '0.25rem 0.65rem',
                        borderRadius: '999px',
                        border: `1px solid ${isSelected ? '#17a2b8' : '#555'}`,
                        backgroundColor: isSelected ? '#17a2b8' : 'transparent',
                        color: isSelected ? 'white' : '#17a2b8',
                        cursor: 'pointer',
                        fontSize: '0.8rem',
                      }}
                    >
                      {isSelected ? '✓ ' : ''}
                      {pod}
                    </button>
                    <span style={{ fontSize: '0.75rem', color: ok ? '#9fdf9f' : '#ccc' }}>
                      {ok ? `Utility access verified for ${pod}` : 'Access not verified'}
                    </span>
                    <button
                      type="button"
                      onClick={() => void verifyPodAccess(pod)}
                      style={{
                        padding: '0.2rem 0.55rem',
                        fontSize: '0.75rem',
                        borderRadius: '4px',
                        border: '1px solid #28a745',
                        backgroundColor: '#28a745',
                        color: 'white',
                        cursor: 'pointer',
                      }}
                    >
                      {ok ? 'Recheck' : 'Verify Access'}
                    </button>
                    {!ok && (
                      <button
                        type="button"
                        onClick={() => toggleDiscoveredPod(pod)}
                        style={{
                          padding: '0.2rem 0.55rem',
                          fontSize: '0.75rem',
                          borderRadius: '4px',
                          border: '1px solid #6c757d',
                          backgroundColor: '#6c757d',
                          color: 'white',
                          cursor: 'pointer',
                        }}
                      >
                        Remove
                      </button>
                    )}
                    {expected && (
                      <span style={{ fontSize: '0.7rem', color: '#aaa', wordBreak: 'break-all' }}>
                        Expected: {expected}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
            {podNames.some((p) => !discoveredPods.includes(p)) && (
              <div style={{ marginTop: '0.75rem', fontSize: '0.85rem', color: '#d5d6d8' }}>
                Manual pod names (not in list above):
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.35rem' }}>
                  {podNames
                    .filter((p) => !discoveredPods.includes(p))
                    .map((pod) => {
                      const ok = podSessionReady(pod);
                      return (
                        <div key={`manual-${pod}`} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem' }}>
                          <code>{pod}</code>
                          <span style={{ fontSize: '0.75rem', color: ok ? '#9fdf9f' : '#ccc' }}>
                            {ok ? `Utility access verified for ${pod}` : 'Access not verified'}
                          </span>
                          <button
                            type="button"
                            onClick={() => void verifyPodAccess(pod)}
                            style={{
                              padding: '0.2rem 0.55rem',
                              fontSize: '0.75rem',
                              borderRadius: '4px',
                              border: '1px solid #28a745',
                              backgroundColor: '#28a745',
                              color: 'white',
                              cursor: 'pointer',
                            }}
                          >
                            {ok ? 'Recheck' : 'Verify Access'}
                          </button>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Data Summary */}
        <div style={{ 
          marginBottom: '1.5rem', 
          padding: '1rem', 
          backgroundColor: '#7a7b7cff', 
          borderRadius: '8px',
          border: '1px solid #3f3f3fff'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <strong style={{ fontSize: '1.1rem' }}>Data Summary</strong>
              <div style={{ marginTop: '0.5rem', display: 'flex', gap: '1.5rem' }}>
                <div>
                  <span style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#007bff' }}>
                    {filteredData.length}
                  </span>
                  <div style={{ fontSize: '0.9rem' }}>Total Points</div>
                </div>
                <div>
                  <span style={{ fontSize: '1.2rem', color: '#17a2b8' }}>
                    {filteredData.filter(d => d.dataType === 'modbus').length}
                  </span>
                  <div style={{ fontSize: '0.9rem' }}>Modbus</div>
                </div>
                <div>
                  <span style={{ fontSize: '1.2rem', color: '#28a745' }}>
                    {filteredData.filter(d => d.dataType === 'slider').length}
                  </span>
                  <div style={{ fontSize: '0.9rem' }}>Slider</div>
                </div>
                <div>
                  <span style={{ fontSize: '1.2rem', color: '#6f42c1' }}>
                    {filteredData.filter(d => d.dataType === 'dnp3').length}
                  </span>
                  <div style={{ fontSize: '0.9rem' }}>DNP3</div>
                </div>
                <div>
                  <span style={{ fontSize: '1.2rem', color: '#20c997' }}>
                    {
                      Array.from(
                        new Set(
                          filteredData
                            .filter(d => d.dataType === 'dnp3' && d.fileDeviceId)
                            .map(d => d.fileDeviceId as string)
                        )
                      ).length
                    }
                  </span>
                  <div style={{ fontSize: '0.9rem' }}>DNP3 Families</div>
                </div>
                <div>
                  <span style={{ fontSize: '1.2rem', color: '#6f42c1' }}>
                    {chartGroups.length}
                  </span>
                  <div style={{ fontSize: '0.9rem' }}>Charts</div>
                </div>
              </div>
            </div>
            <div style={{ fontSize: '0.85rem', color: '#e1e3e4ff', maxWidth: '300px' }}>
              Showing Solid Pod data only
            </div>
          </div>
        </div>

        {/* Render Pipeline Diagnostics */}
        <div
          style={{
            marginBottom: '1rem',
            padding: '0.6rem 0.8rem',
            backgroundColor: '#2f3133',
            border: '1px solid #444',
            borderRadius: '6px',
            fontSize: '0.85rem',
            color: '#d7d9dc',
          }}
        >
          {`Pipeline: allData dnp3=${allDataDnp3Count}, filtered dnp3=${filteredDnp3Count}, familyFiltered dnp3=${familyFilteredDnp3Count}, chartGroups=${chartGroups.length}, view=${groupingMethod}, dataType=${dataType}, family=${selectedFamily}`}
        </div>

        {/* Charts Section */}
        {chartGroups.length > 0 ? (
          <div style={{ marginBottom: '2rem' }}>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              marginBottom: '1rem',
              gap: '1rem',
              flexWrap: 'wrap'
            }}>
              <div>
                <h2 style={{ margin: 0 }}>
                  {groupingMethod === 'device' ? 'Device Charts' : 
                   groupingMethod === 'source' ? 'Data Source Charts' : 
                   'Combined Data View'}
                </h2>
                <div style={{ fontSize: '0.9rem', color: '#6c757d' }}>
                  Displaying {chartGroups.length} chart{chartGroups.length !== 1 ? 's' : ''}
                </div>
              </div>
              {/* DNP3 Family Filter */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
                <span style={{ fontSize: '0.9rem', fontWeight: 'bold' }}>DNP3 Families:</span>
                <button
                  onClick={() => {
                    userChoseAllRef.current = true;
                    setSelectedFamily('all');
                  }}
                  style={{
                    padding: '0.25rem 0.75rem',
                    borderRadius: '999px',
                    border: '1px solid #6c757d',
                    backgroundColor: selectedFamily === 'all' ? '#6c757d' : 'transparent',
                    color: selectedFamily === 'all' ? 'white' : '#6c757d',
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                  }}
                >
                  All
                </button>
                {dnp3Families.map((family) => (
                  <button
                    key={family}
                    onClick={() => {
                      userChoseAllRef.current = false;
                      setSelectedFamily(family);
                    }}
                    style={{
                      padding: '0.25rem 0.75rem',
                      borderRadius: '999px',
                      border: '1px solid #6f42c1',
                      backgroundColor: selectedFamily === family ? '#6f42c1' : 'transparent',
                      color: selectedFamily === family ? 'white' : '#6f42c1',
                      cursor: 'pointer',
                      fontSize: '0.8rem',
                    }}
                  >
                    {family}
                  </button>
                ))}
              </div>
            </div>
            
            <div style={{
              display: 'grid',
              gridTemplateColumns: compactView ? 'repeat(auto-fill, minmax(350px, 1fr))' : 'repeat(auto-fill, minmax(500px, 1fr))',
              gap: compactView ? '1rem' : '1.5rem'
            }}>
              {chartGroups.map((group) => (
                <DeviceChart
                  key={group}
                  title={group}
                  data={chartData[group]}
                  height={chartHeight}
                  showStats={showStats}
                  timeFormat={compactView ? 'short' : 'full'}
                  podName={primaryPod}
                  onDeviceToggle={addUpdate}
                  solidFetch={portalSession.fetch}
                />
              ))}
            </div>
          </div>
        ) : (
          <div style={{
            marginBottom: '2rem',
            padding: '3rem',
            backgroundColor: '#f8f9fa',
            borderRadius: '8px',
            border: '2px dashed #dee2e6',
            textAlign: 'center',
          }}>
            <h3 style={{ color: '#6c757d', marginBottom: '1rem' }}>
              No Data Available
            </h3>
            <p style={{ color: '#6c757d', marginBottom: '1rem' }}>
              {podNames.length === 0
                ? 'Select pods from the list or enter pod names, then verify utility access for each pod.'
                : accessiblePodNames.length === 0
                  ? 'Use Verify Access for each selected pod. Utility must have ACL/ACP read permissions on those pods.'
                  : 'Waiting for data from selected pods...'}
            </p>
            {podNames.length > 0 && (
              <button 
                onClick={fetchData}
                style={{
                  padding: '0.5rem 1.5rem',
                  backgroundColor: '#007bff',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '1rem'
                }}
              >
                Refresh Data
              </button>
            )}
          </div>
        )}

        {/* Data Table */}
        {filteredData.length > 0 && (
          <div style={{ marginBottom: '2rem' }}>
            <h2>Raw Data Table</h2>
            <DataTable data={filteredData} />
          </div>
        )}
        
        {/* Updates Log */}
        <div style={{ marginBottom: '2rem' }}>
          <UpdatesLog updates={updates} />
        </div>
        
        {/* Debug the parser */}
        {isAppUnlocked && accessiblePodNames.length > 0 && (
          <DebugReader
            podNames={accessiblePodNames}
            dataService={dataServiceRef.current}
            solidFetch={portalSession.fetch}
          />
        )}
      </div>
    </div>
  );
};

export default SolidPodReader;
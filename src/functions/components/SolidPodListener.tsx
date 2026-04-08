import React, { useState, useEffect, useRef } from 'react';
import { getDefaultSession, handleIncomingRedirect } from '@inrupt/solid-client-authn-browser';
import { overwriteFile, getFile } from '@inrupt/solid-client';
import { useNavigate } from 'react-router-dom';

const baseURI = import.meta.env.VITE_BASE_URI;

const SolidPodListener: React.FC = () => {
  const session = getDefaultSession();
  const navigate = useNavigate();
  const websocketRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [updates, setUpdates] = useState<string[]>([]);
  const [sliderValue, setSliderValue] = useState<number>(0);
  const [podName, setPodName] = useState<string>('');
  const [messageText, setMessageText] = useState<string>('');
  let curTime: number;

  const loginToSolid = async (): Promise<void> => {
    await session.login({
      oidcIssuer: baseURI,
      redirectUrl: window.location.href,
      clientName: 'ESP32 Listener',
    });
  };

  const logoutFromSolid = async (): Promise<void> => {
    // Close WebSocket connection
    if (websocketRef.current) {
      websocketRef.current.close();
      websocketRef.current = null;
    }
    
    // Logout from Solid
    await session.logout();
    
    // Reset state
    setIsConnected(false);
    setUpdates([]);
    setSliderValue(0);
    setPodName('');
    setMessageText('');
    
    // Add logout message to updates
    setUpdates(prev => [...prev, `[${new Date().toLocaleTimeString()}]: Logged out successfully`]);
  };

  const getWebsocketLink = async (resourceUrl: string) => {
    console.log(resourceUrl);
    return await session.fetch(`${baseURI}/.notifications/WebSocketChannel2023/`, {
      method: 'POST',
      headers: {
        "content-type": "application/ld+json"
      },
      body: JSON.stringify({
        "@context": ["https://www.w3.org/ns/solid/notification/v1"],
        type: "http://www.w3.org/ns/solid/notifications#WebSocketChannel2023",
        topic: resourceUrl
      })
    }).then((res) => res.json())
      .then((response) => response['receiveFrom']);
  };

  const getCurrentFileContent = async (): Promise<string> => {
    if (!podName) return '';
    
    try {
      const file = await getFile(
        `${baseURI}/${podName}/modbus`,
        { fetch: session.fetch }
      );
      
      if (file) {
        return await file.text();
      }
      return '';
    } catch (error) {
      console.error('Error reading file:', error);
      return '';
    }
  };

  // PROBLEM: overwriting Modbus file after potentiometers
  const sendMessage = async (): Promise<void> => {
    if (!podName) {
      setUpdates(prev => [...prev, `[${new Date().toLocaleTimeString()}]: Error: Please enter a pod name`]);
      return;
    }

    const prevTime = Date.now();
    const textValue = messageText || sliderValue.toString();
    const timestamp = new Date().toLocaleTimeString();
    
    try {
      // Get the current file content
      const currentContent = await getCurrentFileContent();
      
      // Append new messages including timestamp
      const newContent = currentContent 
        ? `${currentContent}\n[${timestamp}]: ${textValue}`
        : `[${timestamp}]: ${textValue}`;
      
      // Overwrites, also modbus instead of modbus commands
      await overwriteFile(
        `${baseURI}/${podName}/modbus`,
        new File([newContent], "modbus", { type: "text/plain" }),
        { fetch: session.fetch }
      );
      
      curTime = Date.now();
      setUpdates(prev => [...prev, `[${new Date(curTime).toLocaleTimeString()}]: Sent message: ${textValue}`]);
      setUpdates(prev => [...prev, `[${new Date(curTime).toLocaleTimeString()}]: Took ${curTime - prevTime} ms to send command`]);
      
      // Clear message text after sending (optional)
      setMessageText('');
      
    } catch (error) {
      setUpdates(prev => [...prev, `[${new Date().toLocaleTimeString()}]: Error sending message: ${error}`]);
    }
  };

  const clearModbusFile = async (): Promise<void> => {
    if (!podName) {
      setUpdates(prev => [...prev, `[${new Date().toLocaleTimeString()}]: Error: Please enter a pod name`]);
      return;
    }

    try {
      await overwriteFile(
        `${baseURI}/${podName}/modbus`,
        new File([""], "modbus", { type: "text/plain" }),
        { fetch: session.fetch }
      );
      
      setUpdates(prev => [...prev, `[${new Date().toLocaleTimeString()}]: Deleted modbus file content`]);
    } catch (error) {
      setUpdates(prev => [...prev, `[${new Date().toLocaleTimeString()}]: Error clearing file: ${error}`]);
    }
  };

  const goToReader = (): void => {
    navigate('/reader');
  };

  useEffect(() => {
    const handleSessionState = async () => {
      await handleIncomingRedirect({ restorePreviousSession: true });
      setIsConnected(session.info.isLoggedIn);
      setIsLoading(false);
      
      // Add login status message
      if (session.info.isLoggedIn) {
        setUpdates(prev => [...prev, `[${new Date().toLocaleTimeString()}]: Logged in as ${session.info.webId || 'user'}`]);
      }
    };

    handleSessionState();
  }, [session]);

  useEffect(() => {
    if (isConnected && podName && !websocketRef.current) {
      const subscribeToNotifications = async (resourceUrl: string) => {
        try {
          const websocketURL = await getWebsocketLink(resourceUrl);
          console.log(websocketURL);
          websocketRef.current = new WebSocket(websocketURL, ['solid-0.1']);

          websocketRef.current.addEventListener("open", () => {
            setUpdates(prev => [...prev, `[${new Date().toLocaleTimeString()}]: WebSocket connected`]);
          });

          websocketRef.current.addEventListener("message", async (message: any) => {
            console.log("Raw message data:", message.data);
            try {
              const modifiedMessage = JSON.parse(message.data);
              console.log("Parsed message:", modifiedMessage);

              const response = await session.fetch(modifiedMessage.object);
              const responseData = await response.text();

              console.log("Fetched data:\n", responseData);
              setUpdates(prev => [...prev, `[${new Date().toLocaleTimeString()}]: Received update: ${responseData}`]);
            } catch (error) {
              console.error("Failed to parse message data:", error);
              setUpdates(prev => [...prev, `[${new Date().toLocaleTimeString()}]: Error processing update`]);
            }
          });

          websocketRef.current.addEventListener("error", (error) => {
            console.error("WebSocket error:", error);
            setUpdates(prev => [...prev, `[${new Date().toLocaleTimeString()}]: WebSocket error occurred`]);
          });

          websocketRef.current.addEventListener("close", () => {
            setUpdates(prev => [...prev, `[${new Date().toLocaleTimeString()}]: WebSocket disconnected`]);
          });

        } catch (error) {
          console.error("Failed to establish WebSocket connection:", error);
          setUpdates(prev => [...prev, `[${new Date().toLocaleTimeString()}]: Failed to establish WebSocket connection`]);
        }
      };
      // Set up a WebSocket subscription to listen for real-time changes to the modbus data file in the Solid pod
      subscribeToNotifications(`${baseURI}/${podName}/modbus`);
    }

    return () => {
      if (websocketRef.current) {
        websocketRef.current.close();
        websocketRef.current = null;
      }
    };
  }, [isConnected, podName, session.fetch]);

  const clearUpdates = (): void => {
    setUpdates([]);
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Solid Pod Writer</h1>
        <button 
          onClick={goToReader}
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: '#4CAF50',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Go to Reader
        </button>
      </div>
      {isLoading ? (
        <h2>Loading...</h2>
      ) : (
        !isConnected ? (
          <div>
            <button onClick={loginToSolid}>Login to Solid</button>
          </div>
        ) : (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2>Listening for updates...</h2>
              <div>
                <button onClick={clearUpdates} style={{ marginRight: '0.5rem' }}>
                  Clear Updates
                </button>
                <button onClick={logoutFromSolid}>
                  Logout
                </button>
              </div>
            </div>
            
            {/* Pod Name Input */}
            <div style={{ marginBottom: '1rem' }}>
              <label>
                Pod Name: 
                <input
                  type="text"
                  value={podName}
                  onChange={(e) => setPodName(e.target.value)}
                  placeholder="e.g., PV_Power_Plant_1000 (your logged-in WebID must own this pod)"
                  style={{ 
                    marginLeft: '0.5rem', 
                    padding: '0.25rem',
                    color: 'black',
                    backgroundColor: 'white',
                    border: '1px solid #ccc'
                  }}
                />
              </label>
            </div>

            {/* Message Input and Slider */}
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ marginBottom: '0.5rem' }}>
                <label>
                  Message Text: 
                  <input
                    type="text"
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    placeholder="Enter a message to write to the Pod"
                    style={{ 
                      marginLeft: '0.5rem', 
                      padding: '0.25rem', 
                      width: '200px',
                      color: 'black',
                      backgroundColor: 'white',
                      border: '1px solid #ccc'
                    }}
                  />
                </label>
              </div>
              
              <div style={{ marginBottom: '0.5rem' }}>
                <label>
                  Or use the slider: <strong>{sliderValue}</strong>
                </label>
                <input
                  type="range"
                  min={0}
                  max={65535}
                  value={sliderValue}
                  step={1}
                  onChange={(e) => setSliderValue(Number(e.target.value))}
                  style={{ width: '100%' }}
                />
              </div>
              
              <div>
                <button onClick={sendMessage} style={{ marginRight: '0.5rem' }}>
                  Send Message
                </button>
                <button onClick={clearModbusFile} style={{ backgroundColor: '#ff4444', color: 'white' }}>
                  Clear the Pod
                </button>
              </div>
            </div>
            
            <div style={{ height: '0.75rem' }}>&nbsp;</div>
            <div>
              <h3>Updates</h3>
              <div style={{ 
                height: '300px', 
                overflowY: 'auto', 
                border: '1px solid #ccc', 
                padding: '0.5rem',
                backgroundColor: '#5d5959ff'
              }}>
                {updates.length === 0 ? (
                  <p style={{ color: '#c2c0c0ff', fontStyle: 'italic' }}>No updates yet...</p>
                ) : (
                  updates.map((update, index) => (
                    <p key={index} style={{ margin: '0.25rem 0' }}>{update}</p>
                  ))
                )}
              </div>
            </div>
          </div>
        )
      )}
    </div>
  );
};

export default SolidPodListener;
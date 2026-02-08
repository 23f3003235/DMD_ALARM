import React, { useState, useEffect, useRef, useCallback } from 'react';
import './App.css';

function App() {
  const [meterData, setMeterData] = useState(() => {
    const savedData = localStorage.getItem('energyMeterData');
    return savedData ? JSON.parse(savedData) : null;
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [alarms, setAlarms] = useState(() => {
    const savedAlarms = localStorage.getItem('energyMeterAlarms');
    return savedAlarms ? JSON.parse(savedAlarms) : [];
  });
  const [acknowledgedAlarms, setAcknowledgedAlarms] = useState(() => {
    const savedAck = localStorage.getItem('energyMeterAcknowledgedAlarms');
    return savedAck ? JSON.parse(savedAck) : [];
  });
  const [alarmSettings, setAlarmSettings] = useState(() => {
    const savedSettings = localStorage.getItem('energyMeterAlarmSettings');
    return savedSettings ? JSON.parse(savedSettings) : {
      highSetDemand: 500,
      lowSetDemand: 100,
      autoResetEnabled: true,
      voiceEnabled: true,
      autoRefreshInterval: 10,
      alarmRepeatInterval: 60
    };
  });
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [debugLog, setDebugLog] = useState([]);
  const [openPanels, setOpenPanels] = useState({
    settings: true,
    meterData: true,
    alarms: false,
    debug: false
  });
  const [forceStopActive, setForceStopActive] = useState(() => {
    const saved = localStorage.getItem('forceStopActive');
    return saved ? JSON.parse(saved) : false;
  });

  const alarmIntervalRef = useRef(null);
  const announcementIntervalRef = useRef(null);
  const speechSynthesisRef = useRef(null);
  const audioContextRef = useRef(null);
  const audioBeepRef = useRef(null);

  // Initialize audio for mobile/browser minimized
  const initAudio = () => {
    if (!audioContextRef.current && window.AudioContext) {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    
    // Preload beep sound
    if (!audioBeepRef.current) {
      audioBeepRef.current = new Audio();
      audioBeepRef.current.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA=='; // Simple beep
      audioBeepRef.current.preload = 'auto';
      audioBeepRef.current.volume = 0.7;
    }
  };

  // Play beep sound (works even when browser minimized)
  const playBeep = () => {
    if (!alarmSettings.voiceEnabled || forceStopActive) return;
    
    try {
      if (audioBeepRef.current) {
        audioBeepRef.current.currentTime = 0;
        audioBeepRef.current.play().catch(e => {
          console.log('Audio play failed, trying to resume context');
          if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
            audioContextRef.current.resume();
          }
        });
      }
    } catch (error) {
      addDebugLog(`Beep error: ${error.message}`);
    }
  };

  // Toggle panel
  const togglePanel = (panel) => {
    setOpenPanels(prev => ({
      ...prev,
      [panel]: !prev[panel]
    }));
  };

  // Debug logging
  const addDebugLog = useCallback((message) => {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = `[${timestamp}] ${message}`;
    setDebugLog(prev => [logEntry, ...prev.slice(0, 19)]);
    console.log(logEntry);
  }, []);

  // Save data to localStorage
  useEffect(() => {
    if (meterData) {
      localStorage.setItem('energyMeterData', JSON.stringify(meterData));
    }
  }, [meterData]);

  useEffect(() => {
    localStorage.setItem('energyMeterAlarms', JSON.stringify(alarms));
    addDebugLog(`Alarms updated: ${alarms.length} total, ${alarms.filter(a => a.active).length} active`);
  }, [alarms, addDebugLog]);

  useEffect(() => {
    localStorage.setItem('energyMeterAcknowledgedAlarms', JSON.stringify(acknowledgedAlarms));
  }, [acknowledgedAlarms]);

  useEffect(() => {
    localStorage.setItem('energyMeterAlarmSettings', JSON.stringify(alarmSettings));
  }, [alarmSettings]);

  useEffect(() => {
    localStorage.setItem('forceStopActive', JSON.stringify(forceStopActive));
  }, [forceStopActive]);

  // Initialize speech synthesis
  const initSpeechSynthesis = () => {
    if ('speechSynthesis' in window) {
      speechSynthesisRef.current = window.speechSynthesis;
      return true;
    }
    return false;
  };

  // Speak announcement
  const speakAnnouncement = useCallback((message) => {
    if (!alarmSettings.voiceEnabled || forceStopActive) {
      addDebugLog('Voice announcements disabled or force stop active - not speaking');
      return;
    }

    if (!speechSynthesisRef.current) {
      if (!initSpeechSynthesis()) return;
    }

    // Play beep first (works even when minimized)
    playBeep();

    // Cancel any ongoing speech
    speechSynthesisRef.current.cancel();
    setIsSpeaking(true);
    addDebugLog(`Speaking: ${message.substring(0, 50)}...`);

    const utterance = new SpeechSynthesisUtterance(message);
    
    utterance.onend = () => {
      setIsSpeaking(false);
      addDebugLog('Speech ended');
    };

    utterance.onerror = (error) => {
      setIsSpeaking(false);
      addDebugLog(`Speech error: ${error}`);
    };

    speechSynthesisRef.current.speak(utterance);
  }, [alarmSettings.voiceEnabled, forceStopActive, addDebugLog]);

  // Check for alarms
  const checkAlarms = useCallback((data) => {
    if (forceStopActive) {
      addDebugLog('Force stop active - skipping alarm check');
      return;
    }

    const currentLoad = parseFloat(data.kVA.value);
    const meterName = data.meter_name;
    const timestamp = new Date().toLocaleString();
    
    const newAlarms = [];

    // Check high demand
    if (currentLoad > alarmSettings.highSetDemand) {
      const highAlarm = {
        id: `high-${Date.now()}-${Math.random()}`,
        type: 'HIGH_DEMAND',
        message: `High demand reached! ${meterName} is at ${currentLoad} kVA`,
        meterName,
        value: currentLoad,
        unit: 'kVA',
        limit: alarmSettings.highSetDemand,
        timestamp,
        acknowledged: false,
        active: true
      };
      newAlarms.push(highAlarm);
      addDebugLog(`HIGH alarm triggered: ${currentLoad} > ${alarmSettings.highSetDemand}`);
    }

    // Check low demand
    if (currentLoad < alarmSettings.lowSetDemand) {
      const lowAlarm = {
        id: `low-${Date.now()}-${Math.random()}`,
        type: 'LOW_DEMAND',
        message: `Low demand alert! ${meterName} is at ${currentLoad} kVA`,
        meterName,
        value: currentLoad,
        unit: 'kVA',
        limit: alarmSettings.lowSetDemand,
        timestamp,
        acknowledged: false,
        active: true
      };
      newAlarms.push(lowAlarm);
      addDebugLog(`LOW alarm triggered: ${currentLoad} < ${alarmSettings.lowSetDemand}`);
    }

    // Add new alarms to state
    if (newAlarms.length > 0) {
      setAlarms(prev => [...prev, ...newAlarms]);
      
      // Speak announcement for each new alarm
      newAlarms.forEach(alarm => {
        speakAnnouncement(alarm.message);
      });
    }

    // Auto-reset alarms if enabled
    if (alarmSettings.autoResetEnabled) {
      setAlarms(prev => prev.map(alarm => {
        if (alarm.type === 'HIGH_DEMAND' && currentLoad <= alarm.limit && alarm.active) {
          addDebugLog(`Auto-reset HIGH alarm: ${currentLoad} <= ${alarm.limit}`);
          return { ...alarm, active: false };
        }
        if (alarm.type === 'LOW_DEMAND' && currentLoad >= alarm.limit && alarm.active) {
          addDebugLog(`Auto-reset LOW alarm: ${currentLoad} >= ${alarm.limit}`);
          return { ...alarm, active: false };
        }
        return alarm;
      }));
    }
  }, [alarmSettings, speakAnnouncement, addDebugLog, forceStopActive]);

  // Acknowledge alarm
  const acknowledgeAlarm = useCallback((alarmId) => {
    addDebugLog(`Acknowledging alarm: ${alarmId}`);
    
    setAlarms(prev => prev.map(alarm => 
      alarm.id === alarmId ? { ...alarm, acknowledged: true } : alarm
    ));
    
    setAcknowledgedAlarms(prev => {
      if (!prev.includes(alarmId)) {
        return [...prev, alarmId];
      }
      return prev;
    });
    
    // Stop speaking immediately
    if (speechSynthesisRef.current) {
      speechSynthesisRef.current.cancel();
      setIsSpeaking(false);
    }
    
    // Force check and clear the announcement interval
    const updatedAlarms = alarms.map(alarm => 
      alarm.id === alarmId ? { ...alarm, acknowledged: true } : alarm
    );
    
    const activeUnacknowledged = updatedAlarms.filter(
      alarm => alarm.active && !alarm.acknowledged
    );
    
    if (activeUnacknowledged.length === 0 && announcementIntervalRef.current) {
      addDebugLog('No active unacknowledged alarms, clearing interval');
      clearInterval(announcementIntervalRef.current);
      announcementIntervalRef.current = null;
    }
  }, [alarms, addDebugLog]);

  // Manual reset alarm
  const manualResetAlarm = (alarmId) => {
    addDebugLog(`Manually resetting alarm: ${alarmId}`);
    setAlarms(prev => prev.map(alarm => 
      alarm.id === alarmId ? { ...alarm, active: false, acknowledged: true } : alarm
    ));
  };

  // Reset all alarms
  const resetAllAlarms = () => {
    addDebugLog('Resetting all alarms');
    setAlarms([]);
    setAcknowledgedAlarms([]);
    if (speechSynthesisRef.current) {
      speechSynthesisRef.current.cancel();
      setIsSpeaking(false);
    }
    if (announcementIntervalRef.current) {
      clearInterval(announcementIntervalRef.current);
      announcementIntervalRef.current = null;
    }
  };

  // FORCE STOP ALL - Enhanced
  const forceStopAnnouncements = () => {
    addDebugLog('⚡ FORCE STOP: Stopping all announcements and acknowledging all alarms');
    setForceStopActive(true);
    
    // 1. Stop all speech immediately
    if (speechSynthesisRef.current) {
      speechSynthesisRef.current.cancel();
      setIsSpeaking(false);
    }
    
    // 2. Clear the announcement interval
    if (announcementIntervalRef.current) {
      clearInterval(announcementIntervalRef.current);
      announcementIntervalRef.current = null;
      addDebugLog('Announcement interval cleared');
    }
    
    // 3. Acknowledge ALL active alarms (not just current ones)
    setAlarms(prev => prev.map(alarm => 
      alarm.active ? { ...alarm, acknowledged: true } : alarm
    ));
    
    // 4. Also add to acknowledged list to prevent immediate recurrence
    const activeAlarmIds = alarms
      .filter(alarm => alarm.active)
      .map(alarm => alarm.id);
    
    setAcknowledgedAlarms(prev => {
      const newAcknowledged = [...prev];
      activeAlarmIds.forEach(id => {
        if (!newAcknowledged.includes(id)) {
          newAcknowledged.push(id);
        }
      });
      return newAcknowledged;
    });
    
    addDebugLog('✅ FORCE STOP ACTIVE: All alarms silenced until reset');
  };

  // RESET FORCE STOP - New function
  const resetForceStop = () => {
    addDebugLog('🔄 RESET FORCE STOP: Re-enabling alarm system');
    setForceStopActive(false);
    
    // Clear acknowledged alarms list to allow new alarms
    setAcknowledgedAlarms([]);
    
    // Reset all alarm acknowledged status to false
    setAlarms(prev => prev.map(alarm => ({
      ...alarm,
      acknowledged: false
    })));
    
    // Force an immediate data fetch to check current conditions
    fetchMeterData();
    
    addDebugLog('✅ Alarm system re-enabled and ready');
  };

  // Announcement interval management
  useEffect(() => {
    if (forceStopActive) {
      addDebugLog('Force stop active - not starting announcement interval');
      return;
    }

    // Clear any existing interval first
    if (announcementIntervalRef.current) {
      clearInterval(announcementIntervalRef.current);
      announcementIntervalRef.current = null;
    }
    
    const activeUnacknowledgedAlarms = alarms.filter(
      alarm => alarm.active && !alarm.acknowledged
    );

    addDebugLog(`Active unacknowledged alarms: ${activeUnacknowledgedAlarms.length}`);

    if (activeUnacknowledgedAlarms.length > 0 && alarmSettings.voiceEnabled) {
      addDebugLog(`Starting announcement interval (${alarmSettings.alarmRepeatInterval}s)`);
      
      // Create NEW interval
      announcementIntervalRef.current = setInterval(() => {
        addDebugLog('Interval: Announcing alarms');
        activeUnacknowledgedAlarms.forEach(alarm => {
          speakAnnouncement(alarm.message);
        });
      }, alarmSettings.alarmRepeatInterval * 1000);
    } else {
      addDebugLog('No active unacknowledged alarms, interval not started');
    }

    return () => {
      // Cleanup on component unmount or when dependencies change
      if (announcementIntervalRef.current) {
        clearInterval(announcementIntervalRef.current);
        announcementIntervalRef.current = null;
      }
    };
  }, [alarms, alarmSettings.voiceEnabled, alarmSettings.alarmRepeatInterval, speakAnnouncement, addDebugLog, forceStopActive]);

  // Fetch meter data
  const fetchMeterData = async () => {
    setLoading(true);
    setError(null);
    addDebugLog('Starting data fetch');
    
    try {
      const response = await fetch("https://alensoft.net:8764/get_realtime_data", {
        method: "POST",
        headers: {
          "accept": "application/json, text/plain, */*",
          "accept-language": "en-GB,en-US;q=0.9,en;q=0.8",
          "content-type": "application/json",
        },
        body: JSON.stringify([{
          "meter": 65010600,
          "paraMeters": [7]
        }])
      });

      addDebugLog(`Response status: ${response.status}`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      addDebugLog(`Data received`);
      
      const meterData = data[0];
      setMeterData(meterData);
      
      checkAlarms(meterData);
      
    } catch (err) {
      const errorMsg = `Fetch error: ${err.message}`;
      addDebugLog(errorMsg);
      setError(errorMsg);
    } finally {
      setLoading(false);
      addDebugLog('Data fetch completed');
    }
  };

  // Initial setup
  useEffect(() => {
    addDebugLog('App initialized');
    initSpeechSynthesis();
    initAudio();
    fetchMeterData();
    
    alarmIntervalRef.current = setInterval(fetchMeterData, alarmSettings.autoRefreshInterval * 1000);
    
    // Setup visibility change handler for mobile/browser minimized
    const handleVisibilityChange = () => {
      if (document.hidden) {
        addDebugLog('Browser minimized/tab hidden');
        // Ensure audio context is ready when tab becomes active again
        if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
          audioContextRef.current.resume().then(() => {
            addDebugLog('Audio context resumed');
          });
        }
      } else {
        addDebugLog('Browser/tab now visible');
        // Resume audio context if needed
        if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
          audioContextRef.current.resume();
        }
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      addDebugLog('App cleanup');
      if (alarmIntervalRef.current) clearInterval(alarmIntervalRef.current);
      if (announcementIntervalRef.current) clearInterval(announcementIntervalRef.current);
      if (speechSynthesisRef.current) speechSynthesisRef.current.cancel();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Update alarm settings
  const updateAlarmSettings = (newSettings) => {
    setAlarmSettings(prev => ({ ...prev, ...newSettings }));
  };

  // Get alarm counts
  const activeAlarmsCount = alarms.filter(alarm => alarm.active).length;
  const unacknowledgedAlarmsCount = alarms.filter(alarm => alarm.active && !alarm.acknowledged).length;

  // Active alarms popup
  const activeUnacknowledgedAlarms = alarms.filter(alarm => alarm.active && !alarm.acknowledged);

  return (
    <div className="App">
      <header className="App-header">
        <div className="header-left">
          <h1>Energy Meter Dashboard</h1>
          <div className="alarm-indicator">
            {forceStopActive && (
              <div className="force-stop-indicator">
                🔇 FORCE STOP ACTIVE
              </div>
            )}
            {activeAlarmsCount > 0 && !forceStopActive && (
              <div className={`alarm-badge ${unacknowledgedAlarmsCount > 0 ? 'urgent' : 'acknowledged'}`}>
                ⚠️ {activeAlarmsCount} Active Alarm{activeAlarmsCount !== 1 ? 's' : ''}
                {unacknowledgedAlarmsCount > 0 && ` (${unacknowledgedAlarmsCount} unacknowledged)`}
              </div>
            )}
            {isSpeaking && !forceStopActive && <div className="speaking-indicator">🔊 Speaking...</div>}
            {!alarmSettings.voiceEnabled && <div className="muted-indicator">🔇 Voice Muted</div>}
          </div>
        </div>
        
        <div className="header-controls">
          <button 
            onClick={fetchMeterData} 
            disabled={loading}
            className="refresh-btn"
          >
            {loading ? 'Refreshing...' : 'Refresh Data'}
          </button>
          {forceStopActive ? (
            <button 
              onClick={resetForceStop}
              className="reset-force-stop-btn"
              title="Reset force stop and re-enable alarm system"
            >
              🔄 RESET ALARMS
            </button>
          ) : (
            <button 
              onClick={forceStopAnnouncements}
              className="force-stop-btn"
              title="Force stop all announcements and acknowledge all active alarms"
            >
              ⚡ FORCE STOP
            </button>
          )}
        </div>
      </header>

      {/* Active Alarms Popup */}
      {activeUnacknowledgedAlarms.length > 0 && !forceStopActive && (
        <div className="alarm-popup">
          <div className="alarm-popup-header">
            <span className="alarm-icon">🚨</span>
            <h3>ACTIVE ALARMS - ATTENTION REQUIRED</h3>
            <span className="alarm-icon">🚨</span>
          </div>
          <div className="alarm-popup-content">
            {activeUnacknowledgedAlarms.map(alarm => (
              <div key={alarm.id} className={`alarm-message ${alarm.type === 'HIGH_DEMAND' ? 'high-alarm' : 'low-alarm'}`}>
                <div className="alarm-details">
                  <strong>{alarm.type === 'HIGH_DEMAND' ? '⚠️ HIGH DEMAND' : '⚠️ LOW DEMAND'}</strong>
                  <p>{alarm.message}</p>
                  <div className="alarm-meta">
                    <span>Limit: {alarm.limit} {alarm.unit}</span>
                    <span>Current: {alarm.value} {alarm.unit}</span>
                    <span>Time: {alarm.timestamp}</span>
                  </div>
                </div>
                <button 
                  onClick={() => acknowledgeAlarm(alarm.id)}
                  className="acknowledge-btn"
                >
                  Acknowledge
                </button>
              </div>
            ))}
            <div className="alarm-popup-footer">
              <button 
                onClick={forceStopAnnouncements}
                className="force-stop-popup-btn"
                title="Stop all announcements and acknowledge all alarms"
              >
                ⚡ FORCE STOP ALL ALARMS
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Collapsible Panels Container */}
      <div className="panels-container">
        
        {/* Settings Panel */}
        <div className={`panel ${openPanels.settings ? 'open' : 'closed'}`}>
          <div className="panel-header" onClick={() => togglePanel('settings')}>
            <h3>⚙️ Alarm & System Settings</h3>
            <span className="panel-toggle">{openPanels.settings ? '−' : '+'}</span>
          </div>
          {openPanels.settings && (
            <div className="panel-content">
              <div className="settings-grid">
                <div className="setting-item">
                  <label htmlFor="highSet">High Set Demand (kVA):</label>
                  <input
                    id="highSet"
                    type="number"
                    value={alarmSettings.highSetDemand}
                    onChange={(e) => updateAlarmSettings({ highSetDemand: parseFloat(e.target.value) || 0 })}
                    min="0"
                    step="10"
                  />
                </div>
                <div className="setting-item">
                  <label htmlFor="lowSet">Low Set Demand (kVA):</label>
                  <input
                    id="lowSet"
                    type="number"
                    value={alarmSettings.lowSetDemand}
                    onChange={(e) => updateAlarmSettings({ lowSetDemand: parseFloat(e.target.value) || 0 })}
                    min="0"
                    step="10"
                  />
                </div>
                <div className="setting-item">
                  <label htmlFor="refreshInterval">Auto Refresh (seconds):</label>
                  <input
                    id="refreshInterval"
                    type="number"
                    value={alarmSettings.autoRefreshInterval}
                    onChange={(e) => updateAlarmSettings({ autoRefreshInterval: parseInt(e.target.value) || 10 })}
                    min="5"
                    max="300"
                    step="5"
                  />
                </div>
                <div className="setting-item">
                  <label htmlFor="alarmRepeat">Alarm Repeat (seconds):</label>
                  <input
                    id="alarmRepeat"
                    type="number"
                    value={alarmSettings.alarmRepeatInterval}
                    onChange={(e) => updateAlarmSettings({ alarmRepeatInterval: parseInt(e.target.value) || 60 })}
                    min="10"
                    max="600"
                    step="10"
                  />
                </div>
                <div className="setting-item checkbox-group">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={alarmSettings.autoResetEnabled}
                      onChange={(e) => updateAlarmSettings({ autoResetEnabled: e.target.checked })}
                    />
                    Auto Reset on Normal
                  </label>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={alarmSettings.voiceEnabled}
                      onChange={(e) => updateAlarmSettings({ voiceEnabled: e.target.checked })}
                    />
                    Voice Announcements
                  </label>
                </div>
              </div>
              <div className="settings-summary">
                <small>
                  Current settings: High = {alarmSettings.highSetDemand}kVA, 
                  Low = {alarmSettings.lowSetDemand}kVA, 
                  Refresh every {alarmSettings.autoRefreshInterval}s
                  {forceStopActive && ' | ⚠️ FORCE STOP ACTIVE'}
                </small>
              </div>
            </div>
          )}
        </div>

        {/* Meter Data Panel */}
        <div className={`panel ${openPanels.meterData ? 'open' : 'closed'}`}>
          <div className="panel-header" onClick={() => togglePanel('meterData')}>
            <h3>📊 Meter Data</h3>
            <span className="panel-toggle">{openPanels.meterData ? '−' : '+'}</span>
          </div>
          {openPanels.meterData && (
            <div className="panel-content">
              {error && (
                <div className="error-message">
                  <p>Error: {error}</p>
                  <button onClick={fetchMeterData}>Retry</button>
                </div>
              )}

              {loading && !meterData && (
                <div className="loading">Loading meter data...</div>
              )}

              {meterData && (
                <div className="meter-card">
                  <div className="meter-header">
                    <h2>{meterData.meter_name}</h2>
                    <div className="meter-status">
                      <span className={`status-badge ${meterData.status?.toLowerCase()}`}>
                        {meterData.status}
                      </span>
                      {activeAlarmsCount > 0 && !forceStopActive && (
                        <span className="active-alarm-indicator">⚠️ Alarm Active</span>
                      )}
                      {forceStopActive && (
                        <span className="force-stop-active-indicator">🔇 Alarms Silenced</span>
                      )}
                    </div>
                  </div>
                  
                  <div className="meter-details">
                    <div className="detail-row">
                      <span className="label">Date & Time:</span>
                      <span className="value">{meterData.date_time}</span>
                    </div>
                    
                    <div className="detail-row">
                      <span className="label">Location:</span>
                      <span className="value">{meterData.location}</span>
                    </div>
                    
                    <div className="detail-row">
                      <span className="label">Hierarchy:</span>
                      <span className="value">{meterData.hierachy}</span>
                    </div>
                  </div>

                  <div className="metrics-grid">
                    <div className={`metric-card ${parseFloat(meterData.kVA.value) > alarmSettings.highSetDemand ? 'exceeded-high' : 
                                      parseFloat(meterData.kVA.value) < alarmSettings.lowSetDemand ? 'exceeded-low' : ''}`}>
                      <div className="metric-label">kVA Load</div>
                      <div className="metric-value">
                        {meterData.kVA.value} <span className="metric-unit">{meterData.kVA.unit}</span>
                      </div>
                      <div className="limit-indicator">
                        High: {alarmSettings.highSetDemand}kVA | Low: {alarmSettings.lowSetDemand}kVA
                      </div>
                    </div>
                  </div>

                  <div className="last-updated">
                    Last updated: {new Date().toLocaleTimeString()}
                    {forceStopActive && <span style={{color: '#dc3545', fontWeight: 'bold', marginLeft: '10px'}}> | 🔇 ALARMS SILENCED</span>}
                  </div>
                </div>
              )}

              {!meterData && !loading && !error && (
                <div className="no-data">
                  <p>No meter data available. Click "Refresh Data" to fetch.</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Alarm Log Panel */}
        <div className={`panel ${openPanels.alarms ? 'open' : 'closed'}`}>
          <div className="panel-header" onClick={() => togglePanel('alarms')}>
            <h3>📋 Alarm Log ({alarms.length})</h3>
            <span className="panel-toggle">{openPanels.alarms ? '−' : '+'}</span>
          </div>
          {openPanels.alarms && (
            <div className="panel-content">
              <div className="log-header">
                <div className="log-stats">
                  Active: {activeAlarmsCount} | Total: {alarms.length}
                  {forceStopActive && ' | 🔇 FORCE STOP ACTIVE'}
                </div>
                <div className="log-actions">
                  {forceStopActive ? (
                    <button 
                      onClick={resetForceStop}
                      className="reset-force-stop-log-btn"
                      title="Reset force stop and re-enable alarm system"
                    >
                      🔄 Reset Force Stop
                    </button>
                  ) : (
                    <button 
                      onClick={forceStopAnnouncements}
                      className="force-stop-log-btn"
                      title="Stop all announcements and acknowledge all alarms"
                    >
                      ⚡ Force Stop
                    </button>
                  )}
                  <button 
                    onClick={resetAllAlarms}
                    disabled={alarms.length === 0}
                    className="clear-log-btn"
                  >
                    Clear All Alarms
                  </button>
                </div>
              </div>
              
              {alarms.length === 0 ? (
                <div className="no-alarms">No alarms recorded</div>
              ) : (
                <div className="log-table">
                  <div className="log-header-row">
                    <div className="log-cell">Time</div>
                    <div className="log-cell">Type</div>
                    <div className="log-cell">Value</div>
                    <div className="log-cell">Status</div>
                    <div className="log-cell">Actions</div>
                  </div>
                  
                  {[...alarms].reverse().map(alarm => (
                    <div key={alarm.id} className={`log-row ${alarm.active ? 'active-alarm' : 'inactive-alarm'}`}>
                      <div className="log-cell">{alarm.timestamp}</div>
                      <div className="log-cell">
                        <span className={`alarm-type ${alarm.type === 'HIGH_DEMAND' ? 'high-type' : 'low-type'}`}>
                          {alarm.type === 'HIGH_DEMAND' ? 'HIGH' : 'LOW'}
                        </span>
                      </div>
                      <div className="log-cell">{alarm.value} {alarm.unit}</div>
                      <div className="log-cell">
                        <span className={`status-indicator ${alarm.active ? 'active' : 'inactive'} ${alarm.acknowledged ? 'acknowledged' : ''}`}>
                          {alarm.active ? 
                            (alarm.acknowledged ? 'Active (Ack)' : 'Active ⚠️') : 
                            'Cleared'}
                        </span>
                      </div>
                      <div className="log-cell actions">
                        {alarm.active && !alarm.acknowledged && (
                          <button 
                            onClick={() => acknowledgeAlarm(alarm.id)}
                            className="small-btn ack-btn"
                          >
                            Ack
                          </button>
                        )}
                        {alarm.active && (
                          <button 
                            onClick={() => manualResetAlarm(alarm.id)}
                            className="small-btn reset-btn"
                          >
                            Reset
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Debug Panel */}
        <div className={`panel ${openPanels.debug ? 'open' : 'closed'}`}>
          <div className="panel-header" onClick={() => togglePanel('debug')}>
            <h3>🐛 Debug Logs</h3>
            <span className="panel-toggle">{openPanels.debug ? '−' : '+'}</span>
          </div>
          {openPanels.debug && (
            <div className="panel-content">
              <div className="debug-logs">
                {debugLog.map((log, index) => (
                  <div key={index} className="debug-log">{log}</div>
                ))}
              </div>
              <div className="debug-actions">
                <button onClick={() => setDebugLog([])}>Clear Logs</button>
                <button onClick={() => console.log('Alarms:', alarms)}>Log Alarms</button>
                <button onClick={() => console.log('Meter Data:', meterData)}>Log Meter Data</button>
              </div>
            </div>
          )}
        </div>

      </div>

      {/* Quick Actions Footer */}
      <div className="quick-actions">
        <button onClick={() => setOpenPanels({settings: true, meterData: true, alarms: true, debug: true})}>
          Expand All
        </button>
        <button onClick={() => setOpenPanels({settings: false, meterData: false, alarms: false, debug: false})}>
          Collapse All
        </button>
      </div>
    </div>
  );
}

export default App;
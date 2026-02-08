// SettingsManager.js
import React from 'react';

function SettingsManager({ alarmSettings, updateAlarmSettings, onExport, onImport }) {
  const handleExport = () => {
    const dataStr = JSON.stringify(alarmSettings, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    
    const exportFileDefaultName = `meter-alarm-settings-${new Date().toISOString().split('T')[0]}.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  };

  const handleImport = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const importedSettings = JSON.parse(e.target.result);
        if (window.confirm('Import these settings? This will replace current settings.')) {
          updateAlarmSettings(importedSettings);
        }
      } catch (error) {
        alert('Error importing settings: Invalid JSON file');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="settings-manager">
      <h4>Settings Management</h4>
      <div className="settings-actions">
        <button onClick={handleExport} className="export-btn">
          Export Settings
        </button>
        <label className="import-btn">
          Import Settings
          <input
            type="file"
            accept=".json"
            onChange={handleImport}
            style={{ display: 'none' }}
          />
        </label>
        <button 
          onClick={() => {
            if (window.confirm('Reset to default settings?')) {
              updateAlarmSettings({
                highSetDemand: 850,
                lowSetDemand: 100,
                autoResetEnabled: true,
                voiceEnabled: true,
                autoRefreshInterval: 10,
                alarmRepeatInterval: 60
              });
            }
          }}
          className="reset-default-btn"
        >
          Reset to Defaults
        </button>
      </div>
    </div>
  );
}

export default SettingsManager;
// VoiceControl.js
import React from 'react';

function VoiceControl({ isSpeaking, onToggleVoice }) {
  return (
    <div className="voice-control">
      <button 
        onClick={onToggleVoice}
        className={`voice-btn ${isSpeaking ? 'speaking' : ''}`}
      >
        {isSpeaking ? '🔊 Stop Announcement' : '🔈 Voice Alerts Enabled'}
      </button>
      <div className="voice-info">
        <small>Voice announcements will play for unacknowledged alarms every minute</small>
      </div>
    </div>
  );
}

export default VoiceControl;
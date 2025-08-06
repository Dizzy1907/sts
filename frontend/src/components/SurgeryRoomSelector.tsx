import React from 'react';

interface SurgeryRoomSelectorProps {
  onSelect?: (room: string) => void;
  selectedRoom?: string;
  onRoomSelect?: (room: string) => void; // For modal mode
  showAsModal?: boolean;
}

const SURGERY_ROOMS = [
  'Surgery Room 1',
  'Surgery Room 2', 
  'Surgery Room 3',
  'Surgery Room 4',
  'Surgery Room 5'
];

const SurgeryRoomSelector: React.FC<SurgeryRoomSelectorProps> = ({ 
  onSelect, 
  selectedRoom, 
  onRoomSelect,
  showAsModal = false 
}) => {
  const handleRoomSelection = (room: string) => {
    if (onRoomSelect) {
      onRoomSelect(room);
    } else if (onSelect) {
      onSelect(room);
    }
  };

  if (showAsModal || onRoomSelect) {
    return (
      <div className="modal-overlay">
        <div className="modal-content">
          <div className="modal-header">
            <h2>Select <span className="highlight">Surgery Room</span></h2>
          </div>
          
          <p style={{color: 'var(--text-muted)', marginBottom: '1.5rem', textAlign: 'center'}}>
            Please select which surgery room you are working in
          </p>
          
          <div className="room-selection">
            {SURGERY_ROOMS.map((room) => (
              <button
                key={room}
                onClick={() => handleRoomSelection(room)}
                className="room-btn"
              >
                {room}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="surgery-room-selector">
      <div className="form-group">
        <label>Select Surgery Room</label>
        <select
          value={selectedRoom || ''}
          onChange={(e) => onSelect?.(e.target.value)}
        >
          <option value="">Choose a room...</option>
          {SURGERY_ROOMS.map((room) => (
            <option key={room} value={room}>
              {room}
            </option>
          ))}
        </select>
      </div>
      
      {selectedRoom && (
        <div className="selected-room">
          <p>Selected: <strong>{selectedRoom}</strong></p>
        </div>
      )}
    </div>
  );
};

export default SurgeryRoomSelector;
import React, { useState } from 'react';

interface RfidEmulatorProps {
  onScanSuccess: (data: string) => void;
  onClose: () => void;
}

const RfidEmulator: React.FC<RfidEmulatorProps> = ({ onScanSuccess, onClose }) => {
  const [rfidInput, setRfidInput] = useState('');
  const [isScanning, setIsScanning] = useState(false);

  const handleScan = () => {
    if (!rfidInput.trim()) {
      alert('Please enter RFID data');
      return;
    }
    
    setIsScanning(true);
    // Simulate RFID scan delay
    setTimeout(() => {
      onScanSuccess(rfidInput.trim());
      setIsScanning(false);
      setRfidInput('');
    }, 500);
  };

  const simulateItemScan = (itemId: string) => {
    setRfidInput(itemId);
    setTimeout(() => handleScan(), 100);
  };

  return (
    <div className="rfid-emulator-overlay">
      <div className="rfid-emulator-modal">
        <div className="rfid-header">
          <h3>RFID Emulator</h3>
          <button onClick={onClose} className="close-btn">×</button>
        </div>
        
        <div className="rfid-content">
          <div className="rfid-input-section">
            <label>Enter RFID Data:</label>
            <input
              type="text"
              value={rfidInput}
              onChange={(e) => setRfidInput(e.target.value)}
              placeholder="Enter item ID or group ID"
              disabled={isScanning}
            />
            <button 
              onClick={handleScan} 
              disabled={isScanning || !rfidInput.trim()}
              className="btn-green"
            >
              {isScanning ? 'Scanning...' : 'Simulate RFID Scan'}
            </button>
          </div>

          <div className="rfid-presets">
            <h4>Quick Scan Presets:</h4>
            <div className="preset-buttons">
              <button 
                onClick={() => simulateItemScan('1234560001000001')}
                className="btn-blue"
                disabled={isScanning}
              >
                Sample Item 1
              </button>
              <button 
                onClick={() => simulateItemScan('2345670002000001')}
                className="btn-blue"
                disabled={isScanning}
              >
                Sample Item 2
              </button>
              <button 
                onClick={() => simulateItemScan('3456780003000001')}
                className="btn-blue"
                disabled={isScanning}
              >
                Sample Item 3
              </button>
            </div>
          </div>

          <div className="rfid-status">
            {isScanning && (
              <div className="scanning-indicator">
                <div className="rfid-wave"></div>
                <p>Scanning RFID tag...</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default RfidEmulator;
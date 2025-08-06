import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

interface QrCodeScannerProps {
  onScanSuccess: (decodedText: string) => void;
  onScanError?: (error: string) => void;
  onClose?: () => void;
}

const QrCodeScanner: React.FC<QrCodeScannerProps> = ({ onScanSuccess, onScanError, onClose }) => {
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [scannerInitialized, setScannerInitialized] = useState<boolean>(false);
  const [availableCameras, setAvailableCameras] = useState<Array<{ id: string; label: string }>>([]);
  const [selectedCamera, setSelectedCamera] = useState<string>('');
  const [scannerMessage, setScannerMessage] = useState<string>('');
  const [scanningMethod, setScanningMethod] = useState<'camera' | 'file'>('camera');
  
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scannerRef.current = new Html5Qrcode('qr-reader');
    setScannerInitialized(true);

    Html5Qrcode.getCameras()
      .then(devices => {
        if (devices && devices.length) {
          setAvailableCameras(devices);
          setSelectedCamera(devices[0].id);
        } else {
          setScannerMessage('No cameras found');
        }
      })
      .catch(err => {
        setScannerMessage('Error getting cameras: ' + err);
      });

    return () => {
      if (scannerRef.current && scannerRef.current.isScanning) {
        scannerRef.current.stop()
          .catch(err => console.error('Error stopping scanner:', err));
      }
    };
  }, []);

  const startScanning = () => {
    if (!scannerRef.current || !selectedCamera) return;

    setIsScanning(true);
    setScannerMessage('Starting camera...');

    const config = { fps: 10, qrbox: { width: 250, height: 250 } };
    
    scannerRef.current.start(
      selectedCamera,
      config,
      (decodedText) => {
        onScanSuccess(decodedText);
        stopScanning();
      },
      (errorMessage) => {
        if (onScanError) {
          onScanError(errorMessage);
        }
      }
    )
    .catch((err) => {
      setScannerMessage('Error starting scanner: ' + err);
      setIsScanning(false);
    });
  };

  const stopScanning = () => {
    if (scannerRef.current && scannerRef.current.isScanning) {
      scannerRef.current.stop()
        .then(() => {
          setIsScanning(false);
          setScannerMessage('');
        })
        .catch(err => {
          setScannerMessage('Error stopping scanner: ' + err);
        });
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!scannerRef.current || !event.target.files || event.target.files.length === 0) return;

    const file = event.target.files[0];
    setScannerMessage('Scanning image...');

    scannerRef.current.scanFile(file, true)
      .then(decodedText => {
        onScanSuccess(decodedText);
        setScannerMessage('QR code detected!');
      })
      .catch(err => {
        setScannerMessage('Error scanning file: ' + err);
        if (onScanError) {
          onScanError(err);
        }
      });
      
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <h2>Scan QR Code</h2>
          {onClose && (
            <button onClick={onClose} className="btn-gray">
              ✕
            </button>
          )}
        </div>
        
        <div className="scanning-methods">
          <button
            onClick={() => setScanningMethod('camera')}
            className={`btn ${scanningMethod === 'camera' ? 'btn-blue' : 'btn-gray'}`}
          >
            Use Camera
          </button>
          <button
            onClick={() => setScanningMethod('file')}
            className={`btn ${scanningMethod === 'file' ? 'btn-blue' : 'btn-gray'}`}
          >
            Upload Image
          </button>
        </div>
        
        <div id="qr-reader" className="qr-reader" style={{ height: scanningMethod === 'camera' ? '300px' : '100px' }}></div>
        
        {scanningMethod === 'camera' && (
          <div className="camera-controls">
            {availableCameras.length > 0 && (
              <div className="form-group">
                <label>Select Camera</label>
                <select
                  value={selectedCamera}
                  onChange={(e) => setSelectedCamera(e.target.value)}
                  disabled={isScanning}
                >
                  {availableCameras.map(camera => (
                    <option key={camera.id} value={camera.id}>
                      {camera.label || `Camera ${camera.id}`}
                    </option>
                  ))}
                </select>
              </div>
            )}
            
            <div className="scanner-actions">
              <button
                onClick={startScanning}
                disabled={isScanning || !scannerInitialized || availableCameras.length === 0}
                className="btn-green"
              >
                Start Scanning
              </button>
              
              <button
                onClick={stopScanning}
                disabled={!isScanning}
                className="btn-red"
              >
                Stop Scanning
              </button>
            </div>
          </div>
        )}
        
        {scanningMethod === 'file' && (
          <div className="file-upload">
            <div className="form-group">
              <label>Upload QR Code Image</label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
              />
              <p style={{fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem'}}>
                Supported formats: JPG, PNG, GIF
              </p>
            </div>
          </div>
        )}
        
        {scannerMessage && (
          <div className="scanner-message">
            <p>{scannerMessage}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default QrCodeScanner;
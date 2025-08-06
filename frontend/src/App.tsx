import React, { useState, useEffect, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import AuthLogin from './components/AuthLogin';
import QrCodeScanner from './components/QrCodeScanner';
import InstrumentSelector from './components/InstrumentSelector';
import SurgeryRoomSelector from './components/SurgeryRoomSelector';
import UserManagement from './components/UserManagement';
import { itemsAPI, groupsAPI, historyAPI, forwardingAPI } from './services/api';
import type { User, MedicalItem, InstrumentGroup, ActionHistory, ForwardingRequest } from './services/api';
import './App.css';

const COMPANIES = [
  { value: '123456', label: 'MedTech Inc. (123456)' },
  { value: '234567', label: 'Surgical Tools Co. (234567)' },
  { value: '345678', label: 'Laboratory Supplies (345678)' },
  { value: '456789', label: 'Dental Equipment (456789)' }
];

const ITEM_TYPES = [
  { value: '001', label: 'Surgical Scissors (001)' },
  { value: '002', label: 'Medical Forceps (002)' },
  { value: '003', label: 'Precision Scalpel (003)' },
  { value: '004', label: 'Arterial Clamp (004)' },
  { value: '005', label: 'Suture Needle (005)' }
];

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState(() => {
    return localStorage.getItem('activeTab') || 'inventory';
  });
  const [scannedGroupId, setScannedGroupId] = useState<string | null>(null);
  const [sterilizationStep, setSterilizationStep] = useState<string>('by_hand');
  const [items, setItems] = useState<MedicalItem[]>([]);
  const [groups, setGroups] = useState<InstrumentGroup[]>([]);
  const [history, setHistory] = useState<ActionHistory[]>([]);

  const [selectedItems, setSelectedItems] = useState<MedicalItem[]>([]);
  const [forwardingRequests, setForwardingRequests] = useState<ForwardingRequest[]>([]);
  const [selectedRoom, setSelectedRoom] = useState('');
  const [selectedInventoryItems, setSelectedInventoryItems] = useState<string[]>([]);
  const [showQrScanner, setShowQrScanner] = useState(false);
  const [loading, setLoading] = useState(false);

  // Form states
  const [companyPrefix, setCompanyPrefix] = useState('');
  const [itemType, setItemType] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [groupName, setGroupName] = useState('');
  const [selectedGroupItems, setSelectedGroupItems] = useState<string[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);

  const [showSurgeryRoomSelector, setShowSurgeryRoomSelector] = useState(false);

  // Filter states
  const [filterBrand, setFilterBrand] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [filterItemId, setFilterItemId] = useState('');
  const [filterAction, setFilterAction] = useState('all');
  const [historyFilterType, setHistoryFilterType] = useState('all');

  useEffect(() => {
    const token = sessionStorage.getItem('token');
    const userData = sessionStorage.getItem('user');
    if (token && userData) setUser(JSON.parse(userData));
  }, []);

  const loadData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [itemsRes, groupsRes, historyRes] = await Promise.all([
        itemsAPI.getAll(),
        groupsAPI.getAll(),
        historyAPI.getAll({ limit: 200 })
      ]);
      
      setItems(itemsRes.data);
      setGroups(groupsRes.data);
      setHistory(historyRes.data);

      if (user.role === 'admin') {
        const forwardingRes = await forwardingAPI.getAll();
        setForwardingRequests(forwardingRes.data);
      } else if (['storage', 'surgery', 'msu'].includes(user.role)) {
        const forwardingRes = await forwardingAPI.getPending();
        setForwardingRequests(forwardingRes.data);
      }


    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleLogin = (userData: User, token: string) => {
    sessionStorage.setItem('token', token);
    sessionStorage.setItem('user', JSON.stringify(userData));
    setUser(userData);
    if (userData.role === 'surgery') {
      setShowSurgeryRoomSelector(true);
    }
  };

  const handleLogout = () => {
    sessionStorage.clear();
    setUser(null);
  };

  const handleRegisterItems = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyPrefix || !itemType || quantity < 1) {
      alert('Please fill all fields correctly');
      return;
    }
    
    setLoading(true);
    try {
      const response = await itemsAPI.register(companyPrefix, itemType, quantity);
      
      // Add new items to the beginning of the items array
      if (response.data && Array.isArray(response.data)) {
        setItems(prev => [...response.data, ...prev]);
      } else {
        // Fallback: refresh all data
        const itemsRes = await itemsAPI.getAll();
        setItems(itemsRes.data);
      }
      
      setCompanyPrefix('');
      setItemType('');
      setQuantity(1);
      alert(`Successfully registered ${quantity} item(s)`);
    } catch (error: any) {
      alert(`Failed to register items: ${error.response?.data?.error || error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSterilizeItems = async () => {
    if (selectedItems.length === 0) return;
    
    setLoading(true);
    try {
      await itemsAPI.bulkUpdateStatus(
        selectedItems.map(item => item.id),
        true,
        'MSU',
        'sterilized'
      );
      setSelectedItems([]);
      const itemsRes = await itemsAPI.getAll();
      setItems(itemsRes.data);
      alert(`${selectedItems.length} item(s) marked as sterilized`);
    } catch (error: any) {
      alert(`Failed to sterilize items: ${error.response?.data?.error || error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleForwardGroup = async (groupId: string, toLocation: string) => {
    try {
      await forwardingAPI.create(groupId, toLocation);
      await loadData();
      alert('Forwarding request created successfully!');
    } catch (error: any) {
      alert(`Failed to forward group: ${error.response?.data?.error || error.message}`);
    }
  };

  const handleAcceptForwarding = async (requestId: string) => {
    try {
      await forwardingAPI.accept(requestId);
      await loadData();
      alert('Forwarding request accepted!');
    } catch (error: any) {
      alert(`Failed to accept forwarding: ${error.response?.data?.error || error.message}`);
    }
  };

  const handleRejectForwarding = async (requestId: string, reason?: string) => {
    try {
      await forwardingAPI.reject(requestId, reason);
      await loadData();
      alert('Forwarding request rejected!');
    } catch (error: any) {
      alert(`Failed to reject forwarding: ${error.response?.data?.error || error.message}`);
    }
  };

  const handleCreateGroup = async () => {
    if (!groupName || selectedGroupItems.length === 0) {
      alert('Please enter a group name and select items');
      return;
    }
    
    const selectedItems = items.filter(item => selectedGroupItems.includes(item.id));
    const sterilizedItems = selectedItems.filter(item => item.sterilized);
    const nonSterilizedItems = selectedItems.filter(item => !item.sterilized);
    
    if (sterilizedItems.length > 0 && nonSterilizedItems.length > 0) {
      alert('Cannot mix sterilized and non-sterilized items in the same group');
      return;
    }
    
    setLoading(true);
    try {
      await groupsAPI.create(groupName, selectedGroupItems);
      setGroupName('');
      setSelectedGroupItems([]);
      await loadData();
      alert('Group created successfully!');
    } catch (error: any) {
      alert('Failed to create group: ' + (error.response?.data?.error || error.message));
    } finally {
      setLoading(false);
    }
  };



  const handleDeleteSelectedItems = async () => {
    if (selectedInventoryItems.length === 0) return;
    if (!confirm(`Are you sure you want to remove ${selectedInventoryItems.length} item(s) from inventory?`)) return;
    
    setLoading(true);
    try {
      console.log('Deleting items:', selectedInventoryItems);
      const deletePromises = selectedInventoryItems.map(async (id) => {
        console.log('Deleting item:', id);
        try {
          const result = await itemsAPI.delete(id);
          console.log('Delete result for', id, ':', result.data);
          return result;
        } catch (error) {
          console.error('Delete error for', id, ':', error);
          console.error('Error details:', error.response?.data, error.response?.status);
          throw error;
        }
      });
      await Promise.all(deletePromises);
      setSelectedInventoryItems([]);
      // Refresh both items and history data
      const [itemsRes, historyRes] = await Promise.all([
        itemsAPI.getAll(),
        historyAPI.getAll({ limit: 200 })
      ]);
      setItems(itemsRes.data);
      setHistory(historyRes.data);
      console.log('Recent history entries:', historyRes.data.slice(0, 10).map(h => ({ id: h.item_id, action: h.action })));
      console.log('Removed entries:', historyRes.data.filter(h => h.action === 'removed_from_inventory'));
      alert(`${selectedInventoryItems.length} item(s) removed from inventory successfully`);
    } catch (error: any) {
      alert(`Failed to remove items: ${error.response?.data?.error || error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectAllInventoryItems = () => {
    if (selectedInventoryItems.length === filteredItems.length) {
      setSelectedInventoryItems([]);
    } else {
      setSelectedInventoryItems(filteredItems.map(item => item.id));
    }
  };

  const handleInventoryItemSelect = (itemId: string) => {
    setSelectedInventoryItems(prev => 
      prev.includes(itemId) 
        ? prev.filter(id => id !== itemId)
        : [...prev, itemId]
    );
  };

  const handleQrScan = async (decodedText: string) => {
    try {
      // Try to parse as URL first (for group QR codes)
      let groupId = null;
      try {
        const url = new URL(decodedText);
        groupId = url.searchParams.get('group');
      } catch {
        // Not a URL, might be an item ID
      }

      if (groupId) {
        const groupResponse = await groupsAPI.getById(groupId);
        const group = groupResponse.data;
        
        setGroups(prevGroups => {
          const exists = prevGroups.find(g => g.id === groupId);
          if (!exists) return [...prevGroups, group];
          return prevGroups.map(g => g.id === groupId ? group : g);
        });
        
        if (user?.role === 'msu') {
          setScannedGroupId(groupId);
          setActiveTab('sterilization');
        } else if (user?.role === 'storage') {
          // Reload forwarding requests to get the latest data
          const forwardingRes = await forwardingAPI.getPending();
          const latestRequests = forwardingRes.data;
          setForwardingRequests(latestRequests);
          
          const pendingRequest = latestRequests.find(r => r.group_id === groupId && r.status === 'pending' && r.to_location === 'Storage');
          if (pendingRequest || group.location === 'Storage') {
            setScannedGroupId(groupId);
            setActiveTab('storage-forwarding');
          } else {
            alert('This group is not available for storage operations.');
          }
        } else if (user?.role === 'surgery') {
          setScannedGroupId(groupId);
          setActiveTab('surgery-processing');
        } else {
          setSelectedGroup(groupId);
          setActiveTab('groups');
        }
      } else {
        // Try to find item by ID
        try {
          const item = await itemsAPI.getById(decodedText);
          if (item.data) {
            setSelectedItems([item.data]);
            setActiveTab('inventory');
          } else {
            alert('Item not found');
          }
        } catch {
          alert('Item not found');
        }
      }
      
      setShowQrScanner(false);
    } catch (error) {
      alert('Invalid QR code format');
      setShowQrScanner(false);
    }
  };

  const exportToExcel = (data: any[], filename: string) => {
    let exportData = data;
    
    if (filename === 'history') {
      exportData = data.map((entry, index) => {
        const company = COMPANIES.find(c => c.value === entry.company_prefix);
        const itemType = ITEM_TYPES.find(t => t.value === entry.item_name);
        const actionText = entry.action === 'removed_from_inventory' ? 'Removed from inventory' : 
                          entry.action === 'marked_unsterilized' ? 'Marked Unsterilized' :
                          entry.action === 'sterilization_completed' ? 'Sterilization Completed' :
                          entry.action === 'step_by_hand' ? 'Step: By Hand' :
                          entry.action === 'step_washing' ? 'Step: Washing' :
                          entry.action === 'step_steam_sterilization' ? 'Step: Steam Sterilization' :
                          entry.action === 'step_cooling' ? 'Step: Cooling' :
                          entry.action === 'step_finished' ? 'Step: Finished' :
                          entry.action.charAt(0).toUpperCase() + entry.action.slice(1).replace('_', ' ');
        
        return {
          'No.': index + 1,
          'Item ID': entry.item_id,
          'Company': company?.label.split(' (')[0] || entry.company_prefix,
          'Item Type': itemType?.label.split(' (')[0] || entry.item_name,
          'Action': actionText,
          'Location': entry.action === 'removed_from_inventory' ? '' : (entry.to_location || entry.from_location || ''),
          'Date & Time': new Date(entry.timestamp).toLocaleString()
        };
      });
    } else if (filename === 'inventory') {
      exportData = data.map((item, index) => {
        const company = COMPANIES.find(c => c.value === item.company_prefix);
        const itemType = ITEM_TYPES.find(t => t.value === item.item_name);
        
        return {
          'No.': index + 1,
          'Item ID': item.id,
          'Company': company?.label.split(' (')[0] || item.company_prefix,
          'Item Type': itemType?.label.split(' (')[0] || item.item_name,
          'Status': item.sterilized ? 'Sterilized' : 'Not Sterilized',
          'Location': item.location
        };
      });
    }
    
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Data');
    XLSX.writeFile(wb, `${filename}.xlsx`);
  };

  const downloadQRCode = (groupId: string, groupName: string) => {
    // Get the existing QR code SVG and clone it
    const existingQR = document.querySelector(`svg[data-group="${groupId}"]`);
    if (!existingQR) {
      alert('QR code not found. Please try again.');
      return;
    }
    
    // Create high-resolution canvas
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const size = 400;
    
    canvas.width = size;
    canvas.height = size;
    
    // Clone the SVG and set proper size
    const clonedSVG = existingQR.cloneNode(true) as SVGElement;
    clonedSVG.setAttribute('width', size.toString());
    clonedSVG.setAttribute('height', size.toString());
    
    // Convert SVG to data URL
    const svgData = new XMLSerializer().serializeToString(clonedSVG);
    const svgDataUrl = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
    
    const img = new Image();
    img.onload = () => {
      // Fill white background
      ctx!.fillStyle = 'white';
      ctx!.fillRect(0, 0, size, size);
      
      // Draw QR code
      ctx!.drawImage(img, 0, 0, size, size);
      
      // Convert to PNG and download
      canvas.toBlob((blob) => {
        if (blob) {
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `${groupName}-qr-code.png`;
          link.click();
          URL.revokeObjectURL(url);
        }
      }, 'image/png', 1.0);
    };
    
    img.onerror = () => {
      alert('Failed to generate QR code image. Please try again.');
    };
    
    img.src = svgDataUrl;
  };

  const exportToPDF = (data: any[], filename: string) => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text(`${filename} Report`, 20, 20);
    doc.setFontSize(10);
    let y = 40;
    
    if (filename === 'history') {
      data.forEach((entry, index) => {
        if (y > 260) {
          doc.addPage();
          y = 20;
        }
        const company = COMPANIES.find(c => c.value === entry.company_prefix);
        const itemType = ITEM_TYPES.find(t => t.value === entry.item_name);
        const actionText = entry.action === 'removed_from_inventory' ? 'Removed from inventory' : 
                          entry.action === 'marked_unsterilized' ? 'Marked Unsterilized' :
                          entry.action === 'sterilization_completed' ? 'Sterilization Completed' :
                          entry.action === 'step_by_hand' ? 'Step: By Hand' :
                          entry.action === 'step_washing' ? 'Step: Washing' :
                          entry.action === 'step_steam_sterilization' ? 'Step: Steam Sterilization' :
                          entry.action === 'step_cooling' ? 'Step: Cooling' :
                          entry.action === 'step_finished' ? 'Step: Finished' :
                          entry.action.charAt(0).toUpperCase() + entry.action.slice(1).replace('_', ' ');
        
        doc.text(`${index + 1}. ${entry.item_id}`, 20, y);
        doc.text(`   ${company?.label.split(' (')[0] || entry.company_prefix} - ${itemType?.label.split(' (')[0] || entry.item_name}`, 20, y + 10);
        doc.text(`   ${actionText}`, 20, y + 20);
        doc.text(`   ${new Date(entry.timestamp).toLocaleString()}`, 20, y + 30);
        y += 45;
      });
    } else {
      data.forEach((item, index) => {
        if (y > 260) {
          doc.addPage();
          y = 20;
        }
        const company = COMPANIES.find(c => c.value === item.company_prefix);
        const itemType = ITEM_TYPES.find(t => t.value === item.item_name);
        
        doc.text(`${index + 1}. ${item.id}`, 20, y);
        doc.text(`   ${company?.label.split(' (')[0] || item.company_prefix} - ${itemType?.label.split(' (')[0] || item.item_name}`, 20, y + 10);
        doc.text(`   Status: ${item.sterilized ? 'Sterilized' : 'Not Sterilized'}`, 20, y + 20);
        doc.text(`   Location: ${item.location}`, 20, y + 30);
        y += 45;
      });
    }
    doc.save(`${filename}.pdf`);
  };

  const getVisibleTabs = () => {
    const tabs = ['inventory'];
    if (user?.role === 'admin') {
      tabs.push('register', 'groups', 'users', 'history', 'forwarding');
    } else {
      if (user?.role === 'msu') tabs.push('register', 'groups', 'forwarding');
      if (user?.role === 'storage') tabs.push('groups', 'forwarding');
      if (user?.role === 'surgery') tabs.push('groups', 'forwarding');
    }
    return tabs;
  };

  const filteredItems = items.filter(item => {
    // Role-based location filtering
    if (user?.role === 'msu' && item.location !== 'MSU') return false;
    if (user?.role === 'storage' && item.location !== 'Storage') return false;
    if (user?.role === 'surgery' && !item.location.includes('Surgery')) return false;
    
    if (filterBrand !== 'all' && item.company_prefix !== filterBrand) return false;
    if (filterType !== 'all' && item.item_name !== filterType) return false;
    return true;
  }).sort((a, b) => sortOrder === 'asc' ? a.id.localeCompare(b.id) : b.id.localeCompare(a.id));

  const filteredHistory = history.filter(entry => {
    if (historyFilterType === 'item-id' && filterItemId && (!entry.item_id || !entry.item_id.toLowerCase().includes(filterItemId.toLowerCase()))) return false;
    if (historyFilterType === 'action' && filterAction !== 'all') {
      if (filterAction === 'sterilization') {
        return entry.action === 'marked_unsterilized' || entry.action === 'sterilization_completed' || entry.action.startsWith('step_');
      }
      return entry.action === filterAction;
    }
    return true;
  });

  if (!user) return <AuthLogin onLogin={handleLogin} />;
  if (user.role === 'surgery' && showSurgeryRoomSelector) {
    return <SurgeryRoomSelector onRoomSelect={(room) => {
      setSelectedRoom(room);
      setShowSurgeryRoomSelector(false);
    }} showAsModal />;
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="flex gap-2">
          <button onClick={() => setShowQrScanner(true)} className="btn-purple">
            📱 Scan QR
          </button>
        </div>
        <h1>
          <span className="highlight">MSU</span> System
          <span style={{marginLeft: '0.5rem', fontSize: '0.875rem', fontWeight: 'normal', color: 'var(--text-muted)'}}>
            ({user.role === 'admin' ? 'Admin' : 
              user.role === 'msu' ? 'MSU Personnel' : 
              user.role === 'storage' ? 'Storage Personnel' : 'Surgery Personnel'})
          </span>
        </h1>
        <div className="user-info">
          <span>{user.username}</span>
          <button onClick={handleLogout} className="btn-gray">Logout</button>
        </div>
      </header>

      <div className="status-bar">
        <p>Medical Sterilization Unit Management System</p>
        <div className={`status-indicator ${loading ? 'saving' : ''}`}></div>
        <span>{loading ? 'Loading...' : 'Ready'}</span>
      </div>

      <nav className="tab-nav">
        {getVisibleTabs().map(tab => (
          <button
            key={tab}
            className={`tab ${activeTab === tab ? 'active' : ''}`}
            onClick={() => {
              setActiveTab(tab);
              localStorage.setItem('activeTab', tab);
            }}
          >
            {tab === 'sterilization' ? 'Sterilization Process' : tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </nav>

      <main className="app-main">
        {activeTab === 'inventory' && (
          <div>
            <div className="tab-header">
              <h2>Inventory ({filteredItems.length} items)</h2>
              <div className="flex gap-2">
                <button onClick={() => exportToPDF(filteredItems, 'inventory')} className="btn-red">
                  📄 PDF
                </button>
                <button onClick={() => exportToExcel(filteredItems, 'inventory')} className="btn-green">
                  📊 Excel
                </button>
              </div>
            </div>
            
            <div style={{marginBottom: '1rem', padding: '1rem', background: 'var(--card)', borderRadius: '0.5rem'}}>
              <div style={{display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem'}}>
                <div className="form-group">
                  <label>Company</label>
                  <select value={filterBrand} onChange={(e) => setFilterBrand(e.target.value)}>
                    <option value="all">All Companies</option>
                    {COMPANIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Item Type</label>
                  <select value={filterType} onChange={(e) => setFilterType(e.target.value)}>
                    <option value="all">All Types</option>
                    {ITEM_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Sort by ID</label>
                  <select value={sortOrder} onChange={(e) => setSortOrder(e.target.value as 'asc' | 'desc')}>
                    <option value="asc">Ascending</option>
                    <option value="desc">Descending</option>
                  </select>
                </div>
              </div>
            </div>
            
            {user?.role === 'admin' && (
              <div className="inventory-controls">
                <button 
                  onClick={handleSelectAllInventoryItems}
                  className="btn-purple"
                >
                  {selectedInventoryItems.length === filteredItems.length ? 'Deselect All' : 'Select All'}
                </button>
                {selectedInventoryItems.length > 0 && (
                  <button 
                    onClick={handleDeleteSelectedItems}
                    className="btn-red"
                    disabled={loading}
                  >
                    🗑️ Remove Selected ({selectedInventoryItems.length})
                  </button>
                )}
              </div>
            )}
            
            <div className="inventory-grid">
              {filteredItems.map(item => {
                const company = COMPANIES.find(c => c.value === item.company_prefix);
                const itemType = ITEM_TYPES.find(t => t.value === item.item_name);
                const isSelected = selectedInventoryItems.includes(item.id);
                
                return (
                  <div 
                    key={item.id} 
                    className={`inventory-item-box ${isSelected ? 'selected' : ''} ${user?.role === 'admin' ? 'selectable' : ''}`}
                    onClick={() => user?.role === 'admin' && handleInventoryItemSelect(item.id)}
                  >
                    <div className="item-header">
                      <div className="item-id">{item.id}</div>
                      {user?.role === 'admin' && isSelected && (
                        <div className="selection-indicator">✓</div>
                      )}
                    </div>
                    
                    <div className="item-details">
                      <div className="item-company">{company?.label || item.company_prefix}</div>
                      <div className="item-type">{itemType?.label || item.item_name}</div>
                    </div>
                    
                    <div className="item-status">
                      <span className={`status ${item.sterilized ? 'sterilized' : 'not-sterilized'}`}>
                        {item.sterilized ? '✓ Sterilized' : '✗ Not Sterilized'}
                      </span>
                      <span className="location">{item.location}</span>
                    </div>
                    
                    <div style={{textAlign: 'center', marginTop: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem'}}>
                      <QRCodeSVG value={item.id} size={30} data-item={item.id} />
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          const svg = document.querySelector(`svg[data-item="${item.id}"]`);
                          if (svg) {
                            const canvas = document.createElement('canvas');
                            const ctx = canvas.getContext('2d');
                            const size = 200;
                            canvas.width = size;
                            canvas.height = size;
                            const svgData = new XMLSerializer().serializeToString(svg);
                            const svgDataUrl = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
                            const img = new Image();
                            img.onload = () => {
                              ctx!.fillStyle = 'white';
                              ctx!.fillRect(0, 0, size, size);
                              ctx!.drawImage(img, 0, 0, size, size);
                              canvas.toBlob((blob) => {
                                if (blob) {
                                  const url = URL.createObjectURL(blob);
                                  const link = document.createElement('a');
                                  link.href = url;
                                  link.download = `${item.id}-qr-code.png`;
                                  link.click();
                                  URL.revokeObjectURL(url);
                                }
                              }, 'image/png', 1.0);
                            };
                            img.src = svgDataUrl;
                          }
                        }}
                        className="btn-purple"
                        style={{fontSize: '12px', padding: '4px 8px', minWidth: 'auto'}}
                      >
                        📱
                      </button>
                    </div>

                  </div>
                );
              })}
            </div>
            
            {filteredItems.length === 0 && (
              <div className="empty-state">
                <p>No items found matching the current filters.</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'register' && (
          <div>
            <form onSubmit={handleRegisterItems} style={{marginBottom: '1rem'}}>
              <div className="form-group">
                <label>Company Prefix</label>
                <select value={companyPrefix} onChange={(e) => setCompanyPrefix(e.target.value)} required>
                  <option value="">Select Company</option>
                  {COMPANIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              
              <div className="form-group">
                <label>Item Type</label>
                <select value={itemType} onChange={(e) => setItemType(e.target.value)} required>
                  <option value="">Select Type</option>
                  {ITEM_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              
              <div className="form-group">
                <label>Quantity</label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={quantity}
                  onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                  required
                />
              </div>
              
              <button type="submit" className="btn-green w-full" disabled={loading}>
                {loading ? 'Registering...' : `Register ${quantity} Item${quantity > 1 ? 's' : ''}`}
              </button>
            </form>

            <div style={{background: 'var(--card)', padding: '1rem', borderRadius: '0.5rem'}}>
              <h3>Recently Registered</h3>
              {items.length > 0 ? items.slice(0, 5).map(item => (
                <div key={item.id} className="item-card">
                  <div>
                    <div style={{fontFamily: 'monospace', color: 'var(--blue)'}}>{item.id}</div>
                    <div>{COMPANIES.find(c => c.value === item.company_prefix)?.label} - {ITEM_TYPES.find(t => t.value === item.item_name)?.label}</div>
                  </div>
                </div>
              )) : (
                <p style={{color: 'var(--text-muted)', textAlign: 'center', padding: '1rem'}}>No items registered yet</p>
              )}
            </div>


          </div>
        )}

        {activeTab === 'sterilization' && scannedGroupId && user?.role === 'msu' && (
          <div>
            <div className="tab-header">
              <h2>Sterilization Process</h2>
              <button onClick={() => {
                setScannedGroupId(null);
                setActiveTab('inventory');
              }} className="btn-gray">
                Back to Inventory
              </button>
            </div>
            
            {(() => {
              const group = groups.find(g => g.id === scannedGroupId);
              if (!group) return <p>Group not found</p>;
              
              const pendingRequest = forwardingRequests.find(r => r.group_id === scannedGroupId && r.status === 'pending' && r.to_location === 'MSU');
              const hasAcceptedMSU = group?.location === 'MSU' && !pendingRequest;
              
              const STERILIZATION_STEPS = [
                { key: 'by_hand', label: 'By Hand' },
                { key: 'washing', label: 'Washing' },
                { key: 'steam_sterilization', label: 'Steam Sterilization' },
                { key: 'cooling', label: 'Cooling' },
                { key: 'finished', label: 'Finished' }
              ];
              
              return (
                <div>
                  <div style={{marginBottom: '2rem', padding: '1.5rem', background: 'var(--card)', borderRadius: '0.5rem'}}>
                    <h3>Group: {group.name}</h3>
                    <p>Items: {group.GroupItems?.length || 0}</p>
                    <p>Location: {group.location}</p>
                  </div>
                  
                  <div style={{marginBottom: '2rem', padding: '1.5rem', background: 'var(--card)', borderRadius: '0.5rem'}}>
                    <h3>Detailed Item Information</h3>
                    <div className="inventory-grid" style={{marginTop: '1rem'}}>
                      {group.GroupItems?.map(groupItem => {
                        const item = groupItem.MedicalItem;
                        if (!item) return null;
                        const company = COMPANIES.find(c => c.value === item.company_prefix);
                        const itemType = ITEM_TYPES.find(t => t.value === item.item_name);
                        
                        return (
                          <div key={item.id} className="inventory-item-box">
                            <div className="item-header">
                              <div className="item-id">{item.id}</div>
                            </div>
                            
                            <div className="item-details">
                              <div className="item-company">{company?.label || item.company_prefix}</div>
                              <div className="item-type">{itemType?.label || item.item_name}</div>
                            </div>
                            
                            <div className="item-status">
                              <span className={`status ${item.sterilized ? 'sterilized' : 'not-sterilized'}`}>
                                {item.sterilized ? '✓ Sterilized' : '✗ Not Sterilized'}
                              </span>
                              <span className="location">{item.location}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  
                  {pendingRequest && (
                    <div style={{marginBottom: '2rem'}}>
                      <h3>Forwarding Request</h3>
                      <div style={{display: 'flex', gap: '1rem'}}>
                        <button
                          onClick={async () => {
                            await handleAcceptForwarding(pendingRequest.id);
                            await loadData();
                          }}
                          className="btn-green"
                        >
                          Accept Forwarding
                        </button>
                        <button
                          onClick={() => {
                            const reason = prompt('Reason for rejection (optional):');
                            handleRejectForwarding(pendingRequest.id, reason || undefined);
                          }}
                          className="btn-red"
                        >
                          Send Back
                        </button>
                      </div>
                    </div>
                  )}
                  
                  {hasAcceptedMSU && (
                    <div style={{marginBottom: '2rem'}}>
                      <h3>Sterilization Steps</h3>
                      <div style={{display: 'flex', gap: '1rem', flexWrap: 'wrap'}}>
                        {STERILIZATION_STEPS.map((step, index) => {
                          const isActive = sterilizationStep === step.key;
                          const isCompleted = STERILIZATION_STEPS.findIndex(s => s.key === sterilizationStep) > index;
                          
                          return (
                            <button
                              key={step.key}
                              onClick={() => setSterilizationStep(step.key)}
                              className={`btn-step ${
                                isActive ? 'active' : 
                                isCompleted ? 'completed' : 'pending'
                              }`}
                              style={{
                                padding: '1rem 1.5rem',
                                borderRadius: '0.5rem',
                                border: '2px solid',
                                backgroundColor: isActive ? 'var(--blue)' : isCompleted ? 'var(--green)' : 'var(--card)',
                                borderColor: isActive ? 'var(--blue)' : isCompleted ? 'var(--green)' : 'var(--border)',
                                color: isActive || isCompleted ? 'white' : 'var(--text)'
                              }}
                            >
                              {index + 1}. {step.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  
                  <div style={{display: 'flex', gap: '1rem', marginTop: '2rem', justifyContent: 'space-between'}}>
                    <div style={{display: 'flex', gap: '1rem'}}>
                      {hasAcceptedMSU && (
                        <>
                          <button
                            onClick={async () => {
                              try {
                                const itemIds = group.GroupItems?.map(gi => gi.item_id) || [];
                                const currentStep = STERILIZATION_STEPS.find(s => s.key === sterilizationStep);
                                await itemsAPI.bulkUpdateStatus(itemIds, false, 'MSU', `step_${sterilizationStep}`);
                                await loadData();
                                alert(`Status updated to: ${currentStep?.label}`);
                              } catch (error: any) {
                                alert('Failed to update status: ' + (error.response?.data?.error || error.message));
                              }
                            }}
                            className="btn-blue"
                          >
                            Update Status to {STERILIZATION_STEPS.find(s => s.key === sterilizationStep)?.label}
                          </button>
                          <button
                            onClick={async () => {
                              try {
                                const itemIds = group.GroupItems?.map(gi => gi.item_id) || [];
                                await itemsAPI.bulkUpdateStatus(itemIds, false, 'MSU', 'marked_unsterilized');
                                await loadData();
                                alert('Group marked as unsterilized');
                              } catch (error: any) {
                                alert('Failed to update status: ' + (error.response?.data?.error || error.message));
                              }
                            }}
                            className="btn-red"
                          >
                            Mark as Unsterilized
                          </button>
                          <button
                            onClick={async () => {
                              try {
                                const itemIds = group.GroupItems?.map(gi => gi.item_id) || [];
                                await itemsAPI.bulkUpdateStatus(itemIds, true, 'MSU', 'sterilization_completed');
                                await loadData();
                                alert('Sterilization process completed!');
                                setScannedGroupId(null);
                                setActiveTab('inventory');
                              } catch (error: any) {
                                alert('Failed to complete sterilization: ' + (error.response?.data?.error || error.message));
                              }
                            }}
                            className="btn-green"
                          >
                            Complete Sterilization
                          </button>
                        </>
                      )}
                    </div>
                    {hasAcceptedMSU && (() => {
                      const hasPendingForward = forwardingRequests.find(r => r.group_id === scannedGroupId && r.status === 'pending' && r.from_location === 'MSU');
                      if (hasPendingForward) {
                        return <div style={{
                          position: 'fixed',
                          top: '50%',
                          left: '50%',
                          transform: 'translate(-50%, -50%)',
                          padding: '2rem',
                          background: '#fbbf24',
                          borderRadius: '1rem',
                          color: '#000',
                          fontSize: '1.2rem',
                          fontWeight: 'bold',
                          textAlign: 'center',
                          boxShadow: '0 10px 25px rgba(0,0,0,0.3)',
                          zIndex: 1000,
                          border: '3px solid #f59e0b'
                        }}>
                          ⚠️ Group Already Forwarded to Storage<br/>
                          <span style={{fontSize: '1rem', fontWeight: 'normal'}}>Waiting for acceptance from Storage</span>
                        </div>;
                      }
                      const allItemsSterilized = group.GroupItems?.every(gi => gi.MedicalItem?.sterilized);
                      if (!allItemsSterilized) {
                        return <div style={{padding: '1rem', background: 'var(--red)', borderRadius: '0.5rem', color: 'white'}}>
                          <strong>Cannot Forward</strong><br/>
                          All items must be sterilized before forwarding to Storage.
                        </div>;
                      }
                      return (
                        <button
                          onClick={() => handleForwardGroup(scannedGroupId, 'Storage')}
                          className="btn-purple"
                        >
                          Forward to Storage
                        </button>
                      );
                    })()}
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {activeTab === 'sterilize' && (
          <div>
            <div className="tab-header">
              <h2>Sterilize Items</h2>
              <button onClick={() => setShowQrScanner(true)} className="btn-purple">
                📱 Scan Group QR
              </button>
            </div>
            
            <div style={{marginBottom: '1rem', padding: '1rem', background: 'var(--card)', borderRadius: '0.5rem'}}>
              <div style={{display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem'}}>
                <div className="form-group">
                  <label>Company</label>
                  <select value={filterBrand} onChange={(e) => setFilterBrand(e.target.value)}>
                    <option value="all">All Companies</option>
                    {COMPANIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Item Type</label>
                  <select value={filterType} onChange={(e) => setFilterType(e.target.value)}>
                    <option value="all">All Types</option>
                    {ITEM_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Sort by ID</label>
                  <select value={sortOrder} onChange={(e) => setSortOrder(e.target.value as 'asc' | 'desc')}>
                    <option value="asc">Ascending</option>
                    <option value="desc">Descending</option>
                  </select>
                </div>
              </div>
            </div>
            
            <div className="inventory-controls">
              <button 
                onClick={() => {
                  const filteredUnsterilizedItems = items.filter(item => {
                    if (item.sterilized || item.location !== 'MSU') return false;
                    if (filterBrand !== 'all' && item.company_prefix !== filterBrand) return false;
                    if (filterType !== 'all' && item.item_name !== filterType) return false;
                    return true;
                  });
                  if (selectedItems.length === filteredUnsterilizedItems.length) {
                    setSelectedItems([]);
                  } else {
                    setSelectedItems(filteredUnsterilizedItems);
                  }
                }}
                className="btn-purple"
              >
                {selectedItems.length === items.filter(item => {
                  if (item.sterilized || item.location !== 'MSU') return false;
                  if (filterBrand !== 'all' && item.company_prefix !== filterBrand) return false;
                  if (filterType !== 'all' && item.item_name !== filterType) return false;
                  return true;
                }).length ? 'Deselect All' : 'Select All'}
              </button>
              {selectedItems.length > 0 && (
                <button onClick={handleSterilizeItems} className="btn-green">
                  Mark as Sterilized ({selectedItems.length} items)
                </button>
              )}
            </div>
            
            <div className="inventory-grid">
              {items.filter(item => {
                if (item.sterilized || item.location !== 'MSU') return false;
                if (filterBrand !== 'all' && item.company_prefix !== filterBrand) return false;
                if (filterType !== 'all' && item.item_name !== filterType) return false;
                return true;
              }).sort((a, b) => sortOrder === 'asc' ? a.id.localeCompare(b.id) : b.id.localeCompare(a.id)).map(item => {
                const company = COMPANIES.find(c => c.value === item.company_prefix);
                const itemType = ITEM_TYPES.find(t => t.value === item.item_name);
                const isSelected = selectedItems.some(selected => selected.id === item.id);
                
                return (
                  <div 
                    key={item.id} 
                    className={`inventory-item-box ${isSelected ? 'selected' : ''} selectable`}
                    onClick={() => {
                      if (isSelected) {
                        setSelectedItems(prev => prev.filter(selected => selected.id !== item.id));
                      } else {
                        setSelectedItems(prev => [...prev, item]);
                      }
                    }}
                  >
                    <div className="item-header">
                      <div className="item-id">{item.id}</div>
                      {isSelected && (
                        <div className="selection-indicator">✓</div>
                      )}
                    </div>
                    
                    <div className="item-details">
                      <div className="item-company">{company?.label || item.company_prefix}</div>
                      <div className="item-type">{itemType?.label || item.item_name}</div>
                    </div>
                    
                    <div className="item-status">
                      <span className="status not-sterilized">
                        ✗ Not Sterilized
                      </span>
                      <span className="location">{item.location}</span>
                    </div>
                  </div>
                );
              })}
            </div>
            
            {items.filter(item => {
              if (item.sterilized || item.location !== 'MSU') return false;
              if (filterBrand !== 'all' && item.company_prefix !== filterBrand) return false;
              if (filterType !== 'all' && item.item_name !== filterType) return false;
              return true;
            }).length === 0 && (
              <div className="empty-state">
                <p>No items found matching the current filters.</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'groups' && (
          <div>
            <div className="tab-header">
              <h2>Groups</h2>
              <div className="flex gap-2">
                {user?.role !== 'surgery' && (
                  <button 
                    onClick={() => setActiveTab('groups-create')}
                    className="btn-green"
                  >
                    Create New Group
                  </button>
                )}
                <button 
                  onClick={() => setActiveTab('groups-view')}
                  className="btn-blue"
                >
                  View Existing Groups
                </button>
              </div>
            </div>
            
            <div style={{textAlign: 'center', padding: '3rem', color: 'var(--text-muted)'}}>
              <p>Choose an option above to create a new group or view existing groups.</p>
            </div>
          </div>
        )}

        {activeTab === 'groups-create' && (
          <div>
            <div className="tab-header">
              <h2>Create New Group</h2>
              <button 
                onClick={() => setActiveTab('groups-view')}
                className="btn-blue"
              >
                View Existing Groups
              </button>
            </div>
            
            <div className="form-group" style={{display: 'flex', gap: '1rem', alignItems: 'end'}}>
              <div style={{flex: 1}}>
                <label>Group Name</label>
                <input
                  type="text"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  placeholder="Enter group name"
                />
              </div>
              <button
                onClick={handleCreateGroup}
                disabled={selectedGroupItems.length === 0 || !groupName}
                className="btn-green"
              >
                Create Group with {selectedGroupItems.length} Items
              </button>
            </div>
            
            <div style={{marginBottom: '1rem', padding: '1rem', background: 'var(--card)', borderRadius: '0.5rem'}}>
              <div style={{display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem'}}>
                <div className="form-group">
                  <label>Company</label>
                  <select value={filterBrand} onChange={(e) => setFilterBrand(e.target.value)}>
                    <option value="all">All Companies</option>
                    {COMPANIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Item Type</label>
                  <select value={filterType} onChange={(e) => setFilterType(e.target.value)}>
                    <option value="all">All Types</option>
                    {ITEM_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Status</label>
                  <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                    <option value="all">All Status</option>
                    <option value="sterilized">Sterilized</option>
                    <option value="not-sterilized">Not Sterilized</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Sort by ID</label>
                  <select value={sortOrder} onChange={(e) => setSortOrder(e.target.value as 'asc' | 'desc')}>
                    <option value="asc">Ascending</option>
                    <option value="desc">Descending</option>
                  </select>
                </div>
              </div>
            </div>
            
            <div className="inventory-grid">
              {items.filter(item => {
                // Role-based location filtering
                if (user?.role === 'msu' && item.location !== 'MSU') return false;
                if (user?.role === 'storage' && item.location !== 'Storage') return false;
                // Admin can see all items
                
                // Exclude items already in groups
                const isInGroup = groups.some(group => 
                  group.GroupItems?.some(groupItem => groupItem.item_id === item.id)
                );
                if (isInGroup) return false;
                
                if (filterBrand !== 'all' && item.company_prefix !== filterBrand) return false;
                if (filterType !== 'all' && item.item_name !== filterType) return false;
                if (filterStatus !== 'all' && ((filterStatus === 'sterilized' && !item.sterilized) || (filterStatus === 'not-sterilized' && item.sterilized))) return false;
                return true;
              }).sort((a, b) => sortOrder === 'asc' ? a.id.localeCompare(b.id) : b.id.localeCompare(a.id)).map(item => {
                const company = COMPANIES.find(c => c.value === item.company_prefix);
                const itemType = ITEM_TYPES.find(t => t.value === item.item_name);
                const isSelected = selectedGroupItems.includes(item.id);
                
                return (
                  <div 
                    key={item.id} 
                    className={`inventory-item-box ${isSelected ? 'selected' : ''} selectable`}
                    onClick={() => {
                      if (isSelected) {
                        setSelectedGroupItems(prev => prev.filter(id => id !== item.id));
                      } else {
                        setSelectedGroupItems(prev => [...prev, item.id]);
                      }
                    }}
                  >
                    <div className="item-header">
                      <div className="item-id">{item.id}</div>
                      {isSelected && (
                        <div className="selection-indicator">✓</div>
                      )}
                    </div>
                    
                    <div className="item-details">
                      <div className="item-company">{company?.label || item.company_prefix}</div>
                      <div className="item-type">{itemType?.label || item.item_name}</div>
                    </div>
                    
                    <div className="item-status">
                      <span className={`status ${item.sterilized ? 'sterilized' : 'not-sterilized'}`}>
                        {item.sterilized ? '✓ Sterilized' : '✗ Not Sterilized'}
                      </span>
                      <span className="location">{item.location}</span>
                    </div>
                  </div>
                );
              })}
            </div>
            
            {items.filter(item => {
              // Role-based location filtering
              if (user?.role === 'msu' && item.location !== 'MSU') return false;
              if (user?.role === 'storage' && item.location !== 'Storage') return false;
              // Admin can see all items
              
              // Exclude items already in groups
              const isInGroup = groups.some(group => 
                group.GroupItems?.some(groupItem => groupItem.item_id === item.id)
              );
              if (isInGroup) return false;
              
              if (filterBrand !== 'all' && item.company_prefix !== filterBrand) return false;
              if (filterType !== 'all' && item.item_name !== filterType) return false;
              if (filterStatus !== 'all' && ((filterStatus === 'sterilized' && !item.sterilized) || (filterStatus === 'not-sterilized' && item.sterilized))) return false;
              return true;
            }).length === 0 && (
              <div className="empty-state">
                <p>No items found matching the current filters.</p>
              </div>
            )}
            

          </div>
        )}

        {activeTab === 'groups-view' && (
          <div>
            <div className="tab-header">
              <h2>Existing Groups ({groups.length})</h2>
              {user?.role !== 'surgery' && (
                <button 
                  onClick={() => setActiveTab('groups-create')}
                  className="btn-green"
                >
                  Create New Group
                </button>
              )}
            </div>
            
            <div className="inventory-grid">
              {groups.map(group => (
                <div 
                  key={group.id} 
                  className={`inventory-item-box ${selectedGroup === group.id ? 'selected' : ''} selectable`}
                  onClick={() => setSelectedGroup(selectedGroup === group.id ? null : group.id)}
                >
                  <div className="item-header">
                    <div className="item-id">{group.name}</div>
                    {selectedGroup === group.id && (
                      <div className="selection-indicator">✓</div>
                    )}
                  </div>
                  
                  <div className="item-details">
                    <div className="item-company">Items: {group.GroupItems?.length || 0}</div>
                    <div className="item-type">Location: {group.location}</div>
                  </div>
                  
                  <div className="item-status">
                    <QRCodeSVG value={`${window.location.origin}?group=${group.id}`} size={40} data-group={group.id} />
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        downloadQRCode(group.id, group.name);
                      }}
                      className="btn-purple"
                      style={{marginTop: '5px', fontSize: '12px', padding: '6px 12px'}}
                    >
                      📱 Download
                    </button>
                  </div>
                </div>
              ))}
            </div>
            
            {selectedGroup && (
              <div style={{marginTop: '2rem', padding: '1.5rem', background: 'var(--card)', borderRadius: '0.5rem'}}>
                <div className="tab-header">
                  <h3>Group Details</h3>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => {
                        const group = groups.find(g => g.id === selectedGroup);
                        if (group) downloadQRCode(group.id, group.name);
                      }}
                      className="btn-purple"
                    >
                      📱 Download QR Code
                    </button>
                    {selectedGroupItems.length > 0 && (
                      <button 
                        onClick={async () => {
                          if (confirm(`Remove ${selectedGroupItems.length} item(s) from group?`)) {
                            try {
                              const group = groups.find(g => g.id === selectedGroup);
                              const remainingItems = group?.GroupItems?.filter(gi => !selectedGroupItems.includes(gi.item_id)).map(gi => gi.item_id) || [];
                              await groupsAPI.delete(selectedGroup);
                              if (remainingItems.length > 0) {
                                await groupsAPI.create(group!.name, remainingItems);
                              }
                              setSelectedGroupItems([]);
                              await loadData();
                              alert('Items removed from group successfully!');
                            } catch (error: any) {
                              alert('Failed to remove items: ' + (error.response?.data?.error || error.message));
                            }
                          }
                        }}
                        className="btn-red"
                      >
                        Remove Selected ({selectedGroupItems.length})
                      </button>
                    )}
                    <button 
                      onClick={async () => {
                        if (confirm('Are you sure you want to delete this group?')) {
                          try {
                            await groupsAPI.delete(selectedGroup);
                            setSelectedGroup(null);
                            await loadData();
                            alert('Group deleted successfully!');
                          } catch (error: any) {
                            alert('Failed to delete group: ' + (error.response?.data?.error || error.message));
                          }
                        }
                      }}
                      className="btn-red"
                    >
                      Delete Group
                    </button>
                  </div>
                </div>
                {(() => {
                  const group = groups.find(g => g.id === selectedGroup);
                  if (!group) return null;
                  return (
                    <div>
                      <div style={{marginBottom: '1rem'}}>
                        <strong>Name:</strong> {group.name}<br/>
                        <strong>Location:</strong> {group.location}<br/>
                        <strong>Total Items:</strong> {group.GroupItems?.length || 0}
                      </div>
                      
                      <h4>Items in this group:</h4>
                      <div className="inventory-grid" style={{marginTop: '1rem'}}>
                        {group.GroupItems?.map(groupItem => {
                          const item = groupItem.MedicalItem;
                          if (!item) return null;
                          const company = COMPANIES.find(c => c.value === item.company_prefix);
                          const itemType = ITEM_TYPES.find(t => t.value === item.item_name);
                          const isSelected = selectedGroupItems.includes(item.id);
                          
                          return (
                            <div 
                              key={item.id} 
                              className={`inventory-item-box ${isSelected ? 'selected' : ''} selectable`}
                              onClick={() => {
                                if (isSelected) {
                                  setSelectedGroupItems(prev => prev.filter(id => id !== item.id));
                                } else {
                                  setSelectedGroupItems(prev => [...prev, item.id]);
                                }
                              }}
                            >
                              <div className="item-header">
                                <div className="item-id">{item.id}</div>
                                {isSelected && (
                                  <div className="selection-indicator">✓</div>
                                )}
                              </div>
                              
                              <div className="item-details">
                                <div className="item-company">{company?.label || item.company_prefix}</div>
                                <div className="item-type">{itemType?.label || item.item_name}</div>
                              </div>
                              
                              <div className="item-status">
                                <span className={`status ${item.sterilized ? 'sterilized' : 'not-sterilized'}`}>
                                  {item.sterilized ? '✓ Sterilized' : '✗ Not Sterilized'}
                                </span>
                                <span className="location">{item.location}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
            
            {groups.length === 0 && (
              <div className="empty-state">
                <p>No groups created yet.</p>
              </div>
            )}
          </div>
        )}





        {activeTab === 'storage-forwarding' && scannedGroupId && user?.role === 'storage' && (
          <div>
            <div className="tab-header">
              <h2>Storage Forwarding</h2>
              <button onClick={() => {
                setScannedGroupId(null);
                setActiveTab('inventory');
              }} className="btn-gray">
                Back to Inventory
              </button>
            </div>
            
            {(() => {
              const group = groups.find(g => g.id === scannedGroupId);
              const pendingRequest = forwardingRequests.find(r => r.group_id === scannedGroupId && r.status === 'pending' && r.to_location === 'Storage');
              const hasAcceptedStorage = group?.location === 'Storage';
              
              if (!group) return <p>Group not found</p>;
              
              return (
                <div>
                  <div style={{marginBottom: '2rem', padding: '1.5rem', background: 'var(--card)', borderRadius: '0.5rem'}}>
                    <h3>Group: {group.name}</h3>
                    <p>Items: {group.GroupItems?.length || 0}</p>
                    <p>Location: {group.location}</p>
                  </div>
                  
                  <div style={{marginBottom: '2rem', padding: '1.5rem', background: 'var(--card)', borderRadius: '0.5rem'}}>
                    <h3>Detailed Item Information</h3>
                    <div className="inventory-grid" style={{marginTop: '1rem'}}>
                      {group.GroupItems?.map(groupItem => {
                        const item = groupItem.MedicalItem;
                        if (!item) return null;
                        const company = COMPANIES.find(c => c.value === item.company_prefix);
                        const itemType = ITEM_TYPES.find(t => t.value === item.item_name);
                        
                        return (
                          <div key={item.id} className="inventory-item-box">
                            <div className="item-header">
                              <div className="item-id">{item.id}</div>
                            </div>
                            
                            <div className="item-details">
                              <div className="item-company">{company?.label || item.company_prefix}</div>
                              <div className="item-type">{itemType?.label || item.item_name}</div>
                            </div>
                            
                            <div className="item-status">
                              <span className={`status ${item.sterilized ? 'sterilized' : 'not-sterilized'}`}>
                                {item.sterilized ? '✓ Sterilized' : '✗ Not Sterilized'}
                              </span>
                              <span className="location">{item.location}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  
                  {pendingRequest && (
                    <div style={{display: 'flex', gap: '1rem', marginBottom: '2rem'}}>
                      <button
                        onClick={async () => {
                          await handleAcceptForwarding(pendingRequest.id);
                          // Reload data to update the UI
                          await loadData();
                        }}
                        className="btn-green"
                      >
                        Accept Forwarding
                      </button>
                      <button
                        onClick={() => {
                          const reason = prompt('Reason for rejection (optional):');
                          handleRejectForwarding(pendingRequest.id, reason || undefined);
                        }}
                        className="btn-red"
                      >
                        Send Back
                      </button>
                    </div>
                  )}
                  
                  {hasAcceptedStorage && (() => {
                    const hasPendingForward = forwardingRequests.find(r => r.group_id === scannedGroupId && r.status === 'pending' && r.from_location === 'Storage');
                    if (hasPendingForward) {
                      return <div style={{
                        position: 'fixed',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        padding: '2rem',
                        background: '#fbbf24',
                        borderRadius: '1rem',
                        color: '#000',
                        fontSize: '1.2rem',
                        fontWeight: 'bold',
                        textAlign: 'center',
                        boxShadow: '0 10px 25px rgba(0,0,0,0.3)',
                        zIndex: 1000,
                        border: '3px solid #f59e0b'
                      }}>
                        ⚠️ Group Already Forwarded to {hasPendingForward.to_location}<br/>
                        <span style={{fontSize: '1rem', fontWeight: 'normal'}}>Waiting for acceptance from destination</span>
                      </div>;
                    }
                    return (
                      <div style={{display: 'flex', gap: '1rem', marginTop: '2rem', justifyContent: 'space-between'}}>
                        <div>
                          <SurgeryRoomSelector onSelect={setSelectedRoom} selectedRoom={selectedRoom} />
                        </div>
                        <button
                          onClick={() => handleForwardGroup(scannedGroupId, selectedRoom)}
                          disabled={!selectedRoom}
                          className="btn-purple"
                        >
                          Forward to {selectedRoom || 'Select Room'}
                        </button>
                      </div>
                    );
                  })()}
                </div>
              );
            })()}
          </div>
        )}

        {activeTab === 'surgery-processing' && scannedGroupId && user?.role === 'surgery' && (
          <div>
            <div className="tab-header">
              <h2>Surgery Processing</h2>
              <button onClick={() => {
                setScannedGroupId(null);
                setActiveTab('inventory');
              }} className="btn-gray">
                Back to Inventory
              </button>
            </div>
            
            {(() => {
              const group = groups.find(g => g.id === scannedGroupId);
              if (!group) return <p>Group not found</p>;
              
              const pendingRequest = forwardingRequests.find(r => r.group_id === scannedGroupId && r.status === 'pending' && r.to_location === selectedRoom);
              const hasAcceptedSurgery = group?.location === selectedRoom && !pendingRequest;
              
              return (
                <div>
                  <div style={{marginBottom: '2rem', padding: '1.5rem', background: 'var(--card)', borderRadius: '0.5rem'}}>
                    <h3>Group: {group.name}</h3>
                    <p>Items: {group.GroupItems?.length || 0}</p>
                    <p>Location: {group.location}</p>
                  </div>
                  
                  <div style={{marginBottom: '2rem', padding: '1.5rem', background: 'var(--card)', borderRadius: '0.5rem'}}>
                    <h3>Detailed Item Information</h3>
                    <div className="inventory-grid" style={{marginTop: '1rem'}}>
                      {group.GroupItems?.map(groupItem => {
                        const item = groupItem.MedicalItem;
                        if (!item) return null;
                        const company = COMPANIES.find(c => c.value === item.company_prefix);
                        const itemType = ITEM_TYPES.find(t => t.value === item.item_name);
                        
                        return (
                          <div key={item.id} className="inventory-item-box">
                            <div className="item-header">
                              <div className="item-id">{item.id}</div>
                            </div>
                            
                            <div className="item-details">
                              <div className="item-company">{company?.label || item.company_prefix}</div>
                              <div className="item-type">{itemType?.label || item.item_name}</div>
                            </div>
                            
                            <div className="item-status">
                              <span className={`status ${item.sterilized ? 'sterilized' : 'not-sterilized'}`}>
                                {item.sterilized ? '✓ Sterilized' : '✗ Not Sterilized'}
                              </span>
                              <span className="location">{item.location}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  
                  {pendingRequest && (
                    <div style={{marginBottom: '2rem'}}>
                      <h3>Forwarding Request</h3>
                      <div style={{display: 'flex', gap: '1rem'}}>
                        <button
                          onClick={async () => {
                            await handleAcceptForwarding(pendingRequest.id);
                            await loadData();
                          }}
                          className="btn-green"
                        >
                          Accept Forwarding
                        </button>
                        <button
                          onClick={() => {
                            const reason = prompt('Reason for rejection (optional):');
                            handleRejectForwarding(pendingRequest.id, reason || undefined);
                          }}
                          className="btn-red"
                        >
                          Send Back
                        </button>
                      </div>
                    </div>
                  )}
                  
                  {hasAcceptedSurgery && (
                    <div style={{marginBottom: '2rem'}}>
                      <h3>Surgery Operations</h3>
                    </div>
                  )}
                  
                  <div style={{display: 'flex', gap: '1rem', marginTop: '2rem', justifyContent: 'space-between'}}>
                    <div style={{display: 'flex', gap: '1rem'}}>
                      {hasAcceptedSurgery && (
                        <button
                          onClick={async () => {
                            try {
                              const itemIds = group.GroupItems?.map(gi => gi.item_id) || [];
                              await itemsAPI.bulkUpdateStatus(itemIds, false, selectedRoom, 'marked_unsterilized');
                              await loadData();
                              alert('Items marked as non-sterilized');
                            } catch (error: any) {
                              alert('Failed to mark items: ' + (error.response?.data?.error || error.message));
                            }
                          }}
                          className="btn-red"
                        >
                          Mark Items as Non-Sterilized
                        </button>
                      )}
                    </div>
                    {hasAcceptedSurgery && (() => {
                      const hasPendingForward = forwardingRequests.find(r => r.group_id === scannedGroupId && r.status === 'pending' && r.from_location === selectedRoom);
                      if (hasPendingForward) {
                        return <div style={{
                          position: 'fixed',
                          top: '50%',
                          left: '50%',
                          transform: 'translate(-50%, -50%)',
                          padding: '2rem',
                          background: '#fbbf24',
                          borderRadius: '1rem',
                          color: '#000',
                          fontSize: '1.2rem',
                          fontWeight: 'bold',
                          textAlign: 'center',
                          boxShadow: '0 10px 25px rgba(0,0,0,0.3)',
                          zIndex: 1000,
                          border: '3px solid #f59e0b'
                        }}>
                          ⚠️ Group Already Forwarded to MSU<br/>
                          <span style={{fontSize: '1rem', fontWeight: 'normal'}}>Waiting for acceptance from MSU</span>
                        </div>;
                      }
                      return (
                        <button
                          onClick={async () => {
                            await handleForwardGroup(scannedGroupId, 'MSU');
                            setScannedGroupId(null);
                            setActiveTab('inventory');
                          }}
                          className="btn-purple"
                        >
                          Forward to MSU
                        </button>
                      );
                    })()}
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {activeTab === 'forwarding' && (
          <div>
            <div className="tab-header">
              <h2>Forwarding Requests</h2>
            </div>
            
            {forwardingRequests.map((request, index) => {
              const group = request.InstrumentGroup || groups.find(g => g.id === request.group_id);
              
              return (
                <div key={request.id} className="history-entry">
                  <div className="history-info">
                    <div style={{display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
                      <div style={{color: 'var(--text-muted)', fontSize: '0.9rem', fontWeight: 'bold'}}>{index + 1}.</div>
                      <div>
                        <div><strong>Group: {group?.name || 'Unknown'}</strong>
                          <span style={{fontSize: '0.8rem', color: '#d1d5db', marginLeft: '0.5rem'}}>
                            {group?.GroupItems?.length || 0} items
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="history-badges">
                      <div className={`action-badge action-${request.status}`}>
                        {request.status === 'pending' ? 'Pending' :
                         request.status === 'accepted' ? 'Accepted' :
                         request.status === 'rejected' ? `Rejected${request.rejection_reason ? `: ${request.rejection_reason}` : ''}` :
                         request.status}
                      </div>
                      <div className={`location-badge location-${request.from_location.toLowerCase()}`}>{request.from_location}</div>
                      <div className={`location-badge location-${request.to_location.toLowerCase()}`}>→ {request.to_location}</div>
                    </div>
                  </div>
                  <div className="history-time">
                    {new Date(request.createdAt || request.created_at).toLocaleString()}
                  </div>
                </div>
              );
            })}
            
            {forwardingRequests.length === 0 && (
              <div className="empty-state">
                <p>No forwarding requests found.</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'users' && <UserManagement />}

        {activeTab === 'history' && (
          <div>
            <div className="tab-header">
              <h2>Action History</h2>
              <div className="flex gap-2">
                <span style={{color: 'var(--text-muted)', fontSize: '0.875rem'}}>({filteredHistory.length} entries)</span>
                <button onClick={() => exportToPDF(filteredHistory, 'history')} className="btn-red">📄 PDF</button>
                <button onClick={() => exportToExcel(filteredHistory, 'history')} className="btn-green">📊 Excel</button>
              </div>
            </div>
            
            <div style={{marginBottom: '1rem', padding: '1rem', background: 'var(--card)', borderRadius: '0.5rem'}}>
              <div className="form-group">
                <label>Filter Type</label>
                <select value={historyFilterType} onChange={(e) => {
                  setHistoryFilterType(e.target.value);
                  setFilterItemId('');
                  setFilterAction('all');
                }}>
                  <option value="all">Show All</option>
                  <option value="item-id">Filter by Item ID</option>
                  <option value="action">Filter by Action</option>
                </select>
              </div>
              
              {historyFilterType === 'item-id' && (
                <div className="form-group">
                  <label>Item ID</label>
                  <input
                    type="text"
                    value={filterItemId}
                    onChange={(e) => setFilterItemId(e.target.value)}
                    placeholder="Enter item ID to filter"
                  />
                </div>
              )}
              
              {historyFilterType === 'action' && (
                <div className="form-group">
                  <label>Action</label>
                  <select value={filterAction} onChange={(e) => setFilterAction(e.target.value)}>
                    <option value="all">All Actions</option>
                    <option value="registered">Registered</option>
                    <option value="sterilization">Sterilization Process</option>
                    <option value="grouped">Grouped</option>
                    <option value="forwarding_requested">Forwarding Requested</option>
                    <option value="forwarded">Forwarded</option>
                    <option value="accepted">Accepted</option>
                    <option value="rejected">Rejected</option>
                    <option value="used">Used</option>
                    <option value="removed_from_inventory">Removed from Inventory</option>
                    <option value="disbanded">Disbanded</option>
                    <option value="moved">Moved</option>
                  </select>
                </div>
              )}
              
              {historyFilterType === 'action' && filterAction === 'sterilization' && (
                <div className="form-group">
                  <label>Sterilization Process</label>
                  <select value={filterAction} onChange={(e) => setFilterAction(e.target.value)}>
                    <option value="sterilization">All Sterilization Process</option>
                    <option value="step_by_hand">By Hand</option>
                    <option value="step_washing">Washing</option>
                    <option value="step_steam_sterilization">Steam Sterilization</option>
                    <option value="step_cooling">Cooling</option>
                    <option value="step_finished">Finished</option>
                    <option value="marked_unsterilized">Marked Unsterilized</option>
                    <option value="sterilization_completed">Sterilization Completed</option>
                  </select>
                </div>
              )}
            </div>
            
            {filteredHistory.map((entry, index) => {
              const company = COMPANIES.find(c => c.value === entry.company_prefix);
              const itemType = ITEM_TYPES.find(t => t.value === entry.item_name);
              
              return (
                <div key={entry.id} className="history-entry">
                  <div className="history-info">
                    <div style={{display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
                      <div style={{color: 'var(--text-muted)', fontSize: '0.9rem', fontWeight: 'bold'}}>{index + 1}.</div>
                      <div>
                        <div><strong>{entry.item_id}</strong>
                          <span style={{fontSize: '0.8rem', color: '#d1d5db', marginLeft: '0.5rem'}}>
                            {company?.label.split(' (')[0] || entry.company_prefix} - {itemType?.label.split(' (')[0] || entry.item_name}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="history-badges">
                      <div className={`action-badge action-${entry.action}`}>
                        {entry.action === 'removed_from_inventory' ? 'Removed from inventory' : 
                         entry.action === 'marked_unsterilized' ? 'Marked Unsterilized' :
                         entry.action === 'sterilization_completed' ? 'Sterilization Completed' :
                         entry.action === 'step_by_hand' ? 'By Hand' :
                         entry.action === 'step_washing' ? 'Washing' :
                         entry.action === 'step_steam_sterilization' ? 'Steam Sterilization' :
                         entry.action === 'step_cooling' ? 'Cooling' :
                         entry.action === 'step_finished' ? 'Finished' :
                         entry.action === 'forwarding_requested' ? 'Forwarding Requested' :
                         entry.action.charAt(0).toUpperCase() + entry.action.slice(1).replace('_', ' ')}
                      </div>
                      {entry.action !== 'removed_from_inventory' && (
                        <div className={`location-badge location-${(entry.to_location || entry.from_location || '').toLowerCase()}`}>{entry.to_location || entry.from_location}</div>
                      )}
                    </div>
                  </div>
                  <div className="history-time">
                    {new Date(entry.timestamp).toLocaleString()}
                  </div>
                </div>
              );
            })}
            
            {filteredHistory.length === 0 && (
              <div className="empty-state">
                <p>No history entries found matching the current filters.</p>
              </div>
            )}
          </div>
        )}
      </main>

      {showQrScanner && (
        <QrCodeScanner
          onScanSuccess={handleQrScan}
          onClose={() => setShowQrScanner(false)}
        />
      )}

      {loading && <div className="loading-overlay">Loading...</div>}
    </div>
  );
}

export default App;
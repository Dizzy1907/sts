import React, { useState, useEffect, useCallback, useMemo, lazy, Suspense } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import AuthLogin from './components/AuthLogin';
import SurgeryRoomSelector from './components/SurgeryRoomSelector';
import SterilizationTab from './components/SterilizationTab';

// Lazy loaded components
const QrCodeScanner = lazy(() => import('./components/QrCodeScanner'));
const UserManagement = lazy(() => import('./components/UserManagement'));
import { itemsAPI, groupsAPI, historyAPI, forwardingAPI, authAPI, storageAPI } from './services/api';
import { useOptimizedData } from './hooks/useOptimizedData';
import { useDebounce } from './hooks/useDebounce';
import { useBackgroundSync } from './hooks/useBackgroundSync';
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
  const [activeTab, setActiveTab] = useState(() => localStorage.getItem('activeTab') || 'inventory');
  const [scannedGroupId, setScannedGroupId] = useState<string | null>(null);
  const [items, setItems] = useState<MedicalItem[]>([]);
  const [groups, setGroups] = useState<InstrumentGroup[]>([]);
  const [history, setHistory] = useState<ActionHistory[]>([]);
  const [historyPagination, setHistoryPagination] = useState({ currentPage: 1, pageSize: 50, totalItems: 0, totalPages: 0 });
  const [historyCurrentPage, setHistoryCurrentPage] = useState(1);
  const [inventoryPagination, setInventoryPagination] = useState({ currentPage: 1, pageSize: 100, totalItems: 0, totalPages: 0 });
  const [inventoryCurrentPage, setInventoryCurrentPage] = useState(1);
  
  const dataLoader = useOptimizedData(user);


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
  const [availableItems, setAvailableItems] = useState<MedicalItem[]>([]);
  const [availableItemsPagination, setAvailableItemsPagination] = useState({ currentPage: 1, pageSize: 50, totalItems: 0, totalPages: 0 });
  const [availableItemsCurrentPage, setAvailableItemsCurrentPage] = useState(1);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);

  const [showSurgeryRoomSelector, setShowSurgeryRoomSelector] = useState(false);

  // Filter states
  const [filterBrand, setFilterBrand] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterLocation, setFilterLocation] = useState('all');
  const [filterSurgeryRoom, setFilterSurgeryRoom] = useState('all');
  const [searchText, setSearchText] = useState('');

  const [filterItemId, setFilterItemId] = useState('');
  const [filterAction, setFilterAction] = useState('all');
  const [historyFilterType, setHistoryFilterType] = useState('all');
  const [filterUserRole, setFilterUserRole] = useState('all');
  const [filterUserId, setFilterUserId] = useState('all');
  
  // Debounced search
  const debouncedSearch = useDebounce(searchText, 300);
  const debouncedItemId = useDebounce(filterItemId, 500);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [storagePosition, setStoragePosition] = useState({ letter: '', number: '' });
  const [storedItems, setStoredItems] = useState<any[]>([]);
  const [storageFilterLetter, setStorageFilterLetter] = useState('all');
  const [storageFilterNumber, setStorageFilterNumber] = useState('all');

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'head_admin': return '#8b5cf6';
      case 'admin': return '#e74c3c';
      case 'msu': return '#3498db';
      case 'storage': return '#f39c12';
      case 'surgery': return '#27ae60';
      default: return '#95a5a6';
    }
  };

  const getItemStatus = (item: MedicalItem) => {
    const status = item.status || 'Not Sterilized';
    // Map status values consistently with backend
    if (status === 'Finished' || status === 'step_finished') return 'Finished';
    if (status === 'step_by_hand' || status === 'Washing by Hand') return 'Washing by Hand';
    if (status === 'step_washing' || status === 'Automatic Washing') return 'Automatic Washing';
    if (status === 'step_steam_sterilization' || status === 'Steam Sterilization') return 'Steam Sterilization';
    if (status === 'step_cooling' || status === 'Cooling') return 'Cooling';
    if (status === 'marked_unsterilized' || status === 'Not Sterilized') return 'Not Sterilized';
    return status;
  };

  useEffect(() => {
    const token = sessionStorage.getItem('token');
    const userData = sessionStorage.getItem('user');
    if (token && userData) setUser(JSON.parse(userData));
  }, []);

  const loadData = useCallback(async () => {
    if (!user) return;
    
    try {
      // Load only essential data for current tab
      if (activeTab === 'groups' || activeTab === 'forwarding' || scannedGroupId) {
        const groupsData = await dataLoader.loadGroups();
        setGroups(Array.isArray(groupsData) ? groupsData : []);
      }
      
      if (activeTab === 'forwarding' || ['storage', 'surgery', 'msu'].includes(user.role)) {
        const forwardingData = activeTab === 'forwarding' 
          ? await forwardingAPI.getAll()
          : await dataLoader.loadForwarding();
        const forwardingArray = (forwardingData as any)?.data || forwardingData || [];
        setForwardingRequests(Array.isArray(forwardingArray) ? forwardingArray : []);
      }
      
      // Load admin-specific data only when needed
      if (user.role === 'admin' && (activeTab === 'users' || activeTab === 'storization')) {
        if (activeTab === 'users' && allUsers.length === 0) {
          const usersRes = await authAPI.getUsers();
          setAllUsers(usersRes?.data || []);
        }
        if (activeTab === 'storization' && storedItems.length === 0) {
          const storageRes = await storageAPI.getAll();
          setStoredItems(storageRes?.data || []);
        }
      }
      
      // Load storization data for storage personnel
      if (user.role === 'storage' && activeTab === 'storization' && storedItems.length === 0) {
        const storageRes = await storageAPI.getAll();
        setStoredItems(storageRes?.data || []);
      }
    } catch (error) {
      console.error('Failed to load data:', error);
    }
  }, [user, activeTab, scannedGroupId, dataLoader]);
  
  const loadItemsPage = useCallback(async (page: number = 1, forceRefresh = false) => {
    try {
      const filters = {
        company: filterBrand !== 'all' ? filterBrand : undefined,
        itemType: filterType !== 'all' ? filterType : undefined,
        location: filterLocation !== 'all' ? (filterLocation === 'Surgery Room' && filterSurgeryRoom !== 'all' ? filterSurgeryRoom : filterLocation) : undefined,
        search: debouncedSearch || undefined,
        userRole: user?.role,
        _t: forceRefresh ? Date.now() : undefined // Cache buster
      };
      const itemsRes = await itemsAPI.getAll(page, 100, filters);
      if (itemsRes.data.data) {
        setItems(itemsRes.data.data);
        setInventoryPagination(itemsRes.data.pagination);
        setInventoryCurrentPage(page);
      } else {
        const rawItems = Array.isArray(itemsRes.data) ? itemsRes.data : [];
        setItems(rawItems);
      }
    } catch (error) {
      console.error('Failed to load items:', error);
    }
  }, [filterBrand, filterType, filterLocation, filterSurgeryRoom, debouncedSearch, user?.role]);

  // Auto-reload items when filters change
  useEffect(() => {
    if (user) {
      loadItemsPage(1);
    }
  }, [filterBrand, filterType, filterLocation, filterSurgeryRoom, debouncedSearch, loadItemsPage]);


  

  


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
        await loadItemsPage(1);
      }
      
      // Refresh history to show registration
      if (activeTab === 'history' || user?.role !== 'surgery') {
        await loadHistoryPage(1);
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
      window.location.reload();
    } catch (error: any) {
      alert(`Failed to accept forwarding: ${error.response?.data?.error || error.message}`);
    }
  };

  const handleRejectForwarding = async (requestId: string, reason?: string) => {
    try {
      await forwardingAPI.reject(requestId, reason);
      await loadData();
      alert('Forwarding request rejected!');
      window.location.reload();
    } catch (error: any) {
      alert(`Failed to reject forwarding: ${error.response?.data?.error || error.message}`);
    }
  };



  const handleCreateGroup = async () => {
    if (!groupName || selectedGroupItems.length === 0) {
      alert('Please enter a group name and select items');
      return;
    }
    
    setLoading(true);
    try {
      await groupsAPI.create(groupName, selectedGroupItems);
      setGroupName('');
      setSelectedGroupItems([]);
      await loadData();
      // Refresh history to show group creation
      if (activeTab === 'history' || user?.role !== 'surgery') {
        await loadHistoryPage(1);
      }
      alert('Group created successfully!');
      window.location.reload();
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
      const deletePromises = selectedInventoryItems.map(async (id) => {
        try {
          const result = await itemsAPI.delete(id);
          return result;
        } catch (error: any) {
          console.error('Delete error for', id, ':', error);
          throw error;
        }
      });
      await Promise.all(deletePromises);
      setSelectedInventoryItems([]);
      await Promise.all([
        loadItemsPage(inventoryCurrentPage),
        loadHistoryPage(historyCurrentPage)
      ]);
      alert(`${selectedInventoryItems.length} item(s) removed from inventory successfully`);
    } catch (error: any) {
      alert(`Failed to remove items: ${error.response?.data?.error || error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectAllInventoryItems = async () => {
    if (selectedInventoryItems.length > 0) {
      setSelectedInventoryItems([]);
    } else {
      try {
        const filters = {
          company: filterBrand !== 'all' ? filterBrand : undefined,
          itemType: filterType !== 'all' ? filterType : undefined,
          location: filterLocation !== 'all' ? (filterLocation === 'Surgery Room' && filterSurgeryRoom !== 'all' ? filterSurgeryRoom : filterLocation) : undefined,
          search: debouncedSearch || undefined,
          userRole: user?.role
        };
        const allItemsRes = await itemsAPI.getAll(1, 10000, filters);
        const allFilteredItems = allItemsRes.data.data || allItemsRes.data;
        setSelectedInventoryItems(allFilteredItems.map((item: any) => item.id));
      } catch (error) {
        console.error('Failed to load all filtered items:', error);
      }
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
          setScannedGroupId(groupId);
          setActiveTab('storage-forwarding');
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
            if (user?.role === 'msu') {
              if (item.data.location === 'MSU') {
                setScannedGroupId(decodedText);
                setActiveTab('item-sterilization');
              } else {
                alert('This item is not at MSU location. Current location: ' + item.data.location);
              }
            } else if (user?.role === 'storage') {
              if (item.data.location === 'Storage') {
                setScannedGroupId(decodedText);
                setActiveTab('storage-forwarding');
              } else {
                alert('This item is not at Storage location. Current location: ' + item.data.location);
              }
            } else {
              setActiveTab('inventory');
            }
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

  const exportToExcel = async (_data: any[], filename: string) => {
    try {
      const { exportAPI } = await import('./services/api');
      const response = filename === 'history' 
        ? await exportAPI.history({
            action: filterAction !== 'all' ? filterAction : undefined,
            itemId: filterItemId || undefined,
            userRole: filterUserRole !== 'all' ? filterUserRole : undefined,
            userId: filterUserId !== 'all' ? filterUserId : undefined
          })
        : await exportAPI.inventory();
      
      const ws = XLSX.utils.json_to_sheet(response.data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Data');
      
      // Add filters info
      const filters = filename === 'history' 
        ? `Filters: Type=${historyFilterType}, Action=${filterAction}, ItemID=${filterItemId}, UserRole=${filterUserRole}, UserID=${filterUserId}`
        : `Filters: Company=${filterBrand}, Type=${filterType}, Search=${searchText}`;
      const timestamp = new Date().toLocaleString();
      const exportFilename = `${filename}_${filters.replace(/[^a-zA-Z0-9]/g, '_')}_${timestamp.replace(/[^a-zA-Z0-9]/g, '_')}.xlsx`;
      
      XLSX.writeFile(wb, exportFilename);
    } catch (error: any) {
      alert('Failed to export data: ' + (error.response?.data?.error || error.message));
    }
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

  const exportToPDF = async (_data: any[], filename: string) => {
    try {
      const { exportAPI } = await import('./services/api');
      const response = filename === 'history' 
        ? await exportAPI.history({
            action: filterAction !== 'all' ? filterAction : undefined,
            itemId: filterItemId || undefined,
            userRole: filterUserRole !== 'all' ? filterUserRole : undefined,
            userId: filterUserId !== 'all' ? filterUserId : undefined
          })
        : await exportAPI.inventory();
      const exportData = response.data;
      
      const doc = new jsPDF();
      doc.setFontSize(16);
      doc.text(`${filename} Report`, 20, 20);
      
      // Add filters info
      doc.setFontSize(8);
      const filters = filename === 'history' 
        ? `Filters: Type=${historyFilterType}, Action=${filterAction}, ItemID=${filterItemId}, UserRole=${filterUserRole}, UserID=${filterUserId}`
        : `Filters: Company=${filterBrand}, Type=${filterType}, Search=${searchText}`;
      doc.text(`${filters} | Exported: ${new Date().toLocaleString()}`, 20, 30);
      
      doc.setFontSize(10);
      let y = 45;
      
      exportData.forEach((entry: any) => {
        if (y > 260) {
          doc.addPage();
          y = 20;
        }
        
        if (filename === 'history') {
          doc.text(`${entry['No.']}. ${entry['Item ID']}`, 20, y);
          doc.text(`   ${entry['Company']} - ${entry['Item Type']}`, 20, y + 10);
          doc.text(`   ${entry['Action']}`, 20, y + 20);
          doc.text(`   ${entry['Date & Time']}`, 20, y + 30);
        } else {
          doc.text(`${entry['No.']}. ${entry['Item ID']}`, 20, y);
          doc.text(`   ${entry['Company']} - ${entry['Item Type']}`, 20, y + 10);
          doc.text(`   Status: ${entry['Status']}`, 20, y + 20);
          doc.text(`   Location: ${entry['Location']}`, 20, y + 30);
        }
        y += 45;
      });
      
      doc.save(`${filename}.pdf`);
    } catch (error: any) {
      alert('Failed to export PDF: ' + (error.response?.data?.error || error.message));
    }
  };

  const getVisibleTabs = () => {
    const tabs = ['inventory'];
    if (user?.role === 'head_admin' || user?.role === 'admin') {
      tabs.push('register', 'groups', 'users', 'history', 'forwarding', 'storization');
    } else {
      if (user?.role === 'msu') tabs.push('register', 'groups', 'history', 'forwarding');
      if (user?.role === 'storage') tabs.push('groups', 'history', 'forwarding', 'storization');
      if (user?.role === 'surgery') tabs.push('groups', 'forwarding');
    }
    return tabs;
  };

  const filteredItems = useMemo(() => items, [items]);
  const filteredHistory = useMemo(() => history, [history]);
  
  // Background sync
  useBackgroundSync(dataLoader, user);

  // Load history with pagination
  const loadHistoryPage = async (page: number, filters?: { action?: string; itemId?: string }) => {
    try {
      const params = { 
        page, 
        pageSize: 50, 
        ...filters,
        userRole: filterUserRole !== 'all' ? filterUserRole : undefined,
        userId: filterUserId !== 'all' ? filterUserId : undefined
      };
      const historyRes = await historyAPI.getAll(params);
      setHistory(historyRes.data.data);
      setHistoryPagination(historyRes.data.pagination);
      setHistoryCurrentPage(page);
    } catch (error: any) {
      console.error('Failed to load history:', error);
    }
  };

  // Load full history when filtering by item ID
  const loadFullHistoryForItem = async (itemId: string) => {
    try {
      const fullHistoryRes = await historyAPI.getAll({ itemId: itemId, limit: 1000 });
      const historyData = fullHistoryRes.data.data || fullHistoryRes.data;
      setHistory(historyData);
      if (fullHistoryRes.data.pagination) {
        setHistoryPagination(fullHistoryRes.data.pagination);
      }
    } catch (error: any) {
      console.error('Failed to load full history:', error);
    }
  };

  // Auto-load history when filters change
  useEffect(() => {
    if (historyFilterType === 'item-id' && debouncedItemId && debouncedItemId.length > 5) {
      loadFullHistoryForItem(debouncedItemId);
    } else if (historyFilterType === 'action' && filterAction !== 'all') {
      loadHistoryPage(1, { action: filterAction });
    } else if (historyFilterType === 'action' && filterAction === 'all') {
      loadHistoryPage(1);
    } else if (historyFilterType === 'all') {
      loadHistoryPage(1);
    }
  }, [historyFilterType, debouncedItemId, filterAction, filterUserRole, filterUserId]);

  // Load available items for group creation with pagination
  const loadAvailableItemsPage = useCallback(async (page: number = 1) => {
    if (activeTab !== 'groups-create') return;
    
    setLoading(true);
    try {
      const filters = {
        brand: filterBrand !== 'all' ? filterBrand : undefined,
        type: filterType !== 'all' ? filterType : undefined,
        status: filterStatus !== 'all' ? filterStatus : undefined
      };
      const response = await groupsAPI.getAvailableItems(user?.role || 'admin', filters);
      
      let allItems = response.data || [];
      if (debouncedSearch) {
        allItems = allItems.filter((item: any) => 
          item.id.toLowerCase().includes(debouncedSearch.toLowerCase())
        );
      }
      
      const pageSize = 50;
      const startIndex = (page - 1) * pageSize;
      const endIndex = startIndex + pageSize;
      const paginatedItems = allItems.slice(startIndex, endIndex);
      
      setAvailableItems(paginatedItems);
      setAvailableItemsPagination({
        currentPage: page,
        pageSize,
        totalItems: allItems.length,
        totalPages: Math.ceil(allItems.length / pageSize)
      });
      setAvailableItemsCurrentPage(page);
    } catch (error: any) {
      console.error('Failed to load available items:', error);
      setAvailableItems([]);
    } finally {
      setLoading(false);
    }
  }, [activeTab, filterBrand, filterType, filterStatus, debouncedSearch, user?.role]);

  useEffect(() => {
    if (activeTab === 'groups-create') {
      loadAvailableItemsPage(1);
    }
  }, [loadAvailableItemsPage]);

  // Reset to page 1 when search changes
  useEffect(() => {
    if (activeTab === 'groups-create' && debouncedSearch !== searchText) {
      loadAvailableItemsPage(1);
    }
  }, [debouncedSearch, activeTab, loadAvailableItemsPage]);

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
          {user.role !== 'admin' && user.role !== 'head_admin' && (
            <button onClick={() => setShowQrScanner(true)} className="btn-purple">
              📱 Scan QR
            </button>
          )}
        </div>
        <div style={{position: 'absolute', left: '50%', transform: 'translateX(-50%)', textAlign: 'center'}}>
          <h1><span className="highlight">MSU</span> System</h1>
          <div style={{fontSize: '0.875rem', fontWeight: 'normal', color: getRoleColor(user.role), marginTop: '0.25rem'}}>
            ({user.role === 'head_admin' ? 'Head Admin' :
              user.role === 'admin' ? 'Admin' : 
              user.role === 'msu' ? 'MSU Personnel' : 
              user.role === 'storage' ? 'Storage Personnel' : 'Surgery Personnel'})
          </div>
        </div>
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
            {tab === 'sterilization' ? 'Sterilization Process' : 
             tab === 'storization' ? 'Storage' : 
             tab === 'register' ? 'Registration' : 
             tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </nav>

      <main className="app-main">
        {activeTab === 'inventory' && (
          <div>
            <div className="tab-header">
              <h2>Inventory ({inventoryPagination.totalItems} total, {filteredItems.length} shown)</h2>
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
              <div style={{display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem'}}>
                <div className="form-group">
                  <label>Search Items</label>
                  <input
                    type="text"
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    placeholder="Search by ID, company, or type..."
                  />
                </div>
                <div className="form-group">
                  <label>Company</label>
                  <select value={filterBrand} onChange={(e) => {
                    setFilterBrand(e.target.value);
                    setInventoryCurrentPage(1);
                  }}>
                    <option value="all">All Companies</option>
                    {COMPANIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Item Type</label>
                  <select value={filterType} onChange={(e) => {
                    setFilterType(e.target.value);
                    setInventoryCurrentPage(1);
                  }}>
                    <option value="all">All Types</option>
                    {ITEM_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Location</label>
                  <select value={filterLocation} onChange={(e) => {
                    setFilterLocation(e.target.value);
                    setFilterSurgeryRoom('all');
                    setInventoryCurrentPage(1);
                  }}>
                    <option value="all">All Locations</option>
                    <option value="MSU">MSU</option>
                    <option value="Storage">Storage</option>
                    <option value="Surgery Room">Surgery Room</option>
                  </select>
                </div>
              </div>
              {filterLocation === 'Surgery Room' && (
                <div style={{marginTop: '1rem'}}>
                  <div className="form-group">
                    <label>Surgery Room</label>
                    <select value={filterSurgeryRoom} onChange={(e) => {
                      setFilterSurgeryRoom(e.target.value);
                      setInventoryCurrentPage(1);
                    }}>
                      <option value="all">All Surgery Rooms</option>
                      <option value="Surgery Room 1">Surgery Room 1</option>
                      <option value="Surgery Room 2">Surgery Room 2</option>
                      <option value="Surgery Room 3">Surgery Room 3</option>
                      <option value="Surgery Room 4">Surgery Room 4</option>
                      <option value="Surgery Room 5">Surgery Room 5</option>
                    </select>
                  </div>
                </div>
              )}
            </div>
            
            {['admin', 'head_admin', 'msu'].includes(user?.role || '') && (
              <div className="inventory-controls">
                <button 
                  onClick={handleSelectAllInventoryItems}
                  className="btn-purple"
                >
                  {selectedInventoryItems.length > 0 ? 'Deselect All' : `Select All (${inventoryPagination.totalItems})`}
                </button>
                <button 
                  onClick={() => {
                    const currentPageItemIds = items.map(item => item.id);
                    const allSelected = currentPageItemIds.every(id => selectedInventoryItems.includes(id));
                    if (allSelected) {
                      setSelectedInventoryItems(prev => prev.filter(id => !currentPageItemIds.includes(id)));
                    } else {
                      setSelectedInventoryItems(prev => [...new Set([...prev, ...currentPageItemIds])]);
                    }
                  }}
                  className="btn-blue"
                >
                  {items.every(item => selectedInventoryItems.includes(item.id)) ? 'Deselect Page' : `Select Page (${items.length})`}
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
            
            {/* Top Pagination - After Select All */}
            {inventoryPagination.totalPages > 1 && (
              <div style={{display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '1rem', marginBottom: '1rem', padding: '1rem', background: 'var(--card)', borderRadius: '0.5rem'}}>
                <button 
                  onClick={() => loadItemsPage(inventoryCurrentPage - 1)}
                  disabled={inventoryCurrentPage <= 1}
                  className="btn-gray"
                >
                  ← Previous
                </button>
                
                <div style={{display: 'flex', gap: '0.5rem', alignItems: 'center'}}>
                  {Array.from({ length: Math.min(5, inventoryPagination.totalPages) }, (_, i) => {
                    let pageNum;
                    if (inventoryPagination.totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (inventoryCurrentPage <= 3) {
                      pageNum = i + 1;
                    } else if (inventoryCurrentPage >= inventoryPagination.totalPages - 2) {
                      pageNum = inventoryPagination.totalPages - 4 + i;
                    } else {
                      pageNum = inventoryCurrentPage - 2 + i;
                    }
                    
                    return (
                      <button
                        key={pageNum}
                        onClick={() => loadItemsPage(pageNum)}
                        className={inventoryCurrentPage === pageNum ? 'btn-blue' : 'btn-gray'}
                        style={{minWidth: '40px'}}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>
                
                <button 
                  onClick={() => loadItemsPage(inventoryCurrentPage + 1)}
                  disabled={inventoryCurrentPage >= inventoryPagination.totalPages}
                  className="btn-gray"
                >
                  Next →
                </button>
                
                <div style={{display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
                  <span style={{color: 'var(--text-muted)', fontSize: '0.875rem'}}>Page:</span>
                  <input
                    type="number"
                    min="1"
                    max={inventoryPagination.totalPages}
                    style={{width: '60px', padding: '4px 8px', textAlign: 'center'}}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        const page = parseInt(e.currentTarget.value);
                        if (page >= 1 && page <= inventoryPagination.totalPages) {
                          loadItemsPage(page);
                          e.currentTarget.value = '';
                        }
                      }
                    }}
                    placeholder={inventoryCurrentPage.toString()}
                  />
                  <span style={{color: 'var(--text-muted)', fontSize: '0.875rem'}}>of {inventoryPagination.totalPages}</span>
                </div>
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
                    className={`inventory-item-box ${isSelected ? 'selected' : ''} ${['admin', 'head_admin', 'msu'].includes(user?.role || '') ? 'selectable' : ''}`}
                    onClick={() => ['admin', 'head_admin', 'msu'].includes(user?.role || '') && handleInventoryItemSelect(item.id)}
                  >
                    <div className="item-header">
                      <div className="item-id">{item.id}</div>
                      {['admin', 'head_admin', 'msu'].includes(user?.role || '') && isSelected && (
                        <div className="selection-indicator">✓</div>
                      )}
                    </div>
                    
                    <div className="item-details">
                      <div className="item-company">{company?.label || item.company_prefix}</div>
                      <div className="item-type">{itemType?.label || item.item_name}</div>
                    </div>
                    
                    <div className="item-status">
                      <span className={`status ${getItemStatus(item) === 'Finished' || getItemStatus(item) === 'Sterilized' ? 'sterilized' : 'not-sterilized'}`}>
                        {getItemStatus(item)}
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
            
            {/* Pagination Controls */}
            {inventoryPagination.totalPages > 1 && (
              <div style={{display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '1rem', margin: '2rem 0', padding: '1rem', background: 'var(--card)', borderRadius: '0.5rem'}}>
                <button 
                  onClick={() => loadItemsPage(inventoryCurrentPage - 1)}
                  disabled={inventoryCurrentPage <= 1}
                  className="btn-gray"
                >
                  ← Previous
                </button>
                
                <div style={{display: 'flex', gap: '0.5rem', alignItems: 'center'}}>
                  {Array.from({ length: Math.min(5, inventoryPagination.totalPages) }, (_, i) => {
                    let pageNum;
                    if (inventoryPagination.totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (inventoryCurrentPage <= 3) {
                      pageNum = i + 1;
                    } else if (inventoryCurrentPage >= inventoryPagination.totalPages - 2) {
                      pageNum = inventoryPagination.totalPages - 4 + i;
                    } else {
                      pageNum = inventoryCurrentPage - 2 + i;
                    }
                    
                    return (
                      <button
                        key={pageNum}
                        onClick={() => loadItemsPage(pageNum)}
                        className={inventoryCurrentPage === pageNum ? 'btn-blue' : 'btn-gray'}
                        style={{minWidth: '40px'}}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>
                
                <button 
                  onClick={() => loadItemsPage(inventoryCurrentPage + 1)}
                  disabled={inventoryCurrentPage >= inventoryPagination.totalPages}
                  className="btn-gray"
                >
                  Next →
                </button>
                
                <div style={{display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
                  <span style={{color: 'var(--text-muted)', fontSize: '0.875rem'}}>Page:</span>
                  <input
                    type="number"
                    min="1"
                    max={inventoryPagination.totalPages}
                    style={{width: '60px', padding: '4px 8px', textAlign: 'center'}}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        const page = parseInt(e.currentTarget.value);
                        if (page >= 1 && page <= inventoryPagination.totalPages) {
                          loadItemsPage(page);
                          e.currentTarget.value = '';
                        }
                      }
                    }}
                    placeholder={inventoryCurrentPage.toString()}
                  />
                  <span style={{color: 'var(--text-muted)', fontSize: '0.875rem'}}>of {inventoryPagination.totalPages}</span>
                </div>
              </div>
            )}
            
            {items.length === 0 ? (
              <div className="empty-state">
                <p>Loading items...</p>
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="empty-state">
                <p>No items found matching the current filters.</p>
              </div>
            ) : null}
          </div>
        )}

        {activeTab === 'register' && (
          <div>
            <form onSubmit={handleRegisterItems} style={{marginBottom: '1rem'}}>
              <div style={{display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1rem'}}>
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
                    value={quantity}
                    onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                    required
                  />
                </div>
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
                    <div className="item-id">{item.id}</div>
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
          <SterilizationTab
            user={user}
            scannedGroupId={scannedGroupId}
            onBack={() => {
              setScannedGroupId(null);
              setActiveTab('inventory');
            }}
            onRefresh={async () => {
              await loadItemsPage(inventoryCurrentPage, true);
            }}
          />
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
                disabled={selectedGroupItems.length === 0 || !groupName || loading}
                className="btn-green"
              >
                Create Group with {selectedGroupItems.length} Items
              </button>
            </div>
            
            <div style={{marginBottom: '1rem', padding: '1rem', background: 'var(--card)', borderRadius: '0.5rem'}}>
              <div style={{display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem'}}>
                <div className="form-group">
                  <label>Search by Item ID</label>
                  <input
                    type="text"
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    placeholder="Search by item ID..."
                  />
                </div>
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
                    <option value="Not Sterilized">Not Sterilized</option>
                    <option value="Washing by Hand">Washing by Hand</option>
                    <option value="Automatic Washing">Automatic Washing</option>
                    <option value="Steam Sterilization">Steam Sterilization</option>
                    <option value="Cooling">Cooling</option>
                    <option value="Finished">Finished</option>
                  </select>
                </div>
              </div>
            </div>
            
            {/* Pagination Controls */}
            {availableItemsPagination.totalPages > 1 && (
              <div style={{display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '1rem', marginBottom: '1rem', padding: '1rem', background: 'var(--card)', borderRadius: '0.5rem'}}>
                <button 
                  onClick={() => loadAvailableItemsPage(availableItemsCurrentPage - 1)}
                  disabled={availableItemsCurrentPage <= 1 || loading}
                  className="btn-gray"
                >
                  ← Previous
                </button>
                <span>Page {availableItemsCurrentPage} of {availableItemsPagination.totalPages} ({availableItemsPagination.totalItems} items)</span>
                <button 
                  onClick={() => loadAvailableItemsPage(availableItemsCurrentPage + 1)}
                  disabled={availableItemsCurrentPage >= availableItemsPagination.totalPages || loading}
                  className="btn-gray"
                >
                  Next →
                </button>
                <div style={{display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
                  <span style={{color: 'var(--text-muted)', fontSize: '0.875rem'}}>Page:</span>
                  <input
                    type="number"
                    min="1"
                    max={availableItemsPagination.totalPages}
                    style={{width: '60px', padding: '4px 8px', textAlign: 'center'}}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        const page = parseInt(e.currentTarget.value);
                        if (page >= 1 && page <= availableItemsPagination.totalPages) {
                          loadAvailableItemsPage(page);
                          e.currentTarget.value = '';
                        }
                      }
                    }}
                    placeholder={availableItemsCurrentPage.toString()}
                  />
                  <span style={{color: 'var(--text-muted)', fontSize: '0.875rem'}}>of {availableItemsPagination.totalPages}</span>
                </div>
              </div>
            )}
            
            {loading ? (
              <div className="empty-state">
                <p>Loading available items...</p>
              </div>
            ) : (
              <>
                <div className="inventory-grid">
                  {availableItems.map(item => {
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
                          <span className={`status ${getItemStatus(item) === 'Finished' || getItemStatus(item) === 'Sterilized' ? 'sterilized' : 'not-sterilized'}`}>
                            {getItemStatus(item)}
                          </span>
                          <span className="location">{item.location}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
                
                {availableItems.length === 0 && availableItemsPagination.totalItems === 0 && (
                  <div className="empty-state">
                    <p>No items available for grouping. Items must not be in existing groups and match the selected filters.</p>
                    <p style={{fontSize: '0.875rem', color: 'var(--text-muted)', marginTop: '0.5rem'}}>
                      Try adjusting the filters above or register new items first.
                    </p>
                  </div>
                )}
              </>
            )}
            
            {/* Bottom Pagination */}
            {availableItemsPagination.totalPages > 1 && (
              <div style={{display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '1rem', marginTop: '1rem', padding: '1rem', background: 'var(--card)', borderRadius: '0.5rem'}}>
                <button 
                  onClick={() => loadAvailableItemsPage(availableItemsCurrentPage - 1)}
                  disabled={availableItemsCurrentPage <= 1 || loading}
                  className="btn-gray"
                >
                  ← Previous
                </button>
                <span>Page {availableItemsCurrentPage} of {availableItemsPagination.totalPages}</span>
                <button 
                  onClick={() => loadAvailableItemsPage(availableItemsCurrentPage + 1)}
                  disabled={availableItemsCurrentPage >= availableItemsPagination.totalPages || loading}
                  className="btn-gray"
                >
                  Next →
                </button>
                <div style={{display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
                  <span style={{color: 'var(--text-muted)', fontSize: '0.875rem'}}>Page:</span>
                  <input
                    type="number"
                    min="1"
                    max={availableItemsPagination.totalPages}
                    style={{width: '60px', padding: '4px 8px', textAlign: 'center'}}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        const page = parseInt(e.currentTarget.value);
                        if (page >= 1 && page <= availableItemsPagination.totalPages) {
                          loadAvailableItemsPage(page);
                          e.currentTarget.value = '';
                        }
                      }
                    }}
                    placeholder={availableItemsCurrentPage.toString()}
                  />
                  <span style={{color: 'var(--text-muted)', fontSize: '0.875rem'}}>of {availableItemsPagination.totalPages}</span>
                </div>
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
                              
                              // Remove selected items from group_items table
                              for (const itemId of selectedGroupItems) {
                                await groupsAPI.removeItemFromGroup(selectedGroup, itemId);
                              }
                              
                              // If no items remain, delete the group
                              if (remainingItems.length === 0) {
                                await groupsAPI.delete(selectedGroup);
                                setSelectedGroup(null);
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
                            // Refresh history to show group deletion
                            if (user?.role !== 'surgery') {
                              await loadHistoryPage(1);
                            }
                            alert('Group deleted successfully!');
                            window.location.reload();
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
                      <div style={{marginBottom: '1rem', textAlign: 'left'}}>
                        <strong>Name:</strong> {group.name}<br/>
                        <strong>Location:</strong> {group.location}<br/>
                        <strong>Total Items:</strong> {group.GroupItems?.length || 0}
                      </div>
                      
                      <h4 style={{textAlign: 'left'}}>Items in this group:</h4>
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
                                <span className={`status ${getItemStatus(item) === 'Finished' || getItemStatus(item) === 'Sterilized' ? 'sterilized' : 'not-sterilized'}`}>
                                  {getItemStatus(item)}
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
                              <span className={`status ${getItemStatus(item) === 'Finished' || getItemStatus(item) === 'Sterilized' ? 'sterilized' : 'not-sterilized'}`}>
                                {getItemStatus(item)}
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
                      <div>
                        <div style={{marginBottom: '2rem', padding: '1.5rem', background: 'var(--card)', borderRadius: '0.5rem'}}>
                          <h3>Storage Position</h3>
                          <div style={{display: 'flex', gap: '1rem', alignItems: 'end'}}>
                            <div className="form-group">
                              <label>Letter</label>
                              <select value={storagePosition.letter} onChange={(e) => setStoragePosition(prev => ({...prev, letter: e.target.value}))}>
                                <option value="">Select</option>
                                {['A','B','C','D','E','F','G','H','I','J'].map(letter => (
                                  <option key={letter} value={letter}>{letter}</option>
                                ))}
                              </select>
                            </div>
                            <div className="form-group">
                              <label>Number</label>
                              <select value={storagePosition.number} onChange={(e) => setStoragePosition(prev => ({...prev, number: e.target.value}))}>
                                <option value="">Select</option>
                                {Array.from({length: 20}, (_, i) => i + 1).map(num => (
                                  <option key={num} value={num}>{num}</option>
                                ))}
                              </select>
                            </div>
                            <button
                              onClick={async () => {
                                if (!storagePosition.letter || !storagePosition.number) {
                                  alert('Please select both letter and number');
                                  return;
                                }
                                const position = `${storagePosition.letter}-${storagePosition.number}`;
                                try {
                                  await storageAPI.create(
                                    group ? group.id : scannedGroupId,
                                    group ? group.name : `Item ${scannedGroupId}`,
                                    group ? 'Group' : 'Item',
                                    position
                                  );
                                  const storageRes = await storageAPI.getAll();
                                  setStoredItems(storageRes?.data || []);
                                  alert(`${group ? 'Group' : 'Item'} stored at position ${position}`);
                                  setStoragePosition({ letter: '', number: '' });
                                } catch (error: any) {
                                  alert('Failed to store item: ' + (error.response?.data?.error || error.message));
                                }
                              }}
                              disabled={!storagePosition.letter || !storagePosition.number}
                              className="btn-green"
                            >
                              Store at {storagePosition.letter && storagePosition.number ? `${storagePosition.letter}-${storagePosition.number}` : 'Position'}
                            </button>
                          </div>
                        </div>
                        
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
              
              const pendingRequest = forwardingRequests.find(r => r.group_id === scannedGroupId && r.status === 'pending' && r.to_location.includes('Surgery'));
              const hasAcceptedSurgery = group?.location?.includes('Surgery') && !pendingRequest;
              
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
                              <span className={`status ${getItemStatus(item) === 'Finished' || getItemStatus(item) === 'Sterilized' ? 'sterilized' : 'not-sterilized'}`}>
                                {getItemStatus(item)}
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
                              await itemsAPI.bulkUpdateStatus(itemIds, group.location, 'marked_unsterilized');
                              
                              // Force refresh items
                              await loadItemsPage(inventoryCurrentPage, true);
                              await loadData();
                              
                              // Update items state immediately
                              setItems(prev => prev.map(item => 
                                itemIds.includes(item.id) 
                                  ? { ...item, status: 'Not Sterilized' }
                                  : item
                              ));
                              alert('Items marked as non-sterilized successfully!');
                            } catch (error: any) {
                              alert('Error: ' + (error.response?.data?.error || error.message));
                            }
                          }}
                          className="btn-red"
                        >
                          Mark Items as Non-Sterilized
                        </button>
                      )}
                    </div>
                    {hasAcceptedSurgery && (() => {
                      const hasPendingForward = forwardingRequests.find(r => r.group_id === scannedGroupId && r.status === 'pending' && r.from_location?.includes('Surgery'));
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

        {activeTab === 'item-sterilization' && scannedGroupId && user?.role === 'msu' && (
          <div>
            <div className="tab-header">
              <h2>Item Sterilization Process</h2>
              <button onClick={() => {
                setScannedGroupId(null);
                setActiveTab('inventory');
              }} className="btn-gray">
                Back to Inventory
              </button>
            </div>
            
            {(() => {
              const item = items.find(i => i.id === scannedGroupId);
              if (!item) return <p>Item not found</p>;
              
              const company = COMPANIES.find(c => c.value === item.company_prefix);
              const itemType = ITEM_TYPES.find(t => t.value === item.item_name);
              
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
                    <h3>Item: {item.id}</h3>
                    <p>Company: {company?.label || item.company_prefix}</p>
                    <p>Type: {itemType?.label || item.item_name}</p>
                    <p>Status: {getItemStatus(item)}</p>
                    <p>Location: {item.location}</p>
                  </div>
                  
                  {(() => {
                    // Determine current step based on item status
                    const status = getItemStatus(item);
                    let currentStep = 'by_hand';
                    if (status === 'Washing by Hand') currentStep = 'washing';
                    else if (status === 'Automatic Washing') currentStep = 'steam_sterilization';
                    else if (status === 'Steam Sterilization') currentStep = 'cooling';
                    else if (status === 'Cooling') currentStep = 'finished';
                    else if (status === 'Finished') currentStep = 'finished';
                    else if (status === 'Not Sterilized' || status.includes('unsterilized')) currentStep = 'by_hand';
                    
                    // Current step is determined from item status
                    
                    return (
                      <div style={{marginBottom: '2rem'}}>
                        <h3>Sterilization Steps</h3>
                        <div style={{display: 'flex', gap: '1rem', flexWrap: 'wrap'}}>
                          {STERILIZATION_STEPS.map((step, index) => {
                            const isActive = currentStep === step.key;
                            const currentProgressIndex = STERILIZATION_STEPS.findIndex(s => s.key === currentStep);
                            const isCompleted = currentProgressIndex > index;
                            const canSelect = false; // Disabled for individual items
                        
                            return (
                              <button
                                key={step.key}
                                onClick={() => null}
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
                                  color: isActive || isCompleted ? 'white' : 'var(--text)',
                                  opacity: canSelect ? 1 : 0.5,
                                  cursor: canSelect ? 'pointer' : 'not-allowed'
                                }}
                                disabled={!canSelect}
                              >
                                {index + 1}. {step.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
                  
                  <div style={{display: 'flex', gap: '1rem', marginTop: '2rem'}}>
                    <button
                      onClick={async () => {
                        try {
                          // Individual item processing is simplified
                          alert('Individual item sterilization is now handled through group processing. Please create a group for this item.');
                          setScannedGroupId(null);
                          setActiveTab('inventory');
                        } catch (error: any) {
                          alert('Failed to update status: ' + (error.response?.data?.error || error.message));
                        }
                      }}
                      className="btn-blue"
                    >
Process Individual Item
                    </button>
                    <button
                      onClick={async () => {
                        try {
                          // Update items state immediately
                          setItems(prev => prev.map(i => 
                            i.id === item.id 
                              ? { ...i, status: 'marked_unsterilized' }
                              : i
                          ));
                          await itemsAPI.bulkUpdateStatus([item.id], 'MSU', 'marked_unsterilized');
                          alert('Item marked as unsterilized');
                          setScannedGroupId(null);
                          setActiveTab('inventory');
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
                          await itemsAPI.bulkUpdateStatus([item.id], 'MSU', 'sterilization_completed');
                          await loadData();
                          // Update items state immediately
                          setItems(prev => prev.map(i => 
                            i.id === item.id 
                              ? { ...i, status: 'sterilization_completed' }
                              : i
                          ));
                          alert('Sterilization process completed!');
                          setScannedGroupId(null);
                          setActiveTab('inventory');
                        } catch (error: any) {
                          alert('Failed to complete sterilization: ' + (error.response?.data?.error || error.message));
                        }
                      }}
                      className="btn-green"
                      disabled={getItemStatus(item) !== 'Finished'}
                    >
                      Complete Sterilization
                    </button>
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
              const group = groups.find(g => g.id === request.group_id);
              const groupName = group?.name || 'Unknown Group';
              const itemCount = group?.GroupItems?.length || 0;
              
              return (
                <div key={request.id} className="history-entry">
                  <div className="history-info">
                    <div style={{display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
                      <div style={{color: 'var(--text-muted)', fontSize: '0.9rem', fontWeight: 'bold'}}>{index + 1}.</div>
                      <div>
                        <div><strong>Group: {groupName}</strong>
                          <span style={{fontSize: '0.8rem', color: '#d1d5db', marginLeft: '0.5rem'}}>
                            ({itemCount} items)
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
                    {request.created_at ? new Date(request.created_at).toLocaleString() : 'Unknown date'}
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

        {activeTab === 'users' && (
          <Suspense fallback={<div style={{textAlign: 'center', padding: '2rem'}}>Loading...</div>}>
            <UserManagement />
          </Suspense>
        )}

        {activeTab === 'storization' && (
          <div>
            <div className="tab-header">
              <h2>Storage Locations ({storedItems.filter(item => {
                if (storageFilterLetter !== 'all' && !item.position.startsWith(storageFilterLetter)) return false;
                if (storageFilterNumber !== 'all' && !item.position.endsWith(`-${storageFilterNumber}`)) return false;
                return true;
              }).length} items)</h2>
            </div>
            
            <div style={{marginBottom: '1rem', padding: '1rem', background: 'var(--card)', borderRadius: '0.5rem'}}>
              <div style={{display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem'}}>
                <div className="form-group">
                  <label>Filter by Letter</label>
                  <select value={storageFilterLetter} onChange={(e) => setStorageFilterLetter(e.target.value)}>
                    <option value="all">All Letters</option>
                    {['A','B','C','D','E','F','G','H','I','J'].map(letter => (
                      <option key={letter} value={letter}>{letter}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Filter by Number</label>
                  <select value={storageFilterNumber} onChange={(e) => setStorageFilterNumber(e.target.value)}>
                    <option value="all">All Numbers</option>
                    {Array.from({length: 20}, (_, i) => i + 1).map(num => (
                      <option key={num} value={num}>{num}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Clear Filters</label>
                  <button 
                    onClick={() => {
                      setStorageFilterLetter('all');
                      setStorageFilterNumber('all');
                    }}
                    className="btn-gray"
                  >
                    Clear All
                  </button>
                </div>
              </div>
            </div>
            
            <div className="inventory-grid">
              {storedItems.filter(item => {
                if (storageFilterLetter !== 'all' && !item.position.startsWith(storageFilterLetter)) return false;
                if (storageFilterNumber !== 'all' && !item.position.endsWith(`-${storageFilterNumber}`)) return false;
                // Check if the group still exists and is in Storage location
                const group = groups.find(g => g.id === item.item_id);
                if (!group || group.location !== 'Storage') return false;
                return true;
              }).map(item => (
                <div key={`${item.id}-${item.position}`} className="inventory-item-box">
                  <div className="item-header">
                    <div className="item-id">{item.item_name}</div>
                  </div>
                  
                  <div className="item-details">
                    <div className="item-company">Type: {item.item_type}</div>
                    <div className="item-type">Position: {item.position}</div>
                  </div>
                  
                  <div className="item-status">
                    <span className="status sterilized">Stored</span>
                    <span className="location">{new Date(item.created_at || item.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
            </div>
            
            {storedItems.filter(item => {
              if (storageFilterLetter !== 'all' && !item.position.startsWith(storageFilterLetter)) return false;
              if (storageFilterNumber !== 'all' && !item.position.endsWith(`-${storageFilterNumber}`)) return false;
              return true;
            }).length === 0 && (
              <div className="empty-state">
                <p>No stored items found matching the current filters.</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'history' && (
          <div>
            <div className="tab-header">
              <h2>Action History</h2>
              <div className="flex gap-2">
                <span style={{color: 'var(--text-muted)', fontSize: '0.875rem'}}>({historyPagination.totalItems} total, {filteredHistory.length} shown)</span>
                <button onClick={() => exportToPDF(filteredHistory, 'history')} className="btn-red">📄 PDF</button>
                <button onClick={() => exportToExcel(filteredHistory, 'history')} className="btn-green">📊 Excel</button>
              </div>
            </div>
            
            <div style={{marginBottom: '1rem', padding: '1rem', background: 'var(--card)', borderRadius: '0.5rem'}}>
              <div style={{display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem'}}>
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
                
                <div className="form-group">
                  <label>User Role</label>
                  <select value={filterUserRole} onChange={async (e) => {
                    setFilterUserRole(e.target.value);
                    setFilterUserId('all');
                    
                    if (e.target.value !== 'all' && allUsers.length === 0) {
                      try {
                        const usersRes = await authAPI.getUsers();
                        setAllUsers(usersRes?.data || []);
                      } catch (error) {
                        console.error('Failed to load users:', error);
                      }
                    }
                    
                    // Reset to page 1 when filter changes
                    loadHistoryPage(1);
                  }}>
                    <option value="all">All Roles</option>
                    <option value="admin">Admin</option>
                    <option value="msu">MSU Personnel</option>
                    <option value="storage">Storage Personnel</option>
                    <option value="surgery">Surgery Personnel</option>
                  </select>
                </div>
                
                {filterUserRole !== 'all' && (
                  <div className="form-group">
                    <label>Select User</label>
                    <select value={filterUserId} onChange={(e) => {
                      setFilterUserId(e.target.value);
                      loadHistoryPage(1);
                    }}>
                      <option value="all">All Users</option>
                      {(allUsers || []).filter(u => u.role === filterUserRole).map(u => (
                        <option key={u.id} value={u.id}>{u.username}</option>
                      ))}
                    </select>
                  </div>
                )}
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
                    <option value="forwarding">Forwarding Process</option>
                    <option value="grouped">Grouped</option>
                    <option value="disbanded">Disbanded</option>
                    <option value="removed_from_group">Removed from Group</option>
                    <option value="used">Used</option>
                    <option value="removed_from_inventory">Removed from Inventory</option>
                    <option value="moved">Moved</option>
                    <option value="stored">Storization</option>
                    <option value="user_created">User Created</option>
                    <option value="user_deleted">User Deleted</option>
                  </select>
                </div>
              )}
              
              {historyFilterType === 'action' && filterAction === 'sterilization' && (
                <div className="form-group">
                  <label>Sterilization Process</label>
                  <select value={filterAction} onChange={(e) => {
                    if (e.target.value === 'sterilization') {
                      setFilterAction('sterilization');
                    } else {
                      setFilterAction(e.target.value);
                    }
                  }}>
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
              
              {historyFilterType === 'action' && filterAction === 'forwarding' && (
                <div className="form-group">
                  <label>Forwarding Process</label>
                  <select value={filterAction} onChange={(e) => setFilterAction(e.target.value)}>
                    <option value="forwarding">All Forwarding Process</option>
                    <option value="forwarding_requested">Forwarding Requested</option>
                    <option value="forwarded">Forwarded</option>
                    <option value="rejected">Rejected</option>
                  </select>
                </div>
              )}
              

            </div>
            
            {/* Top Pagination - After Filters */}
            {historyPagination.totalPages > 1 && (
              <div style={{display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '1rem', marginBottom: '1rem', padding: '1rem', background: 'var(--card)', borderRadius: '0.5rem'}}>
                <button 
                  onClick={() => loadHistoryPage(historyCurrentPage - 1)}
                  disabled={historyCurrentPage <= 1}
                  className="btn-gray"
                >
                  ← Previous
                </button>
                
                <div style={{display: 'flex', gap: '0.5rem', alignItems: 'center'}}>
                  {Array.from({ length: Math.min(5, historyPagination.totalPages) }, (_, i) => {
                    let pageNum;
                    if (historyPagination.totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (historyCurrentPage <= 3) {
                      pageNum = i + 1;
                    } else if (historyCurrentPage >= historyPagination.totalPages - 2) {
                      pageNum = historyPagination.totalPages - 4 + i;
                    } else {
                      pageNum = historyCurrentPage - 2 + i;
                    }
                    
                    return (
                      <button
                        key={pageNum}
                        onClick={() => loadHistoryPage(pageNum)}
                        className={historyCurrentPage === pageNum ? 'btn-blue' : 'btn-gray'}
                        style={{minWidth: '40px'}}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>
                
                <button 
                  onClick={() => loadHistoryPage(historyCurrentPage + 1)}
                  disabled={historyCurrentPage >= historyPagination.totalPages}
                  className="btn-gray"
                >
                  Next →
                </button>
                
                <div style={{display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
                  <span style={{color: 'var(--text-muted)', fontSize: '0.875rem'}}>Page:</span>
                  <input
                    type="number"
                    min="1"
                    max={historyPagination.totalPages}
                    style={{width: '60px', padding: '4px 8px', textAlign: 'center'}}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        const page = parseInt(e.currentTarget.value);
                        if (page >= 1 && page <= historyPagination.totalPages) {
                          loadHistoryPage(page);
                          e.currentTarget.value = '';
                        }
                      }
                    }}
                    placeholder={historyCurrentPage.toString()}
                  />
                  <span style={{color: 'var(--text-muted)', fontSize: '0.875rem'}}>of {historyPagination.totalPages}</span>
                </div>
              </div>
            )}
            
            {filteredHistory.map((entry, index) => {
              const companyPrefix = entry.company_prefix || entry.MedicalItem?.company_prefix;
              const company = COMPANIES.find(c => c.value === companyPrefix);
              const itemType = ITEM_TYPES.find(t => t.value === entry.item_name);
              const performedByUser = entry.User || (entry.performed_by_username ? {
                username: entry.performed_by_username,
                role: entry.performed_by_role || 'unknown'
              } : null);
              if (index === 0) console.log('First history entry:', entry);
              
              return (
                <div key={entry.id} className="history-entry">
                  <div className="history-info">
                    <div style={{display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
                      <div style={{color: 'var(--text-muted)', fontSize: '0.9rem', fontWeight: 'bold'}}>{index + 1}.</div>
                      <div>
                        <div><strong>{entry.item_id}</strong>
                          {(company || itemType) && (
                            <span style={{fontSize: '0.8rem', color: '#d1d5db', marginLeft: '0.5rem'}}>
                              {company?.label.split(' (')[0] || entry.company_prefix} - {itemType?.label.split(' (')[0] || entry.item_name}
                            </span>
                          )}
                        </div>
                        {performedByUser && (
                          <div style={{fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem'}}>
                            👤 {performedByUser.username} ({performedByUser.role})
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="history-badges">
                      <div className={`action-badge action-${entry.action === 'stored' ? 'stored' : entry.action === 'grouped' ? 'grouped' : entry.action === 'disbanded' ? 'disbanded' : entry.action === 'removed_from_group' ? 'removed_from_group' : entry.action}`}>
                        {entry.action === 'removed_from_inventory' ? 'Removed from inventory' : 
                         entry.action === 'marked_unsterilized' ? 'Marked Unsterilized' :
                         entry.action === 'sterilization_completed' ? 'Sterilization Completed' :
                         entry.action === 'step_by_hand' ? 'By Hand' :
                         entry.action === 'step_washing' ? 'Washing' :
                         entry.action === 'step_steam_sterilization' ? 'Steam Sterilization' :
                         entry.action === 'step_cooling' ? 'Cooling' :
                         entry.action === 'step_finished' ? 'Finished' :
                         entry.action === 'forwarding_requested' ? 'Forwarding Requested' :
                         entry.action === 'grouped' ? 'Grouped' :
                         entry.action === 'disbanded' ? 'Disbanded' :
                         entry.action === 'removed_from_group' ? 'Removed from Group' :
                         entry.action === 'stored' ? 'Stored' :
                         entry.action === 'user_created' ? 'User Created' :
                         entry.action === 'user_deleted' ? 'User Deleted' :
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
            
            {/* Pagination Controls */}
            {historyPagination.totalPages > 1 && (
              <div style={{display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '1rem', margin: '2rem 0', padding: '1rem', background: 'var(--card)', borderRadius: '0.5rem'}}>
                <button 
                  onClick={() => loadHistoryPage(historyCurrentPage - 1)}
                  disabled={historyCurrentPage <= 1}
                  className="btn-gray"
                >
                  ← Previous
                </button>
                
                <div style={{display: 'flex', gap: '0.5rem', alignItems: 'center'}}>
                  {Array.from({ length: Math.min(5, historyPagination.totalPages) }, (_, i) => {
                    let pageNum;
                    if (historyPagination.totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (historyCurrentPage <= 3) {
                      pageNum = i + 1;
                    } else if (historyCurrentPage >= historyPagination.totalPages - 2) {
                      pageNum = historyPagination.totalPages - 4 + i;
                    } else {
                      pageNum = historyCurrentPage - 2 + i;
                    }
                    
                    return (
                      <button
                        key={pageNum}
                        onClick={() => loadHistoryPage(pageNum)}
                        className={historyCurrentPage === pageNum ? 'btn-blue' : 'btn-gray'}
                        style={{minWidth: '40px'}}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>
                
                <button 
                  onClick={() => loadHistoryPage(historyCurrentPage + 1)}
                  disabled={historyCurrentPage >= historyPagination.totalPages}
                  className="btn-gray"
                >
                  Next →
                </button>
                
                <div style={{display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
                  <span style={{color: 'var(--text-muted)', fontSize: '0.875rem'}}>Page:</span>
                  <input
                    type="number"
                    min="1"
                    max={historyPagination.totalPages}
                    style={{width: '60px', padding: '4px 8px', textAlign: 'center'}}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        const page = parseInt(e.currentTarget.value);
                        if (page >= 1 && page <= historyPagination.totalPages) {
                          loadHistoryPage(page);
                          e.currentTarget.value = '';
                        }
                      }
                    }}
                    placeholder={historyCurrentPage.toString()}
                  />
                  <span style={{color: 'var(--text-muted)', fontSize: '0.875rem'}}>of {historyPagination.totalPages}</span>
                </div>
              </div>
            )}
            
            {history.length === 0 ? (
              <div className="empty-state">
                <p>Loading history...</p>
              </div>
            ) : filteredHistory.length === 0 ? (
              <div className="empty-state">
                <p>No history entries found matching the current filters.</p>
              </div>
            ) : null}
          </div>
        )}
      </main>

      {showQrScanner && (
        <Suspense fallback={<div style={{position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)'}}>Loading Scanner...</div>}>
          <QrCodeScanner
            onScanSuccess={handleQrScan}
            onClose={() => setShowQrScanner(false)}
          />
        </Suspense>
      )}
    </div>
  );
}

export default App;

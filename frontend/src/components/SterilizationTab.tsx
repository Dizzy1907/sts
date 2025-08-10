import React, { useState, useEffect } from 'react';
import { itemsAPI, groupsAPI, forwardingAPI, sterilizationAPI } from '../services/api';
import type { User, MedicalItem, InstrumentGroup, ForwardingRequest } from '../services/api';

interface SterilizationTabProps {
  user: User;
  scannedGroupId: string | null;
  onBack: () => void;
  onRefresh: () => void;
}

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

const STERILIZATION_STEPS = [
  { key: 'by_hand', label: 'By Hand' },
  { key: 'washing', label: 'Washing' },
  { key: 'steam_sterilization', label: 'Steam Sterilization' },
  { key: 'cooling', label: 'Cooling' },
  { key: 'finished', label: 'Finished' }
];

const SterilizationTab: React.FC<SterilizationTabProps> = ({ 
  scannedGroupId, 
  onBack, 
  onRefresh 
}) => {
  const [group, setGroup] = useState<InstrumentGroup | null>(null);
  const [items, setItems] = useState<MedicalItem[]>([]);
  const [forwardingRequests, setForwardingRequests] = useState<ForwardingRequest[]>([]);
  const [currentStep, setCurrentStep] = useState('by_hand');
  const [loading, setLoading] = useState(false);
  const [showSteamModal, setShowSteamModal] = useState(false);
  const [steamData, setSteamData] = useState({ heat: '', psi: '', duration: '' });

  const getItemStatus = (item: MedicalItem) => {
    const status = item.status || 'Not Sterilized';
    // Prioritize 'Not Sterilized' status
    if (status === 'Not Sterilized') return 'Not Sterilized';
    if (status === 'Finished') return 'Sterilized';
    if (status === 'step_by_hand') return 'Washing by Hand';
    if (status === 'step_washing') return 'Automatic Washing';
    if (status === 'step_steam_sterilization') return 'Steam Sterilization';
    if (status === 'step_cooling') return 'Cooling';
    if (status === 'step_finished') return 'Finished';
    if (status === 'marked_unsterilized') return 'Not Sterilized';
    return status;
  };

  useEffect(() => {
    if (scannedGroupId) {
      // Reset state and force fresh load
      setItems([]);
      setGroup(null);
      loadData();
    }
  }, [scannedGroupId]);

  const loadData = async () => {
    if (!scannedGroupId) return;
    
    try {
      setLoading(true);
      const [groupRes, forwardingRes] = await Promise.all([
        groupsAPI.getById(scannedGroupId),
        forwardingAPI.getPending()
      ]);
      
      setGroup(groupRes.data);
      setForwardingRequests(forwardingRes.data);
      
      // Load fresh individual items for current status
      if (groupRes.data.GroupItems) {
        const itemIds = groupRes.data.GroupItems.map(gi => gi.item_id);
        const itemsRes = await Promise.all(
          itemIds.map(id => itemsAPI.getById(id).catch(() => null))
        );
        const freshItems = itemsRes.filter(Boolean).map(res => res!.data);
        setItems(freshItems);
        
        // Update group items with fresh data
        const updatedGroup = {
          ...groupRes.data,
          GroupItems: groupRes.data.GroupItems.map(gi => ({
            ...gi,
            MedicalItem: freshItems.find(item => item.id === gi.item_id) || gi.MedicalItem
          }))
        };
        setGroup(updatedGroup);
      }
    } catch (error) {
      console.error('Failed to load sterilization data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptForwarding = async (requestId: string) => {
    try {
      await forwardingAPI.accept(requestId);
      await loadData();
      onRefresh();
      alert('Forwarding request accepted!');
    } catch (error: any) {
      alert(`Failed to accept forwarding: ${error.response?.data?.error || error.message}`);
    }
  };

  const handleRejectForwarding = async (requestId: string) => {
    const reason = prompt('Reason for rejection (optional):');
    try {
      await forwardingAPI.reject(requestId, reason || undefined);
      await loadData();
      onRefresh();
      alert('Forwarding request rejected!');
    } catch (error: any) {
      alert(`Failed to reject forwarding: ${error.response?.data?.error || error.message}`);
    }
  };

  const handleUpdateStatus = async () => {
    if (!group) return;
    
    try {
      setLoading(true);
      const itemIds = group.GroupItems?.map(gi => gi.item_id) || [];
      
      // Show steam modal when transitioning FROM steam_sterilization TO cooling
      if (currentStep === 'cooling' && items.some(item => getItemStatus(item) === 'Steam Sterilization')) {
        setShowSteamModal(true);
        return;
      }
      
      if (currentStep === 'finished') {
        try {
          await sterilizationAPI.validateCooling(itemIds);
        } catch (error: any) {
          alert(error.response?.data?.error || 'Cooling validation failed');
          // Revert status back to steam sterilization
          await itemsAPI.bulkUpdateStatus(itemIds, 'MSU', 'step_steam_sterilization');
          setItems(prev => prev.map(item => 
            itemIds.includes(item.id) 
              ? { ...item, status: 'step_steam_sterilization' }
              : item
          ));
          setCurrentStep('steam_sterilization');
          await loadData();
          return;
        }
      }
      
      await itemsAPI.bulkUpdateStatus(itemIds, 'MSU', `step_${currentStep}`);
      
      // Update local items state immediately
      setItems(prev => prev.map(item => 
        itemIds.includes(item.id) 
          ? { ...item, status: `step_${currentStep}` }
          : item
      ));
      
      // Auto-advance to next step
      const currentIndex = STERILIZATION_STEPS.findIndex(s => s.key === currentStep);
      if (currentIndex < STERILIZATION_STEPS.length - 1) {
        setCurrentStep(STERILIZATION_STEPS[currentIndex + 1].key);
      }
      
      await loadData();
      onRefresh();
      alert(`Status updated to: ${STERILIZATION_STEPS.find(s => s.key === currentStep)?.label}`);
    } catch (error: any) {
      alert('Failed to update status: ' + (error.response?.data?.error || error.message));
    } finally {
      setLoading(false);
    }
  };

  const handleSteamSterilization = async () => {
    const heat = parseFloat(steamData.heat);
    const psi = parseFloat(steamData.psi);
    const duration = parseFloat(steamData.duration);

    if (heat < 121 || psi < 15 || duration < 30) {
      alert('Invalid parameters. Heat ≥121°C, PSI ≥15, Duration ≥30min');
      return;
    }

    try {
      const itemIds = group?.GroupItems?.map(gi => gi.item_id) || [];
      await sterilizationAPI.steam(itemIds, heat, psi, duration);
      
      // Update local items state immediately
      setItems(prev => prev.map(item => 
        itemIds.includes(item.id) 
          ? { ...item, status: 'step_cooling' }
          : item
      ));
      
      setShowSteamModal(false);
      setSteamData({ heat: '', psi: '', duration: '' });
      setCurrentStep('cooling');
      await loadData();
      await onRefresh();
      alert(`Steam sterilization completed: ${heat}°C, ${psi} PSI, ${duration} minutes`);
    } catch (error: any) {
      alert('Failed to complete steam sterilization: ' + (error.response?.data?.error || error.message));
    }
  };

  const handleMarkUnsterilized = async () => {
    if (!group) return;
    
    try {
      const itemIds = group.GroupItems?.map(gi => gi.item_id) || [];
      
      // Use bulk update with marked_unsterilized
      await itemsAPI.bulkUpdateStatus(itemIds, 'MSU', 'marked_unsterilized');
      
      // Update local state immediately
      setItems(prev => prev.map(item => 
        itemIds.includes(item.id) 
          ? { ...item, status: 'Not Sterilized' }
          : item
      ));
      
      setCurrentStep('by_hand');
      
      // Force refresh items immediately
      const refreshItemIds = group.GroupItems?.map(gi => gi.item_id) || [];
      const itemsRes = await Promise.all(
        refreshItemIds.map(id => itemsAPI.getById(id).catch(() => null))
      );
      const freshItems = itemsRes.filter(Boolean).map(res => res!.data);
      setItems(freshItems);
      
      await loadData();
      await onRefresh();
      alert('Group marked as unsterilized');
    } catch (error: any) {
      alert('Failed to mark as unsterilized: ' + (error.response?.data?.error || error.message));
    }
  };

  const handleForwardToStorage = async () => {
    if (!group) return;
    
    try {
      await forwardingAPI.create(group.id, 'Storage');
      await loadData();
      onRefresh();
      alert('Forwarding request created successfully!');
    } catch (error: any) {
      alert(`Failed to forward group: ${error.response?.data?.error || error.message}`);
    }
  };

  if (!group) {
    return (
      <div>
        <div className="tab-header">
          <h2>Sterilization Process</h2>
          <button onClick={onBack} className="btn-gray">Back to Inventory</button>
        </div>
        <div className="empty-state">
          <p>{loading ? 'Loading...' : 'Group not found'}</p>
        </div>
      </div>
    );
  }

  const pendingRequest = forwardingRequests.find(
    r => r.group_id === scannedGroupId && r.status === 'pending' && r.to_location === 'MSU'
  );
  const hasAcceptedMSU = group.location === 'MSU' && !pendingRequest;
  const hasPendingForward = forwardingRequests.find(
    r => r.group_id === scannedGroupId && r.status === 'pending' && r.from_location === 'MSU'
  );
  const isGroupForwarded = forwardingRequests.find(
    r => r.group_id === scannedGroupId && r.status === 'pending'
  );

  // Determine current step from fresh item status
  const firstItem = items[0];
  if (firstItem && hasAcceptedMSU) {
    const status = getItemStatus(firstItem);
    let autoStep = 'by_hand';
    if (status === 'Washing by Hand') autoStep = 'washing';
    else if (status === 'Automatic Washing') autoStep = 'steam_sterilization';
    else if (status === 'Steam Sterilization') autoStep = 'cooling';
    else if (status === 'Cooling') autoStep = 'finished';
    else if (status === 'Finished') autoStep = 'finished';
    else if (status === 'Not Sterilized') autoStep = 'by_hand';
    
    if (currentStep !== autoStep) {
      setCurrentStep(autoStep);
    }
  }

  const allItemsSterilized = group.GroupItems?.every(gi => {
    const item = items.find(i => i.id === gi.item_id);
    return item && (getItemStatus(item) === 'Finished' || getItemStatus(item) === 'Sterilized');
  });

  return (
    <div>
      <div className="tab-header">
        <h2>Sterilization Process</h2>
        <div className="flex gap-2">
          <button onClick={loadData} className="btn-blue" disabled={loading}>
            🔄 {loading ? 'Loading...' : 'Refresh'}
          </button>
          <button onClick={onBack} className="btn-gray">Back to Inventory</button>
        </div>
      </div>

      {/* Group Info */}
      <div style={{marginBottom: '2rem', padding: '1.5rem', background: 'var(--card)', borderRadius: '0.5rem'}}>
        <h3>Group: {group.name}</h3>
        <p>Items: {group.GroupItems?.length || 0}</p>
        <p>Location: {group.location}</p>
      </div>

      {/* Items Grid */}
      <div style={{marginBottom: '2rem', padding: '1.5rem', background: 'var(--card)', borderRadius: '0.5rem'}}>
        <h3>Items in Group</h3>
        <div className="inventory-grid" style={{marginTop: '1rem'}}>
          {group.GroupItems?.map(groupItem => {
            // Use fresh items state, fallback only if items not loaded yet
            const item = items.find(i => i.id === groupItem.item_id);
            if (!item && items.length === 0) {
              // Still loading, show loading state
              return (
                <div key={groupItem.item_id} className="inventory-item-box">
                  <div className="item-header">
                    <div className="item-id">Loading...</div>
                  </div>
                </div>
              );
            }
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

      {/* Forwarding Request */}
      {pendingRequest && (
        <div style={{marginBottom: '2rem', padding: '1.5rem', background: 'var(--card)', borderRadius: '0.5rem'}}>
          <h3>Forwarding Request</h3>
          <div style={{display: 'flex', gap: '1rem'}}>
            <button onClick={() => handleAcceptForwarding(pendingRequest.id)} className="btn-green">
              Accept Forwarding
            </button>
            <button onClick={() => handleRejectForwarding(pendingRequest.id)} className="btn-red">
              Send Back
            </button>
          </div>
        </div>
      )}

      {/* Sterilization Steps */}
      {hasAcceptedMSU && (
        <div style={{marginBottom: '2rem', padding: '1.5rem', background: 'var(--card)', borderRadius: '0.5rem'}}>
          <h3>Sterilization Steps</h3>
          <div style={{display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '1rem'}}>
            {STERILIZATION_STEPS.map((step, index) => {
              const isActive = currentStep === step.key;
              const currentIndex = STERILIZATION_STEPS.findIndex(s => s.key === currentStep);
              const isCompleted = currentIndex > index;
              const canSelect = index <= currentIndex + 1;
              
              return (
                <button
                  key={step.key}
                  onClick={() => canSelect ? setCurrentStep(step.key) : null}
                  disabled={!canSelect}
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
                >
                  {index + 1}. {step.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      {hasAcceptedMSU && (
        <div style={{display: 'flex', gap: '1rem', justifyContent: 'space-between', alignItems: 'center'}}>
          <div style={{display: 'flex', gap: '1rem'}}>
            <button 
              onClick={handleUpdateStatus} 
              className="btn-blue" 
              disabled={loading || !!isGroupForwarded}
              title={isGroupForwarded ? 'Cannot update status - group is forwarded' : ''}
            >
              {currentStep === 'cooling' && items.some(item => getItemStatus(item) === 'Steam Sterilization') 
                ? 'Enter Steam Data & Cool' 
                : `Update to ${STERILIZATION_STEPS.find(s => s.key === currentStep)?.label}`}
            </button>
            <button 
              onClick={handleMarkUnsterilized} 
              className="btn-red"
              disabled={!!isGroupForwarded}
              title={isGroupForwarded ? 'Cannot mark as unsterilized - group is forwarded' : ''}
            >
              Mark as Unsterilized
            </button>
          </div>
          
          {hasPendingForward ? (
            <div style={{
              padding: '1rem 2rem',
              background: '#fbbf24',
              borderRadius: '0.5rem',
              color: '#000',
              fontWeight: 'bold'
            }}>
              ⚠️ Already Forwarded to Storage
            </div>
          ) : allItemsSterilized ? (
            <button onClick={handleForwardToStorage} className="btn-purple">
              Forward to Storage
            </button>
          ) : (
            <div style={{padding: '1rem', background: 'var(--red)', borderRadius: '0.5rem', color: 'white'}}>
              All items must be sterilized before forwarding
            </div>
          )}
        </div>
      )}

      {/* Steam Modal */}
      {showSteamModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2>Steam Sterilization Parameters</h2>
              <button onClick={() => setShowSteamModal(false)} className="close-btn">×</button>
            </div>
            
            <div className="form-group">
              <label>Temperature (°C) - Minimum: 121°C</label>
              <input
                type="number"
                value={steamData.heat}
                onChange={(e) => setSteamData(prev => ({...prev, heat: e.target.value}))}
                placeholder="Enter temperature"
                min="121"
              />
            </div>
            
            <div className="form-group">
              <label>Pressure (PSI) - Minimum: 15 PSI</label>
              <input
                type="number"
                value={steamData.psi}
                onChange={(e) => setSteamData(prev => ({...prev, psi: e.target.value}))}
                placeholder="Enter pressure"
                min="15"
              />
            </div>
            
            <div className="form-group">
              <label>Duration (Minutes) - Minimum: 30 minutes</label>
              <input
                type="number"
                value={steamData.duration}
                onChange={(e) => setSteamData(prev => ({...prev, duration: e.target.value}))}
                placeholder="Enter duration"
                min="30"
              />
            </div>
            
            <div style={{display: 'flex', gap: '1rem', marginTop: '2rem'}}>
              <button onClick={handleSteamSterilization} className="btn-green">
                Complete Steam Sterilization
              </button>
              <button onClick={() => setShowSteamModal(false)} className="btn-gray">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SterilizationTab;
import React, { useState } from 'react';
import type { MedicalItem } from '../services/api';

interface InstrumentSelectorProps {
  instruments?: MedicalItem[];
  selectedItems: MedicalItem[];
  onSelect: (items: MedicalItem[]) => void;
  filter?: (item: MedicalItem) => boolean;
  multiSelect?: boolean;
  showSearch?: boolean;
  showFullNames?: boolean;
}

const COMPANY_PREFIXES = [
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

const InstrumentSelector: React.FC<InstrumentSelectorProps> = ({
  instruments = [],
  selectedItems,
  onSelect,
  filter,
  multiSelect = true,
  showSearch = true,
  showFullNames = false
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredInstruments = instruments.filter(item => {
    if (filter && !filter(item)) return false;
    if (!searchQuery) return true;
    
    const query = searchQuery.toLowerCase();
    return (
      item.id.toLowerCase().includes(query) ||
      item.item_name.toLowerCase().includes(query) ||
      item.company_prefix.toLowerCase().includes(query)
    );
  });

  const toggleSelection = (item: MedicalItem) => {
    if (!multiSelect) {
      onSelect([item]);
      return;
    }

    const isSelected = selectedItems.some(selected => selected.id === item.id);
    if (isSelected) {
      onSelect(selectedItems.filter(selected => selected.id !== item.id));
    } else {
      onSelect([...selectedItems, item]);
    }
  };

  const selectAll = () => {
    onSelect(filteredInstruments);
  };

  const clearSelection = () => {
    onSelect([]);
  };

  return (
    <div className="instrument-selector">
      {showSearch && (
        <div className="search-controls">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search instruments by ID, name, or company..."
            className="search-input"
          />
        </div>
      )}

      {multiSelect && (
        <div className="selection-controls">
          <button onClick={selectAll} className="btn-blue">
            Select All ({filteredInstruments.length})
          </button>
          <button onClick={clearSelection} className="btn-gray">
            Clear Selection
          </button>
          <span className="selection-count">
            {selectedItems.length} selected
          </span>
        </div>
      )}

      <div className="instruments-list">
        {filteredInstruments.length === 0 ? (
          <p className="no-items">No instruments found.</p>
        ) : (
          filteredInstruments.map((item) => {
            const isSelected = selectedItems.some(selected => selected.id === item.id);
            
            return (
              <div
                key={item.id}
                className={`instrument-item ${isSelected ? 'selected' : ''}`}
                onClick={() => toggleSelection(item)}
              >
                <div className="item-info">
                  <div className="item-id">{item.id}</div>
                  <div className="item-name">
                    {showFullNames ? (
                      `${COMPANY_PREFIXES.find(p => p.value === item.company_prefix)?.label.replace(/ \(\d+\)$/, '') || item.company_prefix} - ${ITEM_TYPES.find(type => type.value === item.item_name)?.label.replace(/ \(\d+\)$/, '') || item.item_name}`
                    ) : (
                      item.item_name
                    )}
                  </div>
                </div>
                
                <div className="item-status">
                  <div className={`status-badge ${item.sterilized ? 'sterilized' : 'non-sterilized'}`}>
                    {item.sterilized ? 'Sterilized' : 'Non-sterilized'}
                  </div>
                  <div className={`location-badge location-${item.location.toLowerCase()}`}>
                    {item.location}
                  </div>
                  <div className="serial-badge">
                    #{item.serial_number}
                  </div>
                  
                  {multiSelect && (
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelection(item)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default InstrumentSelector;
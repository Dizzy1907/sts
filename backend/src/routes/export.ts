import express from 'express';
import { MedicalItem, ActionHistory } from '../models';
import { authenticateToken } from '../middleware/auth';

const router = express.Router();

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

const getItemStatus = (status: string) => {
  return status === 'Finished' ? 'Sterilized' : status || 'Not Sterilized';
};

const getActionText = (action: string) => {
  const actionMap: { [key: string]: string } = {
    'removed_from_inventory': 'Removed from inventory',
    'marked_unsterilized': 'Marked Unsterilized',
    'sterilization_completed': 'Sterilization Completed',
    'step_by_hand': 'By Hand',
    'step_washing': 'Washing',
    'step_steam_sterilization': 'Steam Sterilization',
    'step_cooling': 'Cooling',
    'step_finished': 'Finished',
    'forwarding_requested': 'Forwarding Requested',
    'stored': 'Stored'
  };
  return actionMap[action] || action.charAt(0).toUpperCase() + action.slice(1).replace('_', ' ');
};

// Export inventory data
router.get('/inventory', authenticateToken, async (req, res) => {
  try {
    const items = await MedicalItem.findAll({
      where: { location: { [require('sequelize').Op.ne]: 'DELETED' } }
    });
    
    const exportData = items.map((item, index) => {
      const company = COMPANIES.find(c => c.value === item.company_prefix);
      const itemType = ITEM_TYPES.find(t => t.value === item.item_name);
      
      return {
        'No.': index + 1,
        'Item ID': item.id,
        'Company': company?.label.split(' (')[0] || item.company_prefix,
        'Item Type': itemType?.label.split(' (')[0] || item.item_name,
        'Status': getItemStatus(item.status || ''),
        'Location': item.location
      };
    });
    
    res.json(exportData);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Export history data
router.get('/history', authenticateToken, async (req, res) => {
  try {
    const { action, itemId, userRole, userId } = req.query;
    
    let whereClause: any = {};
    let includeClause: any = [{ association: 'User' }];
    
    // Apply filters
    if (action && action !== 'all') {
      whereClause.action = action;
    }
    
    if (itemId) {
      whereClause.item_id = itemId;
    }
    
    if (userRole && userRole !== 'all') {
      includeClause = [{ 
        association: 'User',
        where: { role: userRole },
        required: true
      }];
    }
    
    if (userId && userId !== 'all') {
      whereClause.performed_by = userId;
    }
    
    const history = await ActionHistory.findAll({
      where: whereClause,
      include: includeClause,
      order: [['timestamp', 'DESC']]
    });
    
    const exportData = history.map((entry, index) => {
      const company = COMPANIES.find(c => c.value === entry.company_prefix);
      const itemType = ITEM_TYPES.find(t => t.value === entry.item_name);
      
      return {
        'No.': index + 1,
        'Item ID': entry.item_id,
        'Company': company?.label.split(' (')[0] || entry.company_prefix,
        'Item Type': itemType?.label.split(' (')[0] || entry.item_name,
        'Action': getActionText(entry.action),
        'Location': entry.action === 'removed_from_inventory' ? '' : (entry.to_location || entry.from_location || ''),
        'Date & Time': new Date((entry as any).timestamp || new Date()).toLocaleString()
      };
    });
    
    res.json(exportData);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
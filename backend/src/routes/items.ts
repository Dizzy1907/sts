import express from 'express';
import { Op } from 'sequelize';
import { MedicalItem, ActionHistory } from '../models';
import { authenticateToken, requireRole } from '../middleware/auth';

const router = express.Router();
console.log('Items router loaded');

router.get('/', authenticateToken, async (req, res) => {
  console.log('GET /items called');
  try {
    const { page = '1', pageSize = '100', company, itemType, location, userRole, search, status, excludeGrouped } = req.query;
    const pageNum = parseInt(page as string);
    const pageSizeNum = parseInt(pageSize as string);
    const offset = (pageNum - 1) * pageSizeNum;
    
    let whereClause: any = { location: { [Op.ne]: 'DELETED' } };
    
    if (company && company !== 'all') whereClause.company_prefix = company;
    if (itemType && itemType !== 'all') whereClause.item_name = itemType;
    if (search) {
      whereClause[Op.or] = [
        { id: { [Op.like]: `%${search}%` } },
        { company_prefix: { [Op.like]: `%${search}%` } },
        { item_name: { [Op.like]: `%${search}%` } }
      ];
    }
    
    // Location filtering (explicit filter takes precedence over role-based filtering)
    if (location && location !== 'all') {
      const locationStr = String(location);
      if (locationStr === 'Surgery Room') {
        whereClause.location = { [Op.like]: '%Surgery%' };
      } else if (locationStr.includes('Surgery Room')) {
        whereClause.location = locationStr;
      } else {
        whereClause.location = locationStr;
      }
    } else {
      // Role-based location filtering (only when no explicit location filter)
      if (userRole === 'msu') whereClause.location = 'MSU';
      else if (userRole === 'storage') whereClause.location = 'Storage';
      else if (userRole === 'surgery') whereClause.location = { [Op.like]: '%Surgery%' };
    }
    
    // Exclude items already in groups (for group creation)
    if (excludeGrouped === 'true') {
      const { GroupItem } = require('../models');
      const groupItems = await GroupItem.findAll({ attributes: ['item_id'] });
      const usedItemIds = groupItems.map((gi: any) => gi.item_id);
      if (usedItemIds.length > 0) {
        whereClause.id = { [Op.notIn]: usedItemIds };
      }
    }
    
    const { count, rows: items } = await MedicalItem.findAndCountAll({ 
      where: whereClause,
      order: [['created_at', 'DESC']],
      limit: pageSizeNum,
      offset
    });
    
    // Optimize: Single query instead of N+1
    const itemIds = items.map(item => item.id);
    const latestSteps = await ActionHistory.findAll({
      where: { 
        item_id: { [Op.in]: itemIds },
        action: { [Op.like]: 'step_%' }
      },
      order: [['timestamp', 'DESC']]
    });
    
    const stepMap = {
      'step_by_hand': 'Washing by Hand',
      'step_washing': 'Automatic Washing',
      'step_steam_sterilization': 'Steam Sterilization',
      'step_cooling': 'Cooling',
      'step_finished': 'Finished'
    };
    
    const statusMap = new Map();
    latestSteps.forEach(step => {
      if (!statusMap.has(step.item_id)) {
        statusMap.set(step.item_id, stepMap[step.action as keyof typeof stepMap] || 'In Process');
      }
    });
    
    let itemsWithStatus = items.map(item => {
      const itemJson = item.toJSON();
      // Always prioritize the database status field over action history
      const mappedStatus = itemJson.status || statusMap.get(item.id) || 'Not Sterilized';
      return {
        ...itemJson,
        status: mappedStatus
      };
    });
    
    // Status filtering (moved from frontend) - Fixed to use consistent status mapping
    if (status && status !== 'all') {
      if (status === 'sterilized') {
        itemsWithStatus = itemsWithStatus.filter(item => 
          item.status === 'Finished' || item.status === 'Sterilized' || item.status === 'step_finished'
        );
      } else if (status === 'not-sterilized') {
        itemsWithStatus = itemsWithStatus.filter(item => 
          item.status !== 'Finished' && item.status !== 'Sterilized' && item.status !== 'step_finished'
        );
      }
    }
    
    console.log('Found items:', itemsWithStatus.length);
    
    res.json({
      data: itemsWithStatus,
      pagination: {
        currentPage: pageNum,
        pageSize: pageSizeNum,
        totalItems: count,
        totalPages: Math.ceil(count / pageSizeNum)
      }
    });
  } catch (error: any) {
    console.error('Items API error:', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
});

router.get('/all-including-deleted', authenticateToken, async (req, res) => {
  try {
    const items = await MedicalItem.findAll({ 
      order: [['created_at', 'DESC']],
      attributes: { include: ['created_at', 'updated_at'] }
    });
    res.json(items);
  } catch (error: any) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/register', authenticateToken, requireRole(['head_admin', 'admin', 'msu']), async (req, res) => {
  try {
    const { company_prefix, item_name, quantity = 1 } = req.body;
    
    const lastItem = await MedicalItem.findOne({
      where: { company_prefix, item_name },
      order: [['serial_number', 'DESC']]
    });
    const nextSerial = lastItem ? lastItem.serial_number + 1 : 1;
    
    if (nextSerial + quantity - 1 > 99999) {
      return res.status(400).json({ 
        error: `Cannot register items. Serial number would exceed 99999 (current: ${lastItem?.serial_number || 0}, requested: ${quantity})` 
      });
    }
    
    const items = [];

    for (let i = 0; i < quantity; i++) {
      const serialNumber = nextSerial + i;
      const itemId = `${company_prefix}0${item_name}0${serialNumber.toString().padStart(5, '0')}`;
      
      const item = await MedicalItem.create({
        id: itemId,
        company_prefix,
        serial_number: serialNumber,
        item_name,
        location: 'MSU'
      });

      await ActionHistory.create({
        id: `${Date.now()}-${i}`,
        item_id: item.id,
        item_name: item.item_name,
        company_prefix: item.company_prefix,
        action: 'registered',
        to_location: 'MSU',
        performed_by: (req as any).user.id,
        performed_by_username: (req as any).user.username,
        performed_by_role: (req as any).user.role
      });

      items.push(item);
    }

    res.json(items);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id/status', authenticateToken, async (req, res) => {
  try {
    const { location, action } = req.body;
    const item = await MedicalItem.findByPk(req.params.id);
    
    if (!item) return res.status(404).json({ error: 'Item not found' });

    const oldLocation = item.location;
    await item.update({ location });

    await ActionHistory.create({
      id: `${Date.now()}-${Math.random()}`,
      item_id: item.id,
      item_name: item.item_name,
      company_prefix: item.company_prefix,
      action,
      from_location: oldLocation,
      to_location: location,
      performed_by: (req as any).user.id
    });

    res.json(item);
  } catch (error: any) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/bulk-status', authenticateToken, async (req, res) => {
  try {
    const { itemIds, sterilized, location, action } = req.body;
    
    const updateData: any = { location };
    if (sterilized !== undefined) updateData.sterilized = sterilized;
    
    // Set status field based on action - ensure consistency
    if (action === 'marked_unsterilized') {
      updateData.status = 'Not Sterilized';
      updateData.sterilized = false;
    } else if (action.startsWith('step_')) {
      // Map step actions to consistent status values
      const stepStatusMap = {
        'step_by_hand': 'Washing by Hand',
        'step_washing': 'Automatic Washing', 
        'step_steam_sterilization': 'Steam Sterilization',
        'step_cooling': 'Cooling',
        'step_finished': 'Finished'
      };
      updateData.status = stepStatusMap[action as keyof typeof stepStatusMap] || action;
    } else if (action === 'sterilization_completed') {
      updateData.status = 'Finished';
      updateData.sterilized = true;
    }
    
    // Batch update all items
    await MedicalItem.update(updateData, { where: { id: itemIds } });
    
    // Batch create history entries
    const items = await MedicalItem.findAll({ where: { id: itemIds } });
    const historyEntries = items.map(item => ({
      id: `${Date.now()}-${item.id}`,
      item_id: item.id,
      item_name: item.item_name,
      company_prefix: item.company_prefix,
      action,
      from_location: location === 'MSU' ? 'MSU' : 'MSU',
      to_location: location,
      performed_by: (req as any).user.id
    }));
    
    await ActionHistory.bulkCreate(historyEntries);
    res.json({ message: 'Items updated' });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Server error' });
  }
});

router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const item = await MedicalItem.findByPk(req.params.id);
    if (!item) return res.status(404).json({ error: 'Item not found' });
    
    const latestStep = await ActionHistory.findOne({
      where: { item_id: item.id, action: { [Op.like]: 'step_%' } },
      order: [['timestamp', 'DESC']]
    });
    
    const stepMap = {
      'step_by_hand': 'Washing by Hand',
      'step_washing': 'Automatic Washing',
      'step_steam_sterilization': 'Steam Sterilization',
      'step_cooling': 'Cooling',
      'step_finished': 'Finished'
    };
    
    // Prioritize item status field if it's 'Not Sterilized'
    let mappedStatus;
    if (item.status === 'Not Sterilized') {
      mappedStatus = 'Not Sterilized';
    } else if (latestStep) {
      mappedStatus = stepMap[latestStep.action as keyof typeof stepMap] || 'In Process';
    } else {
      mappedStatus = item.status || 'Not Sterilized';
    }
    

    
    res.json({ ...item.toJSON(), status: mappedStatus });
  } catch (error: any) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id', authenticateToken, async (req, res) => {
  console.log('DELETE route called for item:', req.params.id);
  try {
    const item = await MedicalItem.findByPk(req.params.id);
    if (!item) {
      console.log('Item not found:', req.params.id);
      return res.status(404).json({ error: 'Item not found' });
    }

    const oldLocation = item.location;
    console.log('Found item:', item.id, 'at location:', oldLocation);

    const historyEntry = {
      id: `${Date.now()}-delete`,
      item_id: item.id,
      item_name: item.item_name,
      company_prefix: item.company_prefix,
      action: 'removed_from_inventory',
      from_location: oldLocation,
      to_location: 'DELETED',
      performed_by: (req as any).user.id
    };
    
    console.log('Creating history entry:', historyEntry);
    await ActionHistory.create(historyEntry);
    console.log('History entry created successfully');

    await item.update({ location: 'DELETED' });
    console.log('Item location updated to DELETED');

    res.json({ message: 'Item deleted', historyCreated: true });
  } catch (error: any) {
    console.error('Delete error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/clear/all', authenticateToken, requireRole(['head_admin', 'admin']), async (req, res) => {
  try {
    await MedicalItem.destroy({ where: {} });
    await ActionHistory.destroy({ where: {} });
    res.json({ message: 'All items cleared' });
  } catch (error: any) {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
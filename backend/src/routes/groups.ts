import express from 'express';
import { Op } from 'sequelize';
import { InstrumentGroup, GroupItem, MedicalItem, ActionHistory, ForwardingRequest } from '../models';
import { authenticateToken, requireRole } from '../middleware/auth';

const router = express.Router();

router.get('/', authenticateToken, async (req, res) => {
  try {
    const user = (req as any).user;
    let whereClause = {};
    
    if (user.role === 'msu') {
      whereClause = { location: 'MSU' };
    } else if (user.role === 'storage') {
      // Storage can see groups at Storage location OR groups with pending forwarding to Storage
      const pendingToStorage = await ForwardingRequest.findAll({
        where: { to_location: 'Storage', status: 'pending' },
        attributes: ['group_id']
      });
      const pendingGroupIds = pendingToStorage.map(req => req.group_id);
      
      if (pendingGroupIds.length > 0) {
        whereClause = {
          [Op.or]: [
            { location: 'Storage' },
            { id: { [Op.in]: pendingGroupIds } }
          ]
        };
      } else {
        whereClause = { location: 'Storage' };
      }
    } else if (user.role === 'surgery') {
      // Surgery can see groups at Surgery locations OR groups with pending forwarding to Surgery rooms
      const pendingToSurgery = await ForwardingRequest.findAll({
        where: { 
          to_location: { [Op.like]: '%Surgery%' }, 
          status: 'pending' 
        },
        attributes: ['group_id']
      });
      const pendingGroupIds = pendingToSurgery.map(req => req.group_id);
      
      if (pendingGroupIds.length > 0) {
        whereClause = {
          [Op.or]: [
            { location: { [Op.like]: '%Surgery%' } },
            { id: { [Op.in]: pendingGroupIds } }
          ]
        };
      } else {
        whereClause = { location: { [Op.like]: '%Surgery%' } };
      }
    }
    // Admin and head_admin see all groups (empty whereClause)
    
    const groups = await InstrumentGroup.findAll({
      where: whereClause,
      include: [{ 
        model: GroupItem, 
        as: 'GroupItems',
        include: [{ model: MedicalItem }]
      }]
    });
    res.json(groups);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', authenticateToken, requireRole(['head_admin', 'admin', 'msu', 'storage']), async (req, res) => {
  try {
    const { name, itemIds } = req.body;
    
    const items = await MedicalItem.findAll({ where: { id: itemIds } });
    if (items.length !== itemIds.length) {
      return res.status(400).json({ error: 'Some items not found' });
    }
    
    const firstItemLocation = items[0].location;
    const allSameLocation = items.every(item => item.location === firstItemLocation);
    
    if (!allSameLocation) {
      return res.status(400).json({ 
        error: 'All items must be in the same location to create a group' 
      });
    }
    
    // Business logic: Check status consistency - all items must have same status
    const getItemStatus = (item: any) => {
      const status = item.status || 'Not Sterilized';
      if (status === 'Finished' || status === 'step_finished') return 'Finished';
      if (status === 'step_by_hand' || status === 'Washing by Hand') return 'Washing by Hand';
      if (status === 'step_washing' || status === 'Automatic Washing') return 'Automatic Washing';
      if (status === 'step_steam_sterilization' || status === 'Steam Sterilization') return 'Steam Sterilization';
      if (status === 'step_cooling' || status === 'Cooling') return 'Cooling';
      if (status === 'marked_unsterilized' || status === 'Not Sterilized') return 'Not Sterilized';
      return status;
    };
    
    const firstItemStatus = getItemStatus(items[0]);
    const allSameStatus = items.every(item => getItemStatus(item) === firstItemStatus);
    
    if (!allSameStatus) {
      return res.status(400).json({ 
        error: 'All items must have the same status to create a group' 
      });
    }
    
    const groupLocation = firstItemLocation;
    
    const group = await InstrumentGroup.create({
      id: `grp-${Date.now()}`,
      name,
      location: groupLocation
    });

    for (const itemId of itemIds) {
      await GroupItem.create({
        id: `gi-${Date.now()}-${itemId}`,
        group_id: group.id,
        item_id: itemId
      });

      const item = items.find(i => i.id === itemId);
      if (item) {
        await ActionHistory.create({
          id: `${Date.now()}-${itemId}`,
          item_id: itemId,
          item_name: item.item_name,
          company_prefix: item.company_prefix,
          action: 'grouped',
          to_location: group.location,
          performed_by: (req as any).user.id,
          performed_by_username: (req as any).user.username,
          performed_by_role: (req as any).user.role
        });
      }
    }

    res.json(group);
  } catch (error: any) {
    console.error('Group creation error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id/location', authenticateToken, async (req, res) => {
  try {
    const { location } = req.body;
    const group = await InstrumentGroup.findByPk(req.params.id);
    
    if (!group) return res.status(404).json({ error: 'Group not found' });

    await group.update({ location });
    res.json(group);
  } catch (error: any) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id', authenticateToken, requireRole(['head_admin', 'admin', 'storage', 'msu']), async (req, res) => {
  try {
    // Delete forwarding requests first
    const { ForwardingRequest } = require('../models');
    await ForwardingRequest.destroy({ where: { group_id: req.params.id } });
    
    const groupItems = await GroupItem.findAll({ where: { group_id: req.params.id } });
    
    for (const groupItem of groupItems) {
      const item = await MedicalItem.findByPk(groupItem.item_id);
      if (item) {
        await ActionHistory.create({
          id: `${Date.now()}-${groupItem.item_id}`,
          item_id: groupItem.item_id,
          item_name: item.item_name,
          company_prefix: item.company_prefix,
          action: 'disbanded',
          from_location: 'Group',
          performed_by: (req as any).user.id,
          performed_by_username: (req as any).user.username,
          performed_by_role: (req as any).user.role
        });
      }
    }

    await InstrumentGroup.destroy({ where: { id: req.params.id } });
    res.json({ message: 'Group deleted' });
  } catch (error: any) {
    console.error('Group deletion error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const group = await InstrumentGroup.findByPk(req.params.id, {
      include: [{ 
        model: GroupItem, 
        as: 'GroupItems',
        include: [{ model: MedicalItem }]
      }]
    });
    
    if (!group) return res.status(404).json({ error: 'Group not found' });
    res.json(group);
  } catch (error: any) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:id/sterilizable-items', authenticateToken, async (req, res) => {
  try {
    const groupItems = await GroupItem.findAll({
      where: { group_id: req.params.id },
      include: [{
        model: MedicalItem,
        where: { location: 'MSU' }
      }]
    });
    
    const items = groupItems.map(gi => gi.MedicalItem).filter(Boolean);
    res.json(items);
  } catch (error: any) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:groupId/items/:itemId', authenticateToken, requireRole(['head_admin', 'admin', 'storage', 'msu']), async (req, res) => {
  try {
    const { groupId, itemId } = req.params;
    
    const groupItem = await GroupItem.findOne({ 
      where: { group_id: groupId, item_id: itemId } 
    });
    
    if (!groupItem) {
      return res.status(404).json({ error: 'Item not found in group' });
    }
    
    const item = await MedicalItem.findByPk(itemId);
    if (item) {
      await ActionHistory.create({
        id: `${Date.now()}-${itemId}`,
        item_id: itemId,
        item_name: item.item_name,
        company_prefix: item.company_prefix,
        action: 'removed_from_group',
        from_location: 'Group',
        performed_by: (req as any).user.id,
        performed_by_username: (req as any).user.username,
        performed_by_role: (req as any).user.role
      });
    }
    
    await groupItem.destroy();
    res.json({ message: 'Item removed from group' });
  } catch (error: any) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/available-items/:role', authenticateToken, async (req, res) => {
  try {
    const { role } = req.params;
    const { brand, type, status } = req.query;
    
    let whereClause: any = { location: { [Op.ne]: 'DELETED' } };
    
    // Role-based location filtering
    if (role === 'msu') whereClause.location = 'MSU';
    else if (role === 'storage') whereClause.location = 'Storage';
    // Admin can see all items
    
    if (brand && brand !== 'all') whereClause.company_prefix = brand;
    if (type && type !== 'all') whereClause.item_name = type;
    
    // Exclude items already in groups
    const groupItems = await GroupItem.findAll({ attributes: ['item_id'] });
    const usedItemIds = groupItems.map(gi => gi.item_id);
    if (usedItemIds.length > 0) {
      whereClause.id = { [Op.notIn]: usedItemIds };
    }
    
    let items = await MedicalItem.findAll({ where: whereClause });
    
    // Status filtering
    if (status && status !== 'all') {
      const getItemStatus = (item: any) => {
        const status = item.status || 'Not Sterilized';
        if (status === 'Finished' || status === 'step_finished') return 'Finished';
        if (status === 'step_by_hand' || status === 'Washing by Hand') return 'Washing by Hand';
        if (status === 'step_washing' || status === 'Automatic Washing') return 'Automatic Washing';
        if (status === 'step_steam_sterilization' || status === 'Steam Sterilization') return 'Steam Sterilization';
        if (status === 'step_cooling' || status === 'Cooling') return 'Cooling';
        if (status === 'marked_unsterilized' || status === 'Not Sterilized') return 'Not Sterilized';
        return status;
      };
      
      items = items.filter(item => getItemStatus(item) === status);
    }
    
    res.json(items);
  } catch (error: any) {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
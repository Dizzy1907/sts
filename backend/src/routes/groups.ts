import express from 'express';
import { Op } from 'sequelize';
import { InstrumentGroup, GroupItem, MedicalItem, ActionHistory } from '../models';
import { authenticateToken, requireRole } from '../middleware/auth';

const router = express.Router();

router.get('/', authenticateToken, async (req, res) => {
  try {
    const user = (req as any).user;
    let whereClause = {};
    
    if (user.role === 'msu') whereClause = { location: 'MSU' };
    else if (user.role === 'storage') whereClause = { location: 'Storage' };
    else if (user.role === 'surgery') whereClause = { location: { [Op.like]: '%Surgery%' } };
    
    const groups = await InstrumentGroup.findAll({
      where: whereClause,
      include: [{ model: GroupItem, include: [MedicalItem] }]
    });
    res.json(groups);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', authenticateToken, requireRole(['admin', 'msu', 'storage']), async (req, res) => {
  try {
    const { name, itemIds } = req.body;
    
    const items = await MedicalItem.findAll({ where: { id: itemIds } });
    if (items.length !== itemIds.length) {
      return res.status(400).json({ error: 'Some items not found' });
    }
    
    const sterilizedItems = items.filter(item => item.sterilized);
    const nonSterilizedItems = items.filter(item => !item.sterilized);
    
    if (sterilizedItems.length > 0 && nonSterilizedItems.length > 0) {
      return res.status(400).json({ 
        error: 'Cannot mix sterilized and non-sterilized items' 
      });
    }
    
    const firstItemLocation = items[0].location;
    const allSameLocation = items.every(item => item.location === firstItemLocation);
    
    if (!allSameLocation) {
      return res.status(400).json({ 
        error: 'All items must be in the same location to create a group' 
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
          action: 'grouped',
          to_location: group.location,
          performed_by: (req as any).user.id
        });
      }
    }

    res.json(group);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/:id/location', authenticateToken, async (req, res) => {
  try {
    const { location } = req.body;
    const group = await InstrumentGroup.findByPk(req.params.id);
    
    if (!group) return res.status(404).json({ error: 'Group not found' });

    await group.update({ location });
    res.json(group);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id', authenticateToken, requireRole(['admin', 'storage']), async (req, res) => {
  try {
    const groupItems = await GroupItem.findAll({ where: { group_id: req.params.id } });
    
    for (const groupItem of groupItems) {
      const item = await MedicalItem.findByPk(groupItem.item_id);
      if (item) {
        await ActionHistory.create({
          id: `${Date.now()}-${groupItem.item_id}`,
          item_id: groupItem.item_id,
          item_name: item.item_name,
          action: 'disbanded',
          from_location: 'Storage',
          performed_by: (req as any).user.id
        });
      }
    }

    await InstrumentGroup.destroy({ where: { id: req.params.id } });
    res.json({ message: 'Group deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const group = await InstrumentGroup.findByPk(req.params.id, {
      include: [{ model: GroupItem, include: [MedicalItem] }]
    });
    
    if (!group) return res.status(404).json({ error: 'Group not found' });
    res.json(group);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:id/sterilizable-items', authenticateToken, async (req, res) => {
  try {
    const groupItems = await GroupItem.findAll({
      where: { group_id: req.params.id },
      include: [{
        model: MedicalItem,
        where: { sterilized: false, location: 'MSU' }
      }]
    });
    
    const items = groupItems.map(gi => gi.MedicalItem).filter(Boolean);
    res.json(items);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/available-items/:role', authenticateToken, async (req, res) => {
  try {
    const { role } = req.params;
    const { brand, type, status } = req.query;
    
    let whereClause: any = {};
    
    if (role === 'msu') whereClause.location = 'MSU';
    if (role === 'storage') whereClause.location = 'Storage';
    
    if (brand && brand !== 'all') whereClause.company_prefix = brand;
    if (type && type !== 'all') whereClause.item_name = type;
    if (status === 'sterilized') whereClause.sterilized = true;
    if (status === 'non-sterilized') whereClause.sterilized = false;
    
    const groupItems = await GroupItem.findAll({ attributes: ['item_id'] });
    const usedItemIds = groupItems.map(gi => gi.item_id);
    if (usedItemIds.length > 0) {
      whereClause.id = { [Op.notIn]: usedItemIds };
    }
    
    const items = await MedicalItem.findAll({ where: whereClause });
    res.json(items);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
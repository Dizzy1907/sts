import express from 'express';
import { StoragePosition } from '../models';
import { authenticateToken, requireRole } from '../middleware/auth';

const router = express.Router();

router.get('/', authenticateToken, async (req, res) => {
  try {
    const positions = await StoragePosition.findAll({
      order: [['created_at', 'DESC']]
    });
    res.json(positions);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', authenticateToken, requireRole(['storage', 'head_admin', 'admin']), async (req, res) => {
  try {
    const { item_id, item_name, item_type, position } = req.body;
    
    // Remove existing storage record for this item if it exists
    await StoragePosition.destroy({
      where: { item_id }
    });
    
    const storagePosition = await StoragePosition.create({
      id: `storage-${Date.now()}`,
      item_id,
      item_name,
      item_type,
      position,
      stored_by: (req as any).user.id
    });

    // Create history entries for individual items in the group
    if (item_type === 'Group') {
      const { GroupItem, MedicalItem, ActionHistory } = require('../models');
      const groupItems = await GroupItem.findAll({
        where: { group_id: item_id },
        include: [{ model: MedicalItem }]
      });
      
      for (const groupItem of groupItems) {
        const item = groupItem.MedicalItem;
        if (item) {
          await ActionHistory.create({
            id: `${Date.now()}-${item.id}`,
            item_id: item.id,
            item_name: item.item_name,
            company_prefix: item.company_prefix,
            action: 'stored',
            performed_by: (req as any).user.id,
            to_location: `Storage-${position}`
          });
        }
      }
    }

    res.json(storagePosition);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', authenticateToken, requireRole(['storage', 'head_admin', 'admin']), async (req, res) => {
  try {
    const position = await StoragePosition.findByPk(req.params.id);
    if (!position) {
      return res.status(404).json({ error: 'Storage position not found' });
    }

    await position.destroy();
    res.json({ message: 'Storage position removed' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
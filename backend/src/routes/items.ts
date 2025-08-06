import express from 'express';
import { MedicalItem, ActionHistory } from '../models';
import { authenticateToken, requireRole } from '../middleware/auth';

const router = express.Router();
console.log('Items router loaded');

router.get('/', authenticateToken, async (req, res) => {
  console.log('GET /items called');
  try {
    const items = await MedicalItem.findAll({ 
      where: { location: { [require('sequelize').Op.ne]: 'DELETED' } },
      order: [['created_at', 'DESC']],
      attributes: { include: ['created_at', 'updated_at'] }
    });
    res.json(items);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/all-including-deleted', authenticateToken, async (req, res) => {
  try {
    const items = await MedicalItem.findAll({ 
      order: [['created_at', 'DESC']],
      attributes: { include: ['created_at', 'updated_at'] }
    });
    res.json(items);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/register', authenticateToken, requireRole(['admin', 'msu']), async (req, res) => {
  try {
    const { company_prefix, item_name, quantity = 1 } = req.body;
    const items = [];

    for (let i = 0; i < quantity; i++) {
      const lastItem = await MedicalItem.findOne({
        where: { company_prefix, item_name },
        order: [['serial_number', 'DESC']]
      });
      const nextSerial = lastItem ? lastItem.serial_number + 1 : 1;
      const itemId = `${company_prefix}0${item_name}0${nextSerial.toString().padStart(5, '0')}`;
      
      const item = await MedicalItem.create({
        id: itemId,
        company_prefix,
        serial_number: nextSerial,
        item_name,
        sterilized: false,
        location: 'MSU'
      });

      await ActionHistory.create({
        id: `${Date.now()}-${i}`,
        item_id: item.id,
        item_name: item.item_name,
        company_prefix: item.company_prefix,
        action: 'registered',
        to_location: 'MSU',
        performed_by: (req as any).user.id
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
    const { sterilized, location, action } = req.body;
    const item = await MedicalItem.findByPk(req.params.id);
    
    if (!item) return res.status(404).json({ error: 'Item not found' });

    const oldLocation = item.location;
    await item.update({ sterilized, location });

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
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/bulk-status', authenticateToken, async (req, res) => {
  try {
    const { itemIds, sterilized, location, action } = req.body;
    console.log('Bulk status update:', { itemIds, sterilized, location, action });
    
    for (const itemId of itemIds) {
      const item = await MedicalItem.findByPk(itemId);
      if (item) {
        const oldLocation = item.location;
        await item.update({ sterilized, location });

        await ActionHistory.create({
          id: `${Date.now()}-${itemId}`,
          item_id: item.id,
          item_name: item.item_name,
          company_prefix: item.company_prefix,
          action,
          from_location: oldLocation,
          to_location: location,
          performed_by: (req as any).user.id
        });
      }
    }

    res.json({ message: 'Items updated' });
  } catch (error: any) {
    console.error('Bulk status error:', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
});

router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const item = await MedicalItem.findByPk(req.params.id);
    if (!item) return res.status(404).json({ error: 'Item not found' });
    res.json(item);
  } catch (error) {
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
  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/clear/all', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    await MedicalItem.destroy({ where: {} });
    await ActionHistory.destroy({ where: {} });
    res.json({ message: 'All items cleared' });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
import express from 'express';
import { ActionHistory } from '../models';
import { authenticateToken, requireRole } from '../middleware/auth';

const router = express.Router();

router.get('/', authenticateToken, async (req, res) => {
  try {
    const { action, itemId, limit = 100 } = req.query;
    const where: any = {};
    
    if (action) where.action = action;
    if (itemId) where.item_id = itemId;

    const history = await ActionHistory.findAll({
      where,
      order: [['timestamp', 'DESC']],
      limit: parseInt(limit as string)
    });
    
    res.json(history);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/clear', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    await ActionHistory.destroy({ where: {} });
    res.json({ message: 'History cleared' });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
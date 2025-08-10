import express from 'express';
import { MedicalItem, ActionHistory } from '../models';
import { authenticateToken } from '../middleware/auth';

const router = express.Router();

// Steam sterilization with validation
router.post('/steam', authenticateToken, async (req, res) => {
  try {
    const { itemIds, heat, psi, duration } = req.body;

    // Backend validation
    if (heat < 121) {
      return res.status(400).json({ error: 'Heat must be at least 121°C' });
    }
    if (psi < 15) {
      return res.status(400).json({ error: 'PSI must be at least 15' });
    }
    if (duration < 30) {
      return res.status(400).json({ error: 'Duration must be at least 30 minutes' });
    }

    // Update items status
    await MedicalItem.update(
      { status: 'step_cooling' },
      { where: { id: itemIds } }
    );

    // Log only cooling step (final result)
    for (let i = 0; i < itemIds.length; i++) {
      const itemId = itemIds[i];
      await ActionHistory.create({
        id: `${Date.now()}-${i}`,
        item_id: itemId,
        item_name: 'Cooling',
        company_prefix: '',
        action: 'step_cooling',
        from_location: 'MSU',
        to_location: 'MSU',
        performed_by: (req as any).user.id
      });
    }

    res.json({ message: `Steam sterilization completed: ${heat}°C, ${psi} PSI, ${duration} minutes` });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Validate cooling time (10 minutes rule)
router.post('/validate-cooling', authenticateToken, async (req, res) => {
  try {
    const { itemIds } = req.body;

    for (const itemId of itemIds) {
      const coolingHistory = await ActionHistory.findOne({
        where: { item_id: itemId, action: 'step_cooling' },
        order: [['timestamp', 'DESC']]
      });

      if (coolingHistory) {
        const coolingTime = new Date((coolingHistory as any).timestamp).getTime();
        const currentTime = new Date().getTime();
        const timeDiff = (currentTime - coolingTime) / (1000 * 60);

        if (timeDiff < 10) {
          return res.status(400).json({ 
            error: `Must wait 10 minutes after cooling. ${Math.ceil(10 - timeDiff)} minutes remaining.` 
          });
        }
      }
    }

    res.json({ valid: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
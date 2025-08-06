import express from 'express';
import { Op } from 'sequelize';
import { ForwardingRequest, InstrumentGroup, GroupItem, MedicalItem, ActionHistory } from '../models';
import { authenticateToken, requireRole } from '../middleware/auth';

const router = express.Router();

router.get('/', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const requests = await ForwardingRequest.findAll({
      include: [InstrumentGroup],
      order: [['created_at', 'DESC']]
    });
    res.json(requests);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/pending', authenticateToken, async (req, res) => {
  try {
    const requests = await ForwardingRequest.findAll({
      include: [{ model: InstrumentGroup, include: [{ model: GroupItem, include: [MedicalItem] }] }],
      order: [['created_at', 'DESC']]
    });
    res.json(requests);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/', authenticateToken, async (req, res) => {
  try {
    const { group_id, to_location } = req.body;
    
    const group = await InstrumentGroup.findByPk(group_id, {
      include: [{ model: GroupItem, include: [MedicalItem] }]
    });
    if (!group) return res.status(404).json({ error: 'Group not found' });
    
    const request = await ForwardingRequest.create({
      id: `fwd-${Date.now()}`,
      group_id,
      from_location: group.location,
      to_location,
      status: 'pending',
      requested_by: (req as any).user.id
    });

    // Log forwarding request creation in history
    const groupItems = (group as any).GroupItems || [];
    for (const groupItem of groupItems) {
      const item = groupItem.MedicalItem;
      if (item) {
        await ActionHistory.create({
          id: `${Date.now()}-${groupItem.item_id}-req`,
          item_id: groupItem.item_id,
          item_name: item.item_name,
          company_prefix: item.company_prefix,
          action: 'forwarding_requested',
          from_location: group.location,
          to_location,
          performed_by: (req as any).user.id
        });
      }
    }

    res.json(request);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/:id/accept', authenticateToken, async (req, res) => {
  try {
    const request = await ForwardingRequest.findByPk(req.params.id);
    if (!request) return res.status(404).json({ error: 'Request not found' });

    await request.update({
      status: 'accepted',
      processed_by: (req as any).user.id,
      processed_at: new Date()
    });

    const group = await InstrumentGroup.findByPk(request.group_id);
    if (group) {
      await group.update({ location: request.to_location });

      const groupItems = await GroupItem.findAll({ where: { group_id: request.group_id } });

      for (const groupItem of groupItems) {
        const item = await MedicalItem.findByPk(groupItem.item_id);
        if (item) {
          await item.update({ location: request.to_location });
          
          await ActionHistory.create({
            id: `${Date.now()}-${groupItem.item_id}`,
            item_id: groupItem.item_id,
            item_name: item.item_name,
            action: 'forwarded',
            from_location: request.from_location,
            to_location: request.to_location,
            performed_by: (req as any).user.id
          });
        }
      }
    }

    res.json(request);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/:id/reject', authenticateToken, async (req, res) => {
  try {
    const { reason } = req.body;
    const request = await ForwardingRequest.findByPk(req.params.id);
    if (!request) return res.status(404).json({ error: 'Request not found' });

    await request.update({
      status: 'rejected',
      rejection_reason: reason,
      processed_by: (req as any).user.id,
      processed_at: new Date()
    });

    const group = await InstrumentGroup.findByPk(request.group_id);
    if (group) {
      const groupItems = await GroupItem.findAll({ where: { group_id: request.group_id } });
      
      for (const groupItem of groupItems) {
        const item = await MedicalItem.findByPk(groupItem.item_id);
        if (item) {
          await ActionHistory.create({
            id: `${Date.now()}-${groupItem.item_id}-rej`,
            item_id: groupItem.item_id,
            item_name: item.item_name,
            company_prefix: item.company_prefix,
            action: 'rejected',
            from_location: request.to_location,
            to_location: request.from_location,
            performed_by: (req as any).user.id
          });
        }
      }
      
      if (reason === 'not_properly_packaged') {
        await group.update({ location: 'MSU' });
        
        for (const groupItem of groupItems) {
          const item = await MedicalItem.findByPk(groupItem.item_id);
          if (item) {
            await item.update({ sterilized: false, location: 'MSU' });
            
            await ActionHistory.create({
              id: `${Date.now()}-${groupItem.item_id}-ret`,
              item_id: groupItem.item_id,
              item_name: item.item_name,
              company_prefix: item.company_prefix,
              action: 'forwarded',
              from_location: request.to_location,
              to_location: 'MSU',
              performed_by: (req as any).user.id
            });
          }
        }
      }
    }

    res.json(request);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
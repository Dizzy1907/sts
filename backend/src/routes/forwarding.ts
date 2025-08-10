import express from 'express';
import { Op } from 'sequelize';
import { ForwardingRequest, InstrumentGroup, GroupItem, MedicalItem, ActionHistory } from '../models';
import { authenticateToken, requireRole } from '../middleware/auth';

const router = express.Router();

router.get('/', authenticateToken, async (req, res) => {
  try {
    const requests = await ForwardingRequest.findAll({
      include: [InstrumentGroup],
      order: [['created_at', 'DESC']]
    });
    res.json(requests);
  } catch (error: any) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/pending', authenticateToken, async (req, res) => {
  try {
    const user = (req as any).user;
    let whereClause: any = { status: 'pending' };
    
    if (user.role === 'msu') whereClause.to_location = 'MSU';
    else if (user.role === 'storage') whereClause.to_location = 'Storage';
    else if (user.role === 'surgery') whereClause.to_location = { [Op.like]: '%Surgery%' };
    
    const requests = await ForwardingRequest.findAll({
      where: whereClause,
      include: [InstrumentGroup],
      order: [['created_at', 'DESC']]
    });
    res.json(requests);
  } catch (error: any) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/', authenticateToken, async (req, res) => {
  try {
    const { group_id, to_location } = req.body;
    const user = (req as any).user;
    
    const group = await InstrumentGroup.findByPk(group_id);
    if (!group) return res.status(404).json({ error: 'Group not found' });
    
    const existingRequest = await ForwardingRequest.findOne({
      where: { group_id, status: 'pending' }
    });
    
    if (existingRequest) {
      return res.status(400).json({ error: 'Pending request already exists for this group' });
    }
    
    const request = await ForwardingRequest.create({
      id: `fwd-${Date.now()}`,
      group_id,
      from_location: group.location,
      to_location,
      requested_by: user.id
    });
    
    const groupItems = await GroupItem.findAll({
      where: { group_id },
      include: [MedicalItem]
    });
    
    for (const groupItem of groupItems) {
      if (groupItem.MedicalItem) {
        await ActionHistory.create({
          id: `${Date.now()}-${groupItem.item_id}`,
          item_id: groupItem.item_id,
          item_name: groupItem.MedicalItem.item_name,
          company_prefix: groupItem.MedicalItem.company_prefix,
          action: 'forwarding_requested',
          from_location: group.location,
          to_location,
          performed_by: user.id
        });
      }
    }
    
    res.json(request);
  } catch (error: any) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/:id/accept', authenticateToken, async (req, res) => {
  try {
    const request = await ForwardingRequest.findByPk(req.params.id);
    if (!request) return res.status(404).json({ error: 'Request not found' });
    
    const group = await InstrumentGroup.findByPk(request.group_id);
    if (!group) return res.status(404).json({ error: 'Group not found' });
    
    await request.update({
      status: 'accepted',
      processed_by: (req as any).user.id,
      processed_at: new Date()
    });
    
    await group.update({ location: request.to_location });
    
    const groupItems = await GroupItem.findAll({
      where: { group_id: request.group_id },
      include: [MedicalItem]
    });
    
    for (const groupItem of groupItems) {
      if (groupItem.MedicalItem) {
        await groupItem.MedicalItem.update({ location: request.to_location });
        
        await ActionHistory.create({
          id: `${Date.now()}-${groupItem.item_id}`,
          item_id: groupItem.item_id,
          item_name: groupItem.MedicalItem.item_name,
          company_prefix: groupItem.MedicalItem.company_prefix,
          action: 'forwarded',
          from_location: request.from_location,
          to_location: request.to_location,
          performed_by: (req as any).user.id
        });
      }
    }
    
    res.json(request);
  } catch (error: any) {
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
    
    const groupItems = await GroupItem.findAll({
      where: { group_id: request.group_id },
      include: [MedicalItem]
    });
    
    for (const groupItem of groupItems) {
      if (groupItem.MedicalItem) {
        await ActionHistory.create({
          id: `${Date.now()}-${groupItem.item_id}`,
          item_id: groupItem.item_id,
          item_name: groupItem.MedicalItem.item_name,
          company_prefix: groupItem.MedicalItem.company_prefix,
          action: 'rejected',
          from_location: request.from_location,
          to_location: request.to_location,
          performed_by: (req as any).user.id
        });
      }
    }
    
    res.json(request);
  } catch (error: any) {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
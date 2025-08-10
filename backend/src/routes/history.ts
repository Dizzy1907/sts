import express from 'express';
import { ActionHistory, User, MedicalItem } from '../models';
import { authenticateToken, requireRole } from '../middleware/auth';

const router = express.Router();

router.get('/', authenticateToken, async (req, res) => {
  try {
    const { action, itemId, limit, page = '1', pageSize = '50', userRole, userId } = req.query;
    let whereClause: any = {};
    let includeClause: any = { model: User, attributes: ['username', 'role'], required: false };
    
    if (action) whereClause.action = action;
    if (itemId) whereClause.item_id = itemId;
    if (userRole) includeClause.where = { role: userRole };
    if (userId) whereClause.performed_by = userId;
    
    const pageNum = parseInt(page as string);
    const pageSizeNum = parseInt(pageSize as string);
    const offset = (pageNum - 1) * pageSizeNum;
    
    const { count, rows: history } = await ActionHistory.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: User,
          attributes: ['username', 'role'],
          required: false,
          where: userRole ? { role: userRole } : undefined
        },
        {
          model: MedicalItem,
          attributes: ['company_prefix'],
          required: false
        }
      ],
      order: [['timestamp', 'DESC']],
      limit: limit ? parseInt(limit as string) : pageSizeNum,
      offset: limit ? 0 : offset
    });
    
    res.json({
      data: history,
      pagination: {
        currentPage: pageNum,
        pageSize: pageSizeNum,
        totalItems: count,
        totalPages: Math.ceil(count / pageSizeNum)
      }
    });
  } catch (error: any) {
    console.error('History API error:', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
});

router.post('/migrate-user-data', authenticateToken, requireRole(['head_admin', 'admin']), async (req, res) => {
  try {
    const { Op } = require('sequelize');
    const historyRecords = await ActionHistory.findAll({
      where: {
        performed_by: { [Op.ne]: null },
        performed_by_username: null
      },
      include: [{ model: User, attributes: ['username', 'role'], required: false }]
    });
    
    let updatedCount = 0;
    for (const record of historyRecords) {
      const recordWithUser = record as any;
      if (recordWithUser.User) {
        await record.update({
          performed_by_username: recordWithUser.User.username,
          performed_by_role: recordWithUser.User.role
        });
        updatedCount++;
      }
    }
    
    res.json({ message: `Updated ${updatedCount} history records out of ${historyRecords.length} found` });
  } catch (error: any) {
    console.error('Migration error:', error);
    res.status(500).json({ error: error.message || 'Migration failed' });
  }
});

router.delete('/clear', authenticateToken, requireRole(['head_admin', 'admin']), async (req, res) => {
  try {
    await ActionHistory.destroy({ where: {} });
    res.json({ message: 'History cleared' });
  } catch (error: any) {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
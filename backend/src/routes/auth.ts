import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User, ActionHistory, ForwardingRequest, StoragePosition } from '../models';
import { authenticateToken, requireRole } from '../middleware/auth';

const router = express.Router();

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ where: { username } });

    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    if (!user.password_hash) {
      return res.json({ requirePasswordSet: true, userId: user.id });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET!);
    res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/set-password', async (req, res) => {
  try {
    const { userId, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    
    await User.update({ password_hash: hashedPassword }, { where: { id: userId } });
    
    const user = await User.findByPk(userId);
    const token = jwt.sign({ id: user!.id, role: user!.role }, process.env.JWT_SECRET!);
    
    res.json({ token, user: { id: user!.id, username: user!.username, role: user!.role } });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/users', authenticateToken, async (req, res) => {
  try {
    const users = await User.findAll({ attributes: ['id', 'username', 'role', 'password_hash', 'created_at'] });
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/users', authenticateToken, requireRole(['head_admin', 'admin']), async (req, res) => {
  try {
    const { username, role } = req.body;
    const user = await User.create({
      id: `${Date.now()}-${Math.random()}`,
      username,
      role,
      password_hash: null
    });
    
    // Log user creation to history
    await ActionHistory.create({
      id: `${Date.now()}-user-created`,
      item_id: user.id,
      item_name: username,
      action: 'user_created',
      to_location: 'System',
      performed_by: (req as any).user.id,
      performed_by_username: (req as any).user.username,
      performed_by_role: (req as any).user.role
    });
    
    res.json({ id: user.id, username: user.username, role: user.role });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/users/:id', authenticateToken, requireRole(['head_admin', 'admin']), async (req, res) => {
  try {
    const { username, role } = req.body;
    await User.update({ username, role }, { where: { id: req.params.id } });
    const user = await User.findByPk(req.params.id, { attributes: ['id', 'username', 'role'] });
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/users/:id', authenticateToken, requireRole(['head_admin', 'admin']), async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    if (user.role === 'head_admin') {
      return res.status(403).json({ error: 'Head administrators cannot be deleted' });
    }
    
    // Log user deletion to history before deletion
    await ActionHistory.create({
      id: `${Date.now()}-user-deleted`,
      item_id: user.id,
      item_name: user.username,
      action: 'user_deleted',
      from_location: 'System',
      performed_by: (req as any).user.id,
      performed_by_username: (req as any).user.username,
      performed_by_role: (req as any).user.role
    });
    
    // Handle foreign key constraints - set performed_by to null but keep username/role
    await ActionHistory.update({ performed_by: null }, { where: { performed_by: req.params.id } });
    await ForwardingRequest.update({ requested_by: null }, { where: { requested_by: req.params.id } });
    await ForwardingRequest.update({ processed_by: null }, { where: { processed_by: req.params.id } });
    await StoragePosition.destroy({ where: { stored_by: req.params.id } });
    
    await User.destroy({ where: { id: req.params.id } });
    res.json({ message: 'User deleted' });
  } catch (error: any) {
    console.error('User deletion error:', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
});

export default router;
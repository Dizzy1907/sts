import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User } from '../models';
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

router.post('/users', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const { username, role } = req.body;
    const user = await User.create({
      id: `${Date.now()}-${Math.random()}`,
      username,
      role,
      password_hash: null
    });
    res.json({ id: user.id, username: user.username, role: user.role });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/users/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const { username, role } = req.body;
    await User.update({ username, role }, { where: { id: req.params.id } });
    const user = await User.findByPk(req.params.id, { attributes: ['id', 'username', 'role'] });
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/users/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    await User.destroy({ where: { id: req.params.id } });
    res.json({ message: 'User deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
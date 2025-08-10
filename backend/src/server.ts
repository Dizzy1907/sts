import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { sequelize } from './models';
import { initializeDatabase } from './utils/dbInit';
import authRoutes from './routes/auth';
import itemRoutes from './routes/items';
import groupRoutes from './routes/groups';
import historyRoutes from './routes/history';
import forwardingRoutes from './routes/forwarding';
import storageRoutes from './routes/storage';
import exportRoutes from './routes/export';
import sterilizationRoutes from './routes/sterilization';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3001;

app.use(cors({
  origin: true, // Allow all origins in development
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));

// Log all requests
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

app.use('/api/auth', authRoutes);
app.use('/api/items', itemRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/history', historyRoutes);
app.use('/api/forwarding', forwardingRoutes);
app.use('/api/storage', storageRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/sterilization', sterilizationRoutes);

app.get('/api/health', (req, res) => res.json({ status: 'OK' }));

const startServer = async () => {
  try {
    await initializeDatabase();
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`API available at http://localhost:${PORT}/api`);
      console.log(`API also available at http://10.11.12.50:${PORT}/api`);
    });
  } catch (error) {
    console.error('Server startup failed:', error);
    process.exit(1);
  }
};

startServer();
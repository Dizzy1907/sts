import { sequelize } from '../models';

export const initializeDatabase = async (retries = 3): Promise<void> => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await sequelize.authenticate();
      console.log('Database connection established');

      await sequelize.sync({ force: false });
      console.log('Database schema synchronized successfully');
      return;

    } catch (error: any) {
      console.error(`Database sync attempt ${attempt} failed:`, error.message);
      
      if (error.original?.code === 'ER_LOCK_DEADLOCK') {
        if (attempt < retries) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
          console.log(`Deadlock detected, waiting ${delay}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
      }
      
      if (attempt === retries) {
        throw new Error(`Database initialization failed after ${retries} attempts: ${error.message}`);
      }
    }
  }
};
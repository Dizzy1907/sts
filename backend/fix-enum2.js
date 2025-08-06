const mysql = require('mysql2/promise');
require('dotenv').config();

async function fixDatabase() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'medical_sterilization'
  });

  try {
    // Add the missing enum value
    await connection.execute(`
      ALTER TABLE action_history 
      MODIFY COLUMN action ENUM(
        'registered', 'sterilized', 'used', 'grouped', 'disbanded', 
        'forwarded', 'received', 'removed_from_inventory', 'marked_unsterilized', 
        'sterilization_completed', 'step_by_hand', 'step_washing', 
        'step_steam_sterilization', 'step_cooling', 'step_finished', 
        'forwarding_requested', 'rejected'
      ) NOT NULL
    `);
    
    console.log('Database updated successfully');
  } catch (error) {
    console.error('Error updating database:', error);
  } finally {
    await connection.end();
  }
}

fixDatabase();
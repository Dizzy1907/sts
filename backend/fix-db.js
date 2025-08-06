const mysql = require('mysql2/promise');
require('dotenv').config();

async function fixDatabase() {
  let connection;
  
  try {
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || 'password',
      database: 'medical_sterilization'
    });
    
    // Fix users table
    await connection.query(`
      ALTER TABLE users 
      MODIFY COLUMN password_hash VARCHAR(255) NULL
    `);
    
    // Fix medical_items table
    await connection.query(`
      ALTER TABLE medical_items 
      MODIFY COLUMN item_name VARCHAR(100) NOT NULL
    `);
    
    // Fix action_history table
    await connection.query(`
      ALTER TABLE action_history 
      ADD COLUMN IF NOT EXISTS company_prefix VARCHAR(10),
      MODIFY COLUMN action ENUM('registered', 'sterilized', 'used', 'grouped', 'disbanded', 'forwarded', 'received', 'removed_from_inventory', 'marked_unsterilized', 'sterilization_completed', 'step_by_hand', 'step_washing', 'step_steam_sterilization', 'step_cooling', 'step_finished') NOT NULL
    `);
    
    console.log('Database schema fixed!');
    
  } catch (error) {
    console.error('Fix failed:', error.message);
  } finally {
    if (connection) await connection.end();
  }
}

fixDatabase();
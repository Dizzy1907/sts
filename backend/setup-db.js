const mysql = require('mysql2/promise');
require('dotenv').config();

async function setupDatabase() {
  let connection;
  
  try {
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || 'password'
    });
    
    await connection.query(`CREATE DATABASE IF NOT EXISTS medical_sterilization`);
    await connection.end();
    
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || 'password',
      database: 'medical_sterilization'
    });
    
    await connection.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(255) PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255),
        role ENUM('admin', 'msu', 'storage', 'surgery') NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    await connection.query(`
      CREATE TABLE IF NOT EXISTS medical_items (
        id VARCHAR(255) PRIMARY KEY,
        company_prefix VARCHAR(10) NOT NULL,
        serial_number INT NOT NULL,
        item_name VARCHAR(10) NOT NULL,
        sterilized BOOLEAN DEFAULT FALSE,
        location VARCHAR(255) DEFAULT 'MSU',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    await connection.query(`
      CREATE TABLE IF NOT EXISTS instrument_groups (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        location VARCHAR(255) DEFAULT 'MSU',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    await connection.query(`
      CREATE TABLE IF NOT EXISTS group_items (
        id VARCHAR(255) PRIMARY KEY,
        group_id VARCHAR(255) NOT NULL,
        item_id VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    await connection.query(`
      CREATE TABLE IF NOT EXISTS action_history (
        id VARCHAR(255) PRIMARY KEY,
        item_id VARCHAR(255) NOT NULL,
        item_name VARCHAR(255),
        action VARCHAR(255) NOT NULL,
        from_location VARCHAR(255),
        to_location VARCHAR(255),
        performed_by VARCHAR(255),
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    await connection.query(`
      CREATE TABLE IF NOT EXISTS forwarding_requests (
        id VARCHAR(255) PRIMARY KEY,
        group_id VARCHAR(255) NOT NULL,
        from_location VARCHAR(255) NOT NULL,
        to_location VARCHAR(255) NOT NULL,
        status ENUM('pending', 'accepted', 'rejected') DEFAULT 'pending',
        rejection_reason VARCHAR(255),
        requested_by VARCHAR(255),
        processed_by VARCHAR(255),
        processed_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    await connection.query(`
      INSERT IGNORE INTO users (id, username, password_hash, role) 
      VALUES ('admin-1', 'admin', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'admin')
    `);
    
    console.log('Database setup completed!');
    console.log('Default admin: admin / password');
    
  } catch (error) {
    console.error('Setup failed:', error);
  } finally {
    if (connection) await connection.end();
  }
}

setupDatabase();
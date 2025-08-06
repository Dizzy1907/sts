const mysql = require('mysql2/promise');
require('dotenv').config();

async function recreateDatabase() {
  let connection;
  
  try {
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || 'password'
    });
    
    await connection.query(`DROP DATABASE IF EXISTS medical_sterilization`);
    await connection.query(`CREATE DATABASE medical_sterilization`);
    await connection.end();
    
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || 'password',
      database: 'medical_sterilization'
    });
    
    await connection.query(`
      CREATE TABLE users (
        id VARCHAR(255) PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NULL,
        role ENUM('admin', 'msu', 'storage', 'surgery') NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    
    await connection.query(`
      CREATE TABLE medical_items (
        id VARCHAR(255) PRIMARY KEY,
        company_prefix VARCHAR(10) NOT NULL,
        serial_number INT NOT NULL,
        item_name VARCHAR(100) NOT NULL,
        sterilized BOOLEAN DEFAULT FALSE,
        location VARCHAR(100) DEFAULT 'MSU',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    
    await connection.query(`
      CREATE TABLE instrument_groups (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        location VARCHAR(100) DEFAULT 'Storage',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    
    await connection.query(`
      CREATE TABLE group_items (
        id VARCHAR(255) PRIMARY KEY,
        group_id VARCHAR(255) NOT NULL,
        item_id VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    
    await connection.query(`
      CREATE TABLE action_history (
        id VARCHAR(255) PRIMARY KEY,
        item_id VARCHAR(255),
        item_name VARCHAR(100) NOT NULL,
        company_prefix VARCHAR(10),
        action ENUM('registered', 'sterilized', 'used', 'grouped', 'disbanded', 'forwarded', 'received', 'removed_from_inventory', 'marked_unsterilized', 'sterilization_completed', 'step_by_hand', 'step_washing', 'step_steam_sterilization', 'step_cooling', 'step_finished') NOT NULL,
        from_location VARCHAR(100),
        to_location VARCHAR(100),
        performed_by VARCHAR(255),
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    
    await connection.query(`
      CREATE TABLE forwarding_requests (
        id VARCHAR(255) PRIMARY KEY,
        group_id VARCHAR(255) NOT NULL,
        from_location VARCHAR(100) NOT NULL,
        to_location VARCHAR(100) NOT NULL,
        status ENUM('pending', 'accepted', 'rejected') DEFAULT 'pending',
        rejection_reason VARCHAR(100),
        requested_by VARCHAR(255),
        processed_by VARCHAR(255),
        processed_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    
    await connection.query(`
      INSERT INTO users (id, username, password_hash, role) 
      VALUES ('admin-1', 'admin', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'admin')
    `);
    
    console.log('Database recreated successfully!');
    console.log('Login: admin / password');
    
  } catch (error) {
    console.error('Failed:', error.message);
  } finally {
    if (connection) await connection.end();
  }
}

recreateDatabase();
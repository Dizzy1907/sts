-- Medical Sterilization Unit Database Schema
CREATE DATABASE IF NOT EXISTS medical_sterilization;
USE medical_sterilization;

-- Users table for authentication
CREATE TABLE users (
    id VARCHAR(36) PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255),
    role ENUM('admin', 'msu', 'storage', 'surgery') NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Medical instruments registry
CREATE TABLE medical_items (
    id VARCHAR(36) PRIMARY KEY,
    company_prefix VARCHAR(10) NOT NULL,
    serial_number INT AUTO_INCREMENT,
    item_name VARCHAR(100) NOT NULL,
    sterilized BOOLEAN DEFAULT FALSE,
    location VARCHAR(100) DEFAULT 'MSU',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_company_serial (company_prefix, serial_number),
    INDEX idx_sterilized (sterilized),
    INDEX idx_location (location)
);

-- Instrument groups for batch management
CREATE TABLE instrument_groups (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    location VARCHAR(100) DEFAULT 'Storage',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Group membership linking table
CREATE TABLE group_items (
    id VARCHAR(36) PRIMARY KEY,
    group_id VARCHAR(36) NOT NULL,
    item_id VARCHAR(36) NOT NULL,
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (group_id) REFERENCES instrument_groups(id) ON DELETE CASCADE,
    FOREIGN KEY (item_id) REFERENCES medical_items(id) ON DELETE CASCADE,
    UNIQUE KEY unique_group_item (group_id, item_id)
);

-- Action history for audit trail
CREATE TABLE action_history (
    id VARCHAR(36) PRIMARY KEY,
    item_id VARCHAR(36),
    item_name VARCHAR(100) NOT NULL,
    action ENUM('registered', 'sterilized', 'used', 'grouped', 'disbanded', 'forwarded', 'received') NOT NULL,
    from_location VARCHAR(100),
    to_location VARCHAR(100),
    performed_by VARCHAR(36),
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (item_id) REFERENCES medical_items(id) ON DELETE SET NULL,
    FOREIGN KEY (performed_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_action (action),
    INDEX idx_item_id (item_id),
    INDEX idx_timestamp (timestamp)
);

-- Department forwarding requests
CREATE TABLE forwarding_requests (
    id VARCHAR(36) PRIMARY KEY,
    group_id VARCHAR(36) NOT NULL,
    from_location VARCHAR(100) NOT NULL,
    to_location VARCHAR(100) NOT NULL,
    status ENUM('pending', 'accepted', 'rejected') DEFAULT 'pending',
    rejection_reason VARCHAR(100),
    requested_by VARCHAR(36),
    processed_by VARCHAR(36),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    processed_at TIMESTAMP NULL,
    FOREIGN KEY (group_id) REFERENCES instrument_groups(id) ON DELETE CASCADE,
    FOREIGN KEY (requested_by) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (processed_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Insert default admin user (password: admin123)
INSERT INTO users (id, username, password_hash, role) VALUES 
('admin-001', 'admin', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'admin');
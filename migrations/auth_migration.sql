-- Admin authentication migration
-- Creates admin sessions table for session-based authentication

CREATE TABLE IF NOT EXISTS admin_sessions (
    id VARCHAR(255) PRIMARY KEY,
    username VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    INDEX idx_username (username),
    INDEX idx_expires_at (expires_at)
);
-- Active: 1752859025384@@127.0.0.1@3306@news_portal
CREATE TABLE IF NOT EXISTS prompt_templates (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    template TEXT NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sources (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    url VARCHAR(500) NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS topics (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Insert default sources
INSERT INTO sources (name, url, description, is_active) VALUES
('StackedHomes', 'https://stackedhomes.com/', 'Singapore property news and analysis', 1),
('EdgeProp', 'https://www.edgeprop.sg/', 'Singapore property market insights', 1)
ON DUPLICATE KEY UPDATE name=name;

-- Insert default topics
INSERT INTO topics (name, description, is_active) VALUES
('HDB', 'Housing Development Board related news', 1),
('Condo', 'Condominium and private property news', 1),
('Landed', 'Landed property and houses news', 1),
('Finance', 'Financial and mortgage related news', 1)
ON DUPLICATE KEY UPDATE name=name;
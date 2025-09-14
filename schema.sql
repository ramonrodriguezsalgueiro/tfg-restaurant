CREATE DATABASE IF NOT EXISTS tfg CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;


-- Users
CREATE TABLE IF NOT EXISTS users (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  username VARCHAR(50) NOT NULL UNIQUE,
  email VARCHAR(120) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('customer','employee','admin') NOT NULL DEFAULT 'customer',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Restaurant settings (single row)
CREATE TABLE IF NOT EXISTS restaurant_settings (
  id TINYINT PRIMARY KEY,
  slot_minutes INT NOT NULL DEFAULT 90,
  slot_capacity INT NOT NULL DEFAULT 40
);
INSERT INTO restaurant_settings (id, slot_minutes, slot_capacity)
VALUES (1, 90, 40) ON DUPLICATE KEY UPDATE slot_minutes=VALUES(slot_minutes), slot_capacity=VALUES(slot_capacity);

-- Reservations
CREATE TABLE IF NOT EXISTS reservations (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  party_size INT NOT NULL,
  date DATE NOT NULL,
  time TIME NOT NULL,
  status ENUM('pending','confirmed','seated','completed','cancelled') NOT NULL DEFAULT 'pending',
  notes VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_res_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_date_time (date, time)
);

-- Menu items
CREATE TABLE IF NOT EXISTS menu_items (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  description VARCHAR(255),
  price DECIMAL(10,2) NOT NULL,
  active TINYINT NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Orders
CREATE TABLE IF NOT EXISTS orders (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT,
  status ENUM('new','preparing','ready','served','cancelled') NOT NULL DEFAULT 'new',
  method ENUM('dine-in','pickup') NOT NULL DEFAULT 'dine-in',
  table_number VARCHAR(10),
  notes VARCHAR(255),
  payment_status ENUM('unpaid','authorized','paid','failed') NOT NULL DEFAULT 'unpaid',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_orders_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS order_items (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  order_id BIGINT NOT NULL,
  menu_item_id BIGINT NOT NULL,
  qty INT NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  CONSTRAINT fk_oi_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_oi_menu FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE RESTRICT
);

-- Inventory
CREATE TABLE IF NOT EXISTS inventory_items (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  sku VARCHAR(50) UNIQUE,
  unit VARCHAR(20) DEFAULT 'unidad',
  quantity DECIMAL(10,2) NOT NULL DEFAULT 0,
  reorder_level DECIMAL(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

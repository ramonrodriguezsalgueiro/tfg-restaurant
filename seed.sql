USE restaurant_app;

-- User seeds (password: Password123!)
INSERT INTO users (username, email, password_hash, role)
VALUES
  ('employee', 'employee@example.com', '$2b$10$rwQtI3UQxOepjuv2F6oPyOZX8.7p7D7rJtuXnAzLz4H3tzbDjCIOe', 'employee'),
  ('customer', 'customer@example.com', '$2b$10$rwQtI3UQxOepjuv2F6oPyOZX8.7p7D7rJtuXnAzLz4H3tzbDjCIOe', 'customer')
ON DUPLICATE KEY UPDATE email=VALUES(email);

-- Sample menu
INSERT INTO menu_items (name, description, price, active) VALUES
 ('Hamburguesa clásica','Con queso y patatas',9.90,1),
 ('Ensalada César','Pollo y croutons',8.50,1),
 ('Pizza Margarita','Tomate, mozzarella y albahaca',10.50,1),
 ('Limonada','Casera',2.90,1);

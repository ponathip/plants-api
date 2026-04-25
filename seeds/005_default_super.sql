INSERT INTO users (name, email, username, password, role)
VALUES (
  'Super Admin',
  'super@example.com',
  'Admin',
  '$2b$10$REPLACE_WITH_BCRYPT_HASH',
  'super'
);
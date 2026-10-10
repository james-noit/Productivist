-- BCrypt hash. Null for accounts created before passwords existed: such an account can be claimed once by signing up
-- with its email (which sets the password), and cannot be logged into until then.
ALTER TABLE users ADD COLUMN password_hash TEXT;

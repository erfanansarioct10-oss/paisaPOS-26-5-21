-- Add is_favorite column to products table for Quick-Access Favorite Chips
ALTER TABLE products ADD COLUMN is_favorite BOOLEAN NOT NULL DEFAULT false;

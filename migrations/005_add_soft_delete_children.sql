ALTER TABLE purchase_items
ADD COLUMN deleted_at DATETIME NULL AFTER shipping_allocated,
ADD COLUMN deleted_by INT NULL AFTER deleted_at,
ADD COLUMN restored_at DATETIME NULL AFTER deleted_by,
ADD COLUMN restored_by INT NULL AFTER restored_at;

ALTER TABLE purchase_images
ADD COLUMN deleted_at DATETIME NULL AFTER created_at,
ADD COLUMN deleted_by INT NULL AFTER deleted_at,
ADD COLUMN restored_at DATETIME NULL AFTER deleted_by,
ADD COLUMN restored_by INT NULL AFTER restored_at;

ALTER TABLE sale_items
ADD COLUMN deleted_at DATETIME NULL AFTER note,
ADD COLUMN deleted_by INT NULL AFTER deleted_at,
ADD COLUMN restored_at DATETIME NULL AFTER deleted_by,
ADD COLUMN restored_by INT NULL AFTER restored_at;
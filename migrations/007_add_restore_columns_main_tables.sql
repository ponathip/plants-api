ALTER TABLE plants
ADD COLUMN restored_at DATETIME NULL AFTER deleted_by,
ADD COLUMN restored_by INT NULL AFTER restored_at;

ALTER TABLE purchases
ADD COLUMN restored_at DATETIME NULL AFTER deleted_by,
ADD COLUMN restored_by INT NULL AFTER restored_at;

ALTER TABLE sales
ADD COLUMN restored_at DATETIME NULL AFTER deleted_by,
ADD COLUMN restored_by INT NULL AFTER restored_at;

ALTER TABLE expenses
ADD COLUMN restored_at DATETIME NULL AFTER deleted_by,
ADD COLUMN restored_by INT NULL AFTER restored_at;

ALTER TABLE suppliers
ADD COLUMN restored_at DATETIME NULL AFTER deleted_by,
ADD COLUMN restored_by INT NULL AFTER restored_at;

ALTER TABLE plant_varieties
ADD COLUMN restored_at DATETIME NULL AFTER deleted_at,
ADD COLUMN restored_by INT NULL AFTER restored_at;

ALTER TABLE plant_species
ADD COLUMN restored_at DATETIME NULL AFTER deleted_at,
ADD COLUMN restored_by INT NULL AFTER restored_at;

ALTER TABLE gardens
ADD COLUMN restored_at DATETIME NULL AFTER deleted_by,
ADD COLUMN restored_by INT NULL AFTER restored_at;
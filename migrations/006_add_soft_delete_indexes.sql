ALTER TABLE purchase_items
ADD INDEX idx_purchase_items_deleted_at (deleted_at),
ADD INDEX idx_purchase_items_purchase_id_deleted_at (purchase_id, deleted_at);

ALTER TABLE purchase_images
ADD INDEX idx_purchase_images_deleted_at (deleted_at),
ADD INDEX idx_purchase_images_purchase_id_deleted_at (purchase_id, deleted_at);

ALTER TABLE sale_items
ADD INDEX idx_sale_items_deleted_at (deleted_at),
ADD INDEX idx_sale_items_sale_id_deleted_at (sale_id, deleted_at);

ALTER TABLE plant_timelines
ADD INDEX idx_plant_timelines_plant_id_deleted_at (plant_id, deleted_at);
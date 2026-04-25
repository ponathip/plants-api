-- super ได้ทั้งหมด
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p
WHERE r.name = 'super';

-- admin
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p
WHERE r.name = 'admin'
AND p.code IN (
  'member.view',
  'species.view','species.create','species.update',
  'variety.view','variety.create','variety.update',
  'plant.view','plant.create','plant.update','plant.delete','plant.restore','plant.export','plant.status.update',
  'plant_timeline.view','plant_timeline.create','plant_timeline.update','plant_timeline.delete','plant_timeline.restore',
  'supplier.view','supplier.create','supplier.update','supplier.delete','supplier.restore',
  'purchase.view','purchase.create','purchase.update','purchase.delete','purchase.restore','purchase.export',
  'expense.view','expense.create','expense.update','expense.delete','expense.restore','expense.export',
  'sale.view','sale.create','sale.update','sale.delete','sale.restore','sale.export',
  'dashboard.view'
);

-- staff
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p
WHERE r.name = 'staff'
AND p.code IN (
  'species.view',
  'variety.view',
  'plant.view','plant.create','plant.update','plant.export','plant.status.update',
  'plant_timeline.view','plant_timeline.create','plant_timeline.update',
  'supplier.view',
  'purchase.view','purchase.create','purchase.update',
  'expense.view','expense.create','expense.update',
  'sale.view','sale.create','sale.update',
  'dashboard.view'
);
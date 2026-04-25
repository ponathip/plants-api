import fs from 'fs';
import path from 'path';

export async function downloadGardenBackup(req, reply) {
  const gardenId = req.params.id;
  const userId = req.user.id;

  // 🏡 garden
  const [[garden]] = await req.db.query(
    `SELECT * FROM gardens WHERE id = ?`,
    [gardenId]
  );

  if (!garden) {
    return reply.code(404).send({ message: 'Garden not found' });
  }

  // 🌱 plants (รวมที่ถูกลบ)
  const [plants] = await req.db.query(
    `SELECT * FROM plants WHERE garden_id = ?`,
    [gardenId]
  );

  // 📜 audit
  await req.db.query(
    `INSERT INTO audit_logs
      (action, entity, entity_id, user_id, garden_id)
     VALUES ('backup_download', 'garden', ?, ?, ?)`,
    [gardenId, userId, gardenId]
  );

  const backup = {
    meta: {
      exportedAt: new Date(),
      exportedBy: userId,
      gardenId
    },
    garden,
    plants
  };

  reply
    .header(
      'Content-Disposition',
      `attachment; filename=garden-${gardenId}-backup.json`
    )
    .type('application/json')
    .send(backup);
}

export async function previewBackup(req, reply) {
  const file = req.body.file; // base64 หรือ multipart
  let data;

  try {
    data = JSON.parse(file);
  } catch {
    return reply.code(400).send({ message: 'Invalid JSON format' });
  }

  // 🔐 Validate structure
  if (!data.meta || !data.garden || !Array.isArray(data.plants)) {
    return reply.code(400).send({ message: 'Invalid backup structure' });
  }

  reply.send({
    garden: {
      name: data.garden.name,
      deletedAt: data.garden.deleted_at
    },
    plantCount: data.plants.length,
    exportedAt: data.meta.exportedAt
  });
}

export async function restoreBackup(req, reply) {
  const { file, restoreAsNew } = req.body;
  const userId = req.user.id;

  const data = JSON.parse(file);

  // 1️⃣ Create garden
  const [result] = await req.db.query(
    `INSERT INTO gardens (name, owner_id)
     VALUES (?, ?)`,
    [
      restoreAsNew
        ? `${data.garden.name} (Restored)`
        : data.garden.name,
      userId
    ]
  );

  const newGardenId = result.insertId;

  // 2️⃣ Restore plants
  for (const plant of data.plants) {
    await req.db.query(
      `INSERT INTO plants (garden_id, name, status)
       VALUES (?, ?, ?)`,
      [newGardenId, plant.name, plant.status]
    );
  }

  // 3️⃣ Audit
  await req.db.query(
    `INSERT INTO audit_logs
      (action, entity, entity_id, user_id, garden_id)
     VALUES ('restore_backup', 'garden', ?, ?, ?)`,
    [newGardenId, userId, newGardenId]
  );

  reply.send({
    message: 'Restore completed',
    gardenId: newGardenId
  });
}

export async function enqueueRestore(req, reply) {
  const userId = req.user.id;
  const { file } = req.body; // base64 หรือ multipart

  // save temp file
  const filePath = `./tmp/restore-${Date.now()}.json`;
  fs.writeFileSync(filePath, file);

  const [result] = await req.db.query(
    `INSERT INTO restore_jobs (file_path, created_by)
     VALUES (?, ?)`,
    [filePath, userId]
  );

  reply.send({
    jobId: result.insertId,
    message: 'Restore job queued'
  });
}
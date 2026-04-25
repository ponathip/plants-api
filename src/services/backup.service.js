import crypto from 'crypto';
import fs from 'fs/promises';

export async function backupEntity({ db, entity, entityId, storage }) {
  let data;

  if (entity === 'garden') {
    const [garden] = await db.query(
      `SELECT * FROM gardens WHERE id = ?`,
      [entityId]
    );
    const [plants] = await db.query(
      `SELECT * FROM plants WHERE garden_id = ?`,
      [entityId]
    );

    data = { garden: garden[0], plants };
  }

  const json = JSON.stringify(data, null, 2);
  const checksum = crypto.createHash('sha256').update(json).digest('hex');

  if (storage === 'nas') {
    const path = `/backup/${entity}/${entityId}-${Date.now()}.json`;
    await fs.writeFile(path, json);

    return { path, checksum, size: json.length };
  }

  if (storage === 's3') {
    return await uploadToS3(json, entity, entityId, checksum);
  }
}

export async function backupGarden(db, gardenId) {
  const [garden] = await db.query(
    `SELECT * FROM gardens WHERE id = ?`,
    [gardenId]
  );
  const [plants] = await db.query(
    `SELECT * FROM plants WHERE garden_id = ?`,
    [gardenId]
  );

  const data = { garden: garden[0], plants };
  const path = `./backup/garden-${gardenId}-${Date.now()}.json`;

  await fs.writeFile(path, JSON.stringify(data, null, 2));

  await db.query(
    `INSERT INTO backups (entity, entity_id, path)
     VALUES ('garden', ?, ?)`,
    [gardenId, path]
  );

  return path;
}

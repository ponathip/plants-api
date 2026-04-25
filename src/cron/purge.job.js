import { writeAudit } from '../services/audit.service.js';

const RETENTION_DAYS = 30;

export async function runPurge(db) {
  console.log('[PURGE] Start purge job');

  // 1️⃣ ดึง plants ที่ลบเกินกำหนด
  const [plantsToPurge] = await db.query(
    `
    SELECT *
    FROM plants
    WHERE deleted_at IS NOT NULL
      AND deleted_at < DATE_SUB(NOW(), INTERVAL ? DAY)
    `,
    [RETENTION_DAYS]
  );

  if (!plantsToPurge.length) {
    console.log('[PURGE] No plants to purge');
    return;
  }

  // 2️⃣ ลบทีละต้น (เพื่อ audit)
  for (const plant of plantsToPurge) {
    await db.query(
      `DELETE FROM plants WHERE id = ?`,
      [plant.id]
    );

    await writeAudit({
      db,
      action: 'purge',
      entity: 'plant',
      entityId: plant.id,
      gardenId: plant.garden_id,
      userId: null, // system
      oldData: plant
    });
  }

  console.log(`[PURGE] Purged ${plantsToPurge.length} plants`);
}

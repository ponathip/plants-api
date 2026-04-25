import fs from 'fs';
import mysql from 'mysql2/promise';

const db = await mysql.createConnection(process.env.DATABASE_URL);

async function run() {
  const [[job]] = await db.query(
    `SELECT * FROM restore_jobs
     WHERE status = 'pending'
     ORDER BY created_at
     LIMIT 1`
  );

   if (job.retry_count >= 3) {
    await db.query(
        `UPDATE restore_jobs
        SET status = 'failed',
            error = 'Retry limit exceeded'
        WHERE id = ?`,
        [job.id]
    );
    return;
    }

  if (!job) return;

  await db.query(
    `UPDATE restore_jobs SET status = 'processing' WHERE id = ?`,
    [job.id]
  );

  try {
    const data = JSON.parse(fs.readFileSync(job.file_path));

    // create garden
    const [gardenRes] = await db.query(
      `INSERT INTO gardens (name, owner_id)
       VALUES (?, ?)`,
      [`${data.garden.name} (Restored)`, job.created_by]
    );
    const gardenId = gardenRes.insertId;

    const plants = data.plants;
    const total = plants.length;

    for (let i = 0; i < total; i++) {
      const p = plants[i];

      await db.query(
        `INSERT INTO plants (garden_id, name, status)
         VALUES (?, ?, ?)`,
        [gardenId, p.name, p.status]
      );

      // update progress ทุก ๆ 50 record
      if (i % 50 === 0) {
        await db.query(
          `UPDATE restore_jobs SET progress = ? WHERE id = ?`,
          [Math.floor((i / total) * 100), job.id]
        );
      }
    }

    await db.query(
      `UPDATE restore_jobs
       SET status = 'done', progress = 100
       WHERE id = ?`,
      [job.id]
    );

  } catch (err) {
    await db.query(
      `UPDATE restore_jobs
       SET status = 'failed', error = ?
       WHERE id = ?`,
      [err.message, job.id]
    );
  }
}

setInterval(run, 3000);

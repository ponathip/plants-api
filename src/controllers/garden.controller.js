import { writeAudit } from '../services/audit.service.js';
import { db } from "../config/db.js";
const SAFETY_DAYS = 30;

export async function listGarden(req, reply) {
  try {
    const { gardenId, isSuper, scope } = req.gardenContext;
    let sql = `
      SELECT id, name
      FROM gardens
    `;
    const params = [];

    if (!(isSuper && scope === "all")) {
      sql += ` AND garden_id = ?`;
      params.push(gardenId);
    }

    sql += ` ORDER BY id DESC`;

    const [rows] = await db.query(sql, params);
    return reply.send(rows);
  } catch (error) {
    console.error("gardens error:", error);
    return reply.code(500).send({ message: "โหลด gardens ไม่สำเร็จ" });
  }
}

export async function getGarden(req, reply) {
  const gardenId = req.params.id;
  const userId = req.user.id; 

  const [[garden]] = await req.db.query(
    `SELECT g.*
     FROM gardens g
     JOIN garden_users gu ON gu.garden_id = g.id
     WHERE g.id = ? AND gu.user_id = ?`,
    [gardenId, userId]
  );

  if (!garden) {
    return reply.code(404).send({ message: 'Garden not found' });
  }

  reply.send(garden);
}

export async function updateGarden(req, reply) {
  const gardenId = req.params.id;
  const userId = req.user.id;

  const [oldGarden] = await req.db.query(
    'SELECT * FROM gardens WHERE id=?',
    [gardenId]
  );

  await req.db.query(
    'UPDATE gardens SET name=? WHERE id=?',
    [req.body.name, gardenId]
  );

  await writeAudit(
  {
    action: 'update',
    entity: 'garden',
    entityId: gardenId,
    userId: req.user.id,
    gardenId
  },
  req.db
);

  reply.send({ success: true });
}

export async function getGardenAuditLogs(req, reply) {
  const gardenId = req.params.id;

  const [logs] = await req.db.query(
    `SELECT a.*, u.email
     FROM audit_logs a
     JOIN users u ON u.id = a.user_id
     WHERE a.garden_id = ?
     ORDER BY a.created_at DESC`,
    [gardenId]
  );

  reply.send(logs);
}

export async function deleteGarden(req, reply) {
  const gardenId = req.params.id;
  const userId = req.user.id;

  const [[garden]] = await req.db.query(
    `SELECT * FROM gardens
     WHERE id = ? AND deleted_at IS NULL`,
    [gardenId]
  );

  if (!garden) {
    return reply.code(404).send({ message: 'Garden not found' });
  }

  await req.db.query(
    `UPDATE gardens
     SET deleted_at = NOW(), deleted_by = ?
     WHERE id = ?`,
    [userId, gardenId]
  );

  await writeAudit({
    db: req.db,
    gardenId,
    userId,
    action: 'delete',
    entity: 'garden',
    entityId: gardenId,
    oldData: garden
  });

  reply.send({ success: true });
}

export async function restoreGarden(req, reply) {
  const gardenId = req.params.id;
  const userId = req.user.id;

  const [[garden]] = await req.db.query(
    `SELECT * FROM gardens
     WHERE id = ? AND deleted_at IS NOT NULL`,
    [gardenId]
  );

  if (!garden) {
    return reply.code(404).send({
      message: 'Garden not found or not deleted'
    });
  }

  await req.db.query(
    `UPDATE gardens
     SET deleted_at = NULL, deleted_by = NULL
     WHERE id = ?`,
    [gardenId]
  );

  await writeAudit({
    db: req.db,
    gardenId,
    userId,
    action: 'restore',
    entity: 'garden',
    entityId: gardenId,
    oldData: garden
  });

  reply.send({ success: true });
}

export async function restoreGardenWithPlants(req, reply) {
  const gardenId = req.params.id;
  const userId = req.user.id;

  // restore garden
  await req.db.query(
    `UPDATE gardens
     SET deleted_at = NULL, deleted_by = NULL
     WHERE id = ? AND deleted_at IS NOT NULL`,
    [gardenId]
  );

  // restore plants
  await req.db.query(
    `UPDATE plants
     SET deleted_at = NULL, deleted_by = NULL
     WHERE garden_id = ? AND deleted_at IS NOT NULL`,
    [gardenId]
  );

  // audit (ระดับสวน)
  await writeAudit({
    db: req.db,
    gardenId,
    userId,
    action: 'restore_all',
    entity: 'garden',
    entityId: gardenId
  });

  reply.send({ success: true });
}

export async function getDeletedGardens(req, reply) {
  const user = req.user;
  const { page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;

  let sql = `
    SELECT g.*, u.name AS deleted_by_name
    FROM gardens g
    LEFT JOIN users u ON u.id = g.deleted_by
    WHERE g.deleted_at IS NOT NULL
  `;
  const params = [];

  // owner เห็นเฉพาะของตัวเอง
  if (user.role !== 'super') {
    sql += ` AND g.owner_id = ?`;
    params.push(user.id);
  }

  sql += ` ORDER BY g.deleted_at DESC LIMIT ? OFFSET ?`;
  params.push(Number(limit), Number(offset));

  const [rows] = await req.db.query(sql, params);

  reply.send({
    page: Number(page),
    limit: Number(limit),
    data: rows
  });
}

export async function forceDeleteGarden(req, reply) {
  const gardenId = req.params.id;
  const userId = req.user.id;

  const [[garden]] = await req.db.query(
    `SELECT *
     FROM gardens
     WHERE id = ?
       AND deleted_at IS NOT NULL
       AND deleted_at < DATE_SUB(NOW(), INTERVAL ? DAY)`,
    [gardenId, SAFETY_DAYS]
  );

  if (!garden) {
    return reply.code(400).send({
      message: `Garden must be deleted at least ${SAFETY_DAYS} days`
    });
  }

  await req.db.query('START TRANSACTION');

  try {
    // ลบลูกทั้งหมดก่อน
    await req.db.query(`DELETE FROM plants WHERE garden_id = ?`, [gardenId]);
    await req.db.query(`DELETE FROM garden_users WHERE garden_id = ?`, [gardenId]);

    // ลบสวน
    await req.db.query(`DELETE FROM gardens WHERE id = ?`, [gardenId]);

    await writeAudit({
      db: req.db,
      gardenId,
      userId,
      action: 'delete_permanent',
      entity: 'garden',
      entityId: gardenId,
      oldData: garden
    });

    await req.db.query('COMMIT');
    reply.send({ success: true });
  } catch (err) {
    await req.db.query('ROLLBACK');
    throw err;
  }
}

export async function getOverview(req, reply) {
  const { from, to } = req.query
  const [[result]] = await db.query(`
    SELECT
      COUNT(*) as total,
      SUM(status = 'alive') as alive,
      SUM(status = 'sold') as sold,
      SUM(status = 'dead') as dead
    FROM plants
    WHERE deleted_at IS NULL
    AND DATE(created_at) BETWEEN '${from}' AND '${to}'
  `, [])

  reply.send(result)
}

export async function getAudits(req, reply) {

  const [rows] = await db.query(
    `SELECT a.*, u.name as user_name
     FROM audit_logs a
     LEFT JOIN users u ON u.id = a.user_id
     ORDER BY a.created_at DESC
     LIMIT 50`,
    []
  )

  reply.send(rows)
}

export async function getDashboardStats(req, reply) {
  const { gardenId } = req.params
  const { from, to } = req.query

  const [rows] = await db.query(
    `SELECT 
        DATE(created_at) as date,
        SUM(status = 'alive') as alive,
        SUM(status = 'sold') as sold,
        SUM(status = 'dead') as dead
     FROM plants
     WHERE garden_id = ?
       AND deleted_at IS NULL
       AND DATE(created_at) BETWEEN '${from}' AND '${to}'
     GROUP BY DATE(created_at)
     ORDER BY date ASC`,
    [gardenId]
  )

  reply.send(rows)
}
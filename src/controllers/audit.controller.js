import { db } from "../config/db.js";
import { writeAudit } from "../services/audit.service.js";

function isSuper(req) {
  return req.user?.role === "super";
}

function normalizeJson(value) {
  if (!value) return null;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function getEntityStatusQuery(entity) {
  const map = {
    purchases: { table: "purchases" },
    sales: { table: "sales" },
    plants: { table: "plants" },
    expenses: { table: "expenses" },
    suppliers: { table: "suppliers" },
    plant_varieties: { table: "plant_varieties" },
    plant_species: { table: "plant_species" },
    plant_timelines: { table: "plant_timelines" },
    gardens: { table: "gardens" },
  };

  return map[entity] || null;
}

async function getRowById(conn, table, id, idColumn = "id") {
  const [[row]] = await conn.query(
    `
    SELECT *
    FROM ${table}
    WHERE ${idColumn} = ?
    LIMIT 1
    `,
    [id]
  );
  return row || null;
}

async function restoreSoftDeletedRowWithConn({
  conn,
  table,
  id,
  userId,
  idColumn = "id",
}) {
  const row = await getRowById(conn, table, id, idColumn);

  if (!row) {
    return { ok: false, code: 404, message: "ไม่พบข้อมูล" };
  }

  if (!("deleted_at" in row)) {
    return { ok: false, code: 400, message: "entity นี้ไม่รองรับ restore" };
  }

  if (!row.deleted_at) {
    return { ok: false, code: 400, message: "รายการนี้ไม่ได้ถูกลบอยู่" };
  }

  const hasRestoredAt = "restored_at" in row;
  const hasRestoredBy = "restored_by" in row;
  const hasDeletedBy = "deleted_by" in row;

  let sql = `UPDATE ${table} SET deleted_at = NULL`;
  const params = [];

  if (hasDeletedBy) {
    sql += `, deleted_by = NULL`;
  }

  if (hasRestoredAt) {
    sql += `, restored_at = NOW()`;
  }

  if (hasRestoredBy) {
    sql += `, restored_by = ?`;
    params.push(userId);
  }

  sql += ` WHERE ${idColumn} = ?`;
  params.push(id);

  await conn.query(sql, params);

  const restoredRow = await getRowById(conn, table, id, idColumn);

  return {
    ok: true,
    oldRow: row,
    restoredRow,
  };
}

async function restoreChildrenByForeignKey({
  conn,
  table,
  foreignKey,
  foreignId,
  userId,
}) {
  const [rows] = await conn.query(
    `
    SELECT *
    FROM ${table}
    WHERE ${foreignKey} = ?
      AND deleted_at IS NOT NULL
    `,
    [foreignId]
  );

  if (!rows.length) {
    return {
      count: 0,
      restoredIds: [],
    };
  }

  const sample = rows[0];
  const hasRestoredAt = "restored_at" in sample;
  const hasRestoredBy = "restored_by" in sample;
  const hasDeletedBy = "deleted_by" in sample;

  let sql = `UPDATE ${table} SET deleted_at = NULL`;
  const params = [];

  if (hasDeletedBy) {
    sql += `, deleted_by = NULL`;
  }

  if (hasRestoredAt) {
    sql += `, restored_at = NOW()`;
  }

  if (hasRestoredBy) {
    sql += `, restored_by = ?`;
    params.push(userId);
  }

  sql += ` WHERE ${foreignKey} = ? AND deleted_at IS NOT NULL`;
  params.push(foreignId);

  await conn.query(sql, params);

  return {
    count: rows.length,
    restoredIds: rows.map((r) => r.id).filter(Boolean),
  };
}

async function restorePurchaseCascade({ conn, entityId, userId }) {
  const parent = await restoreSoftDeletedRowWithConn({
    conn,
    table: "purchases",
    id: entityId,
    userId,
  });

  if (!parent.ok) return parent;

  const items = await restoreChildrenByForeignKey({
    conn,
    table: "purchase_items",
    foreignKey: "purchase_id",
    foreignId: entityId,
    userId,
  });

  const images = await restoreChildrenByForeignKey({
    conn,
    table: "purchase_images",
    foreignKey: "purchase_id",
    foreignId: entityId,
    userId,
  });

  return {
    ...parent,
    meta: {
      restored_children: {
        purchase_items: items.count,
        purchase_images: images.count,
      },
    },
  };
}

async function restoreSaleCascade({ conn, entityId, userId }) {
  const parent = await restoreSoftDeletedRowWithConn({
    conn,
    table: "sales",
    id: entityId,
    userId,
  });

  if (!parent.ok) return parent;

  const items = await restoreChildrenByForeignKey({
    conn,
    table: "sale_items",
    foreignKey: "sale_id",
    foreignId: entityId,
    userId,
  });

  return {
    ...parent,
    meta: {
      restored_children: {
        sale_items: items.count,
      },
    },
  };
}

async function restorePlantCascade({ conn, entityId, userId }) {
  const parent = await restoreSoftDeletedRowWithConn({
    conn,
    table: "plants",
    id: entityId,
    userId,
  });

  if (!parent.ok) return parent;

  const timelines = await restoreChildrenByForeignKey({
    conn,
    table: "plant_timelines",
    foreignKey: "plant_id",
    foreignId: entityId,
    userId,
  });

  return {
    ...parent,
    meta: {
      restored_children: {
        plant_timelines: timelines.count,
      },
    },
  };
}

async function restoreSimpleEntity({ conn, table, entityId, userId }) {
  return restoreSoftDeletedRowWithConn({
    conn,
    table,
    id: entityId,
    userId,
  });
}

async function restoreEntity({ conn, entity, entityId, userId }) {
  const map = {
    purchases: () => restorePurchaseCascade({ conn, entityId, userId }),
    sales: () => restoreSaleCascade({ conn, entityId, userId }),
    plants: () => restorePlantCascade({ conn, entityId, userId }),

    expenses: () =>
      restoreSimpleEntity({
        conn,
        table: "expenses",
        entityId,
        userId,
      }),

    suppliers: () =>
      restoreSimpleEntity({
        conn,
        table: "suppliers",
        entityId,
        userId,
      }),

    plant_varieties: () =>
      restoreSimpleEntity({
        conn,
        table: "plant_varieties",
        entityId,
        userId,
      }),

    plant_species: () =>
      restoreSimpleEntity({
        conn,
        table: "plant_species",
        entityId,
        userId,
      }),

    plant_timelines: () =>
      restoreSimpleEntity({
        conn,
        table: "plant_timelines",
        entityId,
        userId,
      }),

    gardens: () =>
      restoreSimpleEntity({
        conn,
        table: "gardens",
        entityId,
        userId,
      }),
  };

  const handler = map[entity];
  if (!handler) {
    return {
      ok: false,
      code: 400,
      message: `entity "${entity}" ยังไม่รองรับ restore จาก audit logs`,
    };
  }

  return handler();
}

async function getCurrentEntityRow(entity, entityId) {
  const info = getEntityStatusQuery(entity);
  if (!info) return null;

  const [[row]] = await db.query(
    `
    SELECT id, deleted_at
    FROM ${info.table}
    WHERE id = ?
    LIMIT 1
    `,
    [entityId]
  );

  return row || null;
}

export async function listAuditLogs(req, reply) {
  try {
    if (!isSuper(req)) {
      return reply.code(403).send({ message: "ไม่มีสิทธิ์เข้าถึง audit logs" });
    }

    const {
      page = 1,
      limit = 20,
      search = "",
      entity = "all",
      action = "all",
      user_id = "",
      garden_id = "",
      from = "",
      to = "",
    } = req.query || {};

    const pageNum = Number(page) || 1;
    const limitNum = Number(limit) || 20;
    const offset = (pageNum - 1) * limitNum;

    let where = `WHERE 1=1`;
    const params = [];

    if (search) {
      where += ` AND (
        al.entity LIKE ?
        OR al.action LIKE ?
        OR CAST(al.entity_id AS CHAR) LIKE ?
        OR u.name LIKE ?
        OR u.email LIKE ?
        OR g.name LIKE ?
      )`;
      params.push(
        `%${search}%`,
        `%${search}%`,
        `%${search}%`,
        `%${search}%`,
        `%${search}%`,
        `%${search}%`
      );
    }

    if (entity !== "all") {
      where += ` AND al.entity = ?`;
      params.push(entity);
    }

    if (action !== "all") {
      where += ` AND al.action = ?`;
      params.push(action);
    }

    if (user_id) {
      where += ` AND al.user_id = ?`;
      params.push(Number(user_id));
    }

    if (garden_id) {
      where += ` AND al.garden_id = ?`;
      params.push(Number(garden_id));
    }

    if (from && to) {
      where += ` AND DATE(al.created_at) BETWEEN ? AND ?`;
      params.push(from, to);
    } else if (from) {
      where += ` AND DATE(al.created_at) >= ?`;
      params.push(from);
    } else if (to) {
      where += ` AND DATE(al.created_at) <= ?`;
      params.push(to);
    }

    const isTrashMode = action === "delete";

    if (!isTrashMode) {
      const [rows] = await db.query(
        `
        SELECT
          al.id,
          al.garden_id,
          al.user_id,
          al.action,
          al.entity,
          al.entity_id,
          al.created_at,
          u.name AS user_name,
          u.email AS user_email,
          g.name AS garden_name
        FROM audit_logs al
        LEFT JOIN users u ON u.id = al.user_id
        LEFT JOIN gardens g ON g.id = al.garden_id
        ${where}
        ORDER BY al.created_at DESC, al.id DESC
        LIMIT ? OFFSET ?
        `,
        [...params, limitNum, offset]
      );

      const [[countRow]] = await db.query(
        `
        SELECT COUNT(*) AS total
        FROM audit_logs al
        LEFT JOIN users u ON u.id = al.user_id
        LEFT JOIN gardens g ON g.id = al.garden_id
        ${where}
        `,
        params
      );

      return reply.send({
        data: rows,
        total: Number(countRow?.total || 0),
        page: pageNum,
        limit: limitNum,
      });
    }

    // Trash mode:
    // 1) ดึง delete logs ทั้งหมดตาม filter
    // 2) เอาเฉพาะ delete ล่าสุดของ entity+entity_id
    // 3) เช็กสถานะจริงว่า deleted_at ยังไม่ null ค่อยโชว์
    const [deleteLogs] = await db.query(
      `
      SELECT
        al.id,
        al.garden_id,
        al.user_id,
        al.action,
        al.entity,
        al.entity_id,
        al.created_at,
        u.name AS user_name,
        u.email AS user_email,
        g.name AS garden_name
      FROM audit_logs al
      LEFT JOIN users u ON u.id = al.user_id
      LEFT JOIN gardens g ON g.id = al.garden_id
      ${where}
      ORDER BY al.created_at DESC, al.id DESC
      `,
      params
    );

    const latestDeleteMap = new Map();

    for (const log of deleteLogs) {
      const key = `${log.entity}:${log.entity_id}`;
      if (!latestDeleteMap.has(key)) {
        latestDeleteMap.set(key, log);
      }
    }

    const filtered = [];
    for (const log of latestDeleteMap.values()) {
      const row = await getCurrentEntityRow(log.entity, log.entity_id);
      if (row && row.deleted_at) {
        filtered.push(log);
      }
    }

    const paged = filtered.slice(offset, offset + limitNum);

    return reply.send({
      data: paged,
      total: filtered.length,
      page: pageNum,
      limit: limitNum,
    });
  } catch (error) {
    console.error("listAuditLogs error:", error);
    return reply.code(500).send({ message: "โหลด audit logs ไม่สำเร็จ" });
  }
}

export async function getAuditLogDetail(req, reply) {
  try {
    if (!isSuper(req)) {
      return reply.code(403).send({ message: "ไม่มีสิทธิ์เข้าถึง audit logs" });
    }

    const { id } = req.params;

    const [[row]] = await db.query(
      `
      SELECT
        al.*,
        u.name AS user_name,
        u.email AS user_email,
        g.name AS garden_name
      FROM audit_logs al
      LEFT JOIN users u ON u.id = al.user_id
      LEFT JOIN gardens g ON g.id = al.garden_id
      WHERE al.id = ?
      LIMIT 1
      `,
      [id]
    );

    if (!row) {
      return reply.code(404).send({ message: "ไม่พบ audit log" });
    }

    return reply.send({
      ...row,
      old_data: normalizeJson(row.old_data),
      new_data: normalizeJson(row.new_data),
      meta: normalizeJson(row.meta),
    });
  } catch (error) {
    console.error("getAuditLogDetail error:", error);
    return reply.code(500).send({ message: "โหลดรายละเอียด audit log ไม่สำเร็จ" });
  }
}

export async function restoreAuditLog(req, reply) {
  let conn;

  try {
    if (!isSuper(req)) {
      return reply.code(403).send({ message: "ไม่มีสิทธิ์เข้าถึง audit logs" });
    }

    const requesterUserId = req.user?.userId || req.user?.id;
    const { id } = req.params;

    const [[log]] = await db.query(
      `
      SELECT *
      FROM audit_logs
      WHERE id = ?
      LIMIT 1
      `,
      [id]
    );

    if (!log) {
      return reply.code(404).send({ message: "ไม่พบ audit log" });
    }

    if (log.action !== "delete") {
      return reply.code(400).send({ message: "restore ได้เฉพาะ log ที่เป็น delete" });
    }

    conn = await db.getConnection();
    await conn.beginTransaction();

    const result = await restoreEntity({
      conn,
      entity: log.entity,
      entityId: log.entity_id,
      userId: requesterUserId,
    });

    if (!result.ok) {
      await conn.rollback();
      conn.release();
      return reply.code(result.code || 400).send({ message: result.message });
    }

    await conn.commit();
    conn.release();
    conn = null;

    await writeAudit({
      userId: requesterUserId,
      gardenId: log.garden_id || result.restoredRow?.garden_id || null,
      action: "restore",
      entity: log.entity,
      entityId: log.entity_id,
      oldData: result.oldRow,
      newData: result.restoredRow,
      meta: {
        restored_from_audit_log_id: Number(id),
        ...(result.meta || {}),
      },
    });

    return reply.send({
      success: true,
      message: "กู้คืนสำเร็จ",
      meta: result.meta || null,
    });
  } catch (error) {
    if (conn) {
      try {
        await conn.rollback();
      } catch {}
      conn.release();
    }

    console.error("restoreAuditLog error:", error);
    return reply.code(500).send({ message: "restore ไม่สำเร็จ" });
  }
}

export async function bulkRestoreAuditLogs(req, reply) {
  try {
    if (!req.user || req.user.role !== "super") {
      return reply.code(403).send({ message: "ไม่มีสิทธิ์" });
    }

    const { ids = [] } = req.body || {};
    const userId = req.user.userId || req.user.id;

    if (!ids.length) {
      return reply.code(400).send({ message: "กรุณาเลือกรายการ" });
    }

    const [logs] = await db.query(
      `
      SELECT *
      FROM audit_logs
      WHERE id IN (?)
      ORDER BY created_at DESC, id DESC
      `,
      [ids]
    );

    const restored = [];
    const skipped = [];

    for (const log of logs) {
      if (log.action !== "delete") {
        skipped.push({ id: log.id, reason: "invalid action" });
        continue;
      }

      let conn;
      try {
        conn = await db.getConnection();
        await conn.beginTransaction();

        const result = await restoreEntity({
          conn,
          entity: log.entity,
          entityId: log.entity_id,
          userId,
        });

        if (!result.ok) {
          await conn.rollback();
          conn.release();
          skipped.push({ id: log.id, reason: result.message });
          continue;
        }

        await conn.commit();
        conn.release();
        conn = null;

        await writeAudit({
          userId,
          gardenId: log.garden_id || result.restoredRow?.garden_id || null,
          action: "restore",
          entity: log.entity,
          entityId: log.entity_id,
          oldData: result.oldRow,
          newData: result.restoredRow,
          meta: {
            restored_from_audit_log_id: Number(log.id),
            ...(result.meta || {}),
          },
        });

        restored.push(log.id);
      } catch (error) {
        if (conn) {
          try {
            await conn.rollback();
          } catch {}
          conn.release();
        }
        skipped.push({ id: log.id, reason: "restore failed" });
      }
    }

    return reply.send({
      success: true,
      restoredCount: restored.length,
      skippedCount: skipped.length,
      restored,
      skipped,
    });
  } catch (err) {
    console.error(err);
    return reply.code(500).send({ message: "bulk restore ไม่สำเร็จ" });
  }
}
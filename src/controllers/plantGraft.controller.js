import { db } from "../config/db.js";
import { writeAudit } from "../services/audit.service.js";

function normalizeEmpty(v) {
  return v === "" || v === undefined ? null : v;
}

export async function listPlantGrafts(req, reply) {
  try {
    const { plantId } = req.params;
    const ctx = req.gardenContext || {};
    const { gardenId, isSuper, scope } = ctx;

    let sql = `
      SELECT
        pg.*,
        gv.name AS graft_variety_name,
        COALESCE(sv.name, sp.name, CONCAT('Plant #', sp.id)) AS source_plant_name,
        pi.item_type AS purchase_item_type,
        pi.unit_price AS purchase_item_unit_price
      FROM plant_grafts pg
      LEFT JOIN plant_varieties gv ON gv.id = pg.graft_variety_id
      LEFT JOIN plants sp ON sp.id = pg.source_plant_id
      LEFT JOIN plant_varieties sv ON sv.id = sp.plant_variety_id
      LEFT JOIN purchase_items pi ON pi.id = pg.purchase_item_id
      WHERE pg.plant_id = ?
    `;

    const params = [plantId];

    if (!(isSuper && scope === "all")) {
      sql += ` AND pg.garden_id = ?`;
      params.push(gardenId);
    }

    sql += ` ORDER BY pg.id DESC`;

    const [rows] = await db.query(sql, params);

    return reply.send({ data: rows });
  } catch (err) {
    console.error("listPlantGrafts error:", err);
    return reply.code(500).send({ message: "โหลดรายการยอดไม่สำเร็จ" });
  }
}

export async function createPlantGraft(req, reply) {
  let conn;

  try {
    const { plantId } = req.params;
    const body = req.body || {};
    const userId = req.user.userId;
    const ctx = req.gardenContext || {};

    if (!body.graft_variety_id) {
      return reply.code(400).send({ message: "กรุณาเลือกสายพันธุ์ยอด" });
    }

    conn = await db.getConnection();
    await conn.beginTransaction();

    const [[plant]] = await conn.query(
      `SELECT id, garden_id FROM plants WHERE id = ? AND deleted_at IS NULL`,
      [plantId]
    );

    if (!plant) {
      await conn.rollback();
      return reply.code(404).send({ message: "ไม่พบต้นไม้หลัก" });
    }

    const gardenId = plant.garden_id;

    if (!(ctx.isSuper && ctx.scope === "all") && Number(ctx.gardenId) !== Number(gardenId)) {
      await conn.rollback();
      return reply.code(403).send({ message: "ไม่มีสิทธิ์ในสวนนี้" });
    }

    const [result] = await conn.query(
      `
      INSERT INTO plant_grafts (
        garden_id,
        plant_id,
        graft_variety_id,
        method,
        source_type,
        source_plant_id,
        purchase_item_id,
        position_name,
        grafted_at,
        status,
        note,
        created_by,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
      `,
      [
        gardenId,
        plantId,
        body.graft_variety_id,
        body.method || "grafting",
        body.source_type || "unknown",
        normalizeEmpty(body.source_plant_id),
        normalizeEmpty(body.purchase_item_id),
        normalizeEmpty(body.position_name),
        normalizeEmpty(body.grafted_at),
        body.status || "alive",
        normalizeEmpty(body.note),
        userId,
      ]
    );

    await writeAudit({
      userId,
      gardenId,
      action: "create",
      entity: "plant_grafts",
      entityId: result.insertId,
      newData: body,
    });

    await conn.commit();
    return reply.send({ success: true, id: result.insertId });
  } catch (err) {
    if (conn) await conn.rollback();
    console.error("createPlantGraft error:", err);
    return reply.code(500).send({ message: "เพิ่มยอดไม่สำเร็จ" });
  } finally {
    if (conn) conn.release();
  }
}

export async function updatePlantGraft(req, reply) {
  try {
    const { id } = req.params;
    const body = req.body || {};
    const userId = req.user.userId;

    const [[oldRow]] = await db.query(
      `SELECT * FROM plant_grafts WHERE id = ?`,
      [id]
    );

    if (!oldRow) {
      return reply.code(404).send({ message: "ไม่พบรายการยอด" });
    }

    await db.query(
      `
      UPDATE plant_grafts
      SET
        graft_variety_id = ?,
        method = ?,
        source_type = ?,
        source_plant_id = ?,
        purchase_item_id = ?,
        position_name = ?,
        grafted_at = ?,
        status = ?,
        note = ?,
        updated_at = NOW()
      WHERE id = ?
      `,
      [
        body.graft_variety_id,
        body.method || "grafting",
        body.source_type || "unknown",
        normalizeEmpty(body.source_plant_id),
        normalizeEmpty(body.purchase_item_id),
        normalizeEmpty(body.position_name),
        normalizeEmpty(body.grafted_at),
        body.status || "alive",
        normalizeEmpty(body.note),
        id,
      ]
    );

    await writeAudit({
      userId,
      gardenId: oldRow.garden_id,
      action: "update",
      entity: "plant_grafts",
      entityId: id,
      oldData: oldRow,
      newData: body,
    });

    return reply.send({ success: true });
  } catch (err) {
    console.error("updatePlantGraft error:", err);
    return reply.code(500).send({ message: "แก้ไขยอดไม่สำเร็จ" });
  }
}

export async function deletePlantGraft(req, reply) {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    const [[oldRow]] = await db.query(
      `SELECT * FROM plant_grafts WHERE id = ?`,
      [id]
    );

    if (!oldRow) {
      return reply.code(404).send({ message: "ไม่พบรายการยอด" });
    }

    await db.query(`DELETE FROM plant_grafts WHERE id = ?`, [id]);

    await writeAudit({
      userId,
      gardenId: oldRow.garden_id,
      action: "delete",
      entity: "plant_grafts",
      entityId: id,
      oldData: oldRow,
    });

    return reply.send({ success: true });
  } catch (err) {
    console.error("deletePlantGraft error:", err);
    return reply.code(500).send({ message: "ลบยอดไม่สำเร็จ" });
  }
}
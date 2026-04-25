import { db } from "../config/db.js";
import { writeAudit } from '../services/audit.service.js';

function normalizeEmpty(value) {
  if (value === undefined || value === null || value === "") return null;
  return value;
}

export async function getSuppliers(req, reply) {
  try {
    const { gardenId, isSuper, scope } = req.gardenContext;
    let sql = `
      SELECT id, garden_id, name
      FROM suppliers
      WHERE status = 'active'
        AND deleted_at IS NULL
    `;
    const params = [];

    if (!(isSuper && scope === "all")) {
      sql += ` AND garden_id = ?`;
      params.push(gardenId);
    }

    sql += ` ORDER BY name ASC`;

    const [rows] = await db.query(sql, params);
    return reply.send(rows);
  } catch (error) {
    console.error("getSuppliers error:", error);
    return reply.code(500).send({ message: "โหลด suppliers ไม่สำเร็จ" });
  }
}

export async function listSuppliers(req, reply) {
  try {
    const { gardenId, isSuper, scope } = req.gardenContext;
    const search = String(req.query.search || "").trim();
    const status = String(req.query.status || "all");
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 10);
    const offset = (page - 1) * limit;

    let where = `WHERE s.deleted_at IS NULL`;
    const params = [];

    if (!(isSuper && scope === "all")) {
      where += ` AND s.garden_id = ?`;
      params.push(gardenId);
    }

    if (search) {
      where += `
        AND (
          s.name LIKE ?
          OR s.contact_name LIKE ?
          OR s.phone LIKE ?
          OR s.line_id LIKE ?
          OR s.facebook LIKE ?
        )
      `;
      const keyword = `%${search}%`;
      params.push(keyword, keyword, keyword, keyword, keyword);
    }

    if (status !== "all") {
      where += ` AND s.status = ?`;
      params.push(status);
    }

    const [rows] = await db.query(
      `
      SELECT
        s.id,
        s.garden_id,
        g.name AS garden_name,
        s.name,
        s.contact_name,
        s.phone,
        s.line_id,
        s.facebook,
        s.address,
        s.note,
        s.status,
        s.created_at,
        s.updated_at
      FROM suppliers s
      LEFT JOIN gardens g ON g.id = s.garden_id
      ${where}
      ORDER BY s.id DESC
      LIMIT ? OFFSET ?
      `,
      [...params, limit, offset]
    );

    const [[countRow]] = await db.query(
      `
      SELECT COUNT(*) AS total
      FROM suppliers s
      ${where}
      `,
      params
    );

    return reply.send({
      data: rows,
      total: countRow.total,
      page,
      limit,
    });
  } catch (error) {
    console.error("listSuppliers error:", error);
    return reply.code(500).send({ message: "โหลดข้อมูล suppliers ไม่สำเร็จ" });
  }
}

export async function getSupplierById(req, reply) {
  try {
    const { gardenId, isSuper, scope } = req.gardenContext;
    const id = Number(req.params.id);

    let sql = `
      SELECT
        s.id,
        s.garden_id,
        g.name AS garden_name,
        s.name,
        s.contact_name,
        s.phone,
        s.line_id,
        s.facebook,
        s.address,
        s.note,
        s.status,
        s.created_at,
        s.updated_at
      FROM suppliers s
      LEFT JOIN gardens g ON g.id = s.garden_id
      WHERE s.id = ?
        AND s.deleted_at IS NULL
    `;
    const params = [id];

    if (!(isSuper && scope === "all")) {
      sql += ` AND s.garden_id = ?`;
      params.push(gardenId);
    }

    sql += ` LIMIT 1`;

    const [[row]] = await db.query(sql, params);

    if (!row) {
      return reply.code(404).send({ message: "ไม่พบ supplier" });
    }

    return reply.send(row);
  } catch (error) {
    console.error("getSupplierById error:", error);
    return reply.code(500).send({ message: "โหลดข้อมูล supplier ไม่สำเร็จ" });
  }
}

export async function createSupplier(req, reply) {
  try {
    const { gardenId } = req.gardenContext;
    const userId = req.user.userId;
    const body = req.body || {};

    if (!body.name || !String(body.name).trim()) {
      return reply.code(400).send({ message: "กรุณากรอกชื่อ supplier" });
    }

    const name = String(body.name).trim();
    const contactName = normalizeEmpty(body.contact_name);
    const phone = normalizeEmpty(body.phone);
    const lineId = normalizeEmpty(body.line_id);
    const facebook = normalizeEmpty(body.facebook);
    const address = normalizeEmpty(body.address);
    const note = normalizeEmpty(body.note);
    const status = body.status === "inactive" ? "inactive" : "active";

    const [[dup]] = await db.query(
      `
      SELECT id
      FROM suppliers
      WHERE garden_id = ?
        AND name = ?
        AND deleted_at IS NULL
      LIMIT 1
      `,
      [gardenId, name]
    );

    if (dup) {
      return reply.code(400).send({ message: "มี supplier ชื่อนี้อยู่แล้ว" });
    }

    const [result] = await db.query(
      `
      INSERT INTO suppliers (
        garden_id,
        name,
        contact_name,
        phone,
        line_id,
        facebook,
        address,
        note,
        status,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
      `,
      [
        gardenId,
        name,
        contactName,
        phone,
        lineId,
        facebook,
        address,
        note,
        status,
      ]
    );
    
    await writeAudit({
      gardenId,
      userId,
      action: 'create',
      entity: 'suppliers',
      entityId: result.insertId,
      newData: body,
    });

    return reply.code(201).send({
      success: true,
      id: result.insertId,
      message: "เพิ่ม supplier สำเร็จ",
    });
  } catch (error) {
    console.error("createSupplier error:", error);
    return reply.code(500).send({ message: "เพิ่ม supplier ไม่สำเร็จ" });
  }
}

export async function updateSupplier(req, reply) {
  try {
    const { gardenId, isSuper, scope } = req.gardenContext;
    const id = Number(req.params.id);
    const body = req.body || {};
    const userId = req.user.userId;

    if (!body.name || !String(body.name).trim()) {
      return reply.code(400).send({ message: "กรุณากรอกชื่อ supplier" });
    }

    let sqlCurrent = `
      SELECT *
      FROM suppliers
      WHERE id = ?
        AND deleted_at IS NULL
    `;
    const currentParams = [id];

    if (!(isSuper && scope === "all")) {
      sqlCurrent += ` AND garden_id = ?`;
      currentParams.push(gardenId);
    }

    sqlCurrent += ` LIMIT 1`;

    const [[current]] = await db.query(sqlCurrent, currentParams);

    if (!current) {
      return reply.code(404).send({ message: "ไม่พบ supplier" });
    }

    const targetGardenId = isSuper && scope === "single"
      ? gardenId
      : current.garden_id;

    const name = String(body.name).trim();

    const [[dup]] = await db.query(
      `
      SELECT id
      FROM suppliers
      WHERE garden_id = ?
        AND name = ?
        AND id <> ?
        AND deleted_at IS NULL
      LIMIT 1
      `,
      [targetGardenId, name, id]
    );

    if (dup) {
      return reply.code(400).send({ message: "มี supplier ชื่อนี้อยู่แล้ว" });
    }

    await db.query(
      `
      UPDATE suppliers
      SET
        garden_id = ?,
        name = ?,
        contact_name = ?,
        phone = ?,
        line_id = ?,
        facebook = ?,
        address = ?,
        note = ?,
        status = ?,
        updated_at = NOW()
      WHERE id = ?
        AND deleted_at IS NULL
      `,
      [
        targetGardenId,
        name,
        normalizeEmpty(body.contact_name),
        normalizeEmpty(body.phone),
        normalizeEmpty(body.line_id),
        normalizeEmpty(body.facebook),
        normalizeEmpty(body.address),
        normalizeEmpty(body.note),
        body.status === "inactive" ? "inactive" : "active",
        id,
      ]
    );

    await writeAudit({
      gardenId,
      userId,
      action: "update",
      entity: "suppliers",
      entityId: id,
      oldData: current,
      newData: body,
    });

    return reply.send({
      success: true,
      message: "อัปเดต supplier สำเร็จ",
    });
  } catch (error) {
    console.error("updateSupplier error:", error);
    return reply.code(500).send({ message: "อัปเดต supplier ไม่สำเร็จ" });
  }
}

export async function deleteSupplier(req, reply) {
  try {
    const { gardenId, isSuper, scope } = req.gardenContext;
    const userId = req.user.userId;
    const id = Number(req.params.id);

    let sqlCurrent = `
      SELECT id, garden_id
      FROM suppliers
      WHERE id = ?
        AND deleted_at IS NULL
    `;
    const currentParams = [id];

    if (!(isSuper && scope === "all")) {
      sqlCurrent += ` AND garden_id = ?`;
      currentParams.push(gardenId);
    }

    sqlCurrent += ` LIMIT 1`;

    const [[current]] = await db.query(sqlCurrent, currentParams);

    if (!current) {
      return reply.code(404).send({ message: "ไม่พบ supplier" });
    }

    const [[usedPlant]] = await db.query(
      `
      SELECT id
      FROM plants
      WHERE supplier_id = ?
        AND deleted_at IS NULL
      LIMIT 1
      `,
      [id]
    );

    if (usedPlant) {
      return reply.code(400).send({
        message: "supplier นี้ถูกใช้งานใน plants อยู่ ไม่สามารถลบได้",
      });
    }

    await db.query(
      `
      UPDATE suppliers
      SET deleted_at = NOW(), updated_at = NOW()
      WHERE id = ?
        AND deleted_at IS NULL
      `,
      [id]
    );

    await writeAudit({
      gardenId: current.garden_id,
      userId,
      action: "delete",
      entity: "suppliers",
      entityId: id,
      oldData: current,
    });

    return reply.send({
      success: true,
      message: "ลบ supplier สำเร็จ",
    });
  } catch (error) {
    console.error("deleteSupplier error:", error);
    return reply.code(500).send({ message: "ลบ supplier ไม่สำเร็จ" });
  }
}
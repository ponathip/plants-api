import { db } from "../config/db.js";
import { writeAudit } from '../services/audit.service.js';

function normalizeEmpty(value) {
  if (value === undefined || value === null || value === "") return null;
  return value;
}

function escapeCsv(value) {
  return `"${String(value ?? "").replace(/"/g, '""').replace(/\r?\n/g, " ")}"`;
}

/* ---------------- LIST ---------------- */
export async function listExpenses(req, reply) {
  try {
    const { gardenId, isSuper, scope } = req.gardenContext;
    const search = String(req.query.search || "").trim();
    const category = String(req.query.category || "all");
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 10);
    const offset = (page - 1) * limit;

    let where = `WHERE e.deleted_at IS NULL`;
    const params = [];

    if (!(isSuper && scope === "all")) {
      where += ` AND e.garden_id = ?`;
      params.push(gardenId);
    }

    if (search) {
      where += ` AND e.title LIKE ?`;
      params.push(`%${search}%`);
    }

    if (category !== "all") {
      where += ` AND e.category = ?`;
      params.push(category);
    }

    const [rows] = await db.query(
      `
      SELECT
        e.id,
        e.garden_id,
        g.name AS garden_name,
        e.category,
        e.title,
        e.amount,
        e.expense_date,
        e.note,
        e.image_url,
        e.created_at
      FROM expenses e
      LEFT JOIN gardens g ON g.id = e.garden_id
      ${where}
      ORDER BY e.expense_date DESC, e.id DESC
      LIMIT ? OFFSET ?
      `,
      [...params, limit, offset]
    );

    const [[countRow]] = await db.query(
      `SELECT COUNT(*) AS total FROM expenses e ${where}`,
      params
    );

    return reply.send({
      data: rows,
      total: countRow.total,
      page,
      limit,
    });
  } catch (err) {
    console.error(err);
    return reply.code(500).send({ message: "โหลดค่าใช้จ่ายไม่สำเร็จ" });
  }
}

/* ---------------- EXPORT CSV ---------------- */
export async function exportExpenses(req, reply) {
  try {
    const { gardenId, isSuper, scope } = req.gardenContext;
    const userId = req.user?.userId || req.user?.id || null;
    const search = String(req.query.search || "").trim();
    const category = String(req.query.category || "all");
    const from = String(req.query.from || "").trim();
    const to = String(req.query.to || "").trim();

    let where = `WHERE e.deleted_at IS NULL`;
    const params = [];

    if (!(isSuper && scope === "all")) {
      where += ` AND e.garden_id = ?`;
      params.push(gardenId);
    }

    if (search) {
      where += ` AND e.title LIKE ?`;
      params.push(`%${search}%`);
    }

    if (category !== "all") {
      where += ` AND e.category = ?`;
      params.push(category);
    }

    if (from && to) {
      where += ` AND DATE(e.expense_date) BETWEEN ? AND ?`;
      params.push(from, to);
    } else if (from) {
      where += ` AND DATE(e.expense_date) >= ?`;
      params.push(from);
    } else if (to) {
      where += ` AND DATE(e.expense_date) <= ?`;
      params.push(to);
    }

    const [rows] = await db.query(
      `
      SELECT
        g.name AS garden_name,
        e.category,
        e.title,
        e.amount,
        e.expense_date,
        e.note
      FROM expenses e
      LEFT JOIN gardens g ON g.id = e.garden_id
      ${where}
      ORDER BY e.expense_date DESC, e.id DESC
      `,
      params
    );

    await writeAudit({
      gardenId,
      userId,
      action: "export",
      entity: "expenses",
      entityId: 0,
      oldData: rows,
    });

    const headers = ["สวน", "ประเภท", "รายการ", "จำนวนเงิน", "วันที่", "หมายเหตุ"];
    const categoryLabel = {
          fertilizer: "ปุ๋ย",
          chemical: "ยา",
          equipment: "อุปกรณ์",
          labor: "ค่าแรง",
          transport: "ขนส่ง",
          other: "อื่นๆ",
        };
    const csvRows = rows.map((row) =>
      [
        escapeCsv(row.garden_name || ""),
        escapeCsv(categoryLabel[row.category] || ""),
        escapeCsv(row.title || ""),
        escapeCsv(row.amount || 0),
        escapeCsv(row.expense_date || ""),
        escapeCsv(row.note || ""),
      ].join(",")
    );

    const csv = [headers.map(escapeCsv).join(","), ...csvRows].join("\n");

    reply.header("Content-Type", "text/csv; charset=utf-8");
    reply.header(
      "Content-Disposition",
      `attachment; filename="expenses-${Date.now()}.csv"`
    );

    return reply.send("\uFEFF" + csv);
  } catch (err) {
    console.error(err);
    return reply.code(500).send({ message: "export expenses ไม่สำเร็จ" });
  }
}


/* ---------------- CREATE ---------------- */
export async function createExpense(req, reply) {
  try {
    const { gardenId } = req.gardenContext;
    const userId = req.user?.userId || req.user?.id || null;
    const body = req.body || {};

    if (!gardenId) {
      return reply.code(400).send({ message: "garden_id required" });
    }

    if (!body.title || !body.amount || !body.expense_date) {
      return reply.code(400).send({
        message: "กรอกข้อมูลไม่ครบ",
      });
    }

    const [result] = await db.query(
      `
      INSERT INTO expenses (
        garden_id,
        category,
        title,
        amount,
        expense_date,
        note,
        image_url,
        created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        gardenId,
        body.category || "other",
        body.title,
        body.amount,
        body.expense_date,
        normalizeEmpty(body.note),
        normalizeEmpty(body.image_url),
        userId,
      ]
    );

    await writeAudit({
      gardenId: gardenId,
      userId,
      action: "create",
      entity: "expenses",
      entityId: result.insertId,
      newData: body,
    });

    return reply.code(201).send({ success: true });
  } catch (err) {
    console.error(err);
    return reply.code(500).send({ message: "เพิ่มค่าใช้จ่ายไม่สำเร็จ" });
  }
}

/* ---------------- UPDATE ---------------- */
export async function updateExpense(req, reply) {
  try {
    const { gardenId } = req.gardenContext;
    const userId = req.user?.userId || req.user?.id || null;
    const id = Number(req.params.id);
    const body = req.body || {};

    if (!gardenId) {
      return reply.code(400).send({ message: "garden_id required" });
    }

    const [[row]] = await db.query(
      `
      SELECT id
      FROM expenses
      WHERE id = ?
        AND garden_id = ?
        AND deleted_at IS NULL
      LIMIT 1
      `,
      [id, gardenId]
    );

    if (!row) {
      return reply.code(404).send({ message: "ไม่พบรายการค่าใช้จ่าย" });
    }

    await db.query(
      `
      UPDATE expenses
      SET
        category = ?,
        title = ?,
        amount = ?,
        expense_date = ?,
        note = ?,
        image_url = ?,
        updated_at = NOW()
      WHERE id = ?
        AND garden_id = ?
        AND deleted_at IS NULL
      `,
      [
        body.category || "other",
        body.title,
        body.amount,
        body.expense_date,
        normalizeEmpty(body.note),
        normalizeEmpty(body.image_url),
        id,
        gardenId,
      ]
    );

    await writeAudit({
      gardenId,
      userId,
      action: "update",
      entity: "expenses",
      entityId: id,
      oldData: row,
      newData: body,
    });

    return reply.send({ success: true });
  } catch (err) {
    console.error(err);
    return reply.code(500).send({ message: "อัปเดตไม่สำเร็จ" });
  }
}

/* ---------------- DELETE ---------------- */
export async function deleteExpense(req, reply) {
  try {
    // const { gardenId } = req.gardenContext;
    const userId = req.user?.userId || req.user?.id || null;
    const id = Number(req.params.id);

    // if (!gardenId) {
    //   return reply.code(400).send({ message: "garden_id required" });
    // }

    const [[row]] = await db.query(
      `
      SELECT id, garden_id
      FROM expenses
      WHERE id = ?
        AND deleted_at IS NULL
      LIMIT 1
      `,
      [id]
    );

    if (!row) {
      return reply.code(404).send({ message: "ไม่พบรายการค่าใช้จ่าย" });
    }
    
    await db.query(
      `
      UPDATE expenses
      SET deleted_at = NOW()
      WHERE id = ?
        AND deleted_at IS NULL
      `,
      [id]
    );

    await writeAudit({
      gardenId: row.garden_id,
      userId,
      action: "delete",
      entity: "expenses",
      entityId: id,
      oldData: row,
    });

    return reply.send({ success: true });
  } catch (err) {
    console.error(err);
    return reply.code(500).send({ message: "ลบไม่สำเร็จ" });
  }
}
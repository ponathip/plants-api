import { writeAudit } from "../services/audit.service.js";
import { db } from "../config/db.js";
import crypto from "crypto";
import { createPlantTimelineLog } from "../services/plantTimeline.service.js";

function generateQrToken() {
  return crypto.randomBytes(16).toString("hex");
}

function normalizeEmpty(v) {
  return v === "" || v === undefined ? null : v;
}

function generatePlantCode(num) {
  return `CM-${String(num).padStart(7, "0")}`;
}

async function getNextPlantCode(conn, gardenId) {
  const [[row]] = await conn.query(
    `SELECT MAX(id) as maxId FROM plants WHERE garden_id = ?`,
    [gardenId]
  );
  const next = Number(row?.maxId || 0) + 1;
  return generatePlantCode(next);
}

/* ========================= CREATE ========================= */
export async function createPlant(req, reply) {
  // let conn;
  try {
    const body = req.body || {};
    const ctx = req.gardenContext || {};
    const gardenId = ctx.gardenId || body.garden_id;
    const userId = req.user.userId;

    if (!gardenId) {
      return reply.code(400).send({ message: "garden_id required" });
    }

    if (!body.species_id) {
      return reply.code(400).send({ message: "กรุณาเลือกชนิดพืช" });
    }

    if (!body.plant_variety_id && !body.name) {
      return reply.code(400).send({ message: "กรุณาเลือกพันธุ์ไม้ หรือกรอกชื่อพืช" });
    }

    // conn = await db.getConnection();
    // await conn.beginTransaction();

    const qrToken = generateQrToken();
    let plantCode;
    let retry = 0;

    while (retry < 3) {
      plantCode = await getNextPlantCode(conn, gardenId);
      try {
        const [result] = await db.query(
          `
          INSERT INTO plants (
            garden_id, species_id, plant_variety_id,
            plant_code, name, qr_token, status,
            cost_per_unit, acquired_at,
            location_name, zone_name,
            age_value, age_unit,
            height_cm, trunk_diameter_mm, pot_size_inch,
            source_type, supplier_id, purchase_item_id,
            propagation_type, parent_plant_id,
            rootstock_plant_id, rootstock_variety_id,
            source_note, image_url, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
          `,
          [
            gardenId,
            body.species_id,
            normalizeEmpty(body.plant_variety_id),
            plantCode,
            normalizeEmpty(body.name),
            qrToken,
            body.status || "alive",
            Number(body.cost_per_unit || 0),
            normalizeEmpty(body.acquired_at),
            normalizeEmpty(body.location_name),
            normalizeEmpty(body.zone_name),
            normalizeEmpty(body.age_value),
            normalizeEmpty(body.age_unit),
            normalizeEmpty(body.height_cm),
            normalizeEmpty(body.trunk_diameter_mm),
            normalizeEmpty(body.pot_size_inch),
            body.source_type || "unknown",
            normalizeEmpty(body.supplier_id),
            normalizeEmpty(body.purchase_item_id),
            normalizeEmpty(body.propagation_type),
            normalizeEmpty(body.parent_plant_id),
            normalizeEmpty(body.rootstock_plant_id),
            normalizeEmpty(body.rootstock_variety_id),
            normalizeEmpty(body.source_note),
            normalizeEmpty(body.image_url),
          ]
        );

        await writeAudit({
          userId,
          gardenId,
          action: "create",
          entity: "plants",
          entityId: result.insertId,
          newData: { ...body, plant_code: plantCode },
        });

        await createPlantTimelineLog(
          {
            plantId: result.insertId,
            gardenId,
            eventType: "created",
            title: "เพิ่มต้นพืช",
            createdBy: userId,
          },
          // conn
        );

        // await conn.commit();
        // conn.release();

        return reply.send({
          success: true,
          id: result.insertId,
          plant_code: plantCode,
        });
      } catch (err) {
        if (err.code === "ER_DUP_ENTRY") {
          retry++;
          continue;
        }
        throw err;
      }
    }

    throw new Error("generate plant_code failed");
  } catch (err) {
    if (conn) await conn.rollback();
    if (conn) conn.release();
    console.error("createPlant error:", err);

    reply.code(500).send({
      message: "create plant failed",
      error: err.message,
      code: err.code,
      sqlMessage: err.sqlMessage,
    });
  }
}

/* ========================= DELETE ========================= */
export async function deletePlant(req, reply) {
  let conn;
  try {
    const plantId = req.params.id;
    const userId = req.user.userId;

    conn = await db.getConnection();
    await conn.beginTransaction();

    const [[plant]] = await conn.query(
      `SELECT * FROM plants WHERE id=? AND deleted_at IS NULL`,
      [plantId]
    );

    if (!plant) {
      await conn.rollback();
      return reply.code(404).send({ message: "not found" });
    }

    await conn.query(
      `UPDATE plants SET deleted_at=NOW(), deleted_by=? WHERE id=?`,
      [userId, plantId]
    );

    await conn.query(
      `UPDATE plant_timelines SET deleted_at=NOW() WHERE plant_id=?`,
      [plantId]
    );

    await writeAudit({
      userId,
      gardenId: plant.garden_id,
      action: "delete",
      entity: "plants",
      entityId: plantId,
      oldData: plant,
    });

    await conn.commit();
    conn.release();

    reply.send({ success: true });
  } catch (err) {
    if (conn) await conn.rollback();
    if (conn) conn.release();
    console.error(err);
    reply.code(500).send({ message: "delete failed" });
  }
}

/* ========================= RESTORE ========================= */
export async function restorePlant(req, reply) {
  let conn;
  try {
    const plantId = req.params.id;
    const userId = req.user.userId;

    conn = await db.getConnection();
    await conn.beginTransaction();

    const [[plant]] = await conn.query(
      `SELECT * FROM plants WHERE id=? AND deleted_at IS NOT NULL`,
      [plantId]
    );

    if (!plant) {
      await conn.rollback();
      return reply.code(404).send({ message: "not found" });
    }

    await conn.query(
      `UPDATE plants SET deleted_at=NULL, deleted_by=NULL WHERE id=?`,
      [plantId]
    );

    await conn.query(
      `UPDATE plant_timelines SET deleted_at=NULL WHERE plant_id=?`,
      [plantId]
    );

    await writeAudit({
      userId,
      gardenId: plant.garden_id,
      action: "restore",
      entity: "plants",
      entityId: plantId,
    });

    await conn.commit();
    conn.release();

    reply.send({ success: true });
  } catch (err) {
    if (conn) await conn.rollback();
    if (conn) conn.release();
    console.error(err);
    reply.code(500).send({ message: "restore failed" });
  }
}

/* ========================= FORCE DELETE ========================= */
export async function forceDeletePlant(req, reply) {
  try {
    const plantId = req.params.id;
    const userId = req.user.userId;

    const [[plant]] = await db.query(
      `SELECT * FROM plants WHERE id=? AND deleted_at IS NOT NULL`,
      [plantId]
    );

    if (!plant) {
      return reply.code(404).send({ message: "not found" });
    }

    await db.query(`DELETE FROM plant_timelines WHERE plant_id=?`, [plantId]);
    await db.query(`DELETE FROM plants WHERE id=?`, [plantId]);

    await writeAudit({
      userId,
      gardenId: plant.garden_id,
      action: "force_delete",
      entity: "plants",
      entityId: plantId,
    });

    reply.send({ success: true });
  } catch (err) {
    console.error(err);
    reply.code(500).send({ message: "force delete failed" });
  }
}

/* ========================= QR UPDATE ========================= */
export async function updatePlantStatusByQr(req, reply) {
  try {
    const { token } = req.params;
    const { status } = req.body;
    const userId = req.user?.userId || null;

    const allowed = ["alive", "sold", "dead"];
    if (!allowed.includes(status)) {
      return reply.code(400).send({ message: "invalid status" });
    }

    const [[plant]] = await db.query(
      `SELECT * FROM plants WHERE qr_token=? AND deleted_at IS NULL`,
      [token]
    );

    if (!plant) {
      return reply.code(404).send({ message: "not found" });
    }

    await db.query(
      `UPDATE plants SET status=?, updated_at=NOW() WHERE id=?`,
      [status, plant.id]
    );

    await writeAudit({
      userId,
      gardenId: plant.garden_id,
      action: "update_status",
      entity: "plants",
      entityId: plant.id,
      oldData: { status: plant.status },
      newData: { status },
    });

    await createPlantTimelineLog({
      plantId: plant.id,
      gardenId: plant.garden_id,
      eventType: "status_changed",
      title: "เปลี่ยนสถานะ",
      description: `${plant.status} → ${status}`,
      createdBy: userId,
    });

    reply.send({ success: true });
  } catch (err) {
    console.error(err);
    reply.code(500).send({ message: "update status failed" });
  }
}

export async function detailPlants(req, reply) {
  try {
    const { id } = req.params;
    const { gardenId, isSuper, scope } = req.gardenContext;

    let sql = `
      SELECT
        p.*,
        g.name AS garden_name,
        ps.name AS species_name,
        pv.name AS plant_variety_name,
        COALESCE(pv.name, p.name) AS display_name,
        s.name AS supplier_name,
        rv.name AS rootstock_variety_name
      FROM plants p
      LEFT JOIN gardens g ON g.id = p.garden_id
      LEFT JOIN plant_species ps ON ps.id = p.species_id
      LEFT JOIN plant_varieties pv ON pv.id = p.plant_variety_id
      LEFT JOIN suppliers s ON s.id = p.supplier_id
      LEFT JOIN plant_varieties rv ON rv.id = p.rootstock_variety_id
      WHERE p.id = ?
        AND p.deleted_at IS NULL
    `;
    const params = [id];

    if (!(isSuper && scope === "all")) {
      sql += ` AND p.garden_id = ?`;
      params.push(gardenId);
    }

    sql += ` LIMIT 1`;

    const [[plant]] = await db.query(sql, params);

    if (!plant) {
      return reply.code(404).send({ message: "ไม่พบต้นพืช" });
    }

    let purchase_item = null;
    let purchase_item_images = [];

    if (plant.purchase_item_id) {
      const [[item]] = await db.query(
        `
        SELECT
          pi.*,
          ps.name AS species_name,
          pv.name AS variety_name
        FROM purchase_items pi
        LEFT JOIN plant_species ps ON ps.id = pi.plant_species_id
        LEFT JOIN plant_varieties pv ON pv.id = pi.plant_variety_id
        WHERE pi.id = ?
        LIMIT 1
        `,
        [plant.purchase_item_id]
      );

      purchase_item = item || null;

      const [images] = await db.query(
        `
        SELECT
          id,
          purchase_id,
          purchase_item_id,
          image_url,
          image_type,
          note
        FROM purchase_images
        WHERE purchase_item_id = ?
          AND image_type <> 'slip'
        ORDER BY id ASC
        `,
        [plant.purchase_item_id]
      );

      purchase_item_images = images;
    }

    return reply.send({
      plant,
      purchase_item,
      purchase_item_images,
    });
  } catch (error) {
    console.error("detailPlants error:", error);
    reply.code(500).send({ message: "ไม่สามารถโหลดข้อมูลต้นพืชได้" });
  }
}

export async function exportPlants(req, reply) {
  try {
    const { gardenId, isSuper, scope } = req.gardenContext;
    const {
      search = "",
      status = "all",
      from = "",
      to = "",
    } = req.query;

    let where = `WHERE p.deleted_at IS NULL`;
    const params = [];

    if (!(isSuper && scope === "all")) {
      where += ` AND p.garden_id = ?`;
      params.push(gardenId);
    }

    if (search) {
      where += ` AND (
        COALESCE(pv.name, p.name) LIKE ?
        OR p.name LIKE ?
        OR p.plant_code LIKE ?
      )`;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (status && status !== "all") {
      where += ` AND p.status = ?`;
      params.push(status);
    }

    if (from && to) {
      where += ` AND DATE(p.acquired_at) BETWEEN ? AND ?`;
      params.push(from, to);
    } else if (from) {
      where += ` AND DATE(p.acquired_at) >= ?`;
      params.push(from);
    } else if (to) {
      where += ` AND DATE(p.acquired_at) <= ?`;
      params.push(to);
    }

    const [rows] = await db.query(
      `
      SELECT
        g.name AS garden_name,
        p.id,
        p.plant_code,
        ps.name AS species_name,
        pv.name AS plant_variety_name,
        COALESCE(pv.name, p.name) AS display_name,
        p.status,
        p.cost_per_unit,
        p.acquired_at,
        p.zone_name,
        p.location_name,
        p.age_value,
        p.age_unit,
        p.height_cm,
        p.trunk_diameter_mm,
        p.pot_size_inch,
        p.source_type,
        s.name AS supplier_name,
        p.source_note
      FROM plants p
      LEFT JOIN gardens g ON g.id = p.garden_id
      LEFT JOIN plant_species ps ON ps.id = p.species_id
      LEFT JOIN plant_varieties pv ON pv.id = p.plant_variety_id
      LEFT JOIN suppliers s ON s.id = p.supplier_id
      ${where}
      ORDER BY p.id DESC
      `,
      params
    );

    const escapeCsv = (value) =>
      `"${String(value ?? "")
        .replace(/"/g, '""')
        .replace(/\r?\n/g, " ")}"`;

    const headers = [
      "สวน",
      "ID",
      "รหัสต้น",
      "ชนิดพืช",
      "สายพันธุ์",
      "ชื่อแสดง",
      "สถานะ",
      "ต้นทุนต่อหน่วย",
      "วันที่รับเข้า",
      "โซน",
      "ตำแหน่ง",
      "อายุ",
      "ความสูง(ซม.)",
      "ขนาดลำต้น(มม.)",
      "ขนาดกระถาง(นิ้ว)",
      "ที่มา",
      "ผู้ขาย",
      "หมายเหตุ",
    ];

    const csvRows = rows.map((row) => {
      const ageText =
        row.age_value && row.age_unit
          ? `${row.age_value} ${row.age_unit}`
          : "";

      return [
        escapeCsv(row.garden_name || ""),
        escapeCsv(row.id || ""),
        escapeCsv(row.plant_code || ""),
        escapeCsv(row.species_name || ""),
        escapeCsv(row.plant_variety_name || ""),
        escapeCsv(row.display_name || ""),
        escapeCsv(row.status || ""),
        escapeCsv(row.cost_per_unit || 0),
        escapeCsv(row.acquired_at || ""),
        escapeCsv(row.zone_name || ""),
        escapeCsv(row.location_name || ""),
        escapeCsv(ageText),
        escapeCsv(row.height_cm || ""),
        escapeCsv(row.trunk_diameter_mm || ""),
        escapeCsv(row.pot_size_inch || ""),
        escapeCsv(row.source_type || ""),
        escapeCsv(row.supplier_name || ""),
        escapeCsv(row.source_note || ""),
      ].join(",");
    });

    const csv = [headers.map(escapeCsv).join(","), ...csvRows].join("\n");

    reply.header("Content-Type", "text/csv; charset=utf-8");
    reply.header(
      "Content-Disposition",
      `attachment; filename="plants-${Date.now()}.csv"`
    );

    return reply.send("\uFEFF" + csv);
  } catch (error) {
    console.error("exportPlants error:", error);
    return reply.code(500).send({ message: "export plants ไม่สำเร็จ" });
  }
}

export async function getDeletedPlants(req, reply) {
  try {
    const { gardenId } = req.gardenContext;
    const { page = 1, limit = 20 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    const [rows] = await db.query(
      `
      SELECT
        p.*,
        ps.name AS species_name,
        pv.name AS plant_variety_name,
        COALESCE(pv.name, p.name) AS display_name,
        u.name AS deleted_by_name
      FROM plants p
      JOIN plant_species ps ON ps.id = p.species_id
      LEFT JOIN plant_varieties pv ON pv.id = p.plant_variety_id
      LEFT JOIN users u ON u.id = p.deleted_by
      WHERE p.garden_id = ?
        AND p.deleted_at IS NOT NULL
      ORDER BY p.deleted_at DESC
      LIMIT ? OFFSET ?
      `,
      [gardenId, Number(limit), Number(offset)]
    );

    reply.send({
      page: Number(page),
      limit: Number(limit),
      data: rows,
    });
  } catch (error) {
    console.error("getDeletedPlants error:", error);
    reply.code(500).send({ message: "ไม่สามารถโหลดรายการที่ลบได้" });
  }
}

export async function getPlantByQrToken(req, reply) {
  try {
    const { token } = req.params;

    const [[plant]] = await db.query(
      `
      SELECT
        p.*,
        ps.name AS species_name,
        pv.name AS plant_variety_name,
        COALESCE(pv.name, p.name) AS display_name,
        s.name AS supplier_name
      FROM plants p
      LEFT JOIN plant_species ps ON ps.id = p.species_id
      LEFT JOIN plant_varieties pv ON pv.id = p.plant_variety_id
      LEFT JOIN suppliers s ON s.id = p.supplier_id
      WHERE p.qr_token = ?
        AND p.deleted_at IS NULL
      LIMIT 1
      `,
      [token]
    );

    if (!plant) {
      return reply.code(404).send({ message: "ไม่พบต้นพืช" });
    }

    const [plant_varieties] = await db.query(
      `
      SELECT
        image_url,
        short_name,
        note
      FROM plant_varieties
      WHERE id = ?
      LIMIT 1
      `,
      [plant.plant_variety_id]
    );

    const [timeline] = await db.query(
      `
      SELECT
        id,
        plant_id,
        event_type,
        title,
        description,
        image_url,
        event_date
      FROM plant_timelines
      WHERE plant_id = ?
      ORDER BY event_date DESC, id DESC
      `,
      [plant.id]
    );

    let purchase_item = null;
    let purchase_images = [];
    let purchase_item_images = [];

    if (plant.purchase_item_id) {
      const [[item]] = await db.query(
        `
        SELECT
          pi.*,
          ps.name AS species_name,
          pv.name AS variety_name
        FROM purchase_items pi
        LEFT JOIN plant_species ps ON ps.id = pi.plant_species_id
        LEFT JOIN plant_varieties pv ON pv.id = pi.plant_variety_id
        WHERE pi.id = ?
        LIMIT 1
        `,
        [plant.purchase_item_id]
      );

      purchase_item = item || null;

      if (purchase_item?.purchase_id) {
        const [allImages] = await db.query(
          `
          SELECT *
          FROM purchase_images
          WHERE purchase_id = ?
          ORDER BY id ASC
          `,
          [purchase_item.purchase_id]
        );

        purchase_images = allImages.filter((img) => img.purchase_item_id === null);
        purchase_item_images = allImages.filter(
          (img) => Number(img.purchase_item_id) === Number(plant.purchase_item_id)
        );
      }
    }

    const [grafts] = await db.query(
      `
      SELECT
        pg.*,
        pv.name AS graft_variety_name,
        COALESCE(sv.name, sp.name, CONCAT('Plant #', sp.id)) AS source_plant_name
      FROM plant_grafts pg
      LEFT JOIN plant_varieties pv ON pv.id = pg.graft_variety_id
      LEFT JOIN plants sp ON sp.id = pg.source_plant_id
      LEFT JOIN plant_varieties sv ON sv.id = sp.plant_variety_id
      WHERE pg.plant_id = ?
      ORDER BY pg.id DESC
      `,
      [plant.id]
    );

    return reply.send({
      plant,
      timeline,
      plant_varieties,
      purchase_item,
      purchase_images,
      purchase_item_images,
      grafts,
    });
  } catch (error) {
    console.error("getPlantByQrToken error:", error);
    reply.code(500).send({ message: "โหลดข้อมูลไม่สำเร็จ" });
  }
}

export async function listPlants(req, reply) {
  try {
    const { gardenId, isSuper, scope } = req.gardenContext;
    const { search = "", status = "all" } = req.query;

    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;
    const from = String(req.query.from || "").trim();
    const to = String(req.query.to || "").trim();
    const offset = (page - 1) * limit;

    let where = `WHERE p.deleted_at IS NULL`;
    const params = [];

    if (!(isSuper && scope === "all")) {
      where += ` AND p.garden_id = ?`;
      params.push(gardenId);
    }

    if (search) {
      where += ` AND (
        COALESCE(pv.name, p.name) LIKE ?
        OR p.name LIKE ?
        OR p.plant_code LIKE ?
      )`;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (status && status !== "all") {
      where += ` AND p.status = ?`;
      params.push(status);
    }

    if (from && to) {
      where += ` AND DATE(p.acquired_at) BETWEEN ? AND ?`;
      params.push(from, to);
    } else if (from) {
      where += ` AND DATE(p.acquired_at) >= ?`;
      params.push(from);
    } else if (to) {
      where += ` AND DATE(p.acquired_at) <= ?`;
      params.push(to);
    }

    const [rows] = await db.query(
      `
      SELECT
        p.*,
        g.name AS garden_name,
        ps.name AS species_name,
        pv.name AS plant_variety_name,
        COALESCE(pv.name, p.name) AS display_name,
        s.name AS supplier_name,
        rv.name AS rootstock_variety_name
      FROM plants p
      LEFT JOIN gardens g ON g.id = p.garden_id
      LEFT JOIN plant_species ps ON ps.id = p.species_id
      LEFT JOIN plant_varieties pv ON pv.id = p.plant_variety_id
      LEFT JOIN suppliers s ON s.id = p.supplier_id
      LEFT JOIN plant_varieties rv ON rv.id = p.rootstock_variety_id
      ${where}
      ORDER BY p.id DESC
      LIMIT ? OFFSET ?
      `,
      [...params, limit, offset]
    );

    const [[{ total }]] = await db.query(
      `
      SELECT COUNT(*) AS total
      FROM plants p
      LEFT JOIN plant_varieties pv ON pv.id = p.plant_variety_id
      ${where}
      `,
      params
    );

    reply.send({
      data: rows,
      total,
      page,
      limit,
    });
  } catch (error) {
    console.error("listPlants error:", error);
    reply.code(500).send({ message: "ไม่สามารถโหลดรายการต้นพืชได้" });
  }
}


export async function updatePlant(req, reply) {
  try {
    const { id } = req.params;
    const body = req.body || {};
    const ctx = req.gardenContext || {};
    const gardenId = ctx.gardenId || body.garden_id;
    const userId = req.user.userId;

    if (!gardenId) {
      return reply.code(400).send({ message: "garden_id required" });
    }

    const [[oldPlant]] = await db.query(
      `SELECT * FROM plants WHERE id = ? AND garden_id = ? AND deleted_at IS NULL`,
      [id, gardenId]
    );

    if (!oldPlant) {
      return reply.code(404).send({ message: "Plant not found" });
    }

    if (!body.species_id) {
      return reply.code(400).send({ message: "กรุณาเลือกชนิดพืช" });
    }

    if (!body.plant_variety_id && !body.name) {
      return reply
        .code(400)
        .send({ message: "กรุณาเลือกพันธุ์ไม้ หรือกรอกชื่อพืช" });
    }

    await db.query(
      `
      UPDATE plants
      SET
        species_id = ?,
        plant_variety_id = ?,
        plant_code = ?,
        name = ?,
        status = ?,
        cost_per_unit = ?,
        acquired_at = ?,
        location_name = ?,
        zone_name = ?,
        age_value = ?,
        age_unit = ?,
        height_cm = ?,
        trunk_diameter_mm = ?,
        pot_size_inch = ?,
        source_type = ?,
        supplier_id = ?,
        purchase_item_id = ?,
        propagation_type = ?,
        parent_plant_id = ?,
        rootstock_plant_id = ?,
        rootstock_variety_id = ?,
        source_note = ?,
        image_url = ?,
        updated_at = NOW()
      WHERE id = ? AND garden_id = ?
      `,
      [
        body.species_id,
        normalizeEmpty(body.plant_variety_id),
        normalizeEmpty(body.plant_code),
        normalizeEmpty(body.name),
        body.status || "alive",
        Number(body.cost_per_unit || 0),
        normalizeEmpty(body.acquired_at),
        normalizeEmpty(body.location_name),
        normalizeEmpty(body.zone_name),
        normalizeEmpty(body.age_value),
        normalizeEmpty(body.age_unit),
        normalizeEmpty(body.height_cm),
        normalizeEmpty(body.trunk_diameter_mm),
        normalizeEmpty(body.pot_size_inch),
        body.source_type || "unknown",
        normalizeEmpty(body.supplier_id),
        normalizeEmpty(body.purchase_item_id),
        normalizeEmpty(body.propagation_type),
        normalizeEmpty(body.parent_plant_id),
        normalizeEmpty(body.rootstock_plant_id),
        normalizeEmpty(body.rootstock_variety_id),
        normalizeEmpty(body.source_note),
        normalizeEmpty(body.image_url),
        id,
        gardenId,
      ]
    );

    await writeAudit({
      gardenId,
      userId,
      action: "update",
      entity: "plant",
      entityId: id,
      oldData: oldPlant,
      newData: body,
    });

    if (oldPlant.status !== body.status) {
      await createPlantTimelineLog({
        plantId: Number(id),
        gardenId,
        eventType: "status_changed",
        title: "เปลี่ยนสถานะ",
        description: `สถานะเปลี่ยนจาก ${oldPlant.status} เป็น ${body.status}`,
        oldStatus: oldPlant.status,
        newStatus: body.status,
        createdBy: userId,
      });
    }

    if (
      oldPlant.zone_name !== body.zone_name ||
      oldPlant.location_name !== body.location_name
    ) {
      await createPlantTimelineLog({
        plantId: Number(id),
        gardenId,
        eventType: "moved",
        title: "ย้ายตำแหน่ง",
        description: "มีการเปลี่ยนโซนหรือตำแหน่ง",
        oldZoneName: oldPlant.zone_name,
        newZoneName: body.zone_name || null,
        oldLocationName: oldPlant.location_name,
        newLocationName: body.location_name || null,
        createdBy: userId,
      });
    }

    if (
      String(oldPlant.height_cm || "") !== String(body.height_cm || "") ||
      String(oldPlant.trunk_diameter_mm || "") !== String(body.trunk_diameter_mm || "") ||
      String(oldPlant.pot_size_inch || "") !== String(body.pot_size_inch || "") ||
      String(oldPlant.age_value || "") !== String(body.age_value || "") ||
      String(oldPlant.age_unit || "") !== String(body.age_unit || "")
    ) {
      await createPlantTimelineLog({
        plantId: Number(id),
        gardenId,
        eventType: "measured",
        title: "บันทึกการวัด",
        description: "มีการอัปเดตข้อมูลการเติบโต",
        heightCm: body.height_cm || null,
        trunkDiameterMm: body.trunk_diameter_mm || null,
        potSizeInch: body.pot_size_inch || null,
        ageValue: body.age_value || null,
        ageUnit: body.age_unit || null,
        createdBy: userId,
      });
    }

    if (!oldPlant.image_url && body.image_url) {
      await createPlantTimelineLog({
        plantId: Number(id),
        gardenId,
        eventType: "image_added",
        title: "เพิ่มรูปภาพ",
        description: "มีการเพิ่มรูปภาพของต้นพืช",
        imageUrl: body.image_url,
        createdBy: userId,
      });
    }

    reply.send({ success: true });
  } catch (error) {
    console.error("updatePlant error:", error);
    reply.code(500).send({ message: "ไม่สามารถแก้ไขต้นพืชได้" });
  }
}



import { db } from "../config/db.js";
import crypto from "crypto";

function generateQrToken() {
  return crypto.randomBytes(16).toString("hex");
}


async function getNextPlantCode(gardenId) {
  const [rows] = await db.query(
    `
    SELECT plant_code
    FROM plants
    WHERE garden_id = ?
      AND plant_code IS NOT NULL
    ORDER BY id DESC
    LIMIT 1
    `,
    [gardenId]
  );

  const lastCode = rows[0]?.plant_code || null;

  if (!lastCode) return "PL-000001";

  const num = parseInt(String(lastCode).split("-")[1] || "0", 10) + 1;
  return `PL-${String(num).padStart(6, "0")}`;
}

export async function getPurchaseItems(req, reply) {

  const [rows] = await db.query(
    `
    SELECT
      pi.*,
      p.purchase_date,
      p.received_date,
      s.name AS supplier_name,
      ps.name AS species_name,
      pv.name AS variety_name
    FROM purchase_items pi
    LEFT JOIN purchases p ON p.id = pi.purchase_id
    LEFT JOIN suppliers s ON s.id = p.supplier_id
    LEFT JOIN plant_species ps ON ps.id = pi.plant_species_id
    LEFT JOIN plant_varieties pv ON pv.id = pi.plant_variety_id
    ORDER BY p.purchase_date DESC, pi.id DESC
    `
  )

  return reply.send(rows)
}

export async function listPurchaseItems(req, reply) {
  try {
    const { gardenId, isSuper, scope } = req.gardenContext || {};
    const { garden_id = "" } = req.query || {};

    let where = `WHERE 1=1`;
    const params = [];

    if (isSuper && garden_id) {
      where += ` AND p.garden_id = ?`;
      params.push(garden_id);
    } else if (!(isSuper && scope === "all")) {
      where += ` AND p.garden_id = ?`;
      params.push(gardenId);
    }

    const [rows] = await db.query(
      `
      SELECT
        pi.*,

        p.id AS purchase_id,
        p.purchase_date,
        p.received_date,
        p.garden_id,
        p.note AS purchase_note,

        s.id AS supplier_id,
        s.name AS supplier_name,

        ps.name AS species_name,
        pv.name AS variety_name,

        COALESCE(pi.cost_per_unit, pi.unit_price, 0) AS display_price

      FROM purchase_items pi
      LEFT JOIN purchases p ON p.id = pi.purchase_id
      LEFT JOIN suppliers s ON s.id = p.supplier_id
      LEFT JOIN plant_species ps ON ps.id = pi.plant_species_id
      LEFT JOIN plant_varieties pv ON pv.id = pi.plant_variety_id

      ${where}

      ORDER BY
        p.purchase_date DESC,
        pi.id DESC
      `,
      params
    );

    return reply.send({ data: rows });
  } catch (err) {
    console.error("listPurchaseItems error:", err);
    return reply.code(500).send({ message: "โหลดรายการซื้อไม่สำเร็จ" });
  }
}

export async function generatePlantsFromPurchaseItem(req, reply) {
  const purchaseItemId = Number(req.params.id);
  const userId = req.user?.userId || req.user?.id || null;
  const requestedCount = Number(req.body?.count || 0);

  // const conn = await db.getConnection();

  try {
    // await conn.beginTransaction();

    const [[item]] = await db.query(
      `
      SELECT
        pi.id,
        pi.purchase_id,
        pi.plant_species_id,
        pi.plant_variety_id,
        pi.quantity,
        pi.generated_plant_count,
        pi.unit_price,
        p.garden_id,
        p.supplier_id,
        p.purchase_date,
        p.received_date
      FROM purchase_items pi
      JOIN purchases p ON p.id = pi.purchase_id
      WHERE pi.id = ?
      LIMIT 1
      `,
      [purchaseItemId]
    );
    const gardenId = Number(item.garden_id);
    if (!item) {
      // await conn.rollback();
      return reply.code(404).send({ message: "ไม่พบ purchase item" });
    }

    if (Number(item.garden_id) !== Number(gardenId)) {
      // await conn.rollback();
      return reply.code(403).send({ message: "ไม่มีสิทธิ์เข้าถึงข้อมูลนี้" });
    }

    const quantity = Number(item.quantity || 0);
    const generated = Number(item.generated_plant_count || 0);
    const remaining = Math.max(0, quantity - generated);

    if (remaining <= 0) {
      // await conn.rollback();
      return reply.code(400).send({ message: "รายการนี้สร้าง plants ครบแล้ว" });
    }

    const count = requestedCount > 0 ? requestedCount : remaining;

    if (count > remaining) {
      // await conn.rollback();
      return reply.code(400).send({
        message: `สร้างได้สูงสุดอีก ${remaining} ต้น`,
      });
    }

    if (!item.plant_species_id) {
      // await conn.rollback();
      return reply.code(400).send({ message: "purchase item นี้ไม่มี plant_species_id" });
    }

    for (let i = 0; i < count; i++) {
      const plantCode = await getNextPlantCode(gardenId);
      const qrToken = generateQrToken();

      await db.query(
        `
        INSERT INTO plants (
          garden_id,
          species_id,
          plant_variety_id,
          plant_code,
          name,
          qr_token,
          status,
          cost_per_unit,
          acquired_at,
          source_type,
          supplier_id,
          purchase_item_id,
          propagation_type,
          source_note,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
        `,
        [
          gardenId,
          item.plant_species_id,
          item.plant_variety_id || null,
          plantCode,
          null,
          qrToken,
          "alive",
          item.unit_price || 0,
          item.received_date || item.purchase_date || null,
          "purchase",
          item.supplier_id || null,
          item.id,
          null,
          "สร้างอัตโนมัติจาก รายการซื้อ",
        ]
      );
    }

    await db.query(
      `
      UPDATE purchase_items
      SET
        generated_plant_count = generated_plant_count + ?,
        last_generated_at = NOW()
      WHERE id = ?
      `,
      [count, purchaseItemId]
    );

    // await conn.commit();

    return reply.send({
      success: true,
      message: `สร้าง plants สำเร็จ ${count} ต้น`,
      generated_count: count,
      remaining_after: remaining - count,
    });
  } catch (error) {
    // await conn.rollback();
    console.error("generatePlantsFromPurchaseItem error:", error);
    return reply.code(500).send({ message: "สร้าง plants ไม่สำเร็จ" });
  }
}
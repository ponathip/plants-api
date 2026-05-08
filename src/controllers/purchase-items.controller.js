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
      pi.id,
      pi.purchase_id,
      pi.plant_species_id,
      pi.plant_variety_id,
      pi.item_type,
      pi.quantity,
      pi.unit_price
    FROM purchase_items pi
    ORDER BY pi.id DESC
    `
  )

  return reply.send(rows)
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
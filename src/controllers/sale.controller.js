import { db } from "../config/db.js";
import { writeAudit } from '../services/audit.service.js';

function normalizeUploadedImages(images) {
  if (!Array.isArray(images)) return [];
  return images
    .filter((img) => img && img.url)
    .map((img) => ({
      url: img.url,
      public_id: img.public_id || null,
    }));
}

function escapeCsv(value) {
  return `"${String(value ?? "").replace(/"/g, '""').replace(/\r?\n/g, " ")}"`;
}

async function recalculateSaleTotals(saleId) {
  const [[sumRow]] = await db.query(
    `SELECT COALESCE(SUM(line_total), 0) AS items_total,
            COALESCE(SUM(profit_total), 0) AS total_profit
     FROM sale_items
     WHERE sale_id = ?`,
    [saleId]
  );

  const [[sale]] = await db.query(
    `SELECT shipping_fee
     FROM sales
     WHERE id = ?`,
    [saleId]
  );

  const itemsTotal = Number(sumRow.items_total || 0);
  const shippingFee = Number(sale?.shipping_fee || 0);
  const grandTotal = itemsTotal + shippingFee;

  await db.query(
    `UPDATE sales
     SET items_total = ?, grand_total = ?
     WHERE id = ?`,
    [itemsTotal, grandTotal, saleId]
  );

  return {
    items_total: itemsTotal,
    grand_total: grandTotal,
    total_profit: Number(sumRow.total_profit || 0),
  };
}

export async function listSales(req, reply) {
  const { gardenId, isSuper, scope } = req.gardenContext;
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 10;
  const offset = (page - 1) * limit;

  const search = String(req.query.search || "").trim();
  const from = String(req.query.from || "").trim();
  const to = String(req.query.to || "").trim();

  let where = `WHERE s.deleted_at IS NULL`;
  const params = [];

  if (!(isSuper && scope === "all")) {
    where += ` AND s.garden_id = ?`;
    params.push(gardenId);
  }

  if (search) {
      where += ` AND (
        s.buyer_name LIKE ?
        OR s.channel LIKE ?
        OR s.note LIKE ?
      )`;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  if (from && to) {
      where += ` AND DATE(s.sold_at) BETWEEN ? AND ?`;
      params.push(from, to);
    } else if (from) {
      where += ` AND DATE(s.sold_at) >= ?`;
      params.push(from);
    } else if (to) {
      where += ` AND DATE(s.sold_at) <= ?`;
      params.push(to);
    }

  const [rows] = await db.query(
    `SELECT
      s.*,
      COUNT(si.id) AS item_count
     FROM sales s
     LEFT JOIN sale_items si ON si.sale_id = s.id
     ${where}
     GROUP BY s.id
     ORDER BY s.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  const [[{ total }]] = await db.query(
    `SELECT COUNT(*) AS total
     FROM sales s
     ${where}`,
    params
  );

  return reply.send({
    data: rows,
    total,
  });
}

export async function getSaleDetail(req, reply) {
  const { id } = req.params;
  const { gardenId, isSuper, scope } = req.gardenContext;

  let sql = `
    SELECT *
    FROM sales
    WHERE id = ? AND deleted_at IS NULL
  `;
  const params = [id];

  if (!(isSuper && scope === "all")) {
    sql += ` AND garden_id = ?`;
    params.push(gardenId);
  }

  const [[sale]] = await db.query(sql, params);

  if (!sale) {
    return reply.code(404).send({ message: "ไม่พบรายการขาย" });
  }

  const [items] = await db.query(
    `SELECT
      si.*,
      p.name AS plant_name,
      p.status AS plant_status
     FROM sale_items si
     LEFT JOIN plants p ON p.id = si.plant_id
     WHERE si.sale_id = ?
     ORDER BY si.id ASC`,
    [id]
  );

  const [images] = await db.query(
    `SELECT *
     FROM sale_images
     WHERE sale_id = ?
     ORDER BY id ASC`,
    [id]
  );

  return reply.send({ sale, items, images });
}

export async function listAvailablePlants(req, reply) {
  const { gardenId, isSuper, scope } = req.gardenContext;
  const queryGardenId = req.query?.garden_id;

  const targetGardenId =
    isSuper && scope === "all"
      ? Number(queryGardenId || 0)
      : Number(gardenId || 0);

  if (!targetGardenId) {
    return reply.code(400).send({ message: "garden_id required" });
  }

  const [rows] = await db.query(
    `SELECT
      p.id,
      p.name,
      p.status,
      p.cost_per_unit,
      ps.name AS species_name,
      pv.name AS variety_name
     FROM plants p
     LEFT JOIN plant_species ps ON ps.id = p.species_id
     LEFT JOIN plant_varieties pv ON pv.id = p.plant_variety_id
     WHERE p.garden_id = ?
       AND p.deleted_at IS NULL
       AND p.status = 'alive'
     ORDER BY p.id DESC`,
    [targetGardenId]
  );

  return reply.send(rows);
}

export async function createSale(req, reply) {
  const { gardenId } = req.gardenContext;
  const userId = req.user.userId;
  const body = req.body || {};

  const {
    buyer_name,
    sale_link,
    channel,
    payment_method,
    payment_detail,
    shipping_fee,
    sold_at,
    note,
    slip_image_url,
    slip_image_public_id,
    sale_images = [],
    items = [],
  } = body;

  if (!gardenId) {
    return reply.code(400).send({ message: "garden_id required" });
  }

  if (!items.length) {
    return reply.code(400).send({ message: "ต้องมีรายการขายอย่างน้อย 1 รายการ" });
  }

  try {
    let itemsTotal = 0;

    for (const item of items) {
      const [[plant]] = await db.query(
        `SELECT id, garden_id, status, cost_per_unit
         FROM plants
         WHERE id = ? AND garden_id = ? AND deleted_at IS NULL`,
        [item.plant_id, gardenId]
      );

      if (!plant) {
        throw new Error(`ไม่พบต้นพืช id ${item.plant_id}`);
      }

      if (plant.status === "sold") {
        throw new Error(`ต้นพืช id ${item.plant_id} ถูกขายไปแล้ว`);
      }

      itemsTotal += Number(item.unit_price || 0) * Number(item.quantity || 1);
    }

    const grandTotal = itemsTotal + Number(shipping_fee || 0);

    const [saleResult] = await db.query(
      `INSERT INTO sales (
        garden_id,
        buyer_name,
        sale_link,
        channel,
        payment_method,
        payment_detail,
        items_total,
        shipping_fee,
        grand_total,
        sold_at,
        slip_image_url,
        slip_image_public_id,
        note,
        created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        gardenId,
        buyer_name || null,
        sale_link || null,
        channel || null,
        payment_method || null,
        payment_detail || null,
        itemsTotal,
        Number(shipping_fee || 0),
        grandTotal,
        sold_at || null,
        slip_image_url || null,
        slip_image_public_id || null,
        note || null,
        userId,
      ]
    );

    const saleId = saleResult.insertId;

    for (const item of items) {
      const [[plant]] = await db.query(
        `SELECT id, cost_per_unit
         FROM plants
         WHERE id = ? AND garden_id = ?`,
        [item.plant_id, gardenId]
      );

      const qty = Number(item.quantity || 1);
      const unitPrice = Number(item.unit_price || 0);
      const lineTotal = qty * unitPrice;
      const costPerUnit = Number(plant?.cost_per_unit || 0);
      const costTotal = qty * costPerUnit;
      const profitTotal = lineTotal - costTotal;

      await db.query(
        `INSERT INTO sale_items (
          sale_id,
          plant_id,
          quantity,
          unit_price,
          line_total,
          cost_per_unit_snapshot,
          cost_total_snapshot,
          profit_total,
          note
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          saleId,
          item.plant_id,
          qty,
          unitPrice,
          lineTotal,
          costPerUnit,
          costTotal,
          profitTotal,
          item.note || null,
        ]
      );

      await db.query(
        `UPDATE plants
         SET status = 'sold'
         WHERE id = ?`,
        [item.plant_id]
      );
    }

    for (const img of normalizeUploadedImages(sale_images)) {
      await db.query(
        `INSERT INTO sale_images (
          sale_id,
          image_url,
          image_public_id,
          image_type
        ) VALUES (?, ?, ?, 'sale_post')`,
        [saleId, img.url, img.public_id]
      );
    }

    await writeAudit({
      gardenId,
      userId,
      action: 'create',
      entity: 'sales',
      entityId: saleId,
      newData: body,
    });

    return reply.send({
      ok: true,
      saleId,
    });
  } catch (err) {
    console.error(err);
    return reply.code(400).send({
      message: err.message || "บันทึกการขายไม่สำเร็จ",
    });
  }
}

export async function updateSale(req, reply) {
  const { id } = req.params;
  // const { gardenId } = req.gardenContext;
  const userId = req.user.userId;
  const {
    buyer_name,
    sale_link,
    channel,
    payment_method,
    payment_detail,
    shipping_fee,
    sold_at,
    note,
    slip_image_url,
    slip_image_public_id,
  } = req.body || {};

  const [[sale]] = await db.query(
    `SELECT *
     FROM sales
     WHERE id = ? AND deleted_at IS NULL`,
    [id]
  );

  if (!sale) {
    return reply.code(404).send({ message: "ไม่พบรายการขาย" });
  }

  try {
    await db.query(
      `UPDATE sales
       SET buyer_name = ?,
           sale_link = ?,
           channel = ?,
           payment_method = ?,
           payment_detail = ?,
           shipping_fee = ?,
           sold_at = ?,
           slip_image_url = ?,
           slip_image_public_id = ?,
           note = ?
       WHERE id = ?`,
      [
        buyer_name ?? sale.buyer_name,
        sale_link ?? sale.sale_link,
        channel ?? sale.channel,
        payment_method ?? sale.payment_method,
        payment_detail ?? sale.payment_detail,
        shipping_fee ?? sale.shipping_fee,
        sold_at ?? sale.sold_at,
        slip_image_url ?? sale.slip_image_url,
        slip_image_public_id ?? sale.slip_image_public_id,
        note ?? sale.note,
        id,
      ]
    );

    const totals = await recalculateSaleTotals(id);

    await writeAudit({
      gardenId: sale.garden_id,
      userId,
      action: "update",
      entity: "sales",
      entityId: id,
      oldData: sale,
      newData: req.body,
    });

    return reply.send({
      ok: true,
      ...totals,
    });
  } catch (err) {
    console.error(err);
    return reply.code(500).send({ message: "แก้ไขรายการขายไม่สำเร็จ" });
  }
}

export async function deleteSale(req, reply) {
  try {
    const { id } = req.params;
    // const { gardenId } = req.gardenContext;
    const userId = req.user.userId;

    const [[sale]] = await db.query(
      `SELECT * FROM sales
       WHERE id = ? AND deleted_at IS NULL`,
      [id]
    );

    if (!sale) {
      return reply.code(404).send({ message: "ไม่พบ sale" });
    }

    const [items] = await db.query(
      `SELECT plant_id FROM sale_items WHERE sale_id = ?`,
      [id]
    );

    // revert plant
    for (const item of items) {
      if (item.plant_id) {
        await db.query(
          `UPDATE plants SET status = 'alive' WHERE id = ?`,
          [item.plant_id]
        );
      }
    }

    // delete sale
    await db.query(
      `UPDATE sales
       SET deleted_at = NOW(), deleted_by = ?
       WHERE id = ?`,
      [userId, id]
    );

    // delete items
    await db.query(
      `UPDATE sale_items
       SET deleted_at = NOW(), deleted_by = ?
       WHERE sale_id = ? AND deleted_at IS NULL`,
      [userId, id]
    );

    const audit = await writeAudit({
      gardenId: sale.garden_id,
      userId,
      action: "delete",
      entity: "sales",
      entityId: id,
      oldData: sale,
    });

    return reply.send({ ok: true, auditLogId: audit.id, });
  } catch (err) {
    console.error(err);
    return reply.code(500).send({ message: "ลบ sale ไม่สำเร็จ" });
  }
}

export async function addSaleImages(req, reply) {
  const { id } = req.params;
  const userId = req.user.userId;
  const { gardenId, isSuper, scope } = req.gardenContext;
  const {
    slip_image_url,
    slip_image_public_id,
    sale_images = [],
  } = req.body || {};

  let sql = `
    SELECT *
    FROM sales
    WHERE id = ? AND deleted_at IS NULL
  `;
  const params = [id];

  if (!(isSuper && scope === "all")) {
    sql += ` AND garden_id = ?`;
    params.push(gardenId);
  }

  const [[sale]] = await db.query(sql, params);

  if (!sale) {
    return reply.code(404).send({ message: "ไม่พบรายการขาย" });
  }

  try {
    if (slip_image_url) {
      await db.query(
        `UPDATE sales
         SET slip_image_url = ?,
             slip_image_public_id = ?
         WHERE id = ?`,
        [slip_image_url, slip_image_public_id || null, id]
      );
    }

    for (const img of normalizeUploadedImages(sale_images)) {
      await db.query(
        `INSERT INTO sale_images (
          sale_id,
          image_url,
          image_public_id,
          image_type
        ) VALUES (?, ?, ?, 'sale_post')`,
        [id, img.url, img.public_id]
      );
    }

    await writeAudit({
      gardenId: sale.garden_id,
      userId,
      action: 'create',
      entity: 'sale_images',
      entityId: id,
      newData: req.body,
    });

    return reply.send({
      ok: true,
      message: "เพิ่มรูปสำเร็จ",
    });
  } catch (err) {
    console.error(err);
    return reply.code(500).send({ message: "เพิ่มรูปไม่สำเร็จ" });
  }
}

export async function deleteSaleImage(req, reply) {
  const { id, imageId } = req.params;
  const { gardenId } = req.gardenContext;
  const userId = req.user.userId;

  const [[sale]] = await db.query(
    `SELECT id
     FROM sales
     WHERE id = ? AND garden_id = ? AND deleted_at IS NULL`,
    [id, gardenId]
  );

  if (!sale) {
    return reply.code(404).send({ message: "ไม่พบรายการขาย" });
  }

  const [[image]] = await db.query(
    `SELECT *
     FROM sale_images
     WHERE id = ? AND sale_id = ?`,
    [imageId, id]
  );

  if (!image) {
    return reply.code(404).send({ message: "ไม่พบรูปภาพ" });
  }

  await db.query(
    `DELETE FROM sale_images
     WHERE id = ?`,
    [imageId]
  );

  await writeAudit({
    gardenId,
    userId,
    action: 'delete',
    entity: 'sale_images',
    entityId: id,
    oldData: image,
  });

  return reply.send({ ok: true });
}

export async function exportSales(req, reply) {
  try {
    const { gardenId, isSuper, scope } = req.gardenContext;
    const {
      search = "",
      from = "",
      to = "",
      channel = "all",
    } = req.query;

    let where = `WHERE s.deleted_at IS NULL`;
    const params = [];

    if (!(isSuper && scope === "all")) {
      where += ` AND s.garden_id = ?`;
      params.push(gardenId);
    }

    if (search) {
      where += ` AND (
        s.buyer_name LIKE ?
        OR s.channel LIKE ?
        OR s.note LIKE ?
      )`;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (channel && channel !== "all") {
      where += ` AND s.channel = ?`;
      params.push(channel);
    }

    if (from && to) {
      where += ` AND DATE(s.sold_at) BETWEEN ? AND ?`;
      params.push(from, to);
    } else if (from) {
      where += ` AND DATE(s.sold_at) >= ?`;
      params.push(from);
    } else if (to) {
      where += ` AND DATE(s.sold_at) <= ?`;
      params.push(to);
    }

    const [rows] = await db.query(
      `
      SELECT
        g.name AS garden_name,
        s.id,
        s.buyer_name,
        s.channel,
        s.sold_at,
        COUNT(DISTINCT si.id) AS item_count,
        s.shipping_fee,
        s.grand_total,
        COALESCE(SUM(si.cost_total_snapshot), 0) AS cost_total,
        COALESCE(SUM(si.profit_total), 0) AS profit_total,
        s.note
      FROM sales s
      LEFT JOIN gardens g ON g.id = s.garden_id
      LEFT JOIN sale_items si ON si.sale_id = s.id
      ${where}
      GROUP BY s.id
      ORDER BY s.sold_at DESC, s.id DESC
      `,
      params
    );

    const escapeCsv = (value) =>
      `"${String(value ?? "")
        .replace(/"/g, '""')
        .replace(/\r?\n/g, " ")}"`;

    const headers = [
      "สวน",
      "รหัสขาย",
      "ผู้ซื้อ",
      "ช่องทาง",
      "วันที่ขาย",
      "จำนวนรายการ",
      "ส่วนลด",
      "ค่าส่ง",
      "ยอดขายรวม",
      "กำไรรวม",
      "หมายเหตุ",
    ];

    const csvRows = rows.map((row) =>
      [
        escapeCsv(row.garden_name || ""),
        escapeCsv(row.id || ""),
        escapeCsv(row.buyer_name || ""),
        escapeCsv(row.channel || ""),
        escapeCsv(row.sold_at || ""),
        escapeCsv(row.item_count || 0),
        escapeCsv(row.subtotal || 0),
        escapeCsv(row.discount_amount || 0),
        escapeCsv(row.shipping_cost || 0),
        escapeCsv(row.grand_total || 0),
        escapeCsv(row.cost_total || 0),
        escapeCsv(row.profit_total || 0),
        escapeCsv(row.note || ""),
      ].join(",")
    );

    const csv = [headers.map(escapeCsv).join(","), ...csvRows].join("\n");

    reply.header("Content-Type", "text/csv; charset=utf-8");
    reply.header(
      "Content-Disposition",
      `attachment; filename="sales-${Date.now()}.csv"`
    );

    return reply.send("\uFEFF" + csv);
  } catch (error) {
    console.error("exportSales error:", error);
    return reply.code(500).send({ message: "export sales ไม่สำเร็จ" });
  }
}

export async function restoreSale(req, reply) {
  try {
    const { id } = req.params;
    const { gardenId } = req.gardenContext;
    const userId = req.user.userId;

    const [[sale]] = await db.query(
      `SELECT * FROM sales
       WHERE id = ? AND garden_id = ? AND deleted_at IS NOT NULL`,
      [id, gardenId]
    );

    if (!sale) {
      return reply.code(404).send({ message: "ไม่พบ sale" });
    }

    await db.query(
      `UPDATE sales
       SET deleted_at = NULL, deleted_by = NULL
       WHERE id = ?`,
      [id]
    );

    await db.query(
      `UPDATE sale_items
       SET deleted_at = NULL, deleted_by = NULL
       WHERE sale_id = ? AND deleted_at IS NOT NULL`,
      [id]
    );

    // 🧠 mark plant back to sold
    const [items] = await db.query(
      `SELECT plant_id FROM sale_items WHERE sale_id = ?`,
      [id]
    );

    for (const item of items) {
      if (item.plant_id) {
        await db.query(
          `UPDATE plants SET status = 'sold' WHERE id = ?`,
          [item.plant_id]
        );
      }
    }

    await writeAudit({
      gardenId,
      userId,
      action: "restore",
      entity: "sales",
      entityId: id,
      oldData: sale,
    });

    return reply.send({ ok: true });
  } catch (err) {
    console.error(err);
    return reply.code(500).send({ message: "restore sale ไม่สำเร็จ" });
  }
}
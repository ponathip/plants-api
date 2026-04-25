import { db } from "../config/db.js";
import { writeAudit } from '../services/audit.service.js';

function escapeCsv(value) {
  return `"${String(value ?? "").replace(/"/g, '""').replace(/\r?\n/g, " ")}"`;
}

async function recalculatePurchaseTotals(purchaseId) {
  const [[purchase]] = await db.query(
    `SELECT shipping_cost
     FROM purchases
     WHERE id = ?`,
    [purchaseId]
  );

  const [items] = await db.query(
    `SELECT id, quantity, line_total
     FROM purchase_items
     WHERE purchase_id = ?`,
    [purchaseId]
  );

  const itemsTotal = items.reduce(
    (sum, item) => sum + Number(item.line_total || 0),
    0
  );

  const shippingCost = Number(purchase?.shipping_cost || 0);
  const grandTotal = itemsTotal + shippingCost;

  for (const item of items) {
    let shippingAllocated = 0;

    if (itemsTotal > 0) {
      shippingAllocated =
        (Number(item.line_total || 0) / itemsTotal) * shippingCost;
    }

    const costTotal = Number(item.line_total || 0) + shippingAllocated;
    const costPerUnit =
      Number(item.quantity || 0) > 0
        ? costTotal / Number(item.quantity)
        : 0;

    await db.query(
      `UPDATE purchase_items
       SET shipping_allocated = ?,
           cost_total = ?,
           cost_per_unit = ?
       WHERE id = ?`,
      [
        Number(shippingAllocated.toFixed(2)),
        Number(costTotal.toFixed(2)),
        Number(costPerUnit.toFixed(2)),
        item.id,
      ]
    );
  }

  await db.query(
    `UPDATE purchases
     SET items_total = ?, grand_total = ?
     WHERE id = ?`,
    [itemsTotal, grandTotal, purchaseId]
  );

  return {
    items_total: itemsTotal,
    grand_total: grandTotal,
  };
}

function normalizeUploadedImages(images) {
  if (!Array.isArray(images)) return [];
  return images
    .filter((img) => img && img.url)
    .map((img) => ({
      url: img.url,
      public_id: img.public_id || null,
    }));
}

export async function createPurchase(req, reply) {
  const { gardenId } = req.gardenContext;
  const userId = req.user.userId;
  const body = req.body || {};

  const {
    supplier_id,
    order_link,
    channel,
    payment_method,
    payment_detail,
    shipping_cost,
    purchase_date,
    received_date,
    note,
    slip_image_url,
    slip_image_public_id,
    purchase_images = [],
    items = [],
  } = body;

  if (!gardenId) {
    return reply.code(400).send({ message: "garden_id required" });
  }

  if (!supplier_id) {
    return reply.code(400).send({ message: "กรุณาเลือก supplier" });
  }

  if (!items.length) {
    return reply.code(400).send({ message: "ต้องมีรายการอย่างน้อย 1 รายการ" });
  }

  for (const item of items) {
    if (!item.plant_species_id) {
      return reply.code(400).send({ message: "กรุณาเลือกชนิดพืชให้ครบทุกรายการ" });
    }
    if (Number(item.quantity || 0) <= 0) {
      return reply.code(400).send({ message: "จำนวนต้องมากกว่า 0" });
    }
  }

  let itemsTotal = 0;
  for (const item of items) {
    itemsTotal += Number(item.quantity || 0) * Number(item.unit_price || 0);
  }

  const shippingCost = Number(shipping_cost || 0);
  const grandTotal = itemsTotal + shippingCost;

  try {
    const [purchaseResult] = await db.query(
      `INSERT INTO purchases (
        garden_id,
        supplier_id,
        supplier_name,
        contact_link,
        order_link,
        channel,
        payment_method,
        payment_detail,
        items_total,
        shipping_cost,
        grand_total,
        purchase_date,
        received_date,
        slip_image_url,
        slip_image_public_id,
        note,
        created_by
      ) VALUES (?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        gardenId,
        supplier_id,
        order_link || null,
        channel || null,
        payment_method || null,
        payment_detail || null,
        itemsTotal,
        shippingCost,
        grandTotal,
        purchase_date || null,
        received_date || null,
        slip_image_url || null,
        slip_image_public_id || null,
        note || null,
        userId,
      ]
    );

    const purchaseId = purchaseResult.insertId;

    for (const item of items) {
      const lineTotal =
        Number(item.quantity || 0) * Number(item.unit_price || 0);

      const [itemResult] = await db.query(
        `INSERT INTO purchase_items (
          purchase_id,
          plant_species_id,
          plant_variety_id,
          item_type,
          quantity,
          unit_price,
          line_total,
          note
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          purchaseId,
          item.plant_species_id || null,
          item.plant_variety_id || null,
          item.item_type || "cutting",
          Number(item.quantity || 0),
          Number(item.unit_price || 0),
          lineTotal,
          item.note || null,
        ]
      );

      const purchaseItemId = itemResult.insertId;

      const itemImages = normalizeUploadedImages(item.images);
      for (const img of itemImages) {
        await db.query(
          `INSERT INTO purchase_images (
            purchase_id,
            purchase_item_id,
            image_url,
            image_public_id,
            image_type
          ) VALUES (?, ?, ?, ?, 'seller_post')`,
          [purchaseId, purchaseItemId, img.url, img.public_id]
        );
      }
    }

    const billImages = normalizeUploadedImages(purchase_images);
    for (const img of billImages) {
      await db.query(
        `INSERT INTO purchase_images (
          purchase_id,
          purchase_item_id,
          image_url,
          image_public_id,
          image_type
        ) VALUES (?, NULL, ?, ?, 'seller_post')`,
        [purchaseId, img.url, img.public_id]
      );
    }

    const totals = await recalculatePurchaseTotals(purchaseId);

    await writeAudit({
      gardenId,
      userId,
      action: 'create',
      entity: 'purchase',
      entityId: purchaseResult.insertId,
      newData: body,
    });

    return reply.send({
      ok: true,
      purchaseId,
      totals,
    });
  } catch (err) {
    console.error(err);
    return reply.code(500).send({ message: "บันทึกการซื้อไม่สำเร็จ" });
  }
}

/* ---------------- LIST ---------------- */
export async function listPurchases(req, reply) {
  const { gardenId, isSuper, scope } = req.gardenContext;
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 10;
  const offset = (page - 1) * limit;

  const search = String(req.query.search || "").trim();
  const from = String(req.query.from || "").trim();
  const to = String(req.query.to || "").trim();
  const supplierId = String(req.query.supplier_id || "").trim();

  let where = `WHERE p.deleted_at IS NULL`;
  const params = [];

  if (!(isSuper && scope === "all")) {
    where += ` AND p.garden_id = ?`;
    params.push(gardenId);
  }

  if (search) {
    where += ` AND (
      s.name LIKE ?
      OR p.channel LIKE ?
      OR p.order_link LIKE ?
      OR p.note LIKE ?
    )`;
    params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
  }

  if (supplierId) {
    where += ` AND p.supplier_id = ?`;
    params.push(Number(supplierId));
  }

  if (from && to) {
    where += ` AND DATE(p.purchase_date) BETWEEN ? AND ?`;
    params.push(from, to);
  } else if (from) {
    where += ` AND DATE(p.purchase_date) >= ?`;
    params.push(from);
  } else if (to) {
    where += ` AND DATE(p.purchase_date) <= ?`;
    params.push(to);
  }

  const [rows] = await db.query(
    `SELECT
      p.id,
      p.garden_id,
      g.name AS garden_name,
      s.name AS supplier_name,
      p.channel,
      p.purchase_date,
      p.received_date,
      p.items_total,
      p.shipping_cost,
      p.grand_total,
      p.slip_image_url,
      COUNT(DISTINCT pi.id) AS item_count,
      MIN(CASE WHEN img.image_type <> 'slip' THEN img.image_url END) AS cover_image
     FROM purchases p
     LEFT JOIN gardens g ON g.id = p.garden_id
     LEFT JOIN purchase_items pi ON pi.purchase_id = p.id
     LEFT JOIN purchase_images img ON img.purchase_id = p.id
     LEFT JOIN suppliers s ON s.id = p.supplier_id
     ${where}
     GROUP BY p.id
     ORDER BY p.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  const [[{ total }]] = await db.query(
    `SELECT COUNT(*) AS total
     FROM purchases p
     LEFT JOIN suppliers s ON s.id = p.supplier_id
     ${where}`,
    params
  );

  return reply.send({
    data: rows,
    total,
    page,
    limit,
  });
}

/* ---------------- EXPORT CSV ---------------- */
export async function exportPurchases(req, reply) {
  try {
    const { gardenId, isSuper, scope } = req.gardenContext;
    const search = String(req.query.search || "").trim();
    const from = String(req.query.from || "").trim();
    const to = String(req.query.to || "").trim();
    const supplierId = String(req.query.supplier_id || "").trim();

    let where = `WHERE 1=1`;
    const params = [];

    if (!(isSuper && scope === "all")) {
      where += ` AND p.garden_id = ?`;
      params.push(gardenId);
    }

    if (search) {
      where += ` AND (
        s.name LIKE ?
        OR p.channel LIKE ?
        OR p.order_link LIKE ?
        OR p.note LIKE ?
      )`;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (supplierId) {
      where += ` AND p.supplier_id = ?`;
      params.push(Number(supplierId));
    }

    if (from && to) {
      where += ` AND DATE(p.purchase_date) BETWEEN ? AND ?`;
      params.push(from, to);
    } else if (from) {
      where += ` AND DATE(p.purchase_date) >= ?`;
      params.push(from);
    } else if (to) {
      where += ` AND DATE(p.purchase_date) <= ?`;
      params.push(to);
    }

    const [rows] = await db.query(
      `SELECT
        g.name AS garden_name,
        p.id,
        s.name AS supplier_name,
        p.channel,
        p.purchase_date,
        p.received_date,
        p.items_total,
        p.shipping_cost,
        p.grand_total,
        COUNT(DISTINCT pi.id) AS item_count,
        p.note
       FROM purchases p
       LEFT JOIN gardens g ON g.id = p.garden_id
       LEFT JOIN suppliers s ON s.id = p.supplier_id
       LEFT JOIN purchase_items pi ON pi.purchase_id = p.id
       ${where}
       GROUP BY p.id
       ORDER BY p.created_at DESC`,
      params
    );

    const headers = [
      "สวน",
      "รหัสซื้อ",
      "Supplier",
      "ช่องทาง",
      "วันที่ซื้อ",
      "วันที่ได้รับ",
      "จำนวนรายการ",
      "ค่าสินค้ารวม",
      "ค่าส่ง",
      "ยอดรวม",
      "หมายเหตุ",
    ];

    const csvRows = rows.map((row) =>
      [
        escapeCsv(row.garden_name || ""),
        escapeCsv(row.id || ""),
        escapeCsv(row.supplier_name || ""),
        escapeCsv(row.channel || ""),
        escapeCsv(row.purchase_date || ""),
        escapeCsv(row.received_date || ""),
        escapeCsv(row.item_count || 0),
        escapeCsv(row.items_total || 0),
        escapeCsv(row.shipping_cost || 0),
        escapeCsv(row.grand_total || 0),
        escapeCsv(row.note || ""),
      ].join(",")
    );

    const csv = [headers.map(escapeCsv).join(","), ...csvRows].join("\n");

    reply.header("Content-Type", "text/csv; charset=utf-8");
    reply.header(
      "Content-Disposition",
      `attachment; filename="purchases-${Date.now()}.csv"`
    );

    return reply.send("\uFEFF" + csv);
  } catch (error) {
    console.error("exportPurchases error:", error);
    return reply.code(500).send({ message: "export purchases ไม่สำเร็จ" });
  }
}

export async function getPurchaseDetail(req, reply) {
  const { id } = req.params;
  const { gardenId, isSuper, scope } = req.gardenContext;

  let sql = `
    SELECT
      p.garden_id,
      g.name AS garden_name,
      p.id,
      p.supplier_id,
      p.order_link,
      p.channel,
      p.payment_method,
      p.payment_detail,
      p.items_total,
      p.shipping_cost,
      p.grand_total,
      p.purchase_date,
      p.received_date,
      p.slip_image_url,
      p.slip_image_public_id,
      p.note,
      p.created_by,
      p.created_at,
      s.name AS supplier_name
    FROM purchases p
    LEFT JOIN gardens g ON g.id = p.garden_id
    LEFT JOIN suppliers s ON p.supplier_id = s.id
    WHERE p.id = ?
  `;
  const params = [id];

  if (!(isSuper && scope === "all")) {
    sql += ` AND p.garden_id = ?`;
    params.push(gardenId);
  }

  const [[purchase]] = await db.query(sql, params);

  if (!purchase) {
    return reply.code(404).send({ message: "ไม่พบรายการซื้อ" });
  }

  const [items] = await db.query(
    `SELECT
      pi.*,
      ps.name AS species_name,
      pv.name AS variety_name
     FROM purchase_items pi
     LEFT JOIN plant_species ps ON ps.id = pi.plant_species_id
     LEFT JOIN plant_varieties pv ON pv.id = pi.plant_variety_id
     WHERE pi.purchase_id = ?
     ORDER BY pi.id ASC`,
    [id]
  );

  const [images] = await db.query(
    `SELECT *
     FROM purchase_images
     WHERE purchase_id = ?
     ORDER BY id ASC`,
    [id]
  );

  const itemsWithImages = items.map((item) => ({
    ...item,
    images: images.filter((img) => img.purchase_item_id === item.id),
  }));

  return reply.send({
    purchase,
    items: itemsWithImages,
    images: images.filter((img) => img.purchase_item_id === null),
  });
}

export async function updatePurchase(req, reply) {
  const { id } = req.params;
  // const { gardenId } = req.gardenContext;
  const userId = req.user.userId;
  const {
    order_link,
    channel,
    payment_method,
    payment_detail,
    shipping_cost,
    purchase_date,
    received_date,
    note,
    slip_image_url,
    slip_image_public_id,
  } = req.body || {};

  const [[purchase]] = await db.query(
    `SELECT *
     FROM purchases
     WHERE id = ?`,
    [id]
  );

  if (!purchase) {
    return reply.code(404).send({ message: "ไม่พบรายการซื้อ" });
  }

  try {
    await db.query(
      `UPDATE purchases
       SET order_link = ?,
           channel = ?,
           payment_method = ?,
           payment_detail = ?,
           shipping_cost = ?,
           purchase_date = ?,
           received_date = ?,
           slip_image_url = ?,
           slip_image_public_id = ?,
           note = ?
       WHERE id = ?`,
      [
        order_link ?? purchase.order_link,
        channel ?? purchase.channel,
        payment_method ?? purchase.payment_method,
        payment_detail ?? purchase.payment_detail,
        shipping_cost ?? purchase.shipping_cost,
        purchase_date ?? purchase.purchase_date,
        received_date ?? purchase.received_date,
        slip_image_url ?? purchase.slip_image_url,
        slip_image_public_id ?? purchase.slip_image_public_id,
        note ?? purchase.note,
        id,
      ]
    );

    const totals = await recalculatePurchaseTotals(id);

    await writeAudit({
      gardenId: purchase.garden_id,
      userId,
      action: 'update',
      entity: 'purchase',
      entityId: id,
      oldData: purchase,
      newData: req.body,
    });

    return reply.send({
      ok: true,
      ...totals,
    });
  } catch (err) {
    console.error(err);
    return reply.code(500).send({ message: "แก้ไข purchase ไม่สำเร็จ" });
  }
}

export async function updatePurchaseItem(req, reply) {
  const { id, itemId } = req.params;
  // const { gardenId } = req.gardenContext;
  const userId = req.user.userId;
  const {
    plant_species_id,
    plant_variety_id,
    item_type,
    quantity,
    unit_price,
    note,
  } = req.body || {};

  const [[purchase]] = await db.query(
    `SELECT *
     FROM purchases
     WHERE id = ?`,
    [id]
  );

  if (!purchase) {
    return reply.code(404).send({ message: "ไม่พบ purchase" });
  }

  const [[item]] = await db.query(
    `SELECT *
     FROM purchase_items
     WHERE id = ? AND purchase_id = ?`,
    [itemId, id]
  );

  if (!item) {
    return reply.code(404).send({ message: "ไม่พบรายการย่อย" });
  }

  const nextQuantity = Number(quantity ?? item.quantity);
  const nextUnitPrice = Number(unit_price ?? item.unit_price);
  const lineTotal = nextQuantity * nextUnitPrice;

  try {
    await db.query(
      `UPDATE purchase_items
       SET plant_species_id = ?,
           plant_variety_id = ?,
           item_type = ?,
           quantity = ?,
           unit_price = ?,
           line_total = ?,
           note = ?
       WHERE id = ?`,
      [
        plant_species_id ?? item.plant_species_id,
        plant_variety_id ?? item.plant_variety_id,
        item_type ?? item.item_type,
        nextQuantity,
        nextUnitPrice,
        lineTotal,
        note ?? item.note,
        itemId,
      ]
    );

    const totals = await recalculatePurchaseTotals(id);

    await writeAudit({
      gardenId: purchase.garden_id,
      userId,
      action: 'update',
      entity: 'purchase_items',
      entityId: id,
      oldData: item,
      newData: req.body,
    });

    return reply.send({
      ok: true,
      itemId: Number(itemId),
      line_total: lineTotal,
      ...totals,
    });
  } catch (err) {
    console.error(err);
    return reply.code(500).send({ message: "แก้ไขรายการย่อยไม่สำเร็จ" });
  }
}

export async function addPurchaseImages(req, reply) {
  const { id } = req.params;
  const { gardenId, isSuper, scope } = req.gardenContext;
  const userId = req.user.userId;
  const {
    slip_image_url,
    slip_image_public_id,
    purchase_images = [],
    item_images = {},
  } = req.body || {};

  let sql = `
    SELECT
      p.*
    FROM purchases p
    WHERE p.id = ?
  `;
  const params = [id];

  if (!(isSuper && scope === "all")) {
    sql += ` AND p.garden_id = ?`;
    params.push(gardenId);
  }

  const [[purchase]] = await db.query(sql, params);

  if (!purchase) {
    return reply.code(404).send({ message: "ไม่พบ purchase" });
  }

  try {
    if (slip_image_url) {
      await db.query(
        `UPDATE purchases
         SET slip_image_url = ?,
             slip_image_public_id = ?
         WHERE id = ?`,
        [slip_image_url, slip_image_public_id || null, id]
      );
    }

    for (const img of normalizeUploadedImages(purchase_images)) {
      await db.query(
        `INSERT INTO purchase_images (
          purchase_id,
          purchase_item_id,
          image_url,
          image_public_id,
          image_type
        ) VALUES (?, NULL, ?, ?, 'seller_post')`,
        [id, img.url, img.public_id]
      );
    }

    for (const rawItemId of Object.keys(item_images || {})) {
      const purchaseItemId = Number(rawItemId);
      const images = normalizeUploadedImages(item_images[rawItemId]);

      for (const img of images) {
        await db.query(
          `INSERT INTO purchase_images (
            purchase_id,
            purchase_item_id,
            image_url,
            image_public_id,
            image_type
          ) VALUES (?, ?, ?, ?, 'seller_post')`,
          [id, purchaseItemId, img.url, img.public_id]
        );
      }
    }

    await writeAudit({
      gardenId: purchase.garden_id,
      userId,
      action: 'create',
      entity: 'purchase_items',
      entityId: id,
      oldData: purchase,
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

export async function getPurchasesImage(req, reply) {
  const { id } = req.params;

  const [images] = await db.query(
    `SELECT *
     FROM purchase_images
     WHERE purchase_id = ?
     ORDER BY id ASC`,
    [id]
  );

  return reply.send({
    images: images.filter((img) => img.purchase_item_id === null),
  });
}

export async function deletePurchase(req, reply) {
  try {
    const { id } = req.params;
    // const { gardenId } = req.gardenContext;
    const userId = req.user.userId;

    const [[purchase]] = await db.query(
      `SELECT * FROM purchases
       WHERE id = ? AND deleted_at IS NULL`,
      [id]
    );

    if (!purchase) {
      return reply.code(404).send({ message: "ไม่พบ purchase" });
    }

    // delete parent
    await db.query(
      `UPDATE purchases
       SET deleted_at = NOW(), deleted_by = ?
       WHERE id = ?`,
      [userId, id]
    );

    // delete items
    await db.query(
      `UPDATE purchase_items
       SET deleted_at = NOW(), deleted_by = ?
       WHERE purchase_id = ? AND deleted_at IS NULL`,
      [userId, id]
    );

    // delete images
    await db.query(
      `UPDATE purchase_images
       SET deleted_at = NOW(), deleted_by = ?
       WHERE purchase_id = ? AND deleted_at IS NULL`,
      [userId, id]
    );

    const audit = await writeAudit({
      gardenId: purchase.garden_id,
      userId,
      action: "delete",
      entity: "purchases",
      entityId: id,
      oldData: purchase,
    });

    return reply.send({ ok: true, auditLogId: audit.id, });
  } catch (err) {
    console.error(err);
    return reply.code(500).send({ message: "ลบ purchase ไม่สำเร็จ" });
  }
}

export async function restorePurchase(req, reply) {
  try {
    const { id } = req.params;
    const { gardenId } = req.gardenContext;
    const userId = req.user.userId;

    const [[purchase]] = await db.query(
      `SELECT * FROM purchases
       WHERE id = ? AND garden_id = ? AND deleted_at IS NOT NULL`,
      [id, gardenId]
    );

    if (!purchase) {
      return reply.code(404).send({ message: "ไม่พบ purchase" });
    }

    await db.query(
      `UPDATE purchases
       SET deleted_at = NULL, deleted_by = NULL
       WHERE id = ?`,
      [id]
    );

    await db.query(
      `UPDATE purchase_items
       SET deleted_at = NULL, deleted_by = NULL
       WHERE purchase_id = ? AND deleted_at IS NOT NULL`,
      [id]
    );

    await db.query(
      `UPDATE purchase_images
       SET deleted_at = NULL, deleted_by = NULL
       WHERE purchase_id = ? AND deleted_at IS NOT NULL`,
      [id]
    );

    await writeAudit({
      gardenId,
      userId,
      action: "restore",
      entity: "purchases",
      entityId: id,
      oldData: purchase,
    });

    return reply.send({ ok: true });
  } catch (err) {
    console.error(err);
    return reply.code(500).send({ message: "restore purchase ไม่สำเร็จ" });
  }
}
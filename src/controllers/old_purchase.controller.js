import { db } from '../config/db.js';
import fs from "fs"
import path from "path"

async function savePartFile(part, folder = "uploads/purchases") {
  await fs.promises.mkdir(folder, { recursive: true })

  const safeName = `${Date.now()}-${part.filename}`
  const filepath = path.join(folder, safeName)

  await new Promise((resolve, reject) => {
    const stream = fs.createWriteStream(filepath)
    part.file.pipe(stream)
    part.file.on("end", resolve)
    part.file.on("error", reject)
    stream.on("error", reject)
  })

  return `/${filepath.replace(/\\/g, "/")}`
}

async function recalculatePurchaseTotals(purchaseId) {
  const [[purchase]] = await db.query(
    `SELECT shipping_cost
     FROM purchases
     WHERE id = ?`,
    [purchaseId]
  )

  const [items] = await db.query(
    `SELECT id, quantity, line_total
     FROM purchase_items
     WHERE purchase_id = ?`,
    [purchaseId]
  )

  const itemsTotal = items.reduce(
    (sum, item) => sum + Number(item.line_total || 0),
    0
  )

  const shippingCost = Number(purchase?.shipping_cost || 0)
  const grandTotal = itemsTotal + shippingCost

  for (const item of items) {
    let shippingAllocated = 0

    if (itemsTotal > 0) {
      shippingAllocated =
        (Number(item.line_total || 0) / itemsTotal) * shippingCost
    }

    const costTotal = Number(item.line_total || 0) + shippingAllocated
    const costPerUnit =
      Number(item.quantity || 0) > 0
        ? costTotal / Number(item.quantity)
        : 0

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
    )
  }

  await db.query(
    `UPDATE purchases
     SET items_total = ?, grand_total = ?
     WHERE id = ?`,
    [itemsTotal, grandTotal, purchaseId]
  )

  return {
    items_total: itemsTotal,
    grand_total: grandTotal,
  }
}

export async function createPurchase(req, reply) {
  const { gardenId } = req.params
  const userId = req.user.userId

  const fields = {}
  let slipImageUrl = null
  const purchaseImages = []
  const itemImagesMap = {}

  const parts = req.parts()

  for await (const part of parts) {
    if (part.type === "file") {
      if (part.fieldname === "slip_image") {
        slipImageUrl = await savePartFile(part)
      } else if (part.fieldname === "purchase_images") {
        const imageUrl = await savePartFile(part)
        purchaseImages.push(imageUrl)
      } else if (part.fieldname.startsWith("item_images_")) {
        const index = Number(part.fieldname.replace("item_images_", ""))
        const imageUrl = await savePartFile(part)

        if (!itemImagesMap[index]) {
          itemImagesMap[index] = []
        }
        itemImagesMap[index].push(imageUrl)
      }
    } else {
      fields[part.fieldname] = part.value
    }
  }
  const supplier_id = fields.supplier_id || null
  const order_link = fields.order_link || null
  const channel = fields.channel || null
  const payment_method = fields.payment_method || null
  const payment_detail = fields.payment_detail || null
  const shipping_cost = Number(fields.shipping_cost || 0)
  const purchase_date = fields.purchase_date || null
  const received_date = fields.received_date || null
  const note = fields.note || null

  let items = []
  try {
    items = JSON.parse(fields.items || "[]")
  } catch {
    return reply.code(400).send({ message: "items format invalid" })
  }

  if (!items.length) {
    return reply.code(400).send({ message: "ต้องมีรายการอย่างน้อย 1 รายการ" })
  }

  try {

    let itemsTotal = 0

    for (const item of items) {
      itemsTotal += Number(item.quantity || 0) * Number(item.unit_price || 0)
    }

    const grandTotal = itemsTotal + shipping_cost

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
        note,
        created_by
      ) VALUES (?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        gardenId,
        supplier_id,
        order_link,
        channel,
        payment_method,
        payment_detail,
        itemsTotal,
        shipping_cost,
        grandTotal,
        purchase_date,
        received_date,
        slipImageUrl,
        note,
        userId,
      ]
    )

    const purchaseId = purchaseResult.insertId

    for (let index = 0; index < items.length; index++) {
      const item = items[index]
      const lineTotal = Number(item.quantity || 0) * Number(item.unit_price || 0)

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
      )

      const purchaseItemId = itemResult.insertId

      const itemImages = itemImagesMap[index] || []
      for (const imageUrl of itemImages) {
        await db.query(
          `INSERT INTO purchase_images (
            purchase_id,
            purchase_item_id,
            image_url,
            image_type
          ) VALUES (?, ?, ?, 'seller_post')`,
          [purchaseId, purchaseItemId, imageUrl]
        )
      }
    }

    for (const imageUrl of purchaseImages) {
      await db.query(
        `INSERT INTO purchase_images (
          purchase_id,
          purchase_item_id,
          image_url,
          image_type
        ) VALUES (?, NULL, ?, 'seller_post')`,
        [purchaseId, imageUrl]
      )
    }

    const totals = await recalculatePurchaseTotals(purchaseId);

    return reply.send({
      ok: true,
      purchaseId,
      totals,
    })
  } catch (err) {
    console.error(err)
    return reply.code(500).send({ message: "บันทึกการซื้อไม่สำเร็จ" })
  }
}

export async function listPurchases(req, reply) {
  const { gardenId } = req.params
  const page = Number(req.query.page) || 1
  const limit = Number(req.query.limit) || 10
  const offset = (page - 1) * limit

  const [rows] = await db.query(
    `SELECT
      p.id,
      s.name AS supplier_name,
      p.channel,
      p.purchase_date,
      p.received_date,
      p.items_total,
      p.shipping_cost,
      p.grand_total,
      p.slip_image_url,
      COUNT(DISTINCT pi.id) AS item_count,
      MIN(img.image_url) AS cover_image
     FROM purchases p
     LEFT JOIN purchase_items pi ON pi.purchase_id = p.id
     LEFT JOIN purchase_images img ON img.purchase_id = p.id
     LEFT JOIN suppliers s ON s.id = p.supplier_id
     WHERE p.garden_id = ?
     GROUP BY p.id
     ORDER BY p.created_at DESC
     LIMIT ? OFFSET ?`,
    [gardenId, limit, offset]
  )

  const [[{ total }]] = await db.query(
    `SELECT COUNT(*) AS total
     FROM purchases
     WHERE garden_id = ?`,
    [gardenId]
  )

  return reply.send({
    data: rows,
    total,
  })
}

export async function getPurchaseDetail(req, reply) {
  const { gardenId, id } = req.params

  const [[purchase]] = await db.query(
    `SELECT 
      purchases.garden_id, 
      purchases.id, 
      purchases.supplier_id, 
      purchases.order_link, 
      purchases.channel, 
      purchases.payment_method, 
      purchases.payment_detail, 
      purchases.items_total, 
      purchases.shipping_cost, 
      purchases.grand_total, 
      purchases.purchase_date, 
      purchases.received_date, 
      purchases.slip_image_url, 
      purchases.note, 
      purchases.created_by, 
      purchases.created_at,
	    suppliers.name AS supplier_name
     FROM purchases
     LEFT JOIN suppliers ON purchases.supplier_id = suppliers.id
     WHERE purchases.id = ? AND purchases.garden_id = ?`,
    [id, gardenId]
  )

  if (!purchase) {
    return reply.code(404).send({ message: "ไม่พบรายการซื้อ" })
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
  )

  const [images] = await db.query(
    `SELECT *
     FROM purchase_images
     WHERE purchase_id = ?
     ORDER BY id ASC`,
    [id]
  )

  const itemsWithImages = items.map((item) => ({
    ...item,
    images: images.filter((img) => img.purchase_item_id === item.id),
  }))

  return reply.send({
    purchase,
    items: itemsWithImages,
    images: images.filter((img) => img.purchase_item_id === null),
  })
}

export async function updatePurchase(req, reply) {
  const { gardenId, id } = req.params;
  const {
    supplier_name,
    contact_link,
    order_link,
    channel,
    payment_method,
    payment_detail,
    shipping_cost,
    purchase_date,
    received_date,
    note,
  } = req.body;

  const [[purchase]] = await db.query(
    `SELECT *
     FROM purchases
     WHERE id = ? AND garden_id = ?`,
    [id, gardenId]
  );

  if (!purchase) {
    return reply.code(404).send({ message: "ไม่พบรายการซื้อ" });
  }

  try {

    await db.query(
      `UPDATE purchases
       SET supplier_name = ?,
           contact_link = ?,
           order_link = ?,
           channel = ?,
           payment_method = ?,
           payment_detail = ?,
           shipping_cost = ?,
           purchase_date = ?,
           received_date = ?,
           note = ?
       WHERE id = ?`,
      [
        supplier_name ?? purchase.supplier_name,
        contact_link ?? purchase.contact_link,
        order_link ?? purchase.order_link,
        channel ?? purchase.channel,
        payment_method ?? purchase.payment_method,
        payment_detail ?? purchase.payment_detail,
        shipping_cost ?? purchase.shipping_cost,
        purchase_date ?? purchase.purchase_date,
        received_date ?? purchase.received_date,
        note ?? purchase.note,
        id,
      ]
    );

    const totals = await recalculatePurchaseTotals(id);

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
  const { gardenId, id, itemId } = req.params;
  const {
    plant_species_id,
    plant_variety_id,
    item_type,
    quantity,
    unit_price,
    note,
  } = req.body;

  const [[purchase]] = await db.query(
    `SELECT *
     FROM purchases
     WHERE id = ? AND garden_id = ?`,
    [id, gardenId]
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
  const { gardenId, id } = req.params;

  const [[purchase]] = await db.query(
    `SELECT *
     FROM purchases
     WHERE id = ? AND garden_id = ?`,
    [id, gardenId]
  );

  if (!purchase) {
    return reply.code(404).send({ message: "ไม่พบ purchase" });
  }

  const parts = req.parts();
  const uploaded = [];

  for await (const part of parts) {
    if (part.type !== "file") continue;

    const imageUrl = await savePartFile(part);
    uploaded.push({
      fieldname: part.fieldname,
      imageUrl,
    });
  }

  for (const file of uploaded) {
    let purchaseItemId = null;
    let imageType = "other";

    if (file.fieldname === "purchase_images") {
      purchaseItemId = null;
      imageType = "seller_post";
    } else if (file.fieldname.startsWith("item_images_")) {
      purchaseItemId = Number(file.fieldname.replace("item_images_", ""));
      imageType = "seller_post";
    } else if (file.fieldname === "slip_image") {
      imageType = "slip";
      await db.query(
        `UPDATE purchases
         SET slip_image_url = ?
         WHERE id = ?`,
        [file.imageUrl, id]
      );
    }

    await db.query(
      `INSERT INTO purchase_images (
        purchase_id,
        purchase_item_id,
        image_url,
        image_type
      ) VALUES (?, ?, ?, ?)`,
      [id, purchaseItemId, file.imageUrl, imageType]
    );
  }

  return reply.send({
    ok: true,
    uploaded: uploaded.length,
  });
}

export async function getPurchasesImage(req, reply) {
  const { id } = req.params
  console.log(id);
  
  const [images] = await db.query(
    `SELECT *
     FROM purchase_images
     WHERE purchase_id = ?
     ORDER BY id ASC`,
    [id]
  )
  return reply.send({
    images: images.filter((img) => img.purchase_item_id === null),
  })

}
import { db } from "../config/db.js";
import { z } from "zod";
import cloudinary from "../config/cloudinary.js";
import crypto from "crypto";
import { writeAudit } from "../services/audit.service.js";

function generateQrToken() {
  return crypto.randomBytes(16).toString("hex");
}

const plantVarietySchema = z.object({
  plant_species_id: z.coerce.number().int().positive(),
  name: z.string().trim().min(1, "กรุณากรอกชื่อพันธุ์"),
  short_name: z.string().trim().max(100).optional().or(z.literal("")),

  public_qr_token: z.string().trim().max(100).optional().or(z.literal("")),
  is_public: z.coerce.number().optional(),
  public_title: z.string().optional().or(z.literal("")),
  subtitle: z.string().optional().or(z.literal("")),
  highlight_text: z.string().optional().or(z.literal("")),
  planting_method: z.string().optional().or(z.literal("")),
  care_method: z.string().optional().or(z.literal("")),
  sunlight: z.string().optional().or(z.literal("")),
  watering: z.string().optional().or(z.literal("")),
  tips: z.string().optional().or(z.literal("")),
  public_note: z.string().optional().or(z.literal("")),
  cover_image_url: z.string().optional().or(z.literal("")),
  gallery_json: z.string().optional().or(z.literal("[]")),
  sort_order: z.coerce.number().optional(),

  note: z.string().optional().or(z.literal("")),
  image_url: z.string().optional().or(z.literal("")),
  image_public_id: z.string().optional().or(z.literal("")),
});

function extractPublicIdFromCloudinaryUrl(url) {
  if (!url) return null;
  const marker = "/upload/";
  const index = url.indexOf(marker);
  if (index === -1) return null;

  const tail = url.slice(index + marker.length);
  const parts = tail.split("/");

  if (parts[0]?.startsWith("v")) {
    parts.shift();
  }

  const joined = parts.join("/");
  return joined.replace(/\.[^.]+$/, "");
}

async function tableHasColumn(tableName, columnName) {
  const [rows] = await db.query(
    `
    SELECT COUNT(*) AS total
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = ?
      AND COLUMN_NAME = ?
    `,
    [tableName, columnName]
  );

  return Number(rows?.[0]?.total || 0) > 0;
}

async function getPlantVarietyById(id) {
  const hasDeletedAt = await tableHasColumn("plant_varieties", "deleted_at");

  let sql = `
    SELECT *
    FROM plant_varieties
    WHERE id = ?
  `;

  if (hasDeletedAt) {
    sql += ` AND deleted_at IS NULL`;
  }

  sql += ` LIMIT 1`;

  const [[row]] = await db.query(sql, [id]);
  return row || null;
}

async function destroyCloudinaryImage(publicIdOrUrl) {
  if (!publicIdOrUrl) return;

  const publicId =
    publicIdOrUrl.includes("/") || publicIdOrUrl.includes(".")
      ? extractPublicIdFromCloudinaryUrl(publicIdOrUrl) || publicIdOrUrl
      : publicIdOrUrl;

  if (!publicId) return;

  try {
    await cloudinary.uploader.destroy(publicId);
  } catch (err) {
    console.error("Cloudinary destroy error:", publicId, err);
  }
}

export async function getVarietiesBySpecies(req, reply) {
  const { speciesId } = req.params;
  const hasDeletedAt = await tableHasColumn("plant_varieties", "deleted_at");

  let sql = `
    SELECT id, name
    FROM plant_varieties
    WHERE plant_species_id = ?
  `;

  if (hasDeletedAt) {
    sql += ` AND deleted_at IS NULL`;
  }

  sql += ` ORDER BY name ASC`;

  const [rows] = await db.query(sql, [speciesId]);
  return reply.send(rows);
}

export async function getVarieties(req, reply) {
  const hasDeletedAt = await tableHasColumn("plant_varieties", "deleted_at");

  let sql = `
    SELECT id, plant_species_id, name
    FROM plant_varieties
  `;

  if (hasDeletedAt) {
    sql += ` WHERE deleted_at IS NULL`;
  }

  sql += ` ORDER BY name ASC`;

  const [rows] = await db.query(sql);
  return reply.send(rows);
}

export async function getPlantVarieties(request, reply) {
  const hasDeletedAt = await tableHasColumn("plant_varieties", "deleted_at");

  let sql = `
    SELECT
      pv.id,
      pv.plant_species_id,
      ps.name AS species_name,
      pv.name,
      pv.short_name,
      pv.public_qr_token,
      pv.is_public,
      pv.public_title,
      pv.subtitle,
      pv.highlight_text,
      pv.planting_method,
      pv.care_method,
      pv.sunlight,
      pv.watering,
      pv.tips,
      pv.public_note,
      pv.cover_image_url,
      pv.gallery_json,
      pv.sort_order,
      pv.note,
      pv.image_url,
      pv.image_public_id,
      pv.created_at,
      pv.updated_at
    FROM plant_varieties pv
    LEFT JOIN plant_species ps ON ps.id = pv.plant_species_id
  `;

  if (hasDeletedAt) {
    sql += ` WHERE pv.deleted_at IS NULL`;
  }

  sql += ` ORDER BY pv.sort_order ASC, pv.id DESC`;

  const [rows] = await db.query(sql);

  return reply.send({ data: rows });
}

export async function createPlantVariety(request, reply) {
  try {
    const body = request.body || {};
    const userId = request.user?.userId || request.user?.id || null;

    const parsed = plantVarietySchema.safeParse(body);

    if (!parsed.success) {
      return reply.code(400).send({
        message: "ข้อมูลไม่ถูกต้อง",
        errors: parsed.error.flatten(),
      });
    }

    const v = parsed.data;
    const qrToken = v.public_qr_token?.trim() || generateQrToken();

    const [result] = await db.query(
      `
      INSERT INTO plant_varieties (
        plant_species_id,
        name,
        short_name,
        public_qr_token,
        is_public,
        public_title,
        subtitle,
        highlight_text,
        planting_method,
        care_method,
        sunlight,
        watering,
        tips,
        public_note,
        cover_image_url,
        gallery_json,
        sort_order,
        note,
        image_url,
        updated_at,
        image_public_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?)
      `,
      [
        v.plant_species_id,
        v.name,
        v.short_name || null,
        qrToken,
        String(v.is_public) === "1" || v.is_public === true ? 1 : 0,
        v.public_title || null,
        v.subtitle || null,
        v.highlight_text || null,
        v.planting_method || null,
        v.care_method || null,
        v.sunlight || null,
        v.watering || null,
        v.tips || null,
        v.public_note || null,
        v.cover_image_url || null,
        v.gallery_json || "[]",
        Number(v.sort_order || 0),
        v.note || null,
        v.image_url || null,
        v.image_public_id || null,
      ]
    );

    await writeAudit({
      gardenId: 0,
      userId,
      action: "create",
      entity: "plant_varieties",
      entityId: result.insertId,
      newData: {
        ...body,
        public_qr_token: qrToken,
      },
    });

    return reply.code(201).send({
      success: true,
      id: result.insertId,
      plant_species_id: v.plant_species_id,
      name: v.name,
      short_name: v.short_name || null,
      note: v.note || null,
      image_url: v.image_url || null,
      image_public_id: v.image_public_id || null,
      public_qr_token: qrToken,
    });
  } catch (error) {
    console.error("createPlantVariety error:", error);
    return reply.code(500).send({ message: "สร้างสายพันธุ์ไม่สำเร็จ" });
  }
}

export async function updatePlantVariety(request, reply) {
  try {
    const id = Number(request.params.id);
    const body = request.body || {};
    const userId = request.user?.userId || request.user?.id || null;

    const parsed = plantVarietySchema.safeParse(body);

    if (!parsed.success) {
      return reply.code(400).send({
        message: "ข้อมูลไม่ถูกต้อง",
        errors: parsed.error.flatten(),
      });
    }

    const old = await getPlantVarietyById(id);

    if (!old) {
      return reply.code(404).send({ message: "Plant variety not found" });
    }

    const v = parsed.data;

    const oldImageUrl = old.image_url || null;
    const oldImagePublicId = old.image_public_id || null;
    const newImageUrl = v.image_url || null;
    const newImagePublicId = v.image_public_id || null;

    const imageChanged =
      oldImageUrl !== newImageUrl || oldImagePublicId !== newImagePublicId;

    await db.query(
      `
      UPDATE plant_varieties
      SET
        plant_species_id = ?,
        name = ?,
        short_name = ?,
        public_qr_token = ?,
        is_public = ?,
        public_title = ?,
        subtitle = ?,
        highlight_text = ?,
        planting_method = ?,
        care_method = ?,
        sunlight = ?,
        watering = ?,
        tips = ?,
        public_note = ?,
        cover_image_url = ?,
        gallery_json = ?,
        sort_order = ?,
        note = ?,
        image_url = ?,
        image_public_id = ?,
        updated_at = NOW()
      WHERE id = ?
      `,
      [
        v.plant_species_id,
        v.name,
        v.short_name || null,
        v.public_qr_token || null,
        String(v.is_public) === "1" || v.is_public === true ? 1 : 0,
        v.public_title || null,
        v.subtitle || null,
        v.highlight_text || null,
        v.planting_method || null,
        v.care_method || null,
        v.sunlight || null,
        v.watering || null,
        v.tips || null,
        v.public_note || null,
        v.cover_image_url || null,
        v.gallery_json || "[]",
        Number(v.sort_order || 0),
        v.note || null,
        newImageUrl,
        newImagePublicId,
        id,
      ]
    );

    if (imageChanged && oldImagePublicId) {
      await destroyCloudinaryImage(oldImagePublicId);
    }

    await writeAudit({
      gardenId: 0,
      userId,
      action: "update",
      entity: "plant_varieties",
      entityId: id,
      oldData: old,
      newData: body,
    });

    return reply.send({ success: true });
  } catch (error) {
    console.error("updatePlantVariety error:", error);
    return reply.code(500).send({ message: "แก้ไขสายพันธุ์ไม่สำเร็จ" });
  }
}

export async function deletePlantVariety(request, reply) {
  try {
    const id = Number(request.params.id);
    const userId = request.user?.userId || request.user?.id || null;

    const old = await getPlantVarietyById(id);

    if (!old) {
      return reply.code(404).send({ message: "Plant variety not found" });
    }

    const hasDeletedAt = await tableHasColumn("plant_varieties", "deleted_at");
    const hasDeletedBy = await tableHasColumn("plant_varieties", "deleted_by");

    if (old.image_public_id) {
      await destroyCloudinaryImage(old.image_public_id);
    } else if (old.image_url) {
      await destroyCloudinaryImage(old.image_url);
    }

    if (hasDeletedAt) {
      let sql = `UPDATE plant_varieties SET deleted_at = NOW()`;
      const params = [];

      if (hasDeletedBy) {
        sql += `, deleted_by = ?`;
        params.push(userId);
      }

      sql += `, updated_at = NOW() WHERE id = ?`;
      params.push(id);

      await db.query(sql, params);
    } else {
      await db.query("DELETE FROM plant_varieties WHERE id = ?", [id]);
    }

    await writeAudit({
      gardenId: 0,
      userId,
      action: "delete",
      entity: "plant_varieties",
      entityId: id,
      oldData: old,
    });

    return reply.send({ success: true });
  } catch (error) {
    console.error("deletePlantVariety error:", error);
    return reply.code(500).send({ message: "ลบสายพันธุ์ไม่สำเร็จ" });
  }
}

export async function deletePlantVarietyImageHandler(request, reply) {
  try {
    const { id } = request.params;
    const userId = request.user?.userId || request.user?.id || null;

    const [rows] = await db.query(
      "SELECT image_url, image_public_id FROM plant_varieties WHERE id = ? LIMIT 1",
      [id]
    );

    if (rows.length === 0) {
      return reply.code(404).send({ message: "Plant variety not found" });
    }

    const row = rows[0];
    const imageUrl = row.image_url || null;
    const imagePublicId = row.image_public_id || null;

    if (imagePublicId) {
      await destroyCloudinaryImage(imagePublicId);
    } else if (imageUrl) {
      await destroyCloudinaryImage(imageUrl);
    }

    await db.query(
      `
      UPDATE plant_varieties
      SET image_url = NULL,
          image_public_id = NULL,
          updated_at = NOW()
      WHERE id = ?
      `,
      [id]
    );

    await writeAudit({
      gardenId: 0,
      userId,
      action: "delete_image",
      entity: "plant_varieties",
      entityId: Number(id),
      oldData: row,
    });

    return reply.send({ success: true, message: "Image deleted" });
  } catch (error) {
    console.error("deletePlantVarietyImageHandler error:", error);
    return reply.code(500).send({ message: "ลบรูปไม่สำเร็จ" });
  }
}

export async function getPlantVarietyByQrToken(req, reply) {
  try {
    const { token } = req.params;
    const hasDeletedAt = await tableHasColumn("plant_varieties", "deleted_at");

    let sql = `
      SELECT *
      FROM plant_varieties
      WHERE public_qr_token = ?
        AND is_public = 1
    `;

    if (hasDeletedAt) {
      sql += ` AND deleted_at IS NULL`;
    }

    sql += ` LIMIT 1`;

    const [rows] = await db.query(sql, [token]);
    const variety = rows[0];

    if (!variety) {
      return reply.code(404).send({ message: "ไม่พบสายพันธุ์" });
    }

    return reply.send({ variety });
  } catch (error) {
    console.error("getPlantVarietyByQrToken error:", error);
    return reply.code(500).send({ message: "โหลดข้อมูลไม่สำเร็จ" });
  }
}
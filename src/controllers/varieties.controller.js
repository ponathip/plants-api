import { varietySchema } from "../schemas/variety.schema.js";
import fs from "fs";
import path from "path";
import { pipeline } from "stream/promises";
import { db } from "../config/db.js";
import crypto from "crypto";

function generateQrToken() {
  return crypto.randomBytes(16).toString("hex");
}

/* ---------------- GET list ---------------- */
export async function getVarieties(request, reply) {
  const [rows] = await db.query(
    `SELECT 
        id,
        name,
        scientific_name AS scientificName,
        type,
        image_url AS imageUrl
     FROM varieties
     ORDER BY id DESC`
  );

  return reply.send({ data: rows });
}

/* ---------------- CREATE ---------------- */
export async function createVariety(request, reply) {
  const data = await request.file(); // multipart
  const fields = data.fields;
  const file = data.file;

  const parsed = varietySchema.safeParse({
    name: fields.name?.value,
    scientificName: fields.scientificName?.value,
    type: fields.type?.value,
  });

  if (!parsed.success) {
    return reply.code(400).send(parsed.error);
  }

  let imageUrl = null;

  if (file) {
    const filename = `${Date.now()}-${data.filename}`;
    const uploadDir = "uploads/varieties";
    fs.mkdirSync(uploadDir, { recursive: true });

    const filepath = `${uploadDir}/${filename}`;
    await pipeline(file, fs.createWriteStream(filepath));

    imageUrl = `/${filepath}`;
  }

  const qrToken = generateQrToken();

  const { name, scientificName, type } = parsed.data;

  const [result] = await db.query(
    `INSERT INTO varieties (name, scientific_name, type, image_url)
     VALUES (?, ?, ?, ?)`,
    [name, scientificName, type, imageUrl]
  );

  return reply.code(201).send({
    id: result.insertId,
    name,
    scientificName,
    type,
    imageUrl,
  });
}

/* ---------------- UPDATE ---------------- */
export async function updateVariety(request, reply) {
  const id = Number(request.params.id);
  const data = await request.file();
  const fields = data.fields;
  const file = data.file;

  const parsed = varietySchema.safeParse({
    name: fields.name?.value,
    scientificName: fields.scientificName?.value,
    type: fields.type?.value,
  });

  if (!parsed.success) {
    return reply.code(400).send(parsed.error);
  }

  // หา image เดิม
  const [[old]] = await db.query(
    "SELECT image_url FROM varieties WHERE id = ?",
    [id]
  );
  if (!old) {
    return reply.code(404).send({ message: "Variety not found" });
  }

  let imageUrl = old.image_url;

  // ถ้ามีอัปโหลดรูปใหม่ → ลบรูปเก่า
  if (file) {
    if (imageUrl) {
      const oldPath = path.join(process.cwd(), imageUrl);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }

    const filename = `${Date.now()}-${data.filename}`;
    const uploadDir = "uploads/varieties";
    fs.mkdirSync(uploadDir, { recursive: true });

    const filepath = `${uploadDir}/${filename}`;
    await pipeline(file, fs.createWriteStream(filepath));

    imageUrl = `/${filepath}`;
  }

  const { name, scientificName, type } = parsed.data;

  await db.query(
    `UPDATE varieties
     SET name = ?, scientific_name = ?, type = ?, image_url = ?
     WHERE id = ?`,
    [name, scientificName, type, imageUrl, id]
  );

  return reply.send({ success: true });
}

/* ---------------- DELETE variety ---------------- */
export async function deleteVariety(request, reply) {
  const id = Number(request.params.id);

  const [[row]] = await db.query(
    "SELECT image_url FROM varieties WHERE id = ?",
    [id]
  );

  if (!row) {
    return reply.code(404).send({ message: "Variety not found" });
  }

  if (row.image_url) {
    const filePath = path.join(process.cwd(), row.image_url);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }

  await db.query("DELETE FROM varieties WHERE id = ?", [id]);

  return reply.send({ success: true });
}

/* ---------------- DELETE image only ---------------- */
export const deleteVarietyImageHandler = async (req, reply) => {
  const { id } = req.params;

  // 1. หา variety ก่อน
  const [rows] = await db.query(
    "SELECT image_url FROM varieties WHERE id = ?",
    [id]
  );

  if (rows.length === 0) {
    return reply.code(404).send({ message: "Variety not found" });
  }

  const imageUrl = rows[0].image_url;

  // 2. ลบไฟล์จริง
  if (imageUrl) {
    const filePath = path.join(
      process.cwd(),
      "uploads",
      imageUrl.replace("/uploads/", "")
    );

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  // 3. update DB
  await db.query(
    "UPDATE varieties SET image_url = NULL WHERE id = ?",
    [id]
  );

  return reply.send({ message: "Image deleted" });
};


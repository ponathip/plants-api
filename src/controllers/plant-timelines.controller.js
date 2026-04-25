import { db } from "../config/db.js";
import { createPlantTimelineLog } from "../services/plantTimeline.service.js";
import { writeAudit } from '../services/audit.service.js';

export async function createPlantTimeline(req, reply) {
  try {
    const body = req.body || {}

    if (!body.plant_id || !body.title || !body.event_date) {
      return reply.code(400).send({ message: "ข้อมูลไม่ครบ" })
    }

    const [plant_timelines] = await db.query(`
      INSERT INTO plant_timelines (
        plant_id,
        title,
        description,
        image_url,
        event_date
      ) VALUES (?, ?, ?, ?, ?)
    `, [
      body.plant_id,
      body.title,
      body.description || null,
      body.image_url || null,
      body.event_date
    ])

    const plantTimelinesId = plant_timelines.insertId;

    // อัปเดต last_update_at
    await db.query(`
      UPDATE plants
      SET last_update_at = NOW()
      WHERE id = ?
    `, [body.plant_id])

    await writeAudit({
      gardenId,
      userId,
      action: 'create',
      entity: 'plant_timelines',
      entityId: plantTimelinesId,
      newData: body,
    });


    return reply.send({ success: true, message: "เพิ่มไม่สำเร็จ" })

  } catch (err) {
    console.error(err)
    return reply.code(500).send({ message: "เพิ่มไม่สำเร็จ" })
  }
}

export async function getPublicVariety(req, reply) {
  try {
    const { token } = req.params;

    const [[row]] = await db.query(
      `
      SELECT
        pv.id,
        pv.name,
        pv.short_name,
        pv.public_title,
        pv.subtitle,
        pv.highlight_text,
        pv.sunlight,
        pv.watering,
        pv.planting_method,
        pv.care_method,
        pv.tips,
        pv.public_note,
        pv.cover_image_url,
        pv.gallery_json,
        ps.name AS species_name
      FROM plant_varieties pv
      LEFT JOIN plant_species ps ON ps.id = pv.plant_species_id
      WHERE pv.public_qr_token = ?
        AND pv.is_public = 1
      LIMIT 1
      `,
      [token]
    );

    if (!row) {
      return reply.code(404).send({ message: "ไม่พบข้อมูล" });
    }

    row.gallery = row.gallery_json ? JSON.parse(row.gallery_json) : [];

    return reply.send(row);
  } catch (err) {
    console.error(err);
    return reply.code(500).send({ message: "โหลดข้อมูลไม่สำเร็จ" });
  }
}

export async function deletePlantTimelineImage(req, reply) {
  try {
    const id = Number(req.params.id);

    const [[timeline]] = await db.query(
      `
      SELECT id, image_url, image_public_id
      FROM plant_timelines
      WHERE id = ?
        AND deleted_at IS NULL
      LIMIT 1
      `,
      [id]
    );

    if (!timeline) {
      return reply.code(404).send({ message: "ไม่พบ timeline" });
    }

    if (timeline.image_public_id) {
      await cloudinary.uploader.destroy(timeline.image_public_id);
    }

    await db.query(
      `
      UPDATE plant_timelines
      SET image_url = NULL,
          image_public_id = NULL,
          updated_at = NOW()
      WHERE id = ?
      `,
      [id]
    );

    return reply.send({ success: true, message: "ลบรูปสำเร็จ" });
  } catch (err) {
    console.error("deletePlantTimelineImage error:", err);
    return reply.code(500).send({ message: "ลบรูปไม่สำเร็จ" });
  }
}

export async function deletePlantTimeline(req, reply) {
  try {
    const id = Number(req.params.id);

    const [[timeline]] = await db.query(
      `
      SELECT id, plant_id, image_public_id
      FROM plant_timelines
      WHERE id = ?
        AND deleted_at IS NULL
      LIMIT 1
      `,
      [id]
    );

    if (!timeline) {
      return reply.code(404).send({ message: "ไม่พบ timeline" });
    }

    if (timeline.image_public_id) {
      await cloudinary.uploader.destroy(timeline.image_public_id);
    }

    await db.query(
      `
      UPDATE plant_timelines
      SET deleted_at = NOW(),
          updated_at = NOW()
      WHERE id = ?
      `,
      [id]
    );

    await db.query(
      `
      UPDATE plants
      SET last_update_at = NOW()
      WHERE id = ?
      `,
      [timeline.plant_id]
    );

    return reply.send({ success: true, message: "ลบ timeline สำเร็จ" });
  } catch (err) {
    console.error("deletePlantTimeline error:", err);
    return reply.code(500).send({ message: "ลบ timeline ไม่สำเร็จ" });
  }
}

export async function getPlantTimeline(req, reply) {
  try {
    console.log(req.gardenContext);
    const { id } = req.params;
    const { gardenId, isSuper, scope } = req.gardenContext;
  
    let sqlPlant = `
      SELECT id, garden_id
      FROM plants
      WHERE id = ?
        AND deleted_at IS NULL
    `;
    const plantParams = [id];

    if (!(isSuper && scope === "all")) {
      sqlPlant += ` AND garden_id = ?`;
      plantParams.push(gardenId);
    }

    sqlPlant += ` LIMIT 1`;

    const [[plant]] = await db.query(sqlPlant, plantParams);
  
    
    if (!plant) {
      return reply.code(404).send({ message: "ไม่พบต้นพืช" });
    }

    const [rows] = await db.query(
      `
      SELECT
        id,
        plant_id,
        garden_id,
        event_type,
        event_date,
        title,
        description,
        old_status,
        new_status,
        old_zone_name,
        new_zone_name,
        old_location_name,
        new_location_name,
        height_cm,
        trunk_diameter_mm,
        pot_size_inch,
        age_value,
        age_unit,
        image_url,
        created_by,
        created_at
      FROM plant_timelines
      WHERE plant_id = ?
        AND garden_id = ?
      ORDER BY event_date DESC, id DESC
      `,
      [id, plant.garden_id]
    );

    return reply.send({
      data: rows,
    });
  } catch (error) {
    console.error("getPlantTimeline error:", error);
    return reply.code(500).send({ message: "โหลด timeline ไม่สำเร็จ" });
  }
}

export async function createPlantTimelineNote(req, reply) {
  try {
    const { id } = req.params;
    const { gardenId, isSuper, scope } = req.gardenContext;
    const userId = req.user?.userId || req.user?.id || null;
    const { title, description, event_date, image_url, image_public_id } = req.body || {};

    if (!title || !String(title).trim()) {
      return reply.code(400).send({ message: "กรุณากรอกหัวข้อ" });
    }

    let sqlPlant = `
      SELECT id, garden_id
      FROM plants
      WHERE id = ?
        AND deleted_at IS NULL
    `;
    const plantParams = [id];

    if (!(isSuper && scope === "all")) {
      sqlPlant += ` AND garden_id = ?`;
      plantParams.push(gardenId);
    }

    sqlPlant += ` LIMIT 1`;

    const [[plant]] = await db.query(sqlPlant, plantParams);

    if (!plant) {
      return reply.code(404).send({ message: "ไม่พบต้นพืช" });
    }

    const plantTimelinesId = await createPlantTimelineLog({
      plantId: Number(id),
      gardenId: Number(plant.garden_id),
      eventType: "note",
      eventDate: event_date || null,
      title: String(title).trim(),
      description: description || null,
      createdBy: userId,
      imageUrl: image_url || null,
      imagePublicId: image_public_id|| null,
    });

    await writeAudit({
      gardenId: Number(plant.garden_id),
      userId,
      action: "create",
      entity: "plant_timelines",
      entityId: plantTimelinesId,
      newData: {
        plant_id: Number(id),
        event_type: "note",
        title: String(title).trim(),
        description: description || null,
        event_date: event_date || null,
        image_url: image_url || null,
        image_public_id: image_public_id || null,
      },
    });

    return reply.send({
      success: true,
      message: "เพิ่มบันทึกสำเร็จ",
    });
  } catch (error) {
    console.error("createPlantTimelineNote error:", error);
    return reply.code(500).send({ message: "เพิ่มบันทึกไม่สำเร็จ" });
  }
}
import { db } from "../config/db.js";

export async function removeScion(req, reply) {
  const graftId = Number(req.params.id);
  const userId = req.user?.userId || req.user?.id || null;
  const { reason, removed_at } = req.body || {};

  if (!graftId) {
    return reply.code(400).send({ message: "ไม่พบ graft id" });
  }

  try {
    const [[graft]] = await db.query(
      `
      SELECT pg.*, pv.name AS variety_name
      FROM plant_grafts pg
      LEFT JOIN plant_varieties pv ON pv.id = pg.graft_variety_id
      WHERE pg.id = ?
      LIMIT 1
      `,
      [graftId]
    );

    if (!graft) {
      return reply.code(404).send({ message: "ไม่พบยอด" });
    }

    await db.query(
      `
      UPDATE plant_grafts
      SET status = 'removed',
          removed_at = ?,
          removed_reason = ?,
          updated_at = NOW()
      WHERE id = ?
      `,
      [removed_at || new Date(), reason || "Scion removed", graftId]
    );

    await db.query(
      `
      INSERT INTO plant_timelines (
        plant_id,
        garden_id,
        event_type,
        event_date,
        title,
        description,
        created_by,
        created_at
      ) VALUES (?, ?, 'grafted', NOW(), ?, ?, ?, NOW())
      `,
      [
        graft.plant_id,
        graft.garden_id,
        "ถอดยอด / ยอดเสียหาย",
        `ถอดยอด ${graft.variety_name || "-"}${
          reason ? `\nเหตุผล: ${reason}` : ""
        }`,
        userId,
      ]
    );

    return reply.send({ success: true, message: "ถอดยอดสำเร็จ" });
  } catch (err) {
    console.error("removeScion error:", err);
    return reply.code(500).send({ message: "ถอดยอดไม่สำเร็จ" });
  }
}
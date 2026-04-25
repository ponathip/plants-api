import { db } from "../config/db.js";

export async function writeAudit({
  userId,
  gardenId,
  action,
  entity,
  entityId,
  oldData = null,
  newData = null,
  req = null
}) {
  const [result] = await db.query(
    `INSERT INTO audit_logs
     (user_id, garden_id, action, entity, entity_id, old_data, new_data, ip_address, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      userId,
      gardenId,
      action,
      entity,
      entityId,
      oldData ? JSON.stringify(oldData) : null,
      newData ? JSON.stringify(newData) : null,
      req?.ip || null,
      req?.headers['user-agent'] || null
    ]
  );

  return {
    id: result.insertId,
  };
}

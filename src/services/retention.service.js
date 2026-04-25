export async function getRetentionDays(db, entity, gardenId = null) {
  // override per garden
  if (gardenId) {
    const [[custom]] = await db.query(
      `SELECT retention_days
       FROM retention_policies
       WHERE entity = ? AND garden_id = ?
       LIMIT 1`,
      [entity, gardenId]
    );
    if (custom) return custom.retention_days;
  }

  // default
  const [[policy]] = await db.query(
    `SELECT retention_days
     FROM retention_policies
     WHERE entity = ? AND is_default = true
     LIMIT 1`,
    [entity]
  );

  return policy?.retention_days;
}

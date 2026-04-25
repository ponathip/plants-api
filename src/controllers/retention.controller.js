export async function updateRetention(req, reply) {
  const { entity } = req.params;
  const { days, garden_id } = req.body;

  await req.db.query(
    `
    INSERT INTO retention_policies (entity, retention_days, garden_id, is_default)
    VALUES (?, ?, ?, false)
    `,
    [entity, days, garden_id || null]
  );

  reply.send({ success: true });
}

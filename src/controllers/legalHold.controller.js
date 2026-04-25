export async function createLegalHold(req, reply) {
  const { entity, entity_id, reason } = req.body;

  await req.db.query(
    `
    INSERT INTO legal_holds
      (entity, entity_id, reason, created_by)
    VALUES (?, ?, ?, ?)
    `,
    [entity, entity_id, reason, req.user.id]
  );

  await logAudit(req.db, {
    action: 'legal_hold',
    entity,
    entity_id,
    user_id: req.user.id
  });

  reply.send({ success: true });
}

export async function releaseLegalHold(req, reply) {
  await req.db.query(
    `
    UPDATE legal_holds
    SET released_at = NOW()
    WHERE id = ?
    `,
    [req.params.id]
  );

  reply.send({ success: true });
}

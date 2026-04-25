export async function retryRestoreJob(req, reply) {
  const jobId = req.params.id;
  const userId = req.user.id;

  const [[job]] = await req.db.query(
    `SELECT * FROM restore_jobs
     WHERE id = ? AND created_by = ?`,
    [jobId, userId]
  );

  if (!job) {
    return reply.code(404).send({ message: 'Job not found' });
  }

  if (job.status !== 'failed') {
    return reply.code(400).send({
      message: 'Only failed jobs can be retried'
    });
  }

  await req.db.query(
    `UPDATE restore_jobs
     SET status = 'pending',
         progress = 0,
         error = NULL,
         retry_count = retry_count + 1
     WHERE id = ?`,
    [jobId]
  );

  // audit
  await req.db.query(
    `INSERT INTO audit_logs
     (action, entity, entity_id, user_id)
     VALUES ('restore_retry', 'restore_job', ?, ?)`,
    [jobId, userId]
  );

  reply.send({
    message: 'Retry queued',
    jobId
  });
}
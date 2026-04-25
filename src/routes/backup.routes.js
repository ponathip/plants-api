app.get(
  '/gardens/:id/backup',
  {
    preHandler: [
      app.authGuard,
      app.gardenGuard(['owner', 'admin']),
      app.permissionGuard(['garden.backup'])
    ]
  },
  controller.downloadGardenBackup
);

app.post(
  '/backups/preview',
  {
    preHandler: [
      app.authGuard,
      app.permissionGuard(['garden.restore'])
    ]
  },
  controller.previewBackup
);

app.post(
  '/backups/restore',
  {
    preHandler: [
      app.authGuard,
      app.permissionGuard(['garden.restore'])
    ]
  },
  controller.restoreBackup
);

export async function getRestoreJob(req, reply) {
  const [[job]] = await req.db.query(
    `SELECT id, status, progress, error
     FROM restore_jobs
     WHERE id = ?`,
    [req.params.id]
  );

  if (!job) return reply.code(404).send({ message: 'Job not found' });

  reply.send(job);
}

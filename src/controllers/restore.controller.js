export async function restoreFromBackup(req, reply) {
  const backupId = req.params.id;

  const [[backup]] = await req.db.query(
    `SELECT * FROM backups WHERE id = ?`,
    [backupId]
  );

  const json = await loadBackupFile(backup);
  const data = JSON.parse(json);

  await req.db.query(
    `INSERT INTO gardens SET ?`,
    data.garden
  );

  for (const plant of data.plants) {
    await req.db.query(`INSERT INTO plants SET ?`, plant);
  }

  reply.send({ restored: true });
}
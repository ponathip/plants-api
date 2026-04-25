export async function getRecycleBin(req, reply) {
  const user = req.user;
  const { page = 1, limit = 20, type } = req.query;
  const offset = (page - 1) * limit;

  const data = [];

  /* ---------- gardens ---------- */
  if (!type || type === 'garden') {
    let sql = `
      SELECT 
        'garden' AS type,
        g.id,
        g.name,
        g.deleted_at,
        u.name AS deleted_by,
        g.owner_id AS owner_id
      FROM gardens g
      LEFT JOIN users u ON u.id = g.deleted_by
      WHERE g.deleted_at IS NOT NULL
    `;
    const params = [];

    if (user.role !== 'super') {
      sql += ` AND g.owner_id = ?`;
      params.push(user.id);
    }

    sql += ` ORDER BY g.deleted_at DESC LIMIT ? OFFSET ?`;
    params.push(Number(limit), Number(offset));

    const [rows] = await req.db.query(sql, params);
    data.push(...rows);
  }

  /* ---------- plants ---------- */
  if (!type || type === 'plant') {
    let sql = `
      SELECT
        'plant' AS type,
        p.id,
        p.name,
        p.deleted_at,
        u.name AS deleted_by,
        p.garden_id,
        g.name AS garden_name,
        g.owner_id
      FROM plants p
      JOIN gardens g ON g.id = p.garden_id
      LEFT JOIN users u ON u.id = p.deleted_by
      WHERE p.deleted_at IS NOT NULL
    `;
    const params = [];

    if (user.role !== 'super') {
      sql += ` AND g.owner_id = ?`;
      params.push(user.id);
    }

    sql += ` ORDER BY p.deleted_at DESC LIMIT ? OFFSET ?`;
    params.push(Number(limit), Number(offset));

    const [rows] = await req.db.query(sql, params);
    data.push(...rows);
  }

  reply.send({
    page: Number(page),
    limit: Number(limit),
    data
  });
}

export async function getDeletedGardens(req, reply) {
  const [rows] = await req.db.query(
    `SELECT * FROM gardens WHERE deleted_at IS NOT NULL`
  );
  reply.send(rows);
}

export async function restoreGarden(req, reply) {
  const id = req.params.id;

  await req.db.query(
    `UPDATE gardens
     SET deleted_at=NULL, deleted_by=NULL
     WHERE id=?`,
    [id]
  );

  await req.db.query(
    `UPDATE plants
     SET deleted_at=NULL, deleted_by=NULL
     WHERE garden_id=?`,
    [id]
  );

  reply.send({ restored: true });
}

export async function getRecycleSummary(req, reply) {
  const userId = req.user.id;
  const role = req.user.role;

  let gardenWhere = '';
  let params = [];

  // 🧠 Multi-tenant: owner เห็นเฉพาะสวนตัวเอง
  if (role === 'owner') {
    gardenWhere = 'AND owner_id = ?';
    params.push(userId);
  }

  const [[gardenCount]] = await req.db.query(
    `
    SELECT COUNT(*) AS total
    FROM gardens
    WHERE deleted_at IS NOT NULL
    ${gardenWhere}
    `,
    params
  );

  const [[plantCount]] = await req.db.query(
    `
    SELECT COUNT(*) AS total
    FROM plants
    WHERE deleted_at IS NOT NULL
      AND garden_id IN (
        SELECT id FROM gardens WHERE deleted_at IS NOT NULL ${gardenWhere}
      )
    `,
    params
  );

  reply.send({
    gardens: gardenCount.total,
    plants: plantCount.total,
    canRestore: ['owner', 'admin'].includes(role)
  });
}
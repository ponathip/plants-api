export function permissionGuard(perms = []) {
  return async function (req, reply) {
    const userId = req.user.userId
    const gardenId = req.params.gardenId

    // 🔥 ดึง role จาก garden_members
    const [[member]] = await req.db.query(
      `SELECT role
       FROM garden_members
       WHERE user_id = ? AND garden_id = ?`,
      [userId, gardenId]
    )

    if (!member) {
      return reply.code(403).send({ message: 'Not a member' })
    }

    const role = member.role

    // 🔥 ดึง permission ของ role
    const [rows] = await req.db.query(
      `SELECT p.code
       FROM role_permissions rp
       JOIN permissions p ON p.id = rp.permission_id
       WHERE rp.role = ?`,
      [role]
    )

    const allowed = rows.map(r => r.code)

    const ok = perms.every(p => allowed.includes(p))

    if (!ok) {
      return reply.code(403).send({ message: 'Permission denied' })
    }
  }
}

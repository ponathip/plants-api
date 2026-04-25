export function roleGuard(allowedRoles = []) {
  return async (req, reply) => {
    const userId = req.user.sub;

    const [rows] = await req.db.query(
      `
      SELECT r.name
      FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = ?
      `,
      [userId]
    );

    const userRoles = rows.map(r => r.name);

    const ok = userRoles.some(r => allowedRoles.includes(r));
    if (!ok) {
      return reply.code(403).send({ message: 'Forbidden (role)' });
    }

    req.user.roles = userRoles;
  };
}

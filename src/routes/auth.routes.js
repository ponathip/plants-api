import { loginHandler, refreshHandler, logoutHandler, logoutAllHandler } from '../controllers/auth.controller.js';
import { authGuard } from '../middlewares/auth.guard.js';
import { db } from "../config/db.js";

export default async function authRoutes(app) {
  app.post('/login', loginHandler);
  app.post('/refresh', 
    { preHandler: authGuard },
    refreshHandler);
  app.post('/logout', logoutHandler);
  app.post(
    '/logout-all',
    { preHandler: authGuard },
    logoutAllHandler
  );

  app.get("/me", {
    preHandler: [app.authenticate]
  }, async (req, reply) => {
    const userId = req.user.userId
    const role = req.user.role

    let permissions = []

    if (role === "super") {
      permissions = ["*"]
    } else {
      const [rows] = await db.query(
        `
        SELECT p.code
        FROM garden_members gm
        JOIN roles r ON r.name = gm.role
        JOIN role_permissions rp ON rp.role_id = r.id
        JOIN permissions p ON p.id = rp.permission_id
        WHERE gm.user_id = ?
        `,
        [userId]
      )

      permissions = rows.map((r) => r.code)
    }

    return reply.send({
      userId,
      role,
      permissions
    })
  })
}

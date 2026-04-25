import {
  listGarden,
  getGarden,
  updateGarden,
  getGardenAuditLogs,
  deleteGarden,
  restoreGarden,
  restoreGardenWithPlants,
  getDeletedGardens,
  forceDeleteGarden,
  getOverview,
  getAudits,
  getDashboardStats
} from '../controllers/garden.controller.js'

export default async function gardenRoutes(app) {
  app.get(
    '/',
    {
    preHandler: [
        app.authenticate,
        app.gardenGuard({ allowSuperWithoutGarden: true, requireGarden: false }),
    ]
    },listGarden
  )

  app.get(
    '/plants/overview',
    {
      preHandler: [
        app.authenticate,
        app.gardenGuard(['owner', 'admin', 'staff'])
      ]
    },
    getOverview
  )

  app.get(
    '/:gardenId/dashboard/stats',
    {
      preHandler: [
        app.authenticate,
        app.gardenGuard(['owner', 'admin', 'staff'])
      ]
    },
    getDashboardStats
  )

  app.get(
    '/plants/audits',
    {
      preHandler: [
        app.authenticate,
        app.gardenGuard(['owner', 'admin', 'staff'])
      ]
    },
    getAudits
  )

  /* ---------- CREATE GARDEN ---------- */
  app.post(
    '/',
    {
      schema: {
        tags: ['Garden'],
        summary: 'Create garden',
        body: {
          type: 'object',
          required: ['name'],
          properties: {
            name: { type: 'string' }
          }
        },
        response: {
          201: {
            type: 'object',
            properties: {
              id: { type: 'number' },
              name: { type: 'string' }
            }
          }
        }
      }
    },
    async (req, reply) => {
      reply.code(201)
      return { id: 2, name: req.body.name }
    }
  )

  /* 👀 ดูข้อมูลสวน */
  app.get(
    '/:id',
    {
      preHandler: [
        app.authenticate,
        // app.gardenGuard(['owner', 'admin'])
      ]
    },
    getGarden
  )

  /* ✏️ แก้ไขสวน */
  app.put(
    '/:id',
    {
      preHandler: [
        app.authenticate,
        // app.gardenGuard(['owner', 'admin']),
        // app.permissionGuard(['garden.manage'])
      ]
    },
    updateGarden
  )

  /* 📜 Audit Log */
  app.get(
    '/:id/audit-logs',
    {
      preHandler: [
        app.authenticate,
        // app.gardenGuard(['owner', 'admin'])
      ]
    },
    getGardenAuditLogs
  )

  /* 🗑️ Soft delete */
  app.delete(
    '/:id',
    {
      preHandler: [
        app.authenticate,
        // app.gardenGuard(['owner']),
        // app.permissionGuard(['garden.delete'])
      ]
    },
    deleteGarden
  )

  /* ♻️ Restore garden */
  app.post(
    '/:id/restore',
    {
      preHandler: [
        app.authenticate,
        // app.gardenGuard(['owner']),
        // app.permissionGuard(['garden.restore'])
      ]
    },
    restoreGarden
  )

  /* ♻️ Restore garden + plants */
  app.post(
    '/:id/restore-all',
    {
      preHandler: [
        app.authenticate,
        // app.gardenGuard(['owner']),
        // app.permissionGuard(['garden.restore'])
      ]
    },
    restoreGardenWithPlants
  )

  /* 🧺 Trash view */
  app.get(
    '/trash',
    {
      preHandler: [
        app.authenticate,
        // app.permissionGuard(['garden.viewTrash'])
      ]
    },
    getDeletedGardens
  )

  /* 💀 Permanent delete */
  app.delete(
    '/:id/force',
    {
      preHandler: [
        app.authenticate,
        // app.gardenGuard(['owner']),
        // app.permissionGuard(['garden.deletePermanent', 'garden.force']),
        // app.legalHoldGuard('garden')
      ]
    },
    forceDeleteGarden
  )

  app.get('/:gardenId/me/permissions', {
    preHandler: [app.authenticate]
  }, async (req, reply) => {
    const userId = req.user.userId
    const gardenId = req.params.gardenId

    // 🔥 👇 super bypass
    if (req.user.role === 'super') {
      const [all] = await req.db.query(`SELECT code FROM permissions`)
      return reply.send(all.map(p => p.code))
    }

    const [rows] = await req.db.query(
      `SELECT p.code
      FROM garden_members gm
      JOIN roles r ON gm.role = r.name
      JOIN role_permissions rp ON rp.role_id = r.id
      JOIN permissions p ON p.id = rp.permission_id
      WHERE gm.user_id = ? AND gm.garden_id = ?`,
      [userId, gardenId]
    )

    reply.send(rows.map(r => r.code))
  })
}

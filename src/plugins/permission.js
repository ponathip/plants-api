import fp from 'fastify-plugin'

async function permissionGuardPlugin(app) {
  app.decorate('permissionGuard', (permissions = []) => {
    return async function (req, reply) {
    const user = req.user

    if (!user) {
      return reply.code(401).send({ message: "Unauthorized" })
    }

    if (user.role === "super") {
      return
    }

    const userPermissions = user.permissions || []

    const hasPermission = requiredPermissions.some((perm) =>
      userPermissions.includes(perm)
    )

    if (!hasPermission) {
      return reply.code(403).send({ message: "ไม่มีสิทธิ์ใช้งาน" })
    }
  }
  })
}

export default fp(permissionGuardPlugin)

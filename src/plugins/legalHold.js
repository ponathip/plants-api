import fp from 'fastify-plugin'

async function legalHoldGuardPlugin(app) {
  app.decorate('legalHoldGuard', (entity) => {
    return async function legalHoldHandler(req, reply) {
      // legal hold logic
    }
  })
}

export default fp(legalHoldGuardPlugin)
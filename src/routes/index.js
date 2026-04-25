import { authRoutes } from './auth.routes.js'

export async function routes(app) {
  app.register(authRoutes, { prefix: '/auth' })
}

import { buildApp } from './app.js'
import swagger from '@fastify/swagger'
import swaggerUI from '@fastify/swagger-ui'

import authRoutes from './routes/auth.routes.js'
import gardenRoutes from './routes/garden.routes.js'
import plantRoutes from './routes/plant.routes.js'
import varietiesRoutes from "./routes/varieties.routes.js";
import plantSpeciesRoutes from './routes/plant-species.routes.js'
import memberRoutes from './routes/member.routes.js'
import inviteRoutes from './routes/invite.routes.js'
import purchaseRoutes from "./routes/purchase.routes.js"
import plantVarietyRoutes from './routes/plant-variety.routes.js'
import saleRoutes from "./routes/sale.routes.js";
import dashboardRoutes from "./routes/dashboard.routes.js"
import purchaseItemsRoutes from "./routes/purchase-items.routes.js"
import suppliersRoutes from "./routes/suppliers.routes.js"
import expenseRoutes from "./routes/expenses.routes.js"
import plantTimelinesRoutes from "./routes/plant-timelines.routes.js"
import auditRoutes from "./routes/audit.routes.js";
import plantGraftRoutes from "./routes/plantGraft.routes.js";
import graftsRoutes from "./routes/graft.routes.js";

// import swaggerTestRoutes from './routes/__swagger_test.routes.js'

const start = async () => {
  const app = await buildApp()

  // ✅ 1. Swagger มาก่อน
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'Plants API',
        version: '1.0.0'
      }
    },
    exposeRoute: true
  })

  await app.register(swaggerUI, {
    routePrefix: '/docs'
  })

  // ✅ 2. routes ที่มี schema
  // await app.register(swaggerTestRoutes)
  await app.register(authRoutes, { prefix: '/auth' })
  await app.register(gardenRoutes, { prefix: '/gardens' })
  await app.register(plantRoutes, { prefix: '/plants' })
  await app.register(plantSpeciesRoutes, { prefix: '/species' })
  await app.register(memberRoutes, { prefix: '/members' })
  await app.register(inviteRoutes)
  await app.register(purchaseRoutes, { prefix: '/purchases'});
  await app.register(plantVarietyRoutes, { prefix: '/plant-varieties' })
  await app.register(saleRoutes, { prefix: "/sale" });
  await app.register(dashboardRoutes, { prefix: "/dashboard" });
  await app.register(purchaseItemsRoutes, {prefix: "/purchase-items"} )
  await app.register(suppliersRoutes, {prefix: "/suppliers"} )
  await app.register(expenseRoutes, {prefix: "/expenses"} )
  await app.register(plantTimelinesRoutes, {prefix: "/plant-timelines"} )
  await app.register(auditRoutes, { prefix: "/audit-logs" });
  await app.register(plantGraftRoutes);
  await app.register(graftsRoutes, { prefix: "/graft" });
  await varietiesRoutes(app);

  await app.listen({ port: Number(process.env.PORT || 3001),
  host: "0.0.0.0", })
  console.log('🚀 http://localhost:3001/docs')
}

start()

import authDoc from './auth.doc.js'
import gardenDoc from './garden.doc.js'
import plantDoc from './plant.doc.js'
import auditDoc from './audit.doc.js'

export default {
//   openapi: {
    openapi: '3.0.0',
    info: {
      title: 'Garden Management API',
      description: 'Fastify + JWT + MySQL (No ORM)',
      version: '1.0.0'
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Local'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      }
    },
    security: [{ bearerAuth: [] }],
    tags: [
      { name: 'Auth' },
      { name: 'Garden' },
      { name: 'Plant' },
      { name: 'Audit' },
      { name: 'Recycle Bin' },
      { name: 'Dashboard' }
    ],
    paths: {
      ...authDoc,
      ...gardenDoc,
      ...plantDoc,
      ...auditDoc
    }
//   }
}

export default {
  '/plants': {
    post: {
      tags: ['Plant'],
      summary: 'Create plant',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                gardenId: { type: 'string' }
              }
            }
          }
        }
      },
      responses: {
        201: { description: 'Created' }
      }
    }
  }
}

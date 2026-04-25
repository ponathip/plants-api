export default {
  '/gardens/{id}': {
    get: {
      tags: ['Garden'],
      summary: 'Get garden',
      description: 'Roles: owner, admin, staff',
      parameters: [
        {
          name: 'id',
          in: 'path',
          required: true,
          schema: { type: 'integer' }
        }
      ],
      responses: {
        200: { description: 'Garden detail' }
      }
    },

    put: {
      tags: ['Garden'],
      summary: 'Update garden',
      description: 'Roles: owner, admin | Permission: garden.manage',
      parameters: [
        {
          name: 'id',
          in: 'path',
          required: true,
          schema: { type: 'integer' }
        }
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                name: { type: 'string' }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Updated' }
      }
    }
  }
}

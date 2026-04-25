export default {
  '/gardens/{id}/audit-logs': {
    get: {
      tags: ['Audit'],
      summary: 'Get audit logs of a garden',
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          name: 'id',
          in: 'path',
          required: true,
          schema: { type: 'integer' }
        }
      ],
      responses: {
        200: {
          description: 'Audit logs',
          content: {
            'application/json': {
              schema: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'integer' },
                    action: { type: 'string' },
                    entity: { type: 'string' },
                    entity_id: { type: 'integer' },
                    user_id: { type: 'integer' },
                    garden_id: { type: 'integer' },
                    created_at: { type: 'string', format: 'date-time' }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}

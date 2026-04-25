export default {
  '/auth/login': {
    post: {
      tags: ['Auth'],
      summary: 'Login',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                username: { type: 'string', example: 'admin@mail.com' },
                password: { type: 'string', example: '123456' }
              }
            }
          }
        }
      },
      // requestBody: {
      //   required: true,
      //   content: {
      //     'application/json': {
      //       schema: {
      //         type: 'object',
      //         required: ['email', 'password'],
      //         properties: {
      //           email: { type: 'string', example: 'admin@mail.com' },
      //           password: { type: 'string', example: '123456' }
      //         }
      //       }
      //     }
      //   }
      // },
      responses: {
        200: {
          description: 'Login success',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  accessToken: { type: 'string' },
                  refreshToken: { type: 'string' }
                }
              }
            }
          }
        }
      }
    }
  },

  '/auth/refresh': {
    post: {
      tags: ['Auth'],
      summary: 'Refresh token',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['refreshToken'],
              properties: {
                refreshToken: { type: 'string' }
              }
            }
          }
        }
      },
      responses: {
        200: {
          description: 'New access token'
        }
      }
    }
  }
}

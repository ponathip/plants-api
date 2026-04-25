import {
acceptInvite
} from '../controllers/invite.controller.js'

export default async function inviteRoutes(app) {
  app.post(
    '/accept-invite',
    {
      preHandler: [app.authenticate] // ต้อง login ก่อน
    },
    acceptInvite
  )
}
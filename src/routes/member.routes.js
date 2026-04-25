import {
  getMembers,
  inviteUser,
  createMember,
  updateMemberRole,
  updateMemberProfile,
  removeMember,
  acceptInvite,
} from "../controllers/member.controller.js";

export default async function memberRoutes(app) {
  app.get(
    "/",
    {
      preHandler: [
        app.authenticate,
        app.gardenGuard({ allowSuperWithoutGarden: true, requireGarden: false }),
      ],
    },
    getMembers
  );

  app.post(
    "/invite",
    {
      preHandler: [
        app.authenticate,
        app.gardenGuard({ allowSuperWithoutGarden: false, requireGarden: true }),
      ],
    },
    inviteUser
  );

  app.post(
    "/create",
    {
      preHandler: [
        app.authenticate,
        app.gardenGuard({ allowSuperWithoutGarden: false, requireGarden: true }),
      ],
    },
    createMember
  );

  app.patch(
    "/:userId",
    {
      preHandler: [
        app.authenticate,
        app.gardenGuard({ allowSuperWithoutGarden: false, requireGarden: true }),
      ],
    },
    updateMemberRole
  );

  app.put(
    "/:userId/profile",
    {
      preHandler: [
        app.authenticate,
        app.gardenGuard({ allowSuperWithoutGarden: false, requireGarden: true }),
      ],
    },
    updateMemberProfile
  );

  app.delete(
    "/:userId",
    {
      preHandler: [
        app.authenticate,
        app.gardenGuard({ allowSuperWithoutGarden: false, requireGarden: true }),
      ],
    },
    removeMember
  );

  app.post(
    "/accept-invite",
    {
      preHandler: [app.authenticate],
    },
    acceptInvite
  );
}
import {
  removeScion,
} from "../controllers/grafts.controller.js";

export default async function graftsRoutes(app) {
  app.post(
    "/:id/remove-scion",
    {
        preHandler: [
        app.authenticate,
        app.gardenGuard({ allowSuperWithoutGarden: true, requireGarden: false }),
        app.permissionGuard(["plant_graft.update", "plant_graft.manage"]),
        ],
    },
    removeScion
    );

}
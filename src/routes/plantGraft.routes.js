import {
  listPlantGrafts,
  createPlantGraft,
  updatePlantGraft,
  deletePlantGraft,
} from "../controllers/plantGraft.controller.js";

export default async function plantGraftRoutes(app) {
  app.get(
    "/plants/:plantId/grafts",
    {
      preHandler: [
        app.authenticate,
        app.gardenGuard({ allowSuperWithoutGarden: true, requireGarden: false }),
      ],
    },
    listPlantGrafts
  );

  app.post(
    "/plants/:plantId/grafts",
    {
      preHandler: [
        app.authenticate,
        app.gardenGuard({ allowSuperWithoutGarden: true, requireGarden: false }),
        app.permissionGuard(["plant.update"]),
      ],
    },
    createPlantGraft
  );

  app.put(
    "/plant-grafts/:id",
    {
      preHandler: [
        app.authenticate,
        app.gardenGuard({ allowSuperWithoutGarden: true, requireGarden: false }),
        app.permissionGuard(["plant.update"]),
      ],
    },
    updatePlantGraft
  );

  app.delete(
    "/plant-grafts/:id",
    {
      preHandler: [
        app.authenticate,
        app.gardenGuard({ allowSuperWithoutGarden: true, requireGarden: false }),
        app.permissionGuard(["plant.update"]),
      ],
    },
    deletePlantGraft
  );
}
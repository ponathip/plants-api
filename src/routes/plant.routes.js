import {
  exportPlants,
  createPlant,
  deletePlant,
  restorePlant,
  getDeletedPlants,
  forceDeletePlant,
  listPlants,
  detailPlants,
  updatePlant,
  getPlantByQrToken,
  updatePlantStatusByQr,
} from "../controllers/plant.controller.js";

export default async function plantRoutes(app) {
  app.get(
    "/export",
    {
      preHandler: [
        app.authenticate,
        app.gardenGuard({ allowSuperWithoutGarden: true, requireGarden: false }),
      ],
    },
    exportPlants
  );
  app.get(
    "/",
    {
      preHandler: [
        app.authenticate,
        app.gardenGuard({ allowSuperWithoutGarden: true, requireGarden: false }),
      ],
    },
    listPlants
  );

  app.get(
    "/:id",
    {
      preHandler: [
        app.authenticate,
        app.gardenGuard({ allowSuperWithoutGarden: true, requireGarden: false }),
      ],
    },
    detailPlants
  );

  app.post(
    "/",
    {
      preHandler: [
        app.authenticate,
        app.gardenGuard({ allowSuperWithoutGarden: true, requireGarden: false }),
        app.permissionGuard(["plant.create"]),
      ],
    },
    createPlant
  );

  app.put(
    "/:id",
    {
      preHandler: [
        app.authenticate,
        app.gardenGuard({ allowSuperWithoutGarden: true, requireGarden: false }),
        app.permissionGuard(["plant.update"]),
      ],
    },
    updatePlant
  );

  app.delete(
    "/:id",
    {
      preHandler: [
        app.authenticate,
        app.gardenGuard({ allowSuperWithoutGarden: true, requireGarden: false }),
        app.permissionGuard(["plant.delete"]),
      ],
    },
    deletePlant
  );

  app.post(
    "/:id/restore",
    {
      preHandler: [
        app.authenticate,
        app.gardenGuard({ allowSuperWithoutGarden: false, requireGarden: true }),
        app.permissionGuard(["plant.restore"]),
      ],
    },
    restorePlant
  );

  app.get(
    "/trash",
    {
      preHandler: [
        app.authenticate,
        app.gardenGuard({ allowSuperWithoutGarden: false, requireGarden: true }),
        app.permissionGuard(["plant.viewTrash"]),
      ],
    },
    getDeletedPlants
  );

  app.delete(
    "/:id/force",
    {
      preHandler: [
        app.authenticate,
        app.gardenGuard({ allowSuperWithoutGarden: false, requireGarden: true }),
        app.permissionGuard(["plant.deletePermanent"]),
      ],
    },
    forceDeletePlant
  );

  app.get("/qr/:token", getPlantByQrToken);
  app.patch("/qr/:token/status", updatePlantStatusByQr);
}
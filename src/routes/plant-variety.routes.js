import {
  getVarietiesBySpecies,
  getVarieties,
  getPlantVarieties,
  createPlantVariety,
  updatePlantVariety,
  deletePlantVariety,
  deletePlantVarietyImageHandler,
  getPlantVarietyByQrToken,
} from "../controllers/plant-variety.controller.js";

export default async function plantSpeciesRoutes(app) {
  app.get(
    "/:speciesId/varieties",
    { preHandler: [app.authenticate] },
    getVarietiesBySpecies
  );

  app.get(
    "/",
    { preHandler: [app.authenticate] },
    getVarieties
  );

  app.get("/varieties-data", getPlantVarieties);

  app.post(
    "/",
    { preHandler: [app.authenticate] },
    createPlantVariety
  );

  app.put(
    "/:id",
    { preHandler: [app.authenticate] },
    updatePlantVariety
  );

  app.delete(
    "/:id",
    { preHandler: [app.authenticate] },
    deletePlantVariety
  );

  app.delete(
    "/:id/image",
    { preHandler: [app.authenticate] },
    deletePlantVarietyImageHandler
  );

  app.get("/qr/:token", getPlantVarietyByQrToken);
}
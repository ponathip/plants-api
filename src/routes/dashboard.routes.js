import {
  getProfitDashboard,
  getVarietyDashboard,
  getStockSummary,
  getStockByVariety,
} from "../controllers/dashboard.controller.js";

export default async function dashboardRoutes(app) {
  app.get(
    "/profit",
    {
      preHandler: [
        app.authenticate,
        app.gardenGuard({ allowSuperWithoutGarden: true, requireGarden: false }),
      ],
    },
    getProfitDashboard
  );

  app.get(
    "/by-variety",
    {
      preHandler: [
        app.authenticate,
        app.gardenGuard({ allowSuperWithoutGarden: true, requireGarden: false }),
      ],
    },
    getVarietyDashboard
  );

  app.get(
    "/stock-summary",
    {
      preHandler: [
        app.authenticate,
        app.gardenGuard({ allowSuperWithoutGarden: true, requireGarden: false }),
      ],
    },
    getStockSummary
  );

  app.get(
    "/stock-by-variety",
    {
      preHandler: [
        app.authenticate,
        app.gardenGuard({ allowSuperWithoutGarden: true, requireGarden: false }),
      ],
    },
    getStockByVariety
  );
}
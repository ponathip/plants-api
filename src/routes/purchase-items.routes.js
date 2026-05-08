import {
getPurchaseItems,
generatePlantsFromPurchaseItem
} from '../controllers/purchase-items.controller.js'

export default async function purchaseItemsRoutes(app) {
  app.get("/", {
    preHandler: [app.authenticate], // ถ้ามี auth
  }, getPurchaseItems)

  app.post(
    "/:id/generate-plants",
    {
      preHandler: [
        app.authenticate,
        app.gardenGuard({ allowSuperWithoutGarden: true, requireGarden: false }),
      ],
    },
    generatePlantsFromPurchaseItem
  );
}
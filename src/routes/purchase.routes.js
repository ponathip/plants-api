import {
  createPurchase,
  listPurchases,
  exportPurchases,
  getPurchaseDetail,
  updatePurchase,
  updatePurchaseItem,
  addPurchaseImages,
  getPurchasesImage,
  deletePurchase,
} from "../controllers/purchase.controller.js";

export default async function purchaseRoutes(app) {
  app.get(
    "/",
    {
      preHandler: [
        app.authenticate,
        app.gardenGuard({ allowSuperWithoutGarden: true, requireGarden: false }),
        app.permissionGuard(["purchase.view"]),
      ],
    },
    listPurchases
  );

  app.get(
    "/export",
    {
      preHandler: [
        app.authenticate,
        app.gardenGuard({ allowSuperWithoutGarden: true, requireGarden: false }),
      ],
    },
    exportPurchases
  );

  app.get(
    "/:id",
    {
      preHandler: [
        app.authenticate,
        app.gardenGuard({ allowSuperWithoutGarden: true, requireGarden: false }),
        app.permissionGuard(["purchase.view"]),
      ],
    },
    getPurchaseDetail
  );

  app.post(
    "/",
    {
      preHandler: [
        app.authenticate,
        app.gardenGuard({ allowSuperWithoutGarden: false, requireGarden: true }),
        app.permissionGuard(["purchase.create", "purchase.manage"]),
      ],
    },
    createPurchase
  );

  app.patch(
    "/:id",
    {
      preHandler: [
        app.authenticate,
        app.gardenGuard({ allowSuperWithoutGarden: true, requireGarden: false }),
        app.permissionGuard(["purchase.update", "purchase.manage"]),
      ],
    },
    updatePurchase
  );

  app.patch(
    "/:id/items/:itemId",
    {
      preHandler: [
        app.authenticate,
        app.gardenGuard({ allowSuperWithoutGarden: true, requireGarden: false }),
        app.permissionGuard(["purchase_item.update", "purchase.manage"]),
      ],
    },
    updatePurchaseItem
  );

  app.post(
    "/:id/images",
    {
      preHandler: [
        app.authenticate,
        app.gardenGuard({ allowSuperWithoutGarden: true, requireGarden: false }),
        app.permissionGuard(["purchase_image.create", "purchase.manage"]),
      ],
    },
    addPurchaseImages
  );

  app.get(
    "/:id/images",
    {
      preHandler: [
        app.authenticate,
        app.gardenGuard({ allowSuperWithoutGarden: true, requireGarden: false }),
        app.permissionGuard(["purchase.view"]),
      ],
    },
    getPurchasesImage
  );

  app.delete(
    "/:id",
    {
      preHandler: [
        app.authenticate,
        app.gardenGuard({ allowSuperWithoutGarden: true, requireGarden: false }),
        app.permissionGuard(["purchase.delete"]),
      ],
    },
    deletePurchase
  );
}
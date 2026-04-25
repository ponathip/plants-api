import {
  createSale,
  listSales,
  getSaleDetail,
  listAvailablePlants,
  updateSale,
  deleteSale,
  addSaleImages,
  deleteSaleImage,
  exportSales,
} from "../controllers/sale.controller.js";

export default async function saleRoutes(app) {
  app.get(
    "/sales",
    {
      preHandler: [
        app.authenticate,
        app.gardenGuard({ allowSuperWithoutGarden: true, requireGarden: false }),
        app.permissionGuard(["sale.view", "sale.manage"]),
      ],
    },
    listSales
  );

  app.get(
    "/sales/:id",
    {
      preHandler: [
        app.authenticate,
        app.gardenGuard({ allowSuperWithoutGarden: true, requireGarden: false }),
        app.permissionGuard(["sale.view", "sale.manage"]),
      ],
    },
    getSaleDetail
  );

  app.post(
    "/sales",
    {
      preHandler: [
        app.authenticate,
        app.gardenGuard({ allowSuperWithoutGarden: true, requireGarden: false }),
        app.permissionGuard(["sale.create", "sale.manage"]),
      ],
    },
    createSale
  );

  app.get(
    "/plants/available-for-sale",
    {
      preHandler: [
        app.authenticate,
        app.gardenGuard({ allowSuperWithoutGarden: true, requireGarden: false }),
        app.permissionGuard(["sale.create", "sale.update", "sale.manage"]),
      ],
    },
    listAvailablePlants
  );

  app.patch(
    "/sales/:id",
    {
      preHandler: [
        app.authenticate,
        app.gardenGuard({ allowSuperWithoutGarden: true, requireGarden: false }),
        app.permissionGuard(["sale.update", "sale.manage"]),
      ],
    },
    updateSale
  );

  app.delete(
    "/sales/:id",
    {
      preHandler: [
        app.authenticate,
        app.gardenGuard({ allowSuperWithoutGarden: true, requireGarden: false }),
        app.permissionGuard(["sale.delete", "sale.manage"]),
      ],
    },
    deleteSale
  );

  app.post(
    "/sales/:id/images",
    {
      preHandler: [
        app.authenticate,
        app.gardenGuard({ allowSuperWithoutGarden: true, requireGarden: false }),
        app.permissionGuard(["sale_image.create", "sale.manage"]),
      ],
    },
    addSaleImages
  );

  app.delete(
    "/sales/:id/images/:imageId",
    {
      preHandler: [
        app.authenticate,
        app.gardenGuard({ allowSuperWithoutGarden: false, requireGarden: true }),
        app.permissionGuard(["sale_image.delete", "sale.manage"]),
      ],
    },
    deleteSaleImage
  );
  app.get(
    "/export",
    {
      preHandler: [
        app.authenticate,
        app.gardenGuard({ allowSuperWithoutGarden: true, requireGarden: false }),
      ],
    },
    exportSales
  );
}
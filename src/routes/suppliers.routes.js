import {
  getSuppliers,
  listSuppliers,
  getSupplierById,
  createSupplier,
  updateSupplier,
  deleteSupplier,
} from "../controllers/suppliers.controller.js";

export default async function suppliersRoutes(app) {
  app.get(
    "/",
    {
      preHandler: [
        app.authenticate,
        app.gardenGuard({ allowSuperWithoutGarden: true, requireGarden: false }),
      ],
    },
    getSuppliers
  );

  app.get(
    "/suppliers",
    {
      preHandler: [
        app.authenticate,
        app.gardenGuard({ allowSuperWithoutGarden: true, requireGarden: false }),
      ],
    },
    listSuppliers
  );

  app.get(
    "/:id",
    {
      preHandler: [
        app.authenticate,
        app.gardenGuard({ allowSuperWithoutGarden: true, requireGarden: false }),
      ],
    },
    getSupplierById
  );

  app.post(
    "/",
    {
      preHandler: [
        app.authenticate,
        app.gardenGuard({ allowSuperWithoutGarden: false, requireGarden: true }),
      ],
    },
    createSupplier
  );

  app.put(
    "/:id",
    {
      preHandler: [
        app.authenticate,
        app.gardenGuard({ allowSuperWithoutGarden: false, requireGarden: true }),
      ],
    },
    updateSupplier
  );

  app.delete(
    "/:id",
    {
      preHandler: [
        app.authenticate,
        app.gardenGuard({ allowSuperWithoutGarden: true, requireGarden: false }),
      ],
    },
    deleteSupplier
  );
}
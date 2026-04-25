import {
  listExpenses,
  exportExpenses,
  createExpense,
  updateExpense,
  deleteExpense,
} from "../controllers/expenses.controller.js";

export default async function expenseRoutes(app) {
  app.get(
    "/",
    {
      preHandler: [
        app.authenticate,
        app.gardenGuard({ allowSuperWithoutGarden: true, requireGarden: false }),
      ],
    },
    listExpenses
  );

  app.get(
    "/export",
    {
      preHandler: [
        app.authenticate,
        app.gardenGuard({ allowSuperWithoutGarden: true, requireGarden: false }),
      ],
    },
    exportExpenses
  );

  app.post(
    "/",
    {
      preHandler: [
        app.authenticate,
        app.gardenGuard({ allowSuperWithoutGarden: false, requireGarden: true }),
      ],
    },
    createExpense
  );

  app.put(
    "/:id",
    {
      preHandler: [
        app.authenticate,
        app.gardenGuard({ allowSuperWithoutGarden: false, requireGarden: true }),
      ],
    },
    updateExpense
  );

  app.delete(
    "/:id",
    {
      preHandler: [
        app.authenticate,
        app.gardenGuard({ allowSuperWithoutGarden: true, requireGarden: false }),
      ],
    },
    deleteExpense
  );
}
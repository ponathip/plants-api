export default async function recycleRoutes(app) {
  app.get(
    '/recycle-bin',
    {
      preHandler: [
        app.authGuard,
        permissionGuard(['recycle.view'])
      ]
    },
    app.controllers.recycle.getRecycleBin
  );

   app.get(
    '/trash/gardens',
    {
        preHandler: [
        app.authGuard,
        app.permissionGuard(['garden.view'])
        ]
    },
    controller.getDeletedGardens
    );

    app.post(
    '/gardens/:id/restore',
    {
        preHandler: [
        app.authGuard,
        app.permissionGuard(['garden.restore'])
        ]
    },
    controller.restoreGarden
    );

    app.get(
    '/trash/summary',
    {
        preHandler: [
        app.authGuard,
        app.permissionGuard(['garden.view'])
        ]
    },
    controller.getRecycleSummary
    );
}

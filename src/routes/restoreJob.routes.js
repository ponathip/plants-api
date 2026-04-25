export default async function (app) {
  app.post(
    '/restore-jobs/:id/retry',
    {
      preHandler: [
        app.authGuard,
        app.roleGuard(['owner', 'admin'])
      ]
    },
    app.controllers.restoreJob.retryRestoreJob
  );
}
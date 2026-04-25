app.put(
  '/retention/:entity',
  {
    preHandler: [
      app.authGuard,
      permissionGuard(['retention.manage'])
    ]
  },
  controller.updateRetention
);
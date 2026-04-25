app.post(
  '/legal-holds',
  {
    preHandler: [
      app.authGuard,
      permissionGuard(['legal_hold.manage'])
    ]
  },
  controller.createLegalHold
);

app.post(
  '/legal-holds/:id/release',
  {
    preHandler: [
      app.authGuard,
      permissionGuard(['legal_hold.release'])
    ]
  },
  controller.releaseLegalHold
);
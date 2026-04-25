import {
  listAuditLogs,
  getAuditLogDetail,
  restoreAuditLog,
  bulkRestoreAuditLogs,
} from "../controllers/audit.controller.js";

export default async function auditRoutes(app) {
  app.get(
    "/",
    {
      preHandler: [app.authenticate],
    },
    listAuditLogs
  );

  app.get(
    "/:id",
    {
      preHandler: [app.authenticate],
    },
    getAuditLogDetail
  );

  app.post(
    "/:id/restore",
    {
      preHandler: [app.authenticate],
    },
    restoreAuditLog
  );

  app.post(
    "/bulk-restore",
    {
      preHandler: [app.authenticate],
    },
    bulkRestoreAuditLogs
  );
}
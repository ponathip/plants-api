import { authGuard } from "../middlewares/auth.guard.js";
import {
  getVarieties,
  createVariety,
  updateVariety,
  deleteVariety,
  deleteVarietyImageHandler,
} from "../controllers/varieties.controller.js";

export default async function varietiesRoutes(app) {
  app.get("/varieties", getVarieties);
  app.post("/varieties", createVariety);
  app.put("/varieties/:id", updateVariety);
  app.delete("/varieties/:id", deleteVariety);
  app.get(
  "/varieties/:id/image",
    { preHandler: authGuard },
    deleteVarietyImageHandler);
}

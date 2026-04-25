import { 
  createPlantTimeline, 
  getPublicVariety, 
  deletePlantTimeline,
  deletePlantTimelineImage,
  getPlantTimeline,
  createPlantTimelineNote
} from "../controllers/plant-timelines.controller.js"
import fs from "fs";
import path from "path";
import { pipeline } from "stream/promises";

export default async function plantTimelinesRoutes(app) {
  app.post("/", {
    preHandler: [app.authenticate],
  }, createPlantTimeline)

  app.put("/:token", getPublicVariety);

//   app.post("/upload/image", async (req, reply) => {
//         try {
//             const data = await req.file();

//             if (!data) {
//             return reply.code(400).send({ message: "ไม่มีไฟล์" });
//             }

//             const uploadDir = path.join(process.cwd(), "uploads", "timeline");
//             fs.mkdirSync(uploadDir, { recursive: true });

//             const filename = `${Date.now()}-${data.filename}`;
//             const filepath = path.join(uploadDir, filename);

//             await pipeline(data.file, fs.createWriteStream(filepath));

//             return reply.send({
//             url: `/uploads/timeline/${filename}`,
//             });
//         } catch (error) {
//             console.error("uploadPlantTimelineImage error:", error);
//             return reply.code(500).send({ message: "อัปโหลดรูปไม่สำเร็จ" });
//         }
//     })

  app.delete("/plant-timelines/:id", deletePlantTimeline);
  app.delete("/plant-timelines/:id/image", deletePlantTimelineImage);

  app.get(
    "/:id/timeline",
    {
      preHandler: [
        app.authenticate,
        app.gardenGuard({ allowSuperWithoutGarden: true, requireGarden: false })
      ],
    },
    getPlantTimeline
  );

  app.post(
    "/:id/timeline",
    {
      preHandler: [
        app.authenticate,
        app.gardenGuard({ allowSuperWithoutGarden: true, requireGarden: false }),
      ],
    },
    createPlantTimelineNote
  );
}
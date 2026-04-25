import { z } from "zod";

export const varietySchema = z.object({
  name: z.string().min(2, "ชื่อสายพันธุ์สั้นเกินไป"),
  scientificName: z.string().optional().nullable(),
  type: z.string().min(1, "กรุณาระบุประเภท"),
});

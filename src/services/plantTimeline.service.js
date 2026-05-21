import { db } from "../config/db.js";

export async function createPlantTimelineLog(
  {
    plantId,
    gardenId,
    eventType,
    eventDate = null,
    title,
    description = null,
    oldStatus = null,
    newStatus = null,
    oldZoneName = null,
    newZoneName = null,
    oldLocationName = null,
    newLocationName = null,
    heightCm = null,
    trunkDiameterMm = null,
    potSizeInch = null,
    ageValue = null,
    ageUnit = null,
    imagePublicId = null,
    imageUrl = null,
    createdBy = null,
  },
  // conn = db
) {
  await db.query(
    `
    INSERT INTO plant_timelines (
      plant_id, garden_id, event_type, event_date,
      title, description,
      old_status, new_status,
      old_zone_name, new_zone_name,
      old_location_name, new_location_name,
      height_cm, trunk_diameter_mm, pot_size_inch,
      age_value, age_unit,
      image_public_id, image_url,
      created_by
    ) VALUES (?, ?, ?, COALESCE(?, NOW()), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      plantId,
      gardenId,
      eventType,
      eventDate,
      title,
      description,
      oldStatus,
      newStatus,
      oldZoneName,
      newZoneName,
      oldLocationName,
      newLocationName,
      heightCm,
      trunkDiameterMm,
      potSizeInch,
      ageValue,
      ageUnit,
      imagePublicId,
      imageUrl,
      createdBy,
    ]
  );
}
import { db } from "../config/db.js";

export async function getSpeciesHandler(req, res) {
  const [rows] = await db.query("SELECT id, name FROM plant_species ORDER BY name");
  res.send(rows);
}
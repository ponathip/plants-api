import {
  getSpeciesHandler
} from '../controllers/plant-species.controller.js'

export default async function plantSpeciesRoutes(app) {
  app.get('/', getSpeciesHandler);
}

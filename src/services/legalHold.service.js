import { isOnLegalHold } from '../services/legalHold.service.js';

export function legalHoldGuard(entity, idParam = 'id') {
  return async (req, reply) => {
    const entityId = req.params[idParam];

    const locked = await isOnLegalHold(req.db, entity, entityId);
    if (locked) {
      return reply.code(423).send({
        message: 'Entity is under legal hold'
      });
    }
  };
}

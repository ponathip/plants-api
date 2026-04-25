import { verifyAccessToken } from '../utils/jwt.js';

export async function authGuard(req, reply) {
  try {
    const auth = req.headers.authorization;
    if (!auth) throw new Error();

    const token = auth.replace('Bearer ', '');
    const payload = verifyAccessToken(token);
    
    req.user = {
      userId: payload.userId,
      role: payload.role
    };
  } catch {
    return reply.code(401).send({ message: 'Unauthorized' });
  }
}

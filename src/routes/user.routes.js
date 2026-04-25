import { roleGuard } from '../middlewares/role.guard.js';

app.post(
  '/users',
  { preHandler: [app.authGuard, roleGuard(['super'])] },
  controller.createUser
);

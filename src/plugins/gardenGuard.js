import fp from "fastify-plugin";
import { db } from "../config/db.js";

function normalizeGardenId(value) {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function findUserDefaultGarden(userId) {
  const [owned] = await db.query(
    `
    SELECT id, 'owner' AS role
    FROM gardens
    WHERE owner_id = ?
    ORDER BY id ASC
    LIMIT 1
    `,
    [userId]
  );

  if (owned.length) {
    return { gardenId: owned[0].id, role: "owner" };
  }

  const [member] = await db.query(
    `
    SELECT garden_id AS gardenId, role
    FROM garden_members
    WHERE user_id = ?
    ORDER BY garden_id ASC
    LIMIT 1
    `,
    [userId]
  );

  if (member.length) {
    return {
      gardenId: member[0].gardenId,
      role: member[0].role,
    };
  }

  return null;
}

async function canAccessGarden(gardenId, user) {
  if (!gardenId) return null;

  if (user.role === "super") {
    const [gardenRows] = await db.query(
      `SELECT id FROM gardens WHERE id = ? LIMIT 1`,
      [gardenId]
    );

    if (!gardenRows.length) return null;

    return {
      gardenId,
      role: "super",
    };
  }

  const [owner] = await db.query(
    `
    SELECT id
    FROM gardens
    WHERE id = ? AND owner_id = ?
    LIMIT 1
    `,
    [gardenId, user.userId]
  );

  if (owner.length) {
    return {
      gardenId,
      role: "owner",
    };
  }

  const [member] = await db.query(
    `
    SELECT role
    FROM garden_members
    WHERE garden_id = ? AND user_id = ?
    LIMIT 1
    `,
    [gardenId, user.userId]
  );

  if (member.length) {
    return {
      gardenId,
      role: member[0].role,
    };
  }

  return null;
}

function gardenGuard(options = {}) {
  const {
    allowSuperWithoutGarden = false,
    requireGarden = true,
  } = options;

  return async function gardenGuardHandler(req, reply) {
    try {
      const user = req.user;
      console.log(user);
      
      const paramGardenId = normalizeGardenId(req.params?.gardenId);
      const queryGardenId = normalizeGardenId(req.query?.garden_id);
      const bodyGardenId = normalizeGardenId(req.body?.garden_id);

      const requestedGardenId =
        paramGardenId || queryGardenId || bodyGardenId || null;

      if (user.role === "super") {
        if (!requestedGardenId && allowSuperWithoutGarden) {
          req.gardenContext = {
            gardenId: null,
            role: "super",
            scope: "all",
            isSuper: true,
          };
          req.garden = null;
          return;
        }
        
        if (!requestedGardenId && requireGarden) {
          return reply.code(400).send({ message: "garden_id required" });
        }

        if (!requestedGardenId && !requireGarden) {
          req.gardenContext = {
            gardenId: null,
            role: "super",
            scope: "all",
            isSuper: true,
          };
          req.garden = null;
          return;
        }

        const access = await canAccessGarden(requestedGardenId, user);
        if (!access) {
          return reply.code(404).send({ message: "Garden not found" });
        }

        req.gardenContext = {
          gardenId: access.gardenId,
          role: "super",
          scope: "single",
          isSuper: true,
        };
        req.garden = { id: access.gardenId, role: "super" };
        return;
      }

      if (requestedGardenId) {
        const access = await canAccessGarden(requestedGardenId, user);

        if (!access) {
          return reply.code(403).send({ message: "No access to this garden" });
        }

        req.gardenContext = {
          gardenId: access.gardenId,
          role: access.role,
          scope: "single",
          isSuper: false,
        };
        req.garden = { id: access.gardenId, role: access.role };
        return;
      }

      const fallback = await findUserDefaultGarden(user.userId);
console.log(fallback, 'fallback');
      if (!fallback) {
        if (requireGarden) {
          return reply.code(400).send({ message: "garden_id required" });
        }
        
        req.gardenContext = {
          gardenId: null,
          role: null,
          scope: "none",
          isSuper: false,
        };
        req.garden = null;
        return;
      }

      req.gardenContext = {
        gardenId: fallback.gardenId,
        role: fallback.role,
        scope: "single",
        isSuper: false,
      };
      req.garden = {
        id: fallback.gardenId,
        role: fallback.role,
      };
    } catch (error) {
      console.error("gardenGuard error:", error);
      return reply.code(500).send({ message: "Garden guard failed" });
    }
  };
}

async function gardenGuardPlugin(app) {
  app.decorate("gardenGuard", gardenGuard);
}

export default fp(gardenGuardPlugin);
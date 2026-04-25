import Fastify from 'fastify'
import cors from '@fastify/cors'
import cookie from '@fastify/cookie'
import staticPlugin from "@fastify/static";
import multipart from "@fastify/multipart";
import jwt from '@fastify/jwt'
import cron from 'node-cron'
import { env } from './config/env.js'
import path from "path";

import gardenGuardPlugin from './plugins/gardenGuard.js'
import permissionGuardPlugin from './plugins/permission.js'
import legalHoldGuardPlugin from './plugins/legalHold.js'

export async function buildApp() {
  const app = Fastify({ logger: true })

  if (!env.JWT_ACCESS_SECRET) {
    throw new Error('❌ JWT_ACCESS_SECRET is missing')
  }

  await app.register(cors, {
    origin: 'http://localhost:3008',
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  })

  await app.register(cookie, {
    secret: 'supersecret',
    hook: 'onRequest'
  })

  /* ✅ JWT อ่าน cookie ได้ */
  await app.register(jwt, {
    secret: env.JWT_ACCESS_SECRET,
    cookie: {
      cookieName: 'accessToken',
      signed: false
    }
  })

  app.decorate('authenticate', async (req, reply) => {
    try {
      await req.jwtVerify()
    } catch (err) {
      reply.send(err)
    }
  })

  await app.register(multipart)

  await app.register(staticPlugin, {
    root: path.join(process.cwd(), "uploads"),
    prefix: "/uploads/",
  });

  await app.register(gardenGuardPlugin)
  await app.register(permissionGuardPlugin)
  await app.register(legalHoldGuardPlugin)

  app.get('/', async () => ({ status: 'ok' }))

  return app
}

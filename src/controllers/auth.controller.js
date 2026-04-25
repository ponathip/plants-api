import { login,  refresh } from '../services/auth.service.js';
import { hashToken } from '../utils/token-hash.js';
import { db } from '../config/db.js';
import { revokeAllByUser } from '../services/auth.service.js';

export async function loginHandler(req, reply) {
  const { username, password } = req.body;
  const tokens = await login(username, password);
  if (!tokens) {
    return reply.code(401).send({ message: 'Invalid credentials' });
  }

  const { accessToken, refreshToken } = tokens;

  reply
    .setCookie('accessToken', accessToken, {
      httpOnly: true,
      path: '/',
      sameSite: 'lax',
      secure: false, // dev
      maxAge: 60 * 60,
    })
    .setCookie('refreshToken', refreshToken, {
      httpOnly: true,
      path: '/',
      sameSite: 'lax',
      secure: false,
    });

  return reply.send({ ok: true });
}

export async function refreshHandler(req, reply) {
  const refreshToken = req.cookies.refreshToken

  if (!refreshToken) {
    return reply.code(401).send({ message: "No refresh token" })
  }

  try {
    const tokens = await refresh(refreshToken)

    if (!tokens) {
      reply.clearCookie("refreshToken", {
        path: "/",
        sameSite: "lax",
        secure: false,
      })
      reply.clearCookie("accessToken", {
        path: "/",
        sameSite: "lax",
        secure: false,
      })

      return reply.code(401).send({ message: "Invalid refresh token" })
    }

    // สำคัญ: rotate แล้วต้อง set cookie ใหม่กลับไป
    reply
      .setCookie("accessToken", tokens.accessToken, {
        httpOnly: true,
        path: "/",
        sameSite: "lax",
        secure: false,
      })
      .setCookie("refreshToken", tokens.refreshToken, {
        httpOnly: true,
        path: "/",
        sameSite: "lax",
        secure: false,
      })

    return reply.send({ ok: true })
  } catch (err) {
    console.error(err)

    reply.clearCookie("refreshToken", {
      path: "/",
      sameSite: "lax",
      secure: false,
    })
    reply.clearCookie("accessToken", {
      path: "/",
      sameSite: "lax",
      secure: false,
    })

    return reply.code(401).send({ message: "Refresh failed" })
  }
}

export async function logoutHandler(req, reply) {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    return reply.code(400).send({ message: 'refreshToken required' });
  }

  await db.query(
    `UPDATE refresh_tokens SET revoked = TRUE WHERE token_hash = ?`,
    [hashToken(refreshToken)]
  );

  reply.send({ message: 'Logged out' });
}

export async function logoutAllHandler(req, reply) {
  const userId = req.user.userId; // มาจาก access token

  await revokeAllByUser(userId);

  reply.send({ message: 'Logged out from all devices' });
}
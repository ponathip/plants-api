import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/jwt.js';
import { comparePassword } from '../utils/hash.js';
import { hashToken } from '../utils/token-hash.js';
import { db } from '../config/db.js';

export async function login(username, password) {

  const [rows] = await db.query(
      `SELECT * FROM users
       WHERE username = ?`,
      [username]
  );

  if (rows.length === 0) return null;

  // 2️⃣ เช็ค password
  const match = await comparePassword(password, rows[0].password_hash);
  
  if (!match) {
    return null;
  }

  // 3️⃣ สร้าง token
  const payload = {
    userId: rows[0].id,
    role: rows[0].role
  };

  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);

  // 4️⃣ เก็บ refresh token
  await db.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
     VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 7 DAY))`,
    [rows[0].id, hashToken(refreshToken)]
  );

  return { accessToken, refreshToken };
}

export async function refresh(refreshToken) {
  try {
    const payload = verifyRefreshToken(refreshToken)
    const tokenHash = hashToken(refreshToken)

    const [rows] = await db.query(
      `SELECT * FROM refresh_tokens
       WHERE token_hash = ?
         AND revoked = FALSE
         AND expires_at > NOW()`,
      [tokenHash]
    )

    if (rows.length === 0) return null

    await db.query(
      `UPDATE refresh_tokens SET revoked = TRUE WHERE token_hash = ?`,
      [tokenHash]
    )

    const newPayload = {
      userId: payload.userId,
      role: payload.role,
    }

    const newAccessToken = signAccessToken(newPayload)
    const newRefreshToken = signRefreshToken(newPayload)

    await db.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
       VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 7 DAY))`,
      [payload.userId, hashToken(newRefreshToken)]
    )

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    }
  } catch (err) {
    console.error("refresh error:", err)
    return null
  }
}

export async function revokeAllByUser(userId) {
  await db.query(
    `UPDATE refresh_tokens
     SET revoked = TRUE
     WHERE user_id = ? AND revoked = FALSE`,
    [userId]
  );
}

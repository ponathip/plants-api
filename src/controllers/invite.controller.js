import { db } from '../config/db.js'

export async function acceptInvite(req, reply) {
  const { token } = req.body
  const userId = req.user.userId

  if (!token) {
    return reply.code(400).send({ message: 'Token required' })
  }

  // 1. หา invite
  const [[invite]] = await db.query(
    `SELECT * FROM invites
     WHERE token = ?`,
    [token]
  )

  if (!invite) {
    return reply.code(400).send({ message: 'Invalid invite' })
  }

  // 2. เช็คใช้ไปแล้ว
  if (invite.accepted_at) {
    return reply.code(400).send({ message: 'Invite already used' })
  }

  // 3. เช็คหมดอายุ
  const now = new Date()
  if (new Date(invite.expired_at) < now) {
    return reply.code(400).send({ message: 'Invite expired' })
  }

  // 4. กัน join ซ้ำ
  const [existing] = await db.query(
    `SELECT * FROM garden_members
     WHERE garden_id = ? AND user_id = ?`,
    [invite.garden_id, userId]
  )

  if (existing.length) {
    return reply.code(400).send({ message: 'Already a member' })
  }

  // 5. เพิ่ม member
  await db.query(
    `INSERT INTO garden_members (garden_id, user_id, role)
     VALUES (?, ?, ?)`,
    [invite.garden_id, userId, invite.role]
  )

  // 6. mark invite used
  await db.query(
    `UPDATE invites
     SET accepted_at = NOW()
     WHERE id = ?`,
    [invite.id]
  )

  return reply.send({
    success: true,
    gardenId: invite.garden_id
  })
}
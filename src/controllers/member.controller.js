import { db } from "../config/db.js";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import nodemailer from "nodemailer";
import { writeAudit } from "../services/audit.service.js";

function canManageMembers(userRole, memberRoleInGarden) {
  if (userRole === "super") return true;
  return memberRoleInGarden === "owner" || memberRoleInGarden === "admin";
}

export async function createMember(req, reply) {
  try {
    const contextGardenId = req.gardenContext?.gardenId;
    const requesterUserId = req.user?.userId || req.user?.id;
    const requesterRole = req.user?.role;

    const {
      garden_id,
      name,
      username,
      email,
      password,
      role,
    } = req.body || {};

    const targetGardenId =
      requesterRole === "super"
        ? Number(garden_id || contextGardenId || 0)
        : Number(contextGardenId || 0);

    if (!targetGardenId) {
      return reply.code(400).send({ message: "garden_id required" });
    }

    if (!name || !email || !password || !role) {
      return reply.code(400).send({ message: "กรอกข้อมูลไม่ครบ" });
    }

    if (!["admin", "staff"].includes(role)) {
      return reply.code(400).send({ message: "role ไม่ถูกต้อง" });
    }

    let managerRole = null;

    if (requesterRole !== "super") {
      const [[me]] = await db.query(
        `
        SELECT role
        FROM garden_members
        WHERE garden_id = ? AND user_id = ?
        LIMIT 1
        `,
        [targetGardenId, requesterUserId]
      );

      managerRole = me?.role || null;

      if (!canManageMembers(requesterRole, managerRole)) {
        return reply.code(403).send({ message: "ไม่มีสิทธิ์เพิ่มสมาชิก" });
      }
    }

    const [[existUser]] = await db.query(
      `
      SELECT id
      FROM users
      WHERE email = ?
      LIMIT 1
      `,
      [email]
    );

    if (existUser) {
      return reply.code(400).send({ message: "email นี้ถูกใช้แล้ว" });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const [userResult] = await db.query(
      `
      INSERT INTO users (name, email, username, password_hash, role)
      VALUES (?, ?, ?, ?, ?)
      `,
      [name, email, username, passwordHash, role]
    );

    const newUserId = userResult.insertId;

    const [memberResult] = await db.query(
      `
      INSERT INTO garden_members (garden_id, user_id, role)
      VALUES (?, ?, ?)
      `,
      [targetGardenId, newUserId, role]
    );

    await writeAudit({
      userId: requesterUserId,
      gardenId: targetGardenId,
      action: "create",
      entity: "garden_members",
      entityId: memberResult.insertId,
      newData: {
        user_id: newUserId,
        username,
        name,
        email,
        role,
      },
    });

    return reply.send({
      success: true,
      user_id: newUserId,
    });
  } catch (error) {
    console.error("createMember error:", error);
    return reply.code(500).send({ message: "สร้างสมาชิกไม่สำเร็จ" });
  }
}

export async function updateMemberProfile(req, reply) {
  try {
    const contextGardenId = req.gardenContext?.gardenId;
    const requesterUserId = req.user?.userId || req.user?.id;
    const requesterRole = req.user?.role;
    const { userId } = req.params;

    const {
      garden_id,
      name,
      username,
      email,
      role,
      password,
    } = req.body || {};

    const targetGardenId =
      requesterRole === "super"
        ? Number(garden_id || contextGardenId || 0)
        : Number(contextGardenId || 0);

    if (!targetGardenId) {
      return reply.code(400).send({ message: "garden_id required" });
    }

    let managerRole = null;

    if (requesterRole !== "super") {
      const [[me]] = await db.query(
        `
        SELECT role
        FROM garden_members
        WHERE garden_id = ? AND user_id = ?
        LIMIT 1
        `,
        [targetGardenId, requesterUserId]
      );

      managerRole = me?.role || null;

      if (!canManageMembers(requesterRole, managerRole)) {
        return reply.code(403).send({ message: "ไม่มีสิทธิ์แก้ไขสมาชิก" });
      }
    }

    const [[member]] = await db.query(
      `
      SELECT gm.*, u.name, u.email
      FROM garden_members gm
      JOIN users u ON u.id = gm.user_id
      WHERE gm.garden_id = ? AND gm.user_id = ?
      LIMIT 1
      `,
      [targetGardenId, userId]
    );

    if (!member) {
      return reply.code(404).send({ message: "ไม่พบสมาชิก" });
    }

    if (member.role === "owner" && role && role !== "owner") {
      return reply.code(400).send({ message: "แก้ owner ไม่ได้" });
    }

    if (email && email !== member.email) {
      const [[dup]] = await db.query(
        `
        SELECT id
        FROM users
        WHERE email = ? AND id <> ?
        LIMIT 1
        `,
        [email, userId]
      );

      if (dup) {
        return reply.code(400).send({ message: "email นี้ถูกใช้แล้ว" });
      }
    }

    const oldData = { ...member };

    await db.query(
      `
      UPDATE users
      SET name = ?, email = ?, username = ?
      WHERE id = ?
      `,
      [name || member.name, email || member.email, username || member.username, userId]
    );

    if (role && member.role !== "owner") {
      await db.query(
        `
        UPDATE garden_members
        SET role = ?
        WHERE garden_id = ? AND user_id = ?
        `,
        [role, targetGardenId, userId]
      );
    }

    if (password) {
      const passwordHash = await bcrypt.hash(password, 10);
      await db.query(
        `
        UPDATE users
        SET password = ?
        WHERE id = ?
        `,
        [passwordHash, userId]
      );
    }

    await writeAudit({
      userId: requesterUserId,
      gardenId: targetGardenId,
      action: "update",
      entity: "garden_members",
      entityId: Number(userId),
      oldData,
      newData: {
        name: name || member.name,
        username: username || member.username,
        email: email || member.email,
        role: role || member.role,
        password_changed: !!password,
      },
    });

    return reply.send({ success: true });
  } catch (error) {
    console.error("updateMemberProfile error:", error);
    return reply.code(500).send({ message: "แก้ไขสมาชิกไม่สำเร็จ" });
  }
}

export async function getMembers(req, reply) {
  try {
    const { gardenId, isSuper, scope } = req.gardenContext;
    const requestedGardenId = req.query?.garden_id
      ? Number(req.query.garden_id)
      : null;

    let sql = `
      SELECT
        gm.garden_id,
        gm.user_id,
        gm.role,
        gm.created_at,
        u.name,
        u.username,
        u.email,
        g.name AS garden_name
      FROM garden_members gm
      JOIN users u ON u.id = gm.user_id
      JOIN gardens g ON g.id = gm.garden_id
      WHERE 1=1
      AND u.role != 'super'
    `;
    const params = [];

    if (isSuper && scope === "all") {
      if (requestedGardenId) {
        sql += ` AND gm.garden_id = ?`;
        params.push(requestedGardenId);
      }
    } else {
      sql += ` AND gm.garden_id = ?`;
      params.push(gardenId);
    }

    sql += ` ORDER BY gm.created_at DESC, gm.user_id DESC`;

    const [rows] = await db.query(sql, params);
    return reply.send(rows);
  } catch (error) {
    console.error("getMembers error:", error);
    return reply.code(500).send({ message: "โหลดสมาชิกไม่สำเร็จ" });
  }
}

export async function inviteUser(req, reply) {
  try {
    const contextGardenId = req.gardenContext?.gardenId;
    const requesterUserId = req.user?.userId || req.user?.id;
    const requesterRole = req.user?.role;
    const { email, role, garden_id } = req.body || {};

    const targetGardenId =
      requesterRole === "super"
        ? Number(garden_id || contextGardenId || 0)
        : Number(contextGardenId || 0);

    if (!targetGardenId) {
      return reply.code(400).send({ message: "garden_id required" });
    }

    if (!email || !role) {
      return reply.code(400).send({ message: "email และ role จำเป็น" });
    }

    if (!["admin", "staff"].includes(role)) {
      return reply.code(400).send({ message: "role ไม่ถูกต้อง" });
    }

    let managerRole = null;

    if (requesterRole !== "super") {
      const [[me]] = await db.query(
        `
        SELECT role
        FROM garden_members
        WHERE garden_id = ? AND user_id = ?
        LIMIT 1
        `,
        [targetGardenId, requesterUserId]
      );

      managerRole = me?.role || null;

      if (!canManageMembers(requesterRole, managerRole)) {
        return reply.code(403).send({ message: "ไม่มีสิทธิ์เชิญสมาชิก" });
      }
    }

    const [[user]] = await db.query(
      `
      SELECT id, email, name
      FROM users
      WHERE email = ?
      LIMIT 1
      `,
      [email]
    );

    if (!user) {
      return reply.code(404).send({ message: "ไม่พบ user" });
    }

    const [existMember] = await db.query(
      `
      SELECT 1
      FROM garden_members
      WHERE garden_id = ? AND user_id = ?
      `,
      [targetGardenId, user.id]
    );

    if (existMember.length) {
      return reply.code(400).send({ message: "เป็นสมาชิกอยู่แล้ว" });
    }

    const [existInvite] = await db.query(
      `
      SELECT id
      FROM invites
      WHERE garden_id = ?
        AND email = ?
        AND accepted_at IS NULL
        AND expired_at > NOW()
      `,
      [targetGardenId, email]
    );

    if (existInvite.length) {
      return reply.code(400).send({ message: "มีคำเชิญค้างอยู่แล้ว" });
    }

    const token = crypto.randomBytes(32).toString("hex");

    const [inviteResult] = await db.query(
      `
      INSERT INTO invites (garden_id, email, role, token, expired_at)
      VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 1 DAY))
      `,
      [targetGardenId, email, role, token]
    );

    const inviteLink = `http://localhost:3008/admin/accept-invite?token=${token}`;

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: "ponathip1620@gmail.com",
        pass: "allwazurlegfflpy",
      },
    });

    await transporter.sendMail({
      from: '"Garden App" <ponathip1620@gmail.com>',
      to: email,
      subject: "คุณได้รับเชิญเข้าร่วมสวน 🌱",
      html: `
        <h3>คุณได้รับเชิญเข้าร่วมสวน</h3>
        <p>กดปุ่มด้านล่างเพื่อเข้าร่วม:</p>
        <a href="${inviteLink}" style="padding:10px 20px;background:green;color:white;border-radius:6px;text-decoration:none;">
          เข้าร่วมสวน
        </a>
        <p>ลิงก์นี้หมดอายุใน 24 ชั่วโมง</p>
      `,
    });

    await writeAudit({
      userId: requesterUserId,
      gardenId: targetGardenId,
      action: "invite",
      entity: "invites",
      entityId: inviteResult.insertId,
      newData: {
        email,
        role,
        token,
      },
    });

    return reply.send({ success: true });
  } catch (error) {
    console.error("inviteUser error:", error);
    return reply.code(500).send({ message: "เชิญสมาชิกไม่สำเร็จ" });
  }
}

export async function updateMemberRole(req, reply) {
  try {
    const contextGardenId = req.gardenContext?.gardenId;
    const requesterUserId = req.user?.userId || req.user?.id;
    const requesterRole = req.user?.role;
    const { userId } = req.params;
    const { role, garden_id } = req.body || {};
    const queryGardenId = req.query?.garden_id
      ? Number(req.query.garden_id)
      : null;

    const targetGardenId =
      requesterRole === "super"
        ? Number(garden_id || queryGardenId || contextGardenId || 0)
        : Number(contextGardenId || 0);

    if (!targetGardenId) {
      return reply.code(400).send({ message: "garden_id required" });
    }

    if (!role) {
      return reply.code(400).send({ message: "role จำเป็น" });
    }

    if (!["admin", "staff"].includes(role)) {
      return reply.code(400).send({ message: "role ไม่ถูกต้อง" });
    }

    let managerRole = null;

    if (requesterRole !== "super") {
      const [[me]] = await db.query(
        `
        SELECT role
        FROM garden_members
        WHERE garden_id = ? AND user_id = ?
        LIMIT 1
        `,
        [targetGardenId, requesterUserId]
      );

      managerRole = me?.role || null;

      if (!canManageMembers(requesterRole, managerRole)) {
        return reply.code(403).send({ message: "ไม่มีสิทธิ์แก้ role สมาชิก" });
      }
    }

    const [[member]] = await db.query(
      `
      SELECT *
      FROM garden_members
      WHERE garden_id = ? AND user_id = ?
      LIMIT 1
      `,
      [targetGardenId, userId]
    );

    if (!member) {
      return reply.code(404).send({ message: "ไม่พบสมาชิก" });
    }

    if (member.role === "owner") {
      return reply.code(400).send({ message: "แก้ owner ไม่ได้" });
    }

    const oldData = { ...member };

    await db.query(
      `
      UPDATE garden_members
      SET role = ?
      WHERE garden_id = ? AND user_id = ?
      `,
      [role, targetGardenId, userId]
    );

    await writeAudit({
      userId: requesterUserId,
      gardenId: targetGardenId,
      action: "update_role",
      entity: "garden_members",
      entityId: Number(userId),
      oldData,
      newData: { role },
    });

    return reply.send({ success: true });
  } catch (error) {
    console.error("updateMemberRole error:", error);
    return reply.code(500).send({ message: "อัปเดต role ไม่สำเร็จ" });
  }
}

export async function removeMember(req, reply) {
  try {
    const contextGardenId = req.gardenContext?.gardenId;
    const requesterUserId = req.user?.userId || req.user?.id;
    const requesterRole = req.user?.role;
    const { userId } = req.params;
    const requestedGardenId = req.query?.garden_id
      ? Number(req.query.garden_id)
      : null;

    const targetGardenId =
      requesterRole === "super"
        ? Number(requestedGardenId || contextGardenId || 0)
        : Number(contextGardenId || 0);

    if (!targetGardenId) {
      return reply.code(400).send({ message: "garden_id required" });
    }

    let managerRole = null;

    if (requesterRole !== "super") {
      const [[me]] = await db.query(
        `
        SELECT role
        FROM garden_members
        WHERE garden_id = ? AND user_id = ?
        LIMIT 1
        `,
        [targetGardenId, requesterUserId]
      );

      managerRole = me?.role || null;

      if (!canManageMembers(requesterRole, managerRole)) {
        return reply.code(403).send({ message: "ไม่มีสิทธิ์ลบสมาชิก" });
      }
    }

    const [[member]] = await db.query(
      `
      SELECT *
      FROM garden_members
      WHERE garden_id = ? AND user_id = ?
      LIMIT 1
      `,
      [targetGardenId, userId]
    );

    if (!member) {
      return reply.code(404).send({ message: "ไม่พบสมาชิก" });
    }

    if (member.role === "owner") {
      return reply.code(400).send({ message: "ลบ owner ไม่ได้" });
    }

    await db.query(
      `
      DELETE FROM garden_members
      WHERE garden_id = ? AND user_id = ?
      `,
      [targetGardenId, userId]
    );

    await writeAudit({
      userId: requesterUserId,
      gardenId: targetGardenId,
      action: "remove",
      entity: "garden_members",
      entityId: Number(userId),
      oldData: member,
    });

    return reply.send({ success: true });
  } catch (error) {
    console.error("removeMember error:", error);
    return reply.code(500).send({ message: "ลบสมาชิกไม่สำเร็จ" });
  }
}

export async function acceptInvite(req, reply) {
  try {
    const requesterUserId = req.user?.userId || req.user?.id;
    const { token } = req.body || {};

    if (!token) {
      return reply.code(400).send({ message: "token จำเป็น" });
    }

    const [[invite]] = await db.query(
      `
      SELECT *
      FROM invites
      WHERE token = ?
        AND accepted_at IS NULL
        AND expired_at > NOW()
      LIMIT 1
      `,
      [token]
    );

    if (!invite) {
      return reply.code(400).send({ message: "Invalid invite" });
    }

    const [existMember] = await db.query(
      `
      SELECT 1
      FROM garden_members
      WHERE garden_id = ? AND user_id = ?
      `,
      [invite.garden_id, requesterUserId]
    );

    if (existMember.length) {
      await db.query(
        `
        UPDATE invites
        SET accepted_at = NOW()
        WHERE id = ?
        `,
        [invite.id]
      );

      return reply.send({ success: true, message: "เป็นสมาชิกอยู่แล้ว" });
    }

    const [result] = await db.query(
      `
      INSERT INTO garden_members (garden_id, user_id, role)
      VALUES (?, ?, ?)
      `,
      [invite.garden_id, requesterUserId, invite.role]
    );

    await db.query(
      `
      UPDATE invites
      SET accepted_at = NOW()
      WHERE id = ?
      `,
      [invite.id]
    );

    await writeAudit({
      userId: requesterUserId,
      gardenId: invite.garden_id,
      action: "accept_invite",
      entity: "garden_members",
      entityId: result.insertId,
      newData: {
        role: invite.role,
        email: invite.email,
      },
    });

    return reply.send({ success: true });
  } catch (error) {
    console.error("acceptInvite error:", error);
    return reply.code(500).send({ message: "รับคำเชิญไม่สำเร็จ" });
  }
}
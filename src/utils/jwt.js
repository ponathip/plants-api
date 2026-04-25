import jwt from 'jsonwebtoken';

export function signAccessToken(payload) {
  const secret = process.env.JWT_ACCESS_SECRET;

  if (!secret) {
    throw new Error('JWT_ACCESS_SECRET missing');
  }

  return jwt.sign(payload, secret, {
    expiresIn: '1h',
  });
}

export function signRefreshToken(payload) {
  const secret = process.env.JWT_REFRESH_SECRET;

  if (!secret) {
    throw new Error('JWT_REFRESH_SECRET missing');
  }

  return jwt.sign(payload, secret, {
    expiresIn: '7d',
  });
}

export function verifyAccessToken(token) {
  const secret = process.env.JWT_ACCESS_SECRET;

  if (!secret) {
    throw new Error('JWT_ACCESS_SECRET missing');
  }

  return jwt.verify(token, secret);
}

export function verifyRefreshToken(token) {
  const secret = process.env.JWT_REFRESH_SECRET;

  if (!secret) {
    throw new Error('JWT_REFRESH_SECRET missing');
  }

  return jwt.verify(token, secret);
}

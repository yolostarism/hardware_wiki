import { cookies } from 'next/headers';
import crypto from 'node:crypto';

const COOKIE_NAME = 'pzp_session';

// 从运行时环境变量取数据库连接串（服务端专用，不会进浏览器包）
export function databaseUrl() {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || '';
}

export { COOKIE_NAME };

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

export function makePasswordRecord(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  return salt + ':' + hashPassword(password, salt);
}

// 校验口令，返回 true/false。数据库里存的是 "salt:hash"，数据库被读走也拿不到明文。
export async function verifyPassword(sql, password) {
  const { rows } = await sql`SELECT value FROM auth_config WHERE key = 'admin_password';`;
  const record = rows[0]?.value;
  if (!record || !password) return false;
  const [salt, expected] = record.split(':');
  if (!salt || !expected) return false;
  const actual = hashPassword(password, salt);
  const a = Buffer.from(actual, 'hex');
  const b = Buffer.from(expected, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function newSessionToken() {
  return crypto.randomBytes(48).toString('base64url');
}

// 建立会话：写库 + 下发 HttpOnly cookie
export async function createSession(sql, token) {
  await sql`INSERT INTO sessions (token, expires_at) VALUES (${token}, NOW() + INTERVAL '90 days')`;
  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 90,
  });
}

// 读 cookie，判断是不是本人。所有写操作入口都要先过这一关。
export async function isOwner(sql) {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return false;
  const { rows } = await sql`SELECT token FROM sessions WHERE token = ${token} AND expires_at > NOW();`;
  return rows.length > 0;
}

export async function destroySession(sql) {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (token) await sql`DELETE FROM sessions WHERE token = ${token};`;
  store.delete(COOKIE_NAME);
}

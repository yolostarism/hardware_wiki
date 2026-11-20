'use server'; // 这一行极其重要！告诉 Next.js 这是要在服务器上运行的安全代码
import { sql } from '@vercel/postgres';
import { neonConfig } from '@neondatabase/serverless';
import { ProxyAgent, fetch as undiciFetch } from 'undici';
import { verifyPassword, newSessionToken, createSession, isOwner, destroySession } from '../lib/auth';

const neonProxyUrl = process.env.NEON_FETCH_PROXY || process.env.HTTPS_PROXY || process.env.HTTP_PROXY || ''; // 本机直连 Neon 可用；之前 dev 默认走 7890 代理，但 7890 已不再监听，导致取数为空

if (neonProxyUrl) {
  const neonProxyAgent = new ProxyAgent(neonProxyUrl);
  neonConfig.fetchFunction = (url, init) => undiciFetch(url, { ...init, dispatcher: neonProxyAgent });
}

const DENIED = { success: false, error: '没有编辑权限' };

// 0. 登录：口令只跟数据库里的哈希比对，明文不进前端、不进代码
export async function login(password) {
  try {
    const ok = await verifyPassword(sql, String(password || ''));
    if (!ok) return { success: false, error: '口令不对' };
    await createSession(sql, newSessionToken());
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// 0b. 退出：删掉服务端会话记录，cookie 一并清掉
export async function logout() {
  try {
    await destroySession(sql);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// 0c. 当前是不是本人（页面用它决定要不要显示编辑按钮）
export async function getSessionRole() {
  try {
    if (await isOwner(sql)) return { success: true, role: 'admin' };
    return { success: true, role: 'guest' };
  } catch (error) {
    return { success: true, role: 'guest', error: error.message };
  }
}

// 1. 获取所有目录树（只读，公开）
export async function getDirectories() {
  try {
    const { rows } = await sql`SELECT * FROM directories ORDER BY created_at ASC;`;
    return { success: true, data: rows };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// 2. 获取某一篇文章的内容（只读，公开）
export async function getDocument(id) {
  try {
    const { rows } = await sql`SELECT content FROM documents WHERE id = ${id};`;
    return { success: true, content: rows[0]?.content || "" };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// 3. 添加新节点 (目录或文件)
export async function addNode(id, name, type, parentId) {
  try {
    if (!(await isOwner(sql))) return DENIED;
    await sql`
      INSERT INTO directories (id, name, type, parent_id)
      VALUES (${id}, ${name}, ${type}, ${parentId});
    `;
    // 如果是文件，顺便在 documents 表里初始化一行空内容
    if (type === 'file') {
      await sql`
        INSERT INTO documents (id, content)
        VALUES (${id}, '# 新文章\n在此输入内容...');
      `;
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// 4. 删除节点
export async function deleteNode(id) {
  try {
    if (!(await isOwner(sql))) return DENIED;
    // 简单起见，这里只删当前节点（如果是文件夹，里面的子文件在实际开发中最好用外键级联删除）
    await sql`DELETE FROM directories WHERE id = ${id} OR parent_id = ${id};`;
    await sql`DELETE FROM documents WHERE id = ${id};`;
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// 5. 保存文章内容
export async function updateDocument(id, content) {
  try {
    if (!(await isOwner(sql))) return DENIED;
    await sql`
      INSERT INTO documents (id, content, updated_at)
      VALUES (${id}, ${content}, CURRENT_TIMESTAMP)
      ON CONFLICT (id) DO UPDATE
      SET content = EXCLUDED.content, updated_at = CURRENT_TIMESTAMP;
    `;
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// 6. 重命名节点
export async function renameNode(id, newName) {
  try {
    if (!(await isOwner(sql))) return DENIED;
    await sql`UPDATE directories SET name = ${newName} WHERE id = ${id};`;
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// 7. 移动节点
export async function moveNode(id, newParentId) {
  try {
    if (!(await isOwner(sql))) return DENIED;
    await sql`UPDATE directories SET parent_id = ${newParentId} WHERE id = ${id};`;
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

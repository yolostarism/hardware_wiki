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

// 首页/目录是每次进页面必拉的读多写少数据，加 60 秒进程内缓存，任何写操作后立即失效
const cache = globalThis.__pzpWikiCache || (globalThis.__pzpWikiCache = new Map());
const TTL = 60_000;
async function cached(key, fn) {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;
  const value = await fn();
  cache.set(key, { value, expires: Date.now() + TTL });
  return value;
}
function bustCache() { cache.clear(); }

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
    return await cached('directories', async () => {
      const { rows } = await sql`SELECT * FROM directories ORDER BY created_at ASC;`;
      return { success: true, data: rows };
    });
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
    bustCache();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// 4. 删除节点：目录连同所有子孙目录、子孙文章一起删（递归 CTE）
export async function deleteNode(id) {
  try {
    if (!(await isOwner(sql))) return DENIED;
    await sql`
      WITH RECURSIVE subtree AS (
        SELECT id FROM directories WHERE id = ${id}
        UNION ALL
        SELECT d.id FROM directories d INNER JOIN subtree s ON d.parent_id = s.id
      )
      DELETE FROM documents WHERE id IN (SELECT id FROM subtree);
    `;
    const result = await sql`
      WITH RECURSIVE subtree AS (
        SELECT id FROM directories WHERE id = ${id}
        UNION ALL
        SELECT d.id FROM directories d INNER JOIN subtree s ON d.parent_id = s.id
      )
      DELETE FROM directories WHERE id IN (SELECT id FROM subtree);
    `;
    bustCache();
    return { success: true, deleted: result.rowCount ?? 0 };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// 4b. 搜索正文：命中返回所属文章 + 命中位置上下文
export async function searchDocuments(query, limit = 40) {
  try {
    const q = String(query || '').trim();
    if (!q) return { success: true, data: [] };
    const like = '%' + q.replace(/[\\%_]/g, (m) => '\\' + m) + '%';
    const { rows } = await sql`
      SELECT dir.id, dir.name, dir.parent_id,
             substring(d.content from greatest(1, strpos(lower(d.content), lower(${q})) - 30) for 150) AS snippet
      FROM documents d
      INNER JOIN directories dir ON dir.id = d.id
      WHERE d.content ILIKE ${like}
      ORDER BY d.updated_at DESC NULLS LAST
      LIMIT ${limit};
    `;
    return { success: true, data: rows };
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
    bustCache();
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
    bustCache();
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
    bustCache();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// 9. 首页用的统计：最近更新的文章 + 只有标题还没写正文的文章
export async function getLibraryStats() {
  try {
    return await cached('libraryStats', async () => {
    const recent = await sql`
      SELECT dir.id, dir.name, dir.parent_id, d.updated_at, length(d.content) AS len
      FROM documents d
      INNER JOIN directories dir ON dir.id = d.id
      WHERE d.content IS NOT NULL AND length(d.content) >= 200
      ORDER BY d.updated_at DESC NULLS LAST
      LIMIT 8;
    `;
    const thin = await sql`
      SELECT dir.id, dir.name, dir.parent_id, length(d.content) AS len
      FROM directories dir
      LEFT JOIN documents d ON d.id = dir.id
      WHERE dir.type = 'file' AND coalesce(length(d.content), 0) < 50
      ORDER BY dir.created_at ASC;
    `;
    return {
      success: true,
      recent: recent.rows.map((r) => ({ ...r, updated_at: r.updated_at ? new Date(r.updated_at).toISOString() : null })),
      thin: thin.rows,
    };
    });
  } catch (error) {
    return { success: false, error: error.message };
  }
}

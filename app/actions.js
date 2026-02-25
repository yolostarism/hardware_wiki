'use server'; // 这一行极其重要！告诉 Next.js 这是要在服务器上运行的安全代码
import { sql } from '@vercel/postgres';

// 1. 获取所有目录树
export async function getDirectories() {
  try {
    const { rows } = await sql`SELECT * FROM directories ORDER BY created_at ASC;`;
    return { success: true, data: rows };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// 2. 获取某一篇文章的内容
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
    await sql`UPDATE directories SET name = ${newName} WHERE id = ${id};`;
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// 7. 移动节点
export async function moveNode(id, newParentId) {
  try {
    await sql`UPDATE directories SET parent_id = ${newParentId} WHERE id = ${id};`;
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

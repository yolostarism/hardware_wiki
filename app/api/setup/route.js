import { sql } from '@vercel/postgres';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // 1. 创建目录表 (存储文件夹和文件的层级关系)
    await sql`
      CREATE TABLE IF NOT EXISTS directories (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        type VARCHAR(20) NOT NULL, -- 'folder' 或 'file'
        parent_id VARCHAR(50),     -- 用于实现多级目录
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;

    // 2. 创建文章内容表 (专门存储 Markdown 文本)
    await sql`
      CREATE TABLE IF NOT EXISTS documents (
        id VARCHAR(50) PRIMARY KEY, -- 和 directories 表的 id 对应
        content TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;

    // 3. 插入一条测试的根目录数据 (防止界面空空如也)
    await sql`
      INSERT INTO directories (id, name, type, parent_id)
      VALUES ('root-1', '欢迎使用知识库', 'folder', NULL)
      ON CONFLICT (id) DO NOTHING;
    `;

    return NextResponse.json({ message: "数据库建表成功！🎉" }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

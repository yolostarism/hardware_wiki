import { put } from '@vercel/blob';
import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { isOwner } from '../../../lib/auth';

export async function POST(request) {
  try {
    // 没有会话就不许往 Blob 里写东西
    if (!(await isOwner(sql))) {
      return NextResponse.json({ error: '没有编辑权限' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const filename = searchParams.get('filename') || 'image.png';

    // request.body 就是我们要上传的图片文件流
    const blob = await put(filename, request.body, {
      access: 'public', // 必须是 public 才能在网页里显示图片
      addRandomSuffix: true, // 建议开启：自动加随机后缀，防止同名图片互相覆盖
    });

    return NextResponse.json(blob);
  } catch (error) {
    console.error("Blob 上传失败:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

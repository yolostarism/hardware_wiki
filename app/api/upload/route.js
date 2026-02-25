import { put } from '@vercel/blob';
import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const { searchParams } = new URL(request.url);
    const filename = searchParams.get('filename') || 'image.png';

    // request.body 就是我们要上传的图片文件流
    const blob = await put(filename, request.body, {
      access: 'public', // 必须是 public 才能在网页里显示图片
      addRandomSuffix: true, // 建议开启：自动加随机后缀，防止同名图片互相覆盖
    });

    return NextResponse.json(blob);
  } catch (error) {
    // 打印错误到控制台，方便你查看具体的报错原因
    console.error("Blob 上传失败:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

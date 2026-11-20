import { NextResponse } from 'next/server';

// 建表接口曾经对公网开放，任何人访问都会执行建表。
// 现在只返回 410，建表请用项目里的 scripts/init-db（或手工执行 SQL）。
export async function GET() {
  return NextResponse.json({ error: 'Gone' }, { status: 410 });
}

export async function POST() {
  return NextResponse.json({ error: 'Gone' }, { status: 410 });
}

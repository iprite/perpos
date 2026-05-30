// Redirect legacy endpoint — ใช้ /api/usvilla/bookings และ /api/usvilla/rooms แทน
import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({ error: 'Use /api/usvilla/rooms or /api/usvilla/bookings' }, { status: 301 });
}

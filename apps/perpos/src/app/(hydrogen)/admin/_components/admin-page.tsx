'use client';

/**
 * AdminPage / AdminCard — alias ของ PageShell / PageCard กลาง (@/components/ui/page-shell)
 *
 * เดิม shell มาตรฐานถูกนิยามที่นี่เฉพาะ admin console · ตอนนี้ยกขึ้นเป็นของกลาง
 * เพื่อให้ ERP/biz + ผู้ช่วย AI ใช้เปลือกเดียวกัน — ไฟล์นี้คงไว้เป็น re-export
 * เพื่อไม่ให้หน้า admin ที่ import อยู่เดิมพัง (หน้าใหม่แนะนำ import จาก ui/page-shell ตรง ๆ)
 */

export { PageShell as AdminPage, PageCard as AdminCard } from '@/components/ui/page-shell';

/**
 * Compat alias (ชั่วคราว): path เดิม /api/assistant/transcribe/mom-deliver
 *
 * stt-worker เวอร์ชันก่อน redeploy ยังเรียก callback path นี้อยู่ — re-export handler
 * จากตำแหน่งใหม่ /api/assistant/stt/mom-deliver เพื่อตัด lockstep ระหว่าง rollout
 * → ลบไฟล์นี้ทิ้งหลัง redeploy stt-worker (ใช้ path ใหม่) เรียบร้อย
 */
export { POST } from '../../stt/mom-deliver/route';

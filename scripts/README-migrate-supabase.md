# ย้าย Supabase DB + Storage ไปโปรเจกต์ใหม่

ข้อควรระวัง
- ห้ามนำ `service_role` key ไปใส่ฝั่ง client
- ถ้าเคยส่ง key ผ่านแชท/ที่สาธารณะ แนะนำให้ rotate key ทันทีใน Supabase Dashboard → Settings → API

## 1) สลับโปรเจกต์ในแอป (Env)
`apps/perpos` ใช้:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (หรือ `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY`)
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

หมายเหตุ: ฝั่ง server (API) ต้องใช้ `SUPABASE_SERVICE_ROLE_KEY` ของโปรเจกต์ใหม่เท่านั้น

## 2) ย้าย Database (Schema + Data)

### ทางเลือก A (แนะนำ): pg_dump/pg_restore
1) เอา connection string ของโปรเจกต์เก่าและใหม่จาก Supabase Dashboard → Settings → Database
2) dump จากเก่า:

```bash
pg_dump "$OLD_DB_URL" \
  --clean --if-exists \
  --no-owner --no-privileges \
  --format=custom \
  -f supabase.dump
```

3) restore เข้าใหม่:

```bash
pg_restore "$NEW_DB_URL" \
  --clean --if-exists \
  --no-owner --no-privileges \
  -d "$NEW_DB_URL" \
  supabase.dump
```

### ทางเลือก B: Apply migrations แล้วค่อยย้ายข้อมูลเฉพาะ
- Apply ไฟล์ใน `supabase/migrations/*.sql` ไปยังโปรเจกต์ใหม่ (ตามลำดับชื่อไฟล์)
- จากนั้นย้ายข้อมูลด้วย script/ETL ตามต้องการ

## 3) ย้าย Storage (Buckets + Objects)
มีสคริปต์ช่วยคัดลอก object ระหว่างโปรเจกต์:

```bash
OLD_SUPABASE_URL=... \
OLD_SUPABASE_SERVICE_ROLE_KEY=... \
NEW_SUPABASE_URL=... \
NEW_SUPABASE_SERVICE_ROLE_KEY=... \
BUCKETS=documents,order-slips,order-refunds \
node scripts/migrate-supabase-storage.mjs
```

## สร้าง Storage buckets ในโปรเจกต์ใหม่
ถ้าโปรเจกต์ใหม่ยังไม่มี buckets ให้สร้างก่อน:

```bash
SUPABASE_URL=https://<new-project-ref>.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=... \
BUCKETS=documents,poa_slips,poa_documents,worker_profile_pics,order-slips,order-refunds,company-representatives \
BUCKET_PUBLIC=false \
node scripts/create-supabase-storage-buckets.mjs
```

ค่าเริ่มต้นของความเป็น public/ private จะใช้ตาม `BUCKET_PUBLIC_MAP` (override ต่อ bucket):
- `poa_slips=false`, `poa_documents=false`, `documents=false`
- `worker_profile_pics=true`, `order-slips=true`, `order-refunds=true`, `company-representatives=true`

## Schema-only (ไม่ย้ายข้อมูล) แบบไม่ต้องต่อพอร์ต 5432
ถ้าเครือข่ายบล็อก `5432` สามารถสร้างไฟล์ SQL รวมสำหรับ “สร้างโครงสร้างตาราง/นโยบาย” แล้วรันใน Supabase SQL Editor ของโปรเจกต์ใหม่ได้

1) สร้างไฟล์รวม:

```bash
node scripts/build-schema-only-sql.mjs
```

2) จะได้ไฟล์ `supabase/schema-only.sql`

3) เอาไปวางรันที่ Dashboard → SQL Editor ของโปรเจกต์ใหม่

ทิป: แนะนำใส่ค่า env ลงไฟล์ (เช่น `.env.migrate`) แล้วค่อย `source` เพื่อลดความเสี่ยง key โผล่ใน history

```bash
set -a
source .env.migrate
set +a
node scripts/migrate-supabase-storage.mjs
```

หมายเหตุ:
- สคริปต์จะสร้าง bucket ในโปรเจกต์ใหม่ถ้ายังไม่มี
- คัดลอก path เดิมทุกไฟล์ไปยังโปรเจกต์ใหม่

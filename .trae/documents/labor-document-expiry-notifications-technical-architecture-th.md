## 1.Architecture design
```mermaid
graph TD
  A["User Browser"] --> B["React Frontend Application"]
  B --> C["Supabase JS SDK"]
  C --> D["Supabase (Auth + Postgres)"]
  E["Scheduled Notification Job"] --> F["Supabase Edge Function"]
  F --> D
  F --> G["Notification Providers (Email/LINE) مؤ"]

  subgraph "Frontend Layer"
    B
  end

  subgraph "Service Layer (Provided by Supabase)"
    D
    F
  end

  subgraph "External Services"
    G
  end
end
```

## 2.Technology Description
- Frontend: React@18 + TypeScript + tailwindcss@3 + vite
- Backend: Supabase (Auth, Postgres, Edge Functions)

## 3.Route definitions
| Route | Purpose |
|-------|---------|
| /login | หน้าเข้าสู่ระบบและลืมรหัสผ่าน |
| /dashboard | แดชบอร์ดรายการเอกสารใกล้หมดอายุ/หมดอายุ + ประวัติการแจ้งเตือน |
| /settings/notifications | ตั้งค่ากติกา ช่องทาง ผู้รับ และแม่แบบข้อความ |

## 4.API definitions (If it includes backend services)
ใช้ Supabase Edge Functions สำหรับงานเบื้องหลังและทดสอบการส่ง

### 4.1 Core API
1) Run scan + enqueue notifications
```
POST /functions/v1/notification-scan
```
Request (body)
| Param Name| Param Type | isRequired | Description |
|---|---|---|---|
| runAt | string (ISO) | false | เวลาที่เรียกใช้ (ใช้สำหรับทดสอบ/จำลอง) |

Response
| Param Name| Param Type | Description |
|---|---|---|
| queuedCount | number | จำนวนรายการที่เข้าคิวส่ง |

2) Send test notification
```
POST /functions/v1/notification-test
```
Request (body)
| Param Name| Param Type | isRequired | Description |
|---|---|---|---|
| channel | 'email' \| 'line' | true | ช่องทางที่จะทดสอบ |
| to | string | true | ปลายทาง (อีเมล/ไอดีไลน์ตามรูปแบบที่ระบบรองรับ) |
| templateKey | string | true | แม่แบบข้อความที่จะใช้ |

### 4.2 Shared TypeScript types (frontend/backend)
```ts
export type DocType = 'passport' | 'visa' | 'work_permit'
export type ChannelType = 'email' | 'line'

export type Worker = {
  id: string
  employerId: string
  fullName: string
}

export type WorkerDocument = {
  id: string
  workerId: string
  docType: DocType
  docNo?: string
  expiresAt: string // ISO date
}

export type NotificationRule = {
  id: string
  employerId?: string // null = default/global
  docType: DocType
  leadDays: number[]
  frequency: 'daily' | 'on_due'
  enabled: boolean
}
```

## 5.Server architecture diagram (If it includes backend services)
```mermaid
graph TD
  A["Edge Function (HTTP/Cron)"] --> B["Rule Evaluation"]
  B --> C["Queue Builder"]
  C --> D["Provider Adapter"]
  C --> E["Supabase Postgres"]
  D --> F["Email/LINE Provider"]

  subgraph "Supabase Edge Function"
    B
    C
    D
  end
end
```

## 6.Data model(if applicable)

### 6.1 Data model definition
```mermaid
graph TD
  A["employers"] --> B["workers"]
  B --> C["worker_documents"]
  A --> D["notification_rules"]
  A --> E["notification_recipients"]
  C --> F["notification_jobs"]
  F --> G["notification_logs"]
end
```

Entities (คอลัมน์หลักที่จำเป็น)
- employers: id, name
- workers: id, employer_id, full_name
- worker_documents: id, worker_id, doc_type, doc_no, expires_at
- notification_rules: id, employer_id(nullable), doc_type, lead_days(int[]), frequency, enabled
- notification_recipients: id, employer_id, role('employer'|'sales'), channel, destination
- notification_jobs: id, worker_document_id, scheduled_at, channel, to, payload_json, status
- notification_logs: id, job_id, sent_at, result('success'|'failed'), error_message

### 6.2 Data Definition Language
```sql
-- employers
CREATE TABLE employers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- workers
CREATE TABLE workers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employer_id UUID NOT NULL,
  full_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_workers_employer_id ON workers(employer_id);

-- worker_documents
CREATE TABLE worker_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id UUID NOT NULL,
  doc_type TEXT NOT NULL CHECK (doc_type IN ('passport','visa','work_permit')),
  doc_no TEXT,
  expires_at DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_worker_documents_worker_id ON worker_documents(worker_id);
CREATE INDEX idx_worker_documents_expires_at ON worker_documents(expires_at);

-- notification_rules
CREATE TABLE notification_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employer_id UUID,
  doc_type TEXT NOT NULL CHECK (doc_type IN ('passport','visa','work_permit')),
  lead_days INT[] NOT NULL,
  frequency TEXT NOT NULL CHECK (frequency IN ('daily','on_due')),
  enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- notification_recipients
CREATE TABLE notification_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employer_id UUID NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('employer','sales')),
  channel TEXT NOT NULL CHECK (channel IN ('email','line')),
  destination TEXT NOT NULL,
  enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- notification_jobs
CREATE TABLE notification_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_document_id UUID NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('email','line')),
  to_destination TEXT NOT NULL,
  payload_json JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sent','failed')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_notification_jobs_status ON notification_jobs(status);
CREATE INDEX idx_notification_jobs_scheduled_at ON notification_jobs(scheduled_at);

-- notification_logs
CREATE TABLE notification_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL,
  sent_at TIMESTAMPTZ,
  result TEXT NOT NULL CHECK (result IN ('success','failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS (แนวทางขั้นต่ำ: ให้ใช้งานได้เฉพาะ authenticated)
ALTER TABLE employers ENABLE ROW LEVEL SECURITY;
ALTER TABLE workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE worker_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_logs ENABLE ROW LEVEL SECURITY;

-- Grants (ตามแนวทาง Supabase)
GRANT SELECT ON employers, workers, worker_documents, notification_rules, notification_recipients, notification_jobs, notification_logs TO anon;
GRANT ALL PRIVILEGES ON employers, workers, worker_documents, notification_rules, notification_recipients, notification_jobs, notification_logs TO authenticated;
```

// Slim legal copy for /privacy and /terms (extracted from the old locales file).
export type Lang = "th" | "en";

export const legal = {
  th: {
    privacyPage: {
      title: "นโยบายความเป็นส่วนตัว",
      lastUpdated: "อัปเดตล่าสุด: กรกฎาคม 2569",
      section1Title: "1. ข้อมูลที่เราเก็บรวบรวม",
      section1Desc:
        "PERPOS เก็บรวบรวมข้อมูลที่จำเป็นสำหรับการให้บริการ ทั้ง Flow (ผู้ช่วย AI บน LINE) และ Suite (ระบบ ERP องค์กร) รวมถึงข้อมูลผู้ใช้ ข้อมูลองค์กร และไฟล์ที่คุณส่งเข้าสู่ระบบ",
      section2Title: "2. การใช้ข้อมูล",
      section2Desc:
        "เราใช้ข้อมูลของคุณเพื่อประมวลผลงานที่คุณสั่งและปรับปรุงบริการเท่านั้น ไฟล์และเสียงของลูกค้าไม่ถูกนำไปฝึกโมเดล AI",
      section3Title: "3. การแชร์ข้อมูล",
      section3Desc:
        "เราไม่ขายหรือแชร์ข้อมูลส่วนบุคคลของคุณกับบุคคลที่สามโดยไม่ได้รับความยินยอม ยกเว้นกรณีที่กฎหมายกำหนด",
      section4Title: "4. การเก็บและลบไฟล์",
      section4Desc:
        "ไฟล์เสียงไม่ถูกเก็บถาวรในระบบ และไฟล์สรุปประชุมจะถูกลบออกจาก server ภายใน 48 ชั่วโมง ข้อมูลถูกเก็บบน Google Cloud พร้อมการเข้ารหัส",
      section5Title: "5. สิทธิ์ของคุณ",
      section5Desc:
        "คุณมีสิทธิ์เข้าถึง แก้ไข หรือลบข้อมูลส่วนบุคคลของคุณได้ตลอดเวลา ผ่านการตั้งค่าบัญชีหรือติดต่อทีมงานของเรา",
      section6Title: "6. การเข้าถึงข้อมูลจาก Google (Google API)",
      section6Desc:
        "เมื่อคุณเลือกเชื่อมต่อบัญชี Google กับ PERPOS เราจะขอสิทธิ์เข้าถึงข้อมูล Google ของคุณเฉพาะเท่าที่จำเป็นต่อฟังก์ชันที่คุณใช้ ดังนี้ — (1) Google Drive (ขอบเขต drive.file): เราสร้างโฟลเดอร์ชื่อ “Perpos Assistant” ในไดรฟ์ของคุณ และอัปโหลดเฉพาะไฟล์ที่ระบบ PERPOS สร้างขึ้นเอง เช่น รายงานสรุปการประชุม (PDF) และไฟล์เอกสารที่คุณสั่งให้บันทึก เราเข้าถึงได้เฉพาะไฟล์ที่ PERPOS สร้างหรือเปิดผ่านแอปเท่านั้น ไม่สามารถอ่าน แก้ไข หรือลบไฟล์อื่นในไดรฟ์ของคุณ (2) Google Calendar (ขอบเขต calendar.events): เราอ่านรายการนัดหมายในปฏิทินหลัก (primary) ของคุณ เช่น หัวข้อ เวลาเริ่ม-สิ้นสุด สถานที่ คำอธิบาย และลิงก์ประชุมออนไลน์ เพื่อแจ้งเตือนและนัดหมายให้ระบบเข้าร่วม/ถอดเสียงการประชุม และสร้าง แก้ไข หรือลบเฉพาะรายการนัดหมายที่เกี่ยวข้องกับงานที่คุณสั่งเท่านั้น. เราจัดเก็บ access token และ refresh token ของ Google แบบเข้ารหัสบนเซิร์ฟเวอร์ เพื่อเรียกใช้ API ตามคำสั่งของคุณเท่านั้น ข้อมูล Google ของคุณจะไม่ถูกขาย ไม่ถูกแชร์กับบุคคลที่สาม และไม่ถูกนำไปฝึกหรือปรับปรุงโมเดล AI ใด ๆ คุณสามารถยกเลิกการเชื่อมต่อได้ทุกเมื่อผ่านการตั้งค่าในแอป PERPOS หรือที่ https://myaccount.google.com/permissions ซึ่งจะลบ token ที่เราจัดเก็บไว้ทันที. การใช้งานและการถ่ายโอนข้อมูลที่ได้รับจาก Google API ของ PERPOS เป็นไปตาม Google API Services User Data Policy รวมถึงข้อกำหนด Limited Use",
      section7Title: "7. ข้อมูล Google กับ AI/ML (Limited Use)",
      section7Desc:
        "PERPOS ไม่ใช้ ไม่ถ่ายโอน และไม่ขายข้อมูลผู้ใช้ Google เพื่อสร้าง ฝึก (train) หรือปรับปรุงโมเดล AI/ML ใด ๆ ไม่ว่าจะเป็นข้อมูลดิบ ข้อมูลรวม (aggregated) ข้อมูลที่ไม่ระบุตัวตน (anonymized) หรือข้อมูลที่ประมวลผลต่อ (derived) — และไม่ส่งข้อมูลผู้ใช้ Google ไปยังผู้ให้บริการ AI บุคคลที่สามใด ๆ ทั้งสิ้น. โดยการออกแบบระบบ: (ก) ขอบเขต Drive ที่เราใช้คือ drive.file ซึ่งใช้ “เขียน” ไฟล์ที่ระบบสร้างเองเท่านั้น เราไม่ได้อ่านเนื้อหาไฟล์ในไดรฟ์ของคุณ จึงไม่มีเนื้อหาจากไดรฟ์ไหลเข้าสู่ AI ได้เลย (ข) ข้อมูลปฏิทินถูกใช้เพื่อแจ้งเตือนและกำหนดเวลาภายในระบบของเราเท่านั้น และ “ไม่เคย” ถูกใส่ลงในคำสั่ง (prompt) ที่ส่งให้โมเดล AI — คำสั่งที่ส่งให้โมเดลเป็นข้อความคงที่ (static) ไม่มีการแทรกข้อมูลจาก Google (ค) ฟีเจอร์ AI ของเราประมวลผลเฉพาะเนื้อหาที่คุณส่งเข้ามาเองโดยตรง เช่น ไฟล์เสียงการประชุมและเอกสารที่คุณอัปโหลด ซึ่งไม่ใช่ข้อมูลที่ได้จาก Google Workspace API. เราใช้ Gemini API แบบ paid tier ซึ่งผู้ให้บริการไม่นำข้อมูลไปฝึกโมเดล และสำหรับฟีเจอร์บันทึกการประชุม เราส่งให้ผู้ให้บริการบันทึกการประชุม (Recall.ai) เพียง “ลิงก์ห้องประชุมและชื่อบอท” เท่านั้น ไม่ส่งหัวข้อ รายละเอียด หรือรายชื่อผู้เข้าร่วมจากปฏิทิน. การใช้งานและการถ่ายโอนข้อมูลที่ได้รับจาก Google API เป็นไปตาม Google API Services User Data Policy และ Google Workspace API User Data and Developer Policy รวมถึงข้อกำหนด Limited Use",
      section8Title: "8. มาตรการปกป้องข้อมูลและความปลอดภัย",
      section8Desc:
        "เราใช้มาตรการเชิงเทคนิคและเชิงองค์กรเพื่อปกป้องข้อมูลของคุณ โดยเฉพาะข้อมูลอ่อนไหว (sensitive data) เช่น โทเคนการเข้าถึงบัญชี Google เนื้อหาการประชุม และเอกสารทางการเงิน ดังนี้ — (1) การเข้ารหัสระหว่างรับส่ง: การรับส่งข้อมูลทั้งหมดระหว่างเบราว์เซอร์ เซิร์ฟเวอร์ และ API ภายนอก ใช้ HTTPS/TLS เท่านั้น (2) การเข้ารหัสขณะจัดเก็บ: ฐานข้อมูลและที่เก็บไฟล์ของเราเข้ารหัสข้อมูลขณะพัก (encryption at rest) (3) การควบคุมการเข้าถึง: ตารางที่เก็บโทเคน Google ตั้งค่า Row Level Security แบบปฏิเสธทั้งหมด (deny-all) และเพิกถอนสิทธิ์จากบทบาทผู้ใช้ทั่วไปทั้งหมด เข้าถึงได้เฉพาะกระบวนการฝั่งเซิร์ฟเวอร์ที่ใช้สิทธิ์ service role เท่านั้น ไม่มีการส่งโทเคนออกไปฝั่งเบราว์เซอร์ (4) การแยกข้อมูลรายผู้ใช้และองค์กร: ข้อมูลถูกกั้นด้วย Row Level Security ตามเจ้าของข้อมูลและองค์กร (5) การจัดการความลับ: กุญแจและ API key เก็บใน secret manager ของผู้ให้บริการคลาวด์ ไม่เก็บไว้ในซอร์สโค้ด และบริการภายในตรวจสอบสิทธิ์กันด้วย shared secret (6) การจำกัดระยะเวลาเก็บ: ไฟล์เสียงดิบถูกลบเมื่อประมวลผลเสร็จ ส่วนไฟล์สรุปการประชุมและข้อความถอดเสียงถูกลบภายใน 48 ชั่วโมง (7) การเพิกถอน: เมื่อคุณยกเลิกการเชื่อมต่อ Google โทเคนที่จัดเก็บไว้จะถูกลบทันที (8) หลักสิทธิ์เท่าที่จำเป็น: เราขอเฉพาะขอบเขต (scope) ที่จำเป็นต่อฟังก์ชันที่คุณใช้ และจำกัดการเข้าถึงข้อมูลของทีมงานเท่าที่จำเป็นต่อการให้บริการและแก้ปัญหา",
      section9Title: "9. ติดต่อเรา",
      section9Desc: "หากมีคำถามเกี่ยวกับนโยบายความเป็นส่วนตัวนี้ ติดต่อเราได้ที่",
      signupCta: "เริ่มใช้งาน PERPOS",
    },
    termsPage: {
      title: "เงื่อนไขการใช้งาน",
      lastUpdated: "อัปเดตล่าสุด: มกราคม 2568",
      section1Title: "1. การยอมรับเงื่อนไข",
      section1Desc:
        "การเข้าใช้งาน PERPOS Flow หรือ Suite ถือว่าคุณยอมรับเงื่อนไขการใช้งานนี้ หากคุณไม่เห็นด้วยกับเงื่อนไขใด กรุณาหยุดใช้งานระบบ",
      section2Title: "2. บริการ",
      section2Desc:
        "PERPOS ให้บริการผู้ช่วย AI บน LINE (Flow) และระบบ ERP สำหรับองค์กร (Suite) โดยมีสิทธิ์เปลี่ยนแปลงหรือยกเลิกบริการได้ตามความเหมาะสม",
      section3Title: "3. บัญชีผู้ใช้",
      section3Desc:
        "คุณรับผิดชอบในการรักษาความลับของบัญชี และยอมรับว่าคุณเป็นผู้รับผิดชอบต่อกิจกรรมทั้งหมดที่เกิดขึ้นภายใต้บัญชีของคุณ",
      section4Title: "4. ข้อมูลของคุณ",
      section4Desc:
        "คุณคงเป็นเจ้าของข้อมูลที่คุณป้อนเข้าสู่ระบบ PERPOS เราจะไม่ใช้ข้อมูลของคุณโดยไม่ได้รับความยินยอม",
      section5Title: "5. การชำระเงิน",
      section5Desc:
        "Flow คิดค่าบริการแบบ token เติมเท่าที่ใช้ ส่วน Suite เป็น subscription ตามขอบเขตที่ตกลง คุณสามารถยกเลิกได้ตามเงื่อนไขของแต่ละบริการ",
      section6Title: "6. ข้อจำกัดความรับผิด",
      section6Desc:
        "PERPOS ไม่รับผิดต่อความเสียหายใดที่เกิดจากการใช้งานระบบ และไม่รับประกันว่าระบบจะทำงานได้ตลอดเวลาหรือปราศจากข้อผิดพลาด",
      section7Title: "7. ติดต่อเรา",
      section7Desc: "หากมีคำถามเกี่ยวกับเงื่อนไขการใช้งานนี้ ติดต่อเราได้ที่",
      signupCta: "เริ่มใช้งาน PERPOS",
    },
  },
  en: {
    privacyPage: {
      title: "Privacy Policy",
      lastUpdated: "Last updated: July 2026",
      section1Title: "1. Information We Collect",
      section1Desc:
        "PERPOS collects information necessary to deliver both Flow (the LINE AI assistant) and Suite (organization ERP), including user data, organization details, and files you send into the system.",
      section2Title: "2. How We Use Information",
      section2Desc:
        "We use your information only to process the work you request and to improve our services. Customer files and audio are never used to train AI models.",
      section3Title: "3. Sharing Information",
      section3Desc:
        "We do not sell or share your personal data with third parties without your consent, except as required by law.",
      section4Title: "4. File Retention & Deletion",
      section4Desc:
        "Audio files are not stored permanently, and meeting-summary files are deleted from the server within 48 hours. Data is stored on Google Cloud with encryption.",
      section5Title: "5. Your Rights",
      section5Desc:
        "You have the right to access, edit, or delete your personal data at any time through account settings or by contacting our team.",
      section6Title: "6. Google User Data (Google API Access)",
      section6Desc:
        "When you choose to connect your Google account to PERPOS, we request access only to the specific Google data required for the features you use: (1) Google Drive (drive.file scope): we create a folder named “Perpos Assistant” in your Drive and upload only files that PERPOS itself generates, such as meeting-summary reports (PDF) and documents you ask us to save. We can access only the files PERPOS created or opened through the app — we cannot read, modify, or delete any other files in your Drive. (2) Google Calendar (calendar.events scope): we read events on your primary calendar (such as title, start/end time, location, description, and online-meeting links) to send reminders and to schedule the assistant to join or transcribe meetings, and we create, update, or delete only the calendar events related to tasks you request. We store your Google access and refresh tokens in encrypted form on our servers solely to call these APIs on your behalf. Your Google data is never sold, never shared with third parties, and never used to train or improve any AI models. You can disconnect at any time from your PERPOS app settings or at https://myaccount.google.com/permissions, which immediately deletes the tokens we hold. PERPOS's use and transfer of information received from Google APIs adheres to the Google API Services User Data Policy, including the Limited Use requirements.",
      section7Title: "7. Google User Data and AI/ML (Limited Use)",
      section7Desc:
        "PERPOS does not use, transfer, or sell Google user data to create, train, or improve any foundational or generalized machine learning or artificial intelligence models. This applies to raw, aggregated, anonymized, and derived data alike, and we do not transfer Google user data to any third-party AI service. This is enforced by design: (a) the only Drive scope we request is drive.file, which we use solely to write files our system generates — we never read the contents of your Drive files, so no Drive content can reach an AI model; (b) Google Calendar data is used only for reminders and scheduling inside our own infrastructure and is never included in any prompt sent to an AI model — the prompt we send is a fixed, static instruction with no Google data interpolated into it; (c) our AI features process only content you submit directly, such as meeting audio you record or upload and documents you upload, which is not data obtained from Google Workspace APIs. We use the Gemini API on a paid tier, under which the provider does not use submitted data to train its models. For the meeting-recording feature, the only information sent to our meeting-recording provider (Recall.ai) is the meeting link and the bot's display name — never the event title, description, or attendee list from your calendar. Our use and transfer of information received from Google APIs adheres to the Google API Services User Data Policy and the Google Workspace API User Data and Developer Policy, including the Limited Use requirements.",
      section8Title: "8. Data Protection and Security Measures",
      section8Desc:
        "We apply technical and organizational measures to protect your data, and in particular sensitive data such as Google account tokens, meeting content, and financial documents: (1) Encryption in transit — all traffic between browsers, our servers, and external APIs uses HTTPS/TLS only. (2) Encryption at rest — our database and file storage encrypt data at rest. (3) Access control — the table holding Google tokens has Row Level Security with a deny-all policy and all privileges revoked from ordinary user roles; it is reachable only by server-side processes using a service-role credential, and tokens are never exposed to the browser. (4) Tenant isolation — data is partitioned by owner and organization through Row Level Security. (5) Secrets management — keys and API credentials are held in our cloud provider's secret manager rather than in source code, and internal services authenticate to each other with a shared secret. (6) Retention limits — raw audio is deleted once processing completes, and meeting-summary files and transcripts are deleted within 48 hours. (7) Revocation — disconnecting your Google account immediately deletes the stored tokens. (8) Least privilege — we request only the scopes required for the features you use, and staff access to data is limited to what is necessary to operate the service and resolve issues.",
      section9Title: "9. Contact Us",
      section9Desc: "If you have any questions about this Privacy Policy, contact us at",
      signupCta: "Get started with PERPOS",
    },
    termsPage: {
      title: "Terms of Service",
      lastUpdated: "Last updated: January 2025",
      section1Title: "1. Acceptance of Terms",
      section1Desc:
        "By using PERPOS Flow or Suite, you agree to these terms of service. If you do not agree to any of these terms, please stop using the system.",
      section2Title: "2. Services",
      section2Desc:
        "PERPOS provides a LINE AI assistant (Flow) and an organization ERP (Suite). We reserve the right to change or discontinue services as appropriate.",
      section3Title: "3. User Accounts",
      section3Desc:
        "You are responsible for maintaining the confidentiality of your account and accept responsibility for all activities under it.",
      section4Title: "4. Your Data",
      section4Desc:
        "You retain ownership of all data you input into PERPOS. We will not use your data without your consent.",
      section5Title: "5. Payment",
      section5Desc:
        "Flow is billed via pay-as-you-go tokens; Suite is a subscription scoped to your agreement. You may cancel under each service's terms.",
      section6Title: "6. Limitation of Liability",
      section6Desc:
        "PERPOS is not liable for any damages resulting from use of the system and does not guarantee uninterrupted or error-free operation.",
      section7Title: "7. Contact Us",
      section7Desc: "If you have any questions about these Terms of Service, contact us at",
      signupCta: "Get started with PERPOS",
    },
  },
} as const;

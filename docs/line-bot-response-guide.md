# คัมภีร์การสร้าง LINE Bot Response สำหรับระบบ PERPOS
**ฉบับกำหนดให้ใช้ LINE Flex Card เป็นค่าเริ่มต้น (Default to Flex Card)**

---

## 🌟 วิสัยทัศน์ (Vision)
เพื่อมอบประสบการณ์ใช้งานระดับพรีเมียม (WOW Experience) ให้แก่ผู้ใช้งาน SME ในประเทศไทย ทุก ๆ ข้อความตอบกลับหลัก (Main Response) จาก LINE Bot ในระบบ PERPOS **ต้องกำหนดค่าเริ่มต้นการแสดงผลเป็น Flex Card เสมอ** หลีกเลี่ยงการใช้ข้อความธรรมดา (Plain Text) ยกเว้นในกรณีที่เป็นการแจ้งเตือนสั้น ๆ ข้อผิดพลาดระบบ หรือ System warning

---

## 🚫 กฎเหล็กในการออกแบบ Flex Card (Critical Rules)

### 1. ห้ามใช้ `align: "center"` บน `box` component เด็ดขาด!
- ❌ **ผิด (LINE API ปฏิเสธข้อความทันที/บอทจะเงียบ)**:
  ```json
  { "type": "box", "layout": "horizontal", "align": "center" }
  ```
- 🟢 **ถูก (จัดตำแหน่งกลางแนวแกนตั้งในแนวดิ่ง)**:
  ```json
  { "type": "box", "layout": "horizontal", "alignItems": "center" }
  ```
- 🟢 **ถูก (จัดตำแหน่งกลางแนวแกนนอน)**:
  ```json
  { "type": "box", "layout": "horizontal", "justifyContent": "center" }
  ```
- *หมายเหตุ: คุณสมบัติ `align` สามารถใช้ได้บน component ลูก เช่น `text`, `icon`, `image` เท่านั้น ห้ามใช้บน `box`*

### 2. ต้องกำหนด `altText` ที่มีความหมายเสมอ
- ทุกการส่ง Flex Card ต้องกำหนด `altText` ให้ชัดเจนเพื่อให้ผู้ใช้เข้าใจได้ทันทีเมื่อมีข้อความแจ้งเตือน (Notification) เด้งบนหน้าจอมือถือ (เช่น `altText: "ข้อมูลสินค้า JQ-101"` แทนคำว่า `"Flex Card"`)

### 3. ต้องใช้ `wrap: true` บน `text` component ที่มีความยาว
- หากข้อความรายละเอียด (เช่น Description หรือ Note) มีความยาว ต้องใส่ `"wrap": true` เสมอ เพื่อป้องกันไม่ให้ข้อความถูกตัดตัวอักษรล้นเฟรม

### 4. การจับคู่คู่สีพรีเมียม (Curated Color Palettes)
เลือกใช้โทนสีที่หรูหรา สบายตา และสื่อสารถึงสถานะได้อย่างถูกต้อง:
- 🔵 **Theme Slate/Navy (ข้อมูลทั่วไป)**: Header `#1E293B` to `#334155`
- 🟢 **Success / In Stock (สถานะปกติ)**: `#059669` (Emerald 600)
- ⚠️ **Warning / Low Stock (เฝ้าระวัง)**: `#D97706` (Amber 600)
- 🔴 **Danger / Out of Stock (สินค้าหมด/ค้างส่ง)**: `#DC2626` (Red 600)

---

## 🛠️ แม่แบบโครงสร้าง Flex Card มาตรฐาน (JSON Templates)

### 1. โครงสร้างข้อมูลเดี่ยว (Single Bubble Template)
ใช้สำหรับตอบกลับข้อมูลเฉพาะ เช่น รายละเอียดสินค้า 1 รายการ, สรุปใบเสนอราคา, หรือสถานะงาน

```typescript
{
  type: 'flex',
  altText: 'ข้อมูลสินค้า [Item Code]',
  contents: {
    type: 'bubble',
    header: {
      type: 'box',
      layout: 'vertical',
      paddingAll: '16px',
      background: {
        type: 'linearGradient',
        angle: '135deg',
        startColor: '#1E293B',
        endColor: '#334155'
      },
      contents: [
        { type: 'text', text: '📦 ข้อมูลสินค้า / STOCK', weight: 'bold', color: '#94A3B8', size: 'xs' },
        { type: 'text', text: 'ITEM-CODE-999', weight: 'bold', size: 'xl', color: '#FFFFFF', margin: 'xs', wrap: true }
      ]
    },
    body: {
      type: 'box',
      layout: 'vertical',
      paddingAll: '16px',
      spacing: 'md',
      contents: [
        {
          type: 'box',
          layout: 'vertical',
          spacing: 'xs',
          contents: [
            { type: 'text', text: 'รายละเอียด', size: 'xs', color: '#64748B' },
            { type: 'text', text: 'รายละเอียดสินค้าตรงนี้...', size: 'sm', color: '#1E293B', wrap: true }
          ]
        },
        { type: 'separator' },
        {
          type: 'box',
          layout: 'horizontal',
          contents: [
            { type: 'text', text: '📍 ที่เก็บสินค้า', size: 'sm', color: '#64748B', flex: 2 },
            { type: 'text', text: 'คลังสินค้า A', size: 'sm', color: '#1E293B', weight: 'bold', flex: 3, align: 'end', wrap: true }
          ]
        },
        { type: 'separator' },
        {
          type: 'box',
          layout: 'horizontal',
          alignItems: 'center', // ใช้ alignItems แทน align
          contents: [
            { type: 'text', text: '🟢 สถานะสต๊อก', size: 'sm', color: '#64748B', flex: 2 },
            { type: 'text', text: '100 ชิ้น', size: 'lg', color: '#059669', weight: 'bold', flex: 3, align: 'end' }
          ]
        }
      ]
    }
  }
}
```

### 2. โครงสร้างรายการข้อมูลแบบ Carousel (Carousel Template)
ใช้เมื่อผลการค้นพบมีหลายรายการ เช่น ค้นพบสินค้า 2-5 รายการที่ใกล้เคียงกัน หรือต้องการนำเสนอเมนูทางเลือกแบบ Flex Card หลายๆ ใบต่อกันในแนวนอน

```typescript
{
  type: 'flex',
  altText: 'รายการสินค้าที่ค้นพบ',
  contents: {
    type: 'carousel',
    contents: [
      // Bubble ใบที่ 1
      {
        type: 'bubble',
        size: 'micro', // ขนาดกะทัดรัดสำหรับ Carousel
        header: {
          type: 'box',
          layout: 'vertical',
          backgroundColor: '#1E293B',
          paddingAll: '12px',
          contents: [
            { type: 'text', text: 'ITEM-01', weight: 'bold', color: '#FFFFFF', size: 'sm' }
          ]
        },
        body: {
          type: 'box',
          layout: 'vertical',
          paddingAll: '12px',
          spacing: 'sm',
          contents: [
            { type: 'text', text: 'คำอธิบายสินค้าแบบย่อ...', size: 'xs', color: '#6B7280', wrap: true },
            {
              type: 'box',
              layout: 'horizontal',
              contents: [
                { type: 'text', text: 'คงเหลือ:', size: 'xs', color: '#9CA3AF' },
                { type: 'text', text: '12 ชิ้น', size: 'xs', color: '#059669', weight: 'bold', align: 'end' }
              ]
            }
          ]
        }
      }
      // เพิ่ม Bubble ใบถัด ๆ ไปใน Array นี้...
    ]
  }
}
```

---

## 🔍 ขั้นตอนการพัฒนาและการตรวจสอบ (Verification Workflow)

1. **ออกแบบโครงสร้างด้วย Simulator ก่อนเสมอ**:
   - นำรูปแบบ JSON ไปจำลองหน้าจอและตรวจสอบความเข้ากันได้ที่ [LINE Flex Message Simulator](https://developers.line.biz/flex-simulator/)
2. **ดักจับ Error การยิง API**:
   - ในการพัฒนา ฟังก์ชันส่งข้อความของบอทควรตรวจสอบผลตอบรับจาก LINE API เสมอ:
   ```typescript
   const res = await fetch('https://api.line.me/v2/bot/message/reply', { ... });
   if (!res.ok) {
     const errorDetail = await res.text();
     console.error('LINE Reply API Error:', errorDetail);
     // ช่วยให้ตรวจจับปัญหา JSON schema ผิดได้ทันทีใน log
   }
   ```

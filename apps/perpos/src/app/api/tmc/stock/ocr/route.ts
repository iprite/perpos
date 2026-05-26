import { NextRequest, NextResponse } from 'next/server';
import { requireTmcMember } from '../../_lib';

type OcrItem = { name: string; unit: string; qty: number; unitCost: number };

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as Record<string, string>;
  const { orgId, imageBase64, mimeType } = body;

  if (!orgId || !imageBase64) {
    return NextResponse.json({ error: 'missing orgId or imageBase64' }, { status: 400 });
  }

  const auth = await requireTmcMember(req, orgId);
  if (!auth.ok) return auth.res;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'OCR ไม่พร้อมใช้งาน (ไม่มี OPENAI_API_KEY)' }, { status: 503 });
  }

  const model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
  const imgMime = mimeType ?? 'image/jpeg';

  const prompt = `You are a Thai receipt OCR assistant. Extract all line items from this purchase receipt/bill.
Return ONLY valid JSON (no markdown, no explanation) in this exact format:
{
  "items": [
    { "name": "product name in Thai", "unit": "unit (ชิ้น/แพ็ค/ขวด/กก etc)", "qty": number, "unitCost": number }
  ],
  "note": "vendor name or bill note if visible (optional)"
}
Rules:
- If a line has total price but no unit price, divide by qty to get unitCost
- Use Thai product names as shown on the receipt
- Default unit to "ชิ้น" if not specified
- qty and unitCost must be positive numbers
- Omit items with 0 quantity or price`;

  const ocrRes = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      max_tokens: 1500,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: `data:${imgMime};base64,${imageBase64}`, detail: 'high' } },
        ],
      }],
    }),
  });

  if (!ocrRes.ok) {
    const err = await ocrRes.text();
    return NextResponse.json({ error: `OpenAI error: ${err.slice(0, 200)}` }, { status: 502 });
  }

  const ocrJson = await ocrRes.json() as { choices: { message: { content: string } }[] };
  const content = ocrJson.choices?.[0]?.message?.content ?? '';

  // strip markdown code fences if present
  const cleaned = content.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();

  let parsed: { items: OcrItem[]; note?: string };
  try {
    parsed = JSON.parse(cleaned) as { items: OcrItem[]; note?: string };
  } catch {
    return NextResponse.json({ error: 'ไม่สามารถอ่านบิลได้ กรุณาลองใหม่', raw: content }, { status: 422 });
  }

  return NextResponse.json({ items: parsed.items ?? [], note: parsed.note ?? '' });
}

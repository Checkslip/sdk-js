# @checkslip/sdk

[English](./README.md)

ไลบรารี JavaScript และ TypeScript ทางการสำหรับเรียก [Checkslip API](https://checkslip.com/docs)

Checkslip ถามธนาคารผู้โอนว่ามีรายการโอนตามสลิปหรือไม่ คุณส่งข้อความใน QR บนสลิป หรือส่งรูปสลิปมา แล้ว Checkslip ส่งข้อมูลที่ธนาคารมีกลับไป ได้แก่ ยอดเงิน เวลา ผู้โอน และผู้รับ ส่วนการตัดสินใจว่าจะรับเงินหรือไม่ เป็นของคุณ โดยเทียบกับออเดอร์ของคุณเอง

ใช้ได้บน Node.js 22 ขึ้นไป, Bun, Deno, Cloudflare Workers, Vercel Edge และ runtime อื่นที่มี `fetch` ไม่มี dependency ตอน runtime มีทั้ง ESM, CommonJS และ type ของ TypeScript

## ติดตั้ง

```sh
npm install @checkslip/sdk
# หรือ
bun add @checkslip/sdk
pnpm add @checkslip/sdk
yarn add @checkslip/sdk
```

Deno:

```ts
import { Checkslip } from "npm:@checkslip/sdk";
```

## เริ่มใช้งาน

ออก API key ในหน้า dashboard ของ Checkslip แล้วเก็บไว้ฝั่งเซิร์ฟเวอร์ ถ้าไม่ส่ง `apiKey` ไลบรารีจะอ่านจาก environment variable `CHECKSLIP_API_KEY`

```ts
import { Checkslip } from "@checkslip/sdk";

const checkslip = new Checkslip({ apiKey: process.env.CHECKSLIP_API_KEY });
```

### ตรวจสอบด้วยข้อความใน QR

อ่าน QR บนสลิปด้วยตัวอ่าน QR ตัวไหนก็ได้ แล้วส่งข้อความนั้นมา

```ts
const check = await checkslip.slips.lookup({
  qr: "00330006000001010306902126302105340875102TH9104F86F",
  client_reference: "ORDER-10023", // ไม่บังคับ ใส่เลขออเดอร์ของคุณเอง
});

if (check.outcome === "FOUND" && "sender" in check.slip) {
  console.log(check.slip.amount.satang / 100, "บาท");
  console.log("จาก", check.slip.sender.name_th, "ธนาคาร", check.slip.sender.bank.code);
  console.log("ถึง", check.slip.receiver.name_th, check.slip.receiver.account);
}
```

ยอดเงินเป็นหน่วยสตางค์ (100 สตางค์ = 1 บาท) เลขบัญชีส่งกลับมาเฉพาะ 4 หลักท้าย

### ตรวจสอบด้วยรูปสลิป

ส่งเป็น `Blob`, `File`, `Uint8Array`, `Buffer` ของ Node หรือ `ArrayBuffer` ก็ได้ รับ JPEG, PNG และ WebP ขนาดไม่เกิน 10 MB Checkslip อ่าน QR จากรูปให้ และไม่เก็บรูปไว้

```ts
import { readFile } from "node:fs/promises";

const check = await checkslip.slips.lookup({ image: await readFile("slip.jpg") });
```

รับรูปจากฟอร์มใน route handler:

```ts
const form = await request.formData();
const check = await checkslip.slips.lookup({ image: form.get("slip") as File });
```

### ผลที่ได้ (outcome)

| outcome     | ความหมาย                                                                                                  | เครดิตที่ใช้ |
| ----------- | --------------------------------------------------------------------------------------------------------- | -------- |
| `FOUND`     | ธนาคารคืนข้อมูลรายการโอนมา ดูรายละเอียดใน `slip`                                                               | 1        |
| `NOT_FOUND` | ธนาคารไม่มีรายการตามเลขอ้างอิงนี้                                                                               | 0        |
| `DUPLICATE` | บัญชีนี้เคยดึงรายการนี้แล้ว `duplicate_of` ชี้ไปที่ครั้งก่อน                                                             | 0        |
| `PENDING`   | ธนาคารยังไม่ตอบ ระบบลองใหม่ให้ แล้วส่ง webhook `slip.checked` เมื่อได้ผล หรือเรียก `slips.get(request_id)` ภายหลังก็ได้ | 0        |

ทั้งสี่แบบเป็นผลปกติ ไลบรารีจึงคืนค่ากลับมาโดยไม่ throw ส่วนกรณีที่คำขอมีปัญหา เช่น อ่าน QR ไม่ได้ จะ throw เป็น error (ดูหัวข้อถัดไป) รายการผลทั้งหมดอยู่ที่ [checkslip.com/docs/outcomes](https://checkslip.com/docs/outcomes)

## Error

error ทุกตัวที่ไลบรารี throw สืบทอดจาก `CheckslipError` ถ้าเป็น error จาก API จะมีค่าเหล่านี้

- `status`: HTTP status
- `code`: ค่า `code` ใน problem body เช่น `NO_CREDIT` หรือ `INVALID_QR`
- `requestId`: ค่า header `X-Request-Id` แนบค่านี้มาเมื่อติดต่อทีมงาน
- `problem`: problem body ตาม [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457) ทั้งก้อน

```ts
import {
  CheckslipError,
  InsufficientCreditError,
  RateLimitError,
  UnprocessableEntityError,
} from "@checkslip/sdk";

try {
  await checkslip.slips.lookup({ qr });
} catch (err) {
  if (err instanceof UnprocessableEntityError && err.code === "INVALID_QR") {
    // ข้อความนี้ไม่ใช่ QR ของสลิป ขอรูปใหม่จากลูกค้า
  } else if (err instanceof InsufficientCreditError) {
    // เติมเครดิต
  } else if (err instanceof RateLimitError) {
    console.log(`ลองใหม่ใน ${err.retryAfter} วินาที`);
  } else if (err instanceof CheckslipError) {
    console.error(err.status, err.code, err.requestId, err.message);
  }
  throw err;
}
```

| คลาส                       | เมื่อไร                                                          |
| -------------------------- | -------------------------------------------------------------- |
| `BadRequestError`          | 400                                                            |
| `AuthenticationError`      | 401 ไม่มี API key, key ผิด หรือถูกยกเลิกแล้ว                          |
| `InsufficientCreditError`  | 402 `NO_CREDIT` หรือ `CREDIT_EXPIRED`                           |
| `PermissionDeniedError`    | 403 key ไม่มีสิทธิ์ที่คำขอนี้ต้องใช้                                      |
| `NotFoundError`            | 404                                                            |
| `ConflictError`            | 409                                                            |
| `GoneError`                | 410 ของหายไปแล้วถาวร เช่น export ที่หมดอายุ                         |
| `UnprocessableEntityError` | 422 เช่น `INVALID_QR`, `QR_TAMPERED`, `TOO_OLD`, `INVALID_FILE` |
| `RateLimitError`           | 429 มี `retryAfter` เป็นวินาที                                     |
| `ServerError`              | 5xx ที่ไม่ใช่ 503                                                  |
| `ServiceUnavailableError`  | 503 ระบบยังอยู่ แต่ตอบไม่ได้ชั่วคราว                                   |
| `ConnectionError`          | ไม่ได้รับคำตอบเลย (DNS, TLS, การเชื่อมต่อหลุด หรือเกิน `timeoutMs`)     |
| `UnexpectedResponseError`  | สถานะที่ไม่มีคลาสของตัวเอง เช่น 413 หรือ 415                          |
| `CheckslipError`           | status อื่น เช่น 413 หรือ 415                                      |

รหัส error ทั้งหมดและวิธีแก้: [checkslip.com/docs/errors](https://checkslip.com/docs/errors)

## การลองใหม่อัตโนมัติ

ไลบรารีลองใหม่เองได้สูงสุด `maxRetries` ครั้ง (ค่าเริ่มต้น 2) รอ 0.5 วินาที แล้ว 1 วินาที แล้ว 2 วินาที ไปเรื่อย ๆ โดยสุ่มเวลาเล็กน้อย สูงสุด 8 วินาที และลองใหม่เฉพาะกรณีที่ส่งซ้ำแล้วไม่มีอะไรเกิดซ้ำ

- 429 ทุกคำขอ ถ้ามี `Retry-After` จะรอตามนั้น ถ้า `Retry-After` เกิน 60 วินาที จะ throw `RateLimitError` แทนการรอ
- 409 `IDEMPOTENCY_IN_FLIGHT` แปลว่าคำขอแรกที่ใช้ Idempotency-Key เดียวกันยังทำงานอยู่
- 408, 5xx, เครือข่ายล่ม และ timeout เฉพาะคำขอ GET, PUT, DELETE และคำขอที่มี Idempotency-Key

ปิดการลองใหม่ด้วย `maxRetries: 0` ตั้งที่ client หรือเฉพาะคำขอเดียวก็ได้

## Idempotency-Key

`slips.lookup()` ส่ง header `Idempotency-Key` ทุกครั้ง ส่งซ้ำด้วย key เดิมจะได้ผลเดิม และไม่หักเครดิตซ้ำ ถ้าไม่ส่ง key มา ไลบรารีสุ่ม UUID ให้หนึ่งค่าต่อการเรียกหนึ่งครั้ง และใช้ค่าเดิมตอนลองใหม่

key ที่สุ่มให้กันซ้ำได้แค่การลองใหม่ภายในการเรียกครั้งนั้น ถ้าโปรเซสของคุณอาจล่มแล้วรันงานเดิมอีกรอบ ให้สร้าง key จากข้อมูลของคุณเอง รอบที่สองจะได้ผลของรอบแรก

```ts
await checkslip.slips.lookup({ qr }, { idempotencyKey: `order-${order.id}-slip-1` });
```

คำขอที่ API บังคับให้มี key (`webhooks.endpoints.rotateSecret`, `sendTest`, `recover`, `webhooks.deliveries.redeliver`, `audit.exports.create`) ได้ key สุ่มแบบเดียวกัน คำขออื่นส่ง `idempotencyKey` เองได้เช่นกัน

## การแบ่งหน้า

รายการทุกชุดมีเมธอดคู่กัน `listAll()` ไล่ทุกหน้าและคืนทีละรายการ โดยตาม `next_cursor` ให้เอง ส่วน `list()` คืนมาหน้าเดียว

```ts
for await (const record of checkslip.slips.listAll({ outcome: ["FOUND"], limit: 100 })) {
  console.log(record.request_id, record.slip?.trans_ref);
}
```

ถ้าต้องการทีละหน้า ให้ await `list()`:

```ts
let page = await checkslip.slips.list({ trans_ref: "630210534087" });
console.log(page.items);
while (page.hasNextPage()) {
  page = await page.getNextPage();
  console.log(page.items);
}
```

ถ้าจะทำต่อภายหลัง เก็บ `page.nextCursor` ไว้ แล้วส่งกลับมาเป็น `cursor`

## Webhook

เมื่อการตรวจสอบเสร็จ Checkslip ส่งข้อความ `slip.checked` ไปที่ endpoint ของคุณ รวมถึงรายการที่เคยเป็น `PENDING` ด้วย ข้อความมีลายเซ็นตามแบบ [Standard Webhooks](https://www.standardwebhooks.com) ตรวจลายเซ็นก่อนเชื่อข้อความทุกครั้ง

```ts
import { verifyWebhook, WebhookVerificationError } from "@checkslip/sdk";

export async function POST(request: Request) {
  const payload = await request.text(); // body ดิบ ก่อน parse JSON
  try {
    const event = await verifyWebhook({
      payload,
      headers: request.headers,
      secret: process.env.CHECKSLIP_WEBHOOK_SECRET!,
    });
    if (event.type === "slip.checked") {
      // event.data.request_id, event.data.outcome, event.data.client_reference
    }
    return new Response(null, { status: 204 });
  } catch (err) {
    if (err instanceof WebhookVerificationError) return new Response(null, { status: 400 });
    throw err;
  }
}
```

ถ้าใช้ Express ให้อ่าน body เป็น byte ดิบ และส่ง `req.headers` เข้าไปตรง ๆ

```ts
app.post("/checkslip/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  const event = await verifyWebhook({ payload: req.body, headers: req.headers, secret });
  // ...
  res.sendStatus(204);
});
```

`verifyWebhook` ปฏิเสธข้อความเมื่อ

- ไม่มี header `webhook-id`, `webhook-timestamp` หรือ `webhook-signature`
- `webhook-timestamp` ห่างจากนาฬิกาของคุณเกิน 5 นาที (เปลี่ยนได้ด้วย `toleranceSeconds`)
- ไม่มีลายเซ็น `v1` ตัวไหนตรงกับ secret

ถ้าระบบของคุณไม่ตอบ 2xx Checkslip จะส่งซ้ำ และทุกครั้งใช้ `webhook-id` เดิม เก็บ id ที่จัดการแล้วไว้ แล้วข้ามตัวที่ซ้ำ

หลังเปลี่ยน secret ตัวเดิมยังใช้ได้อีก 24 ชั่วโมง และทุกข้อความมีลายเซ็น 2 ชุด ระหว่างนั้นส่ง secret ทั้งสองตัว: `secret: [newSecret, oldSecret]`

ถ้าจะยิงคำขอทดสอบที่มีลายเซ็นเข้า handler ของคุณเอง ใช้ `signWebhook({ id, payload, secret })` ซึ่งคืน header ทั้งสามตัว ส่วน `checkslip.webhooks.endpoints.sendTest(endpointId)` สั่งให้ Checkslip ส่งข้อความ `webhook.test` ไปที่ endpoint นั้น

จัดการ endpoint:

```ts
const endpoint = await checkslip.webhooks.endpoints.create({
  url: "https://example.com/checkslip/webhook",
  event_types: ["slip.checked"],
});
// endpoint.secret แสดงในคำตอบนี้ครั้งเดียว เก็บไว้ทันที

for await (const delivery of checkslip.webhooks.deliveries.list({ status: "FAILED" })) {
  await checkslip.webhooks.deliveries.redeliver(delivery.id);
}
```

## คำขออื่น ๆ

```ts
await checkslip.billing.balance.get(); // เครดิตคงเหลือ และสถานะเครดิตใกล้หมด
await checkslip.usage.get({ from: "2026-11-01", to: "2026-11-30" });
await checkslip.banks.list(); // ธนาคารที่รองรับ
await checkslip.slips.get(requestId); // ผลตรวจสอบครั้งก่อน
await checkslip.slips.counts({ from, to, bucket: "DAY" });
await checkslip.slips.exports.create({ columns: ["request_id", "outcome", "slip.trans_ref"] });
await checkslip.audit.events.list(); // ประวัติการใช้งานบัญชี
await checkslip.audit.requests.list({ trans_ref }); // ประวัติคำขอ
await checkslip.audit.exports.create({ from_day, to_day });
```

`slips.exports.downloadPart()` และ `audit.exports.download()` คืน `Response` ดิบ จึง stream ไฟล์ได้โดยไม่ต้องโหลดทั้งไฟล์เข้าหน่วยความจำ

endpoint ทั้งหมดอยู่ใน API reference: [checkslip.com/docs/reference](https://checkslip.com/docs/reference)

## การตั้งค่า

```ts
const checkslip = new Checkslip({
  apiKey: "csk_...", // ค่าเริ่มต้น: process.env.CHECKSLIP_API_KEY
  baseUrl: "https://api.checkslip.com", // ค่าเริ่มต้น
  timeoutMs: 30_000, // ต่อหนึ่งครั้งที่ส่ง ค่าเริ่มต้น 30 วินาที
  maxRetries: 2, // ค่าเริ่มต้น 2
  fetch: customFetch, // ค่าเริ่มต้น: fetch ของ runtime
  defaultHeaders: { "X-My-App": "shop" }, // ส่งไปกับทุกคำขอ
});
```

ทุกเมธอดรับ `options` เป็นอาร์กิวเมนต์ตัวสุดท้าย ใช้กับคำขอนั้นคำขอเดียว

```ts
await checkslip.slips.lookup(
  { qr },
  {
    idempotencyKey: "order-42-slip-1",
    timeoutMs: 10_000,
    maxRetries: 0,
    signal: AbortSignal.timeout(15_000),
    headers: { "X-My-App": "shop" },
  },
);
```

### ใช้ในเบราว์เซอร์

ถ้าสร้าง client ในหน้าเว็บ constructor จะ throw เพราะใครเปิดหน้าเว็บก็อ่าน API key ได้ ให้เรียก Checkslip จากเซิร์ฟเวอร์ของคุณแทน ถ้าเข้าใจความเสี่ยงแล้ว (เช่น เครื่องมือภายในที่ใช้ key สิทธิ์จำกัด) ส่ง `dangerouslyAllowBrowser: true`

## TypeScript

type ของคำตอบและพารามิเตอร์สร้างจาก [OpenAPI](https://checkslip.com/docs/reference) และ export เป็นชื่อ เช่น `SlipCheck`, `SlipCheckRecord`, `WebhookEvent`, `Balance`, `Problem` ชื่อฟิลด์เป็น snake_case ตรงกับ JSON ที่ API ส่งมา type ดิบ `paths`, `components` และ `operations` ก็ export ไว้ด้วย

## ลิงก์

- เอกสาร: https://checkslip.com/docs
- API reference: https://checkslip.com/docs/reference
- รหัส error: https://checkslip.com/docs/errors
- บันทึกการเปลี่ยนแปลง: [CHANGELOG.md](./CHANGELOG.md)
- แจ้งปัญหาความปลอดภัย: [SECURITY.md](./SECURITY.md)

## สัญญาอนุญาต

MIT

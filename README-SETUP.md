# RecharGo — Cloudflare + Telegram (نسخة محدثة)

## التعديلات
- المبالغ المقترحة: 50 / 70 / 100 / 200 DH (ويمكن كتابة 20 يدوياً).
- عرض المبلغ الصافي قبل إرسال الطلب. Inwi: 20→16, 50→42, 100→85, 200→175، وما عدا ذلك -30%. البنك وCash Plus: 20→18, 50→45, 100→95, 200→190، وما عدا ذلك -5%.
- رفع صورة الوصل أو إدخال أكواد Inwi، ثم إرسال الطلب مباشرة إلى Telegram عبر Worker.

## GitHub
استبدل index.html و app.js و style.css بالنسخ الجديدة، وزد الملفات worker.js و wrangler.jsonc و .assetsignore في جذر المستودع. احتفظ بمجلد assets/ كما هو.

## Cloudflare Workers & Pages
- افتح المشروع rechargo. في Settings > Builds > Build configuration غيّر Deploy command إلى: `npx wrangler deploy`.
- Build command: فارغ / None. Root directory: `/`.
- ادفع الملفات الجديدة إلى فرع main، ثم انتظر النشر الأخضر.
- بعد النشر، Settings > Variables and Secrets:
  - `TELEGRAM_BOT_TOKEN` — نوع Secret، قيمته من BotFather (لا تنشرها في GitHub).
  - `TELEGRAM_CHAT_ID` — نوع Secret، قيمته رقم المحادثة مع البوت.
- احفظ القيم وأعد النشر إذا طلب Cloudflare ذلك.
- افتح موقعك وجرب طلب اختبار بمعلومات غير حقيقية، ثم تحقق من وصول إشعار Telegram.

## ملاحظات
- لا تحفظ الـ Bot Token في أي ملف من المستودع.
- رسالة Telegram تؤكد وصول الطلب، **لا تؤكد وصول الأموال أو شحن الحساب**.
- الرسائل وأكواد التعبئة وصور الوصولات بيانات حساسة؛ يجب تقليل الوصول إليها وتأمين حساب Telegram، والحصول على موافقة المستخدمين وتطبيق شروط الخدمة والقوانين ذات الصلة.
- يجب إضافة منع الرسائل الآلية (مثل Cloudflare Turnstile) وحدود طلبات مناسبة قبل إطلاق الموقع للجمهور.
- لا توجد قاعدة بيانات في هذه النسخة؛ Telegram هو وجهة الطلبات الوحيدة.
- الاستخدام المجاني ضمن حدود Cloudflare وTelegram وخاضع لشروطهما.

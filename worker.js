// RecharGo Cloudflare Worker — Telegram credentials belong only in Cloudflare Secrets.
const ALLOWED_PLATFORMS=new Set(['1XBET','BETWINNER','MELBET','MEGAPARI','MYSTAKE','GOOOBET','STAKE','LINEBET','1WIN']);
const ALLOWED_METHODS=new Set(['cih','attijari','cashplus','barid','boa','lbankalik','populaire','inwi']);
const METHOD_LABELS={cih:'CIH Bank',attijari:'Attijari Bank',cashplus:'Cash Plus',barid:'Al Barid Bank',boa:'Bank of Africa',lbankalik:'Lbankalik',populaire:'Banque Populaire',inwi:'Recharge Inwi'};
const INWI_SPECIAL={20:16,50:42,100:85,200:175};
const BANK_SPECIAL={20:18,50:45,100:95,200:190};
const DENOMINATIONS=[100,50,20,10];
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
function credited(sum,inwi){const table=inwi?INWI_SPECIAL:BANK_SPECIAL;return Object.prototype.hasOwnProperty.call(table,sum)?table[sum]:Math.round(sum*(inwi?.70:.95)*100)/100}
function expectedVoucherCount(sum){let count=0;for(const v of DENOMINATIONS){count+=Math.floor(sum/v);sum%=v}return sum===0?count:-1}
function clean(value){return String(value??'').replace(/[\r\n\t]/g,' ').trim()}
function money(n){return n.toFixed(2)+' MAD'}
async function telegramSend(env,endpoint,form){
 const response=await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${endpoint}`,{method:'POST',body:form,signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw new Error('Telegram delivery failed');
 const result=await response.json();if(!result.ok)throw new Error('Telegram rejected message');
}
export default {
 async fetch(request,env){
  const url=new URL(request.url);
  if(url.pathname!=='/api/orders')return env.ASSETS.fetch(request);
  if(request.method!=='POST')return json({ok:false,error:'طريقة الطلب غير مدعومة.'},405);
  const origin=request.headers.get('Origin');
  if(origin&&origin!==url.origin)return json({ok:false,error:'الطلب غير مسموح.'},403);
  if(!env.TELEGRAM_BOT_TOKEN||!env.TELEGRAM_CHAT_ID)return json({ok:false,error:'استقبال الطلبات غير مفعّل حالياً. تواصل مع الدعم.'},503);
  if(!(request.headers.get('Content-Type')||'').toLowerCase().startsWith('multipart/form-data'))return json({ok:false,error:'صيغة الطلب غير صحيحة.'},415);
  const length=Number(request.headers.get('Content-Length')||0);
  if(length>6*1024*1024)return json({ok:false,error:'حجم الملفات كبير بزاف (الحد 5MB للصورة).'},413);
  let form;
  try{form=await request.formData()}catch(_){return json({ok:false,error:'تعذر قراءة الطلب.'},400)}
  const platform=clean(form.get('platform'));
  const account=clean(form.get('account'));
  const method=clean(form.get('method'));
  const amountRaw=clean(form.get('amount'));
  const amount=Number(amountRaw);
  if(!ALLOWED_PLATFORMS.has(platform)||!ALLOWED_METHODS.has(method)||!account||account.length>64||!/^\d+$/.test(amountRaw)||!Number.isSafeInteger(amount)||amount<20||amount>2000||amount%10!==0){
   return json({ok:false,error:'معلومات الطلب غير صحيحة.'},400);
  }
  const inwi=method==='inwi';
  const net=credited(amount,inwi);
  const reference=crypto.randomUUID().slice(0,8).toUpperCase();
  const lines=[
   '🔔 طلب إيداع جديد — RecharGo',
   `المرجع: ${reference}`,
   `المنصة: ${platform}`,
   `ID الحساب: ${account}`,
   `طريقة الأداء: ${METHOD_LABELS[method]}`,
   `المبلغ المدفوع: ${money(amount)}`,
   `المبلغ المتوقع إضافته: ${money(net)}`,
   `الفرق: ${money(amount-net)}`,
   'الحالة: في انتظار مراجعة الأداء',
  ];
  const tgForm=new FormData();tgForm.set('chat_id',env.TELEGRAM_CHAT_ID);
  let endpoint;
  if(inwi){
   let vouchers;
   try{vouchers=JSON.parse(String(form.get('vouchers')||''))}catch(_){return json({ok:false,error:'أكواد التعبئة غير صحيحة.'},400)}
   if(!Array.isArray(vouchers)||vouchers.length!==expectedVoucherCount(amount)||vouchers.some(v=>typeof v!=='string'||!/^\d{16}$/.test(v))||new Set(vouchers).size!==vouchers.length){
    return json({ok:false,error:'تحقق من أكواد تعبئة Inwi.'},400);
   }
   lines.push('أكواد Inwi:');
   vouchers.forEach((code,i)=>lines.push(`${i+1}. ${code}`));
   tgForm.set('text',lines.join('\n'));
   // Telegram's copy_text inline buttons copy the full 16-digit code in one tap.
   // Keep the code visible in the message as a fallback for older clients.
   tgForm.set('reply_markup',JSON.stringify({
    inline_keyboard:vouchers.map((code,i)=>[{
     text:`📋 نسخ كود Inwi رقم ${i+1}`,
     copy_text:{text:code}
    }])
   }));
   endpoint='sendMessage';
  }else{
   const receipt=form.get('receipt');
   const allowed=['image/jpeg','image/png','image/webp','image/heic','image/heif'];
   if(!(receipt instanceof File)||!allowed.includes(receipt.type)||receipt.size<1||receipt.size>5*1024*1024){
    return json({ok:false,error:'رفع صورة وصل صحيحة بحجم أقل من 5MB.'},400);
   }
   tgForm.set('caption',lines.join('\n'));
   tgForm.set('document',receipt,receipt.name.slice(0,100)||'receipt.jpg');
   endpoint='sendDocument';
  }
  try{await telegramSend(env,endpoint,tgForm)}catch(_){return json({ok:false,error:'تعذر إرسال الطلب حالياً. تأكد من الاتصال أو تواصل مع الدعم.'},502)}
  return json({ok:true,reference});
 }
};

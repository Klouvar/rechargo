// RecharGo - Cloudflare Worker with durable anti-spam protection.
// Telegram credentials must remain in Cloudflare runtime variables/secrets.
const ALLOWED_PLATFORMS = new Set(['1XBET','BETWINNER','MELBET','MEGAPARI','MYSTAKE','GOOOBET','STAKE','LINEBET','1WIN']);
const ALLOWED_METHODS = new Set(['cih','attijari','cashplus','barid','boa','lbankalik','populaire','inwi']);
const METHOD_LABELS = {cih:'CIH Bank',attijari:'Attijari Bank',cashplus:'Cash Plus',barid:'Al Barid Bank',boa:'Bank of Africa',lbankalik:'Lbankalik',populaire:'Banque Populaire',inwi:'Recharge Inwi'};
const INWI_SPECIAL = {20:16,50:42,100:85,200:175};
const BANK_SPECIAL = {20:18,50:45,100:95,200:190};
const DENOMINATIONS = [100,50,20,10];
const WINDOW_MS = 30 * 60 * 1000;
const BAN_MS = 30 * 60 * 1000;
const MAX_ORDERS = 3;
const REPLAY_MS = 30 * 24 * 60 * 60 * 1000;
const PENDING_MS = 2 * 60 * 1000;

const json = (body,status=200,extra={}) => new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...extra}});
function credited(sum,inwi){const table=inwi?INWI_SPECIAL:BANK_SPECIAL;return Object.prototype.hasOwnProperty.call(table,sum)?table[sum]:Math.round(sum*(inwi?.70:.95)*100)/100}
function expectedVoucherCount(sum){let count=0;for(const v of DENOMINATIONS){count+=Math.floor(sum/v);sum%=v}return sum===0?count:-1}
function clean(value){return String(value??'').replace(/[\r\n\t]/g,' ').trim()}
function money(n){return n.toFixed(2)+' MAD'}
async function hashText(value){const bytes=new TextEncoder().encode(value);return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('')}
async function hashReceipt(file){const digest=await crypto.subtle.digest('SHA-256',await file.arrayBuffer());return 'receipt:'+Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('')}
async function telegramSend(env,endpoint,form){
 const response=await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${endpoint}`,{method:'POST',body:form,signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw new Error('Telegram delivery failed');
 const result=await response.json();if(!result.ok)throw new Error('Telegram rejected message');
}

// One Durable Object for the shop provides atomic checks across concurrent requests.
// Only SHA-256 fingerprints (not voucher codes, receipt bytes, or plain IPs) are stored.
export class RecharGoSpamGuard {
 constructor(ctx,env){this.ctx=ctx;this.env=env}
 async fetch(request){
  if(request.method!=='POST')return json({ok:false},405);
  let input;try{input=await request.json()}catch{return json({ok:false},400)}
  const now=Date.now();
  if(new URL(request.url).pathname==='/reserve'){
   const {ip,hashes}=input;
   if(typeof ip!=='string'||!/^[a-f0-9]{64}$/.test(ip)||!Array.isArray(hashes)||hashes.length<1||hashes.length>200||hashes.some(h=>typeof h!=='string'||!/^(voucher|receipt):[a-f0-9]{64}$/.test(h))||new Set(hashes).size!==hashes.length)return json({ok:false},400);
   const token=crypto.randomUUID();
   const decision=await this.ctx.storage.transaction(async txn=>{
    const ipKey='rate:'+ip;
    const record=await txn.get(ipKey);
    if(record?.banUntil>now){
     return {kind:'rate',retry:Math.max(1,Math.ceil((record.banUntil-now)/1000))};
    }
    // After a ban expires, start a fresh allowance of three orders.
    const times=record?.banUntil ? [] : (record?.times||[]).filter(t=>Number.isFinite(t)&&t>now-WINDOW_MS);
    if(times.length>=MAX_ORDERS){
     const banUntil=now+BAN_MS;
     await txn.put(ipKey,{times,banUntil,until:banUntil});
     return {kind:'rate',retry:Math.ceil(BAN_MS/1000)};
    }
    for(const hash of hashes){
     const record=await txn.get('proof:'+hash);
     if(record&&record.until>now)return {kind:'duplicate'};
    }
    times.push(now);
    const banUntil=times.length===MAX_ORDERS ? now+BAN_MS : 0;
    await txn.put(ipKey,{times,banUntil,until:banUntil||now+WINDOW_MS});
    for(const hash of hashes)await txn.put('proof:'+hash,{token,until:now+PENDING_MS,state:'pending'});
    return {kind:'ok'};
   });
   if(decision.kind==='rate')return json({ok:false,error:'وصلتي للحد المسموح: 3 طلبات. خاصك تسنّى 30 دقيقة من بعد الطلب الثالث.'},429,{'Retry-After':String(decision.retry)});
   if(decision.kind==='duplicate')return json({ok:false,error:'هاد كود التعبئة أو الوصل سبق تصيفط. ما يمكنش تعاود نفس الطلب.'},409);
   // Daily garbage collection keeps durable storage bounded over time.
   if(!(await this.ctx.storage.getAlarm()))await this.ctx.storage.setAlarm(now+24*60*60*1000);
   return json({ok:true,token});
  }
  if(new URL(request.url).pathname==='/finish'){
   const {token,hashes,success}=input;
   if(typeof token!=='string'||!Array.isArray(hashes)||typeof success!=='boolean')return json({ok:false},400);
   await this.ctx.storage.transaction(async txn=>{
    for(const hash of hashes){
     if(typeof hash!=='string')continue;
     const key='proof:'+hash;
     const record=await txn.get(key);
     if(record?.token!==token||record.state!=='pending')continue;
     if(success)await txn.put(key,{token,until:Date.now()+REPLAY_MS,state:'used'});
     else await txn.delete(key);
    }
   });
   return json({ok:true});
  }
  return json({ok:false},404);
 }
 async alarm(){
  const now=Date.now();
  for(const prefix of ['proof:','rate:']){
   let lastKey;
   while(true){
    const options={prefix,limit:500};
    if(lastKey)options.startAfter=lastKey;
    const entries=await this.ctx.storage.list(options);
    for(const [key,value] of entries){
     lastKey=key;
     if(!value||value.until<=now)await this.ctx.storage.delete(key);
    }
    if(entries.size<500)break;
   }
  }
  await this.ctx.storage.setAlarm(now+24*60*60*1000);
 }
}

export default {
 async fetch(request,env){
  const url=new URL(request.url);
  if(url.pathname!=='/api/orders')return env.ASSETS.fetch(request);
  if(request.method!=='POST')return json({ok:false,error:'طريقة الطلب غير مدعومة.'},405);
  const origin=request.headers.get('Origin');
  if(origin&&origin!==url.origin)return json({ok:false,error:'الطلب غير مسموح.'},403);
  if(!env.TELEGRAM_BOT_TOKEN||!env.TELEGRAM_CHAT_ID)return json({ok:false,error:'استقبال الطلبات غير مفعّل حالياً. تواصل مع الدعم.'},503);
  if(!env.SPAM_GUARD)return json({ok:false,error:'الحماية غير مفعلة حالياً. تواصل مع الدعم.'},503);
  if(!(request.headers.get('Content-Type')||'').toLowerCase().startsWith('multipart/form-data'))return json({ok:false,error:'صيغة الطلب غير صحيحة.'},415);
  const length=Number(request.headers.get('Content-Length')||0);
  if(length>6*1024*1024)return json({ok:false,error:'حجم الملفات كبير بزاف (الحد 5MB للصورة).'},413);
  let form;try{form=await request.formData()}catch{return json({ok:false,error:'تعذر قراءة الطلب.'},400)}
  const platform=clean(form.get('platform'));
  const account=clean(form.get('account'));
  const method=clean(form.get('method'));
  const amountRaw=clean(form.get('amount'));
  const amount=Number(amountRaw);
  if(!ALLOWED_PLATFORMS.has(platform)||!ALLOWED_METHODS.has(method)||!account||account.length>64||!/^[0-9A-Za-z_-]+$/.test(account)||!/^[0-9]+$/.test(amountRaw)||!Number.isSafeInteger(amount)||amount<20||amount>2000||amount%10!==0){
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
  const hashes=[];
  let endpoint;
  if(inwi){
   let vouchers;
   try{vouchers=JSON.parse(String(form.get('vouchers')||''))}catch{return json({ok:false,error:'أكواد التعبئة غير صحيحة.'},400)}
   if(!Array.isArray(vouchers)||vouchers.length!==expectedVoucherCount(amount)||vouchers.some(v=>typeof v!=='string'||!/^\d{16}$/.test(v))||new Set(vouchers).size!==vouchers.length){
    return json({ok:false,error:'تحقق من أكواد تعبئة Inwi.'},400);
   }
   for(const code of vouchers)hashes.push('voucher:'+await hashText('inwi:'+code));
   lines.push('أكواد Inwi:');
   vouchers.forEach((code,i)=>lines.push(`${i+1}. ${code}`));
   tgForm.set('text',lines.join('\n'));
   tgForm.set('reply_markup',JSON.stringify({inline_keyboard:vouchers.map((code,i)=>[{text:`📋 نسخ كود Inwi رقم ${i+1}`,copy_text:{text:code}}])}));
   endpoint='sendMessage';
  }else{
   const receipt=form.get('receipt');
   const allowed=['image/jpeg','image/png','image/webp','image/heic','image/heif'];
   if(!(receipt instanceof File)||!allowed.includes(receipt.type)||receipt.size<1||receipt.size>5*1024*1024){
    return json({ok:false,error:'رفع صورة وصل صحيحة بحجم أقل من 5MB.'},400);
   }
   hashes.push(await hashReceipt(receipt));
   tgForm.set('caption',lines.join('\n'));
   tgForm.set('document',receipt,receipt.name.slice(0,100)||'receipt.jpg');
   endpoint='sendDocument';
  }

  // Reserve a rate-limit slot and all payment proofs before contacting Telegram.
  const ip=request.headers.get('CF-Connecting-IP')||'unknown';
  const ipHash=await hashText('ip:'+ip);
  const stub=env.SPAM_GUARD.get(env.SPAM_GUARD.idFromName('rechargo-orders-global'));
  let reservation;
  try{
   const response=await stub.fetch('https://guard/reserve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ip:ipHash,hashes})});
   reservation=await response.json();
   if(!response.ok)return json({ok:false,error:reservation.error||'تعذر استقبال الطلب حالياً.'},response.status,response.status===429?{'Retry-After':response.headers.get('Retry-After')||'1800'}:{});
   if(typeof reservation.token!=='string')throw new Error('Missing guard reservation token');
  }catch{return json({ok:false,error:'خدمة الحماية غير متاحة مؤقتاً. حاول من بعد.'},503)}
  let sent=false;
  try{await telegramSend(env,endpoint,tgForm);sent=true}
  catch{return json({ok:false,error:'تعذر إرسال الطلب حالياً. تأكد من الاتصال أو تواصل مع الدعم.'},502)}
  finally{
   // If Telegram fails, release payment proof locks so the user can retry.
   try{await stub.fetch('https://guard/finish',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:reservation.token,hashes,success:sent})})}catch(error){console.error('Spam guard finalization failed',String(error))}
  }
  return json({ok:true,reference});
 }
};

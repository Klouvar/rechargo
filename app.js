'use strict';
// Front-end only. Existing Cloudflare worker.js, anti-spam guard and Telegram settings are untouched.
const $ = id => document.getElementById(id);
const PRICES = Object.freeze({20:16,50:42,100:85,200:175});
const DENOMS = [100,50,20,10];
const MIN_AMOUNT = 20;
const MAX_AMOUNT = 2000;
const VALID_STEP = 10;
const isValidAmount = value => Number.isSafeInteger(value) && value >= MIN_AMOUNT && value <= MAX_AMOUNT && value % VALID_STEP === 0;
let order = null;
const formatMAD = n => Number(n).toLocaleString('fr-MA',{minimumFractionDigits:2,maximumFractionDigits:2}) + ' DH';
function credited(amount){return Object.prototype.hasOwnProperty.call(PRICES,amount)?PRICES[amount]:Math.round(amount*0.70*100)/100}
function breakdown(sum){if(!isValidAmount(sum))return null;const result=[];for(const d of DENOMS){while(sum>=d){result.push(d);sum-=d}}return sum===0?result:null}
function showError(id,message){const el=$(id);el.textContent=message;el.hidden=!message}
function updatePreview(){
 const sum=Number($('amount').value);const valid=$('amount').value!==''&&isValidAmount(sum);
 $('previewNet').textContent=valid?formatMAD(credited(sum)):'—';
 $('previewFee').textContent=valid?formatMAD(sum-credited(sum)):'—';
 for(const btn of document.querySelectorAll('[data-amount]')){const selected=btn.dataset.amount===$('amount').value;btn.classList.toggle('is-active',selected);btn.setAttribute('aria-pressed',String(selected))}
 $('customAmountBtn').classList.toggle('is-active',!$('customAmountPanel').hidden);
}
$('year').textContent=String(new Date().getFullYear());

for(const btn of document.querySelectorAll('[data-amount]'))btn.addEventListener('click',()=>{
 $('customAmountPanel').hidden=true;$('customAmountBtn').setAttribute('aria-expanded','false');
 $('customAmount').value='';$('amount').value=btn.dataset.amount;updatePreview();showError('formError','');
});
$('customAmountBtn').addEventListener('click',()=>{
 const opening=$('customAmountPanel').hidden;
 $('customAmountPanel').hidden=!opening;
 $('customAmountBtn').setAttribute('aria-expanded',String(opening));
 if(opening){$('amount').value='';$('customAmount').value='';updatePreview();$('customAmount').focus();}
 else{ $('customAmount').value='';$('amount').value='';updatePreview(); }
 showError('formError','');
});
$('customAmount').addEventListener('input',()=>{
 const raw=$('customAmount').value.trim();
 $('amount').value=raw && isValidAmount(Number(raw))?String(Number(raw)):'';
 updatePreview();showError('formError','');
});
$('orderForm').addEventListener('submit',event=>{
 event.preventDefault();showError('formError','');
 const platform=document.querySelector('input[name="platform"]:checked')?.value;
 const account=$('account').value.trim();const amount=Number($('amount').value);
 if(!platform){showError('formError','اختار المنصة أولاً.');return}
 if(!/^[0-9A-Za-z_-]{1,64}$/.test(account)){showError('formError','دخل ID صحيح (حروف إنجليزية أو أرقام، بلا مسافات).');$('account').focus();return}
 const parts=breakdown(amount);
 if(!parts){showError('formError','اختار مبلغ سريع أو دخل مبلغ آخر من 20 حتى 2000 درهم بمضاعفات 10.');($('customAmountPanel').hidden?document.querySelector('[data-amount]'):$('customAmount'))?.focus();return}
 order={platform,account,amount,parts};
 $('reviewPlatform').textContent=platform;$('reviewAccount').textContent=account;
 $('reviewAmount').textContent=formatMAD(amount);$('reviewNet').textContent=formatMAD(credited(amount));
 $('denominations').replaceChildren();
 for(const denom of parts){const chip=document.createElement('span');chip.textContent=denom+' DH';$('denominations').append(chip)}
 $('voucherFields').replaceChildren();
 parts.forEach((denom,index)=>{
  const wrapper=document.createElement('div');wrapper.className='voucher-field';
  const label=document.createElement('label');label.htmlFor='voucher'+index;label.textContent='كود Inwi '+denom+' درهم — رقم '+(index+1);
  const input=document.createElement('input');input.id='voucher'+index;input.className='voucher-input';input.type='text';input.inputMode='numeric';input.maxLength=16;input.autocomplete='off';input.spellcheck=false;input.placeholder='16 رقم';input.setAttribute('aria-label',label.textContent);
  const hint=document.createElement('small');hint.textContent='دخل 16 رقم كيفما مكتوبين فالكود';
  input.addEventListener('input',()=>{input.value=input.value.replace(/[^0-9]/g,'').slice(0,16);input.classList.remove('is-invalid');showError('detailError','')});
  wrapper.append(label,input,hint);$('voucherFields').append(wrapper);
 });
 $('adultCheck').checked=false;showError('detailError','');
 $('stepOne').hidden=true;$('stepTwo').hidden=false;
 $('progressOne').classList.remove('is-current');$('progressTwo').classList.add('is-current');
 $('stepTwoTitle').scrollIntoView({behavior:'smooth',block:'start'});
});
$('backBtn').addEventListener('click',()=>{
 $('stepTwo').hidden=true;$('stepOne').hidden=false;
 $('progressTwo').classList.remove('is-current');$('progressOne').classList.add('is-current');
 $('orderHeading').scrollIntoView({behavior:'smooth',block:'start'});
});
$('confirmBtn').addEventListener('click',async()=>{
 if(!order)return;
 showError('detailError','');
 const fields=[...document.querySelectorAll('.voucher-input')];
 const vouchers=fields.map(f=>f.value.trim());
 const bad=fields.find(f=>!/^[0-9]{16}$/.test(f.value.trim()));
 if(bad){bad.classList.add('is-invalid');showError('detailError','كل كود خاصو يكون فيه 16 رقم بالضبط.');bad.focus();return}
 if(new Set(vouchers).size!==vouchers.length){showError('detailError','كاين كود مكرر، راجع الأكواد.');return}
 if(!$('adultCheck').checked){showError('detailError','خاصك تأكد السن القانوني وفهم شروط المراجعة.');$('adultCheck').focus();return}
 const data=new FormData();data.set('platform',order.platform);data.set('account',order.account);data.set('amount',String(order.amount));data.set('method','inwi');data.set('vouchers',JSON.stringify(vouchers));
 const button=$('confirmBtn');button.disabled=true;button.textContent='جاري إرسال الطلب…';
 try{
  const response=await fetch('/api/orders',{method:'POST',body:data,headers:{Accept:'application/json'},cache:'no-store'});
  const payload=await response.json().catch(()=>({}));
  if(!response.ok||!payload.ok)throw new Error(payload.error||'ما قدرناش نصيفطو الطلب دابا، حاول مرة أخرى.');
  $('referenceBox').hidden=!payload.reference;$('referenceBox').textContent=payload.reference?'مرجع الطلب: '+payload.reference:'';
  $('successModal').hidden=false;$('modalClose').focus();
  for(const field of fields)field.value='';
 }catch(error){showError('detailError',error.message||'وقع مشكل فالاتصال، حاول مرة أخرى.');}
 finally{button.disabled=false;button.textContent='إرسال الطلب للمراجعة ←'}
});
function closeModal(){$('successModal').hidden=true;$('backBtn').focus()}
$('modalClose').addEventListener('click',closeModal);
$('successModal').addEventListener('click',e=>{if(e.target===$('successModal'))closeModal()});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('successModal').hidden)closeModal()});
updatePreview();

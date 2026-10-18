'use strict';
const $=id=>document.getElementById(id);
const methods=[
 {id:'cih',label:'CIH Bank',image:'assets/cih.jpg',name:'Zakariae Chaib',number:'6705174211018800'},
 {id:'attijari',label:'Attijari Bank',image:'assets/attijari.jpg',name:'Zakariae Chaib',number:'230170670517421101880090'},
 {id:'cashplus',label:'Cash Plus',image:'assets/cashplus.png',name:'AHMED CHAIB',number:'0709396127'},
 {id:'barid',label:'Al Barid Bank',image:'assets/barid.png',name:'REDA EL BACAHRY',number:'13682204'},
 {id:'boa',label:'Bank of Africa',image:'assets/boa.png',name:'Zakariae Chaib',number:'230170670517421101880090'},
 {id:'lbankalik',label:'Lbankalik',image:'assets/lbankalik.png',name:'Zakariae Chaib',number:'230170670517421101880090'},
 {id:'populaire',label:'Banque Populaire',image:'assets/populaire.jpg',name:'Zakariae Chaib',number:'230170670517421101880090'},
 {id:'inwi',label:'Recharge Inwi',image:'assets/inwi.jpg'}
];
let order=null,selected=null,lastFocus=null;
const denominations=[100,50,20,10];
function breakdown(amount){if(!Number.isSafeInteger(amount)||amount<10||amount%10)return null;const result=[];for(const v of denominations){while(amount>=v){result.push(v);amount-=v}}return amount===0?result:null}
function show(id){for(const el of document.querySelectorAll('.page'))el.classList.toggle('active',el.id===id);const steps={'order':1,'methodsPage':2,'detailsPage':3};for(const el of document.querySelectorAll('.step'))el.classList.toggle('current',Number(el.dataset.step)===steps[id]);window.scrollTo({top:0,behavior:'auto'});}
function error(id,message){$(id).textContent=message;$(id).hidden=!message}
const amount=$('amount');
for(const b of document.querySelectorAll('[data-amount]'))b.addEventListener('click',()=>{amount.value=b.dataset.amount;amount.dispatchEvent(new Event('input',{bubbles:true}));error('formError','')});
amount.addEventListener('input',()=>{for(const b of document.querySelectorAll('[data-amount]')){const active=b.dataset.amount===amount.value;b.classList.toggle('selected',active);b.setAttribute('aria-pressed',String(active))}});
$('orderForm').addEventListener('submit',event=>{
 event.preventDefault();error('formError','');
 const account=$('account').value.trim();const sum=Number(amount.value);const chosen=document.querySelector('input[name="platform"]:checked');
 if(!chosen){error('formError','اختار المنصة أولاً');return}
 if(!account){error('formError','دخل ID ديال الحساب');$('account').focus();return}
 if(!Number.isSafeInteger(sum)||sum<20||sum%10!==0){error('formError','دخل مبلغ صحيح من مضاعفات 10 دراهم، ابتداءً من 20 DH.');amount.focus();return}
 order={platform:chosen.value,account,amount:sum};$('summary').textContent=`${order.platform} • ID: ${order.account} • ${order.amount} DH`;show('methodsPage');
});
$('methodsGrid').innerHTML=methods.map((m,i)=>`<button class="method" type="button" data-index="${i}"><img src="${m.image}" alt=""><strong>${m.label}</strong></button>`).join('');
$('methodsGrid').addEventListener('click',e=>{const button=e.target.closest('[data-index]');if(!button||!order)return;selected=methods[Number(button.dataset.index)];$('selectedMethodName').textContent=selected.label;$('detailAmount').textContent=`MAD ${order.amount.toFixed(2)}`;$('detailOrder').textContent=`${order.platform} • ID ${order.account}`;const isInwi=selected.id==='inwi';$('bankSection').hidden=isInwi;$('inwiSection').hidden=!isInwi;error('detailError','');$('receipt').value='';$('fileName').textContent='اختار صورة من هاتفك';
 if(isInwi){const parts=breakdown(order.amount);$('inwiBreakdown').innerHTML=parts?parts.map(v=>`<span class="chip">${v} DH</span>`).join(''):'<span>هاد المبلغ ما متوفرش بالفئات الحالية.</span>';$('voucherFields').replaceChildren();if(parts)for(const [i,v] of parts.entries()){const wrapper=document.createElement('div');wrapper.className='voucher';const label=document.createElement('label');label.textContent=`كود روشارج ${v} DH — رقم ${i+1}`;label.htmlFor=`voucher${i}`;const input=document.createElement('input');input.id=`voucher${i}`;input.className='voucher-input';input.type='text';input.inputMode='numeric';input.autocomplete='off';input.placeholder='14 رقم';input.maxLength=30;const message=document.createElement('div');message.className='v-error';message.setAttribute('aria-live','polite');input.addEventListener('input',()=>{input.classList.remove('invalid');message.textContent='' });wrapper.append(label,input,message);$('voucherFields').append(wrapper)}}else{
 $('beneficiary').textContent=selected.name;$('bankNumber').textContent=selected.number;$('numberLabel').textContent=selected.id==='cashplus'?'رقم Cash Plus':'رقم الحساب / RIB';
 const hasFullRib=/^\d{24}$/.test(selected.number);
 $('bankNotice').textContent=selected.id==='cashplus'?'المرجو التأكد من بيانات الإيداع وإتمام العملية عبر Cash Plus.':hasFullRib?'⚠️ يجب تفعيل خيار Virement instantané (التحويل الفوري) قبل إرسال التحويل، لضمان معالجة العملية فوراً.':'‼️ يرجى إتمام التحويل خلال 10 دقائق باستخدام البيانات أدناه. ⚠️ يجب تفعيل خيار Virement instantané (التحويل الفوري) في تطبيق البنك قبل إرسال التحويل، لضمان معالجة العملية فوراً.';
 }
 show('detailsPage');
});
for(const button of document.querySelectorAll('[data-back]'))button.addEventListener('click',()=>show(button.dataset.back));
$('homeLink').addEventListener('click',e=>{e.preventDefault();show('order')});
$('receipt').addEventListener('change',()=>{$('fileName').textContent=$('receipt').files.length?$('receipt').files[0].name:'اختار صورة من هاتفك';error('detailError','')});
async function copyText(text){try{if(navigator.clipboard&&window.isSecureContext){await navigator.clipboard.writeText(text);return true}}catch(_){}const input=document.createElement('textarea');input.value=text;input.style.cssText='position:fixed;opacity:0;top:0;left:-9999px';document.body.append(input);input.select();let ok=false;try{ok=document.execCommand('copy')}catch(_){}input.remove();return ok}
for(const button of document.querySelectorAll('[data-copy]'))button.addEventListener('click',async()=>{const success=await copyText($(button.dataset.copy).textContent.trim());const old=button.textContent;button.textContent=success?'✓ نُسخ':'نسخ يدوي';setTimeout(()=>button.textContent=old,1700)});
$('confirmBtn').addEventListener('click',()=>{if(!selected||!order)return;error('detailError','');if(selected.id==='inwi'){
 const fields=[...document.querySelectorAll('.voucher-input')];let first=null;for(const field of fields){const valid=/^\d{14}$/.test(field.value.trim());field.classList.toggle('invalid',!valid);field.nextElementSibling.textContent=valid?'':'الكود خاصو يكون 14 رقم بالضبط.';if(!valid&&!first)first=field}if(!fields.length){error('detailError','المبلغ غير متوفر بفئات Inwi.');return}if(first){error('detailError','صحح الأكواد اللي باللون الأحمر قبل التأكيد.');first.focus();return}
 }else if(!$('receipt').files.length){error('detailError','اختار صورة الإيصال أولاً.');return}
 lastFocus=document.activeElement;$('modal').hidden=false;$('modalClose').focus();
});
function closeModal(){$('modal').hidden=true;if(lastFocus&&lastFocus.isConnected)lastFocus.focus()}
$('modalClose').addEventListener('click',closeModal);
$('modal').addEventListener('click',e=>{if(e.target===$('modal'))closeModal()});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('modal').hidden)closeModal()});

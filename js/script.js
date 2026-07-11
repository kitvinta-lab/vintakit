// ─── FIREBASE ───
var firebaseConfig = {
  apiKey: "AIzaSyDzfC75-YNWr4XVCn2AVnIWshcdKZP-jAc",
  authDomain: "vintakit-ca42b.firebaseapp.com",
  projectId: "vintakit-ca42b",
  storageBucket: "vintakit-ca42b.firebasestorage.app",
  messagingSenderId: "483907194164",
  appId: "1:483907194164:web:43e59d71360b23ef54e961",
  measurementId: "G-FQW0LZTRVJ"
};
firebase.initializeApp(firebaseConfig);
var db = firebase.firestore();
var auth = firebase.auth();

// ─── IMAGE HELPERS ───
var pendingImgs = []; // base64 strings for new product
var editImgs = [];    // base64 strings for edit
var editingPid = null;

// Reads a file, resizes it (max width 900px) and compresses it to JPEG
// so uploaded photos stay small enough to store safely in Firestore.
function fileToBase64(file){
  return new Promise(function(resolve){
    var reader = new FileReader();
    reader.onload = function(e){
      var img = new Image();
      img.onload = function(){
        var maxW = 900;
        var scale = Math.min(1, maxW / img.width);
        var w = Math.round(img.width * scale) || img.width;
        var h = Math.round(img.height * scale) || img.height;
        var canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        var ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.72));
      };
      img.onerror = function(){ resolve(e.target.result); };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

function handleImgUpload(input){
  var files = Array.from(input.files).slice(0,3);
  Promise.all(files.map(fileToBase64)).then(function(results){
    pendingImgs = results.slice(0,3);
    renderPreviews('img-previews', pendingImgs, function(i){ pendingImgs.splice(i,1); renderPreviews('img-previews', pendingImgs, arguments.callee); });
  });
  input.value = '';
}

function handleEditImgUpload(input){
  var files = Array.from(input.files).slice(0, 3 - editImgs.length);
  Promise.all(files.map(fileToBase64)).then(function(results){
    editImgs = editImgs.concat(results).slice(0,3);
    renderPreviews('edit-previews', editImgs, function(i){ editImgs.splice(i,1); renderPreviews('edit-previews', editImgs, arguments.callee); });
  });
  input.value = '';
}

function renderPreviews(containerId, imgs, onDel){
  var container = document.getElementById(containerId);
  if(!container) return;
  container.innerHTML = imgs.map(function(src, i){
    return '<div class="img-preview-wrap'+(i===0?' main-preview':'')+'">'
      + '<img src="'+src+'">'
      + (i===0?'<div class="img-main-tag">رئيسية</div>':'')
      + '<button class="img-del-btn" onclick="event.stopPropagation();delPreviewImg(\''+containerId+'\','+i+')">✕</button>'
      + '</div>';
  }).join('');
}

function delPreviewImg(containerId, idx){
  if(containerId === 'img-previews'){
    pendingImgs.splice(idx,1);
    renderPreviews('img-previews', pendingImgs, null);
  } else {
    editImgs.splice(idx,1);
    renderPreviews('edit-previews', editImgs, null);
  }
}

// drag & drop
document.addEventListener('DOMContentLoaded', function(){
  var area = document.getElementById('upload-area');
  if(!area) return;
  area.addEventListener('click', function(){ document.getElementById('f-imgs').click(); });
  area.addEventListener('dragover', function(e){ e.preventDefault(); area.classList.add('drag-over'); });
  area.addEventListener('dragleave', function(){ area.classList.remove('drag-over'); });
  area.addEventListener('drop', function(e){
    e.preventDefault(); area.classList.remove('drag-over');
    var files = Array.from(e.dataTransfer.files).filter(function(f){ return f.type.startsWith('image/'); }).slice(0,3);
    Promise.all(files.map(fileToBase64)).then(function(results){
      pendingImgs = results.slice(0,3);
      renderPreviews('img-previews', pendingImgs, null);
    });
  });
});

// ─── STATE ───
// Language stays a per-device preference (no need to sync across visitors).
var lang = localStorage.getItem('vk-lang') || 'ar';
// waNum / aboutTexts / products now live in Firestore and are kept in sync
// in real time by the listeners set up in the INIT section at the bottom
// of this file. The values below are just placeholders shown until the
// first Firestore snapshot arrives.
var waNum = '212600000000';
var aboutTexts = {
  ar: 'Vintakit هو متجر متخصص في قمصان المنتخبات الوطنية من حول العالم. نجمع بين الأصالة والأسلوب العصري لنقدم لك أفضل قمصان المنتخبات بجودة عالية وأسعار مناسبة.',
  en: 'Vintakit is a store specialized in national team jerseys from around the world. We combine authenticity with modern style to bring you the best jerseys at great prices.'
};
var products = [];
var currentFilter = 'all';
var selectedSizes = {};
var currentPid = null;
var currentProdSize = null;
var firstProductsLoad = true;

// ─── DEFAULT PRODUCTS ───
// Used only once, to seed Firestore the very first time the store runs
// (if the "products" collection is still empty).
var DEFAULT_PRODUCTS = [
  {id:'p1',nar:'قميص المنتخب المغربي 2024',nen:'Morocco 2024 Home Jersey',car:'المغرب',cen:'Morocco',flag:'🇲🇦',price:450,region:'africa',imgs:['https://picsum.photos/seed/ma24a/600/450','https://picsum.photos/seed/ma24b/600/450','https://picsum.photos/seed/ma24c/600/450'],sizes:['S','M','L','XL','XXL'],soldOut:false},
  {id:'p2',nar:'قميص المنتخب الجزائري',nen:'Algeria Home Jersey',car:'الجزائر',cen:'Algeria',flag:'🇩🇿',price:380,region:'africa',imgs:['https://picsum.photos/seed/dz24a/600/450','https://picsum.photos/seed/dz24b/600/450'],sizes:['M','L','XL'],soldOut:false},
  {id:'p3',nar:'قميص السنغال 2024',nen:'Senegal 2024 Jersey',car:'السنغال',cen:'Senegal',flag:'🇸🇳',price:360,region:'africa',imgs:['https://picsum.photos/seed/sn24a/600/450'],sizes:['S','M','L','XL'],soldOut:false},
  {id:'p4',nar:'قميص فرنسا المنزلي',nen:'France Home Jersey',car:'فرنسا',cen:'France',flag:'🇫🇷',price:490,region:'europe',imgs:['https://picsum.photos/seed/fr24a/600/450','https://picsum.photos/seed/fr24b/600/450'],sizes:['S','M','L','XL','XXL'],soldOut:false},
  {id:'p5',nar:'قميص إسبانيا 2024',nen:'Spain 2024 Jersey',car:'إسبانيا',cen:'Spain',flag:'🇪🇸',price:470,region:'europe',imgs:['https://picsum.photos/seed/es24a/600/450'],sizes:['S','M','L'],soldOut:true},
  {id:'p6',nar:'قميص البرتغال الخارجي',nen:'Portugal Away Jersey',car:'البرتغال',cen:'Portugal',flag:'🇵🇹',price:480,region:'europe',imgs:['https://picsum.photos/seed/pt24a/600/450','https://picsum.photos/seed/pt24b/600/450'],sizes:['M','L','XL','XXL'],soldOut:false},
  {id:'p7',nar:'قميص البرازيل المنزلي',nen:'Brazil Home Jersey',car:'البرازيل',cen:'Brazil',flag:'🇧🇷',price:450,region:'america',imgs:['https://picsum.photos/seed/br24a/600/450','https://picsum.photos/seed/br24b/600/450'],sizes:['M','L','XL','XXL'],soldOut:false},
  {id:'p8',nar:'قميص الأرجنتين 2024',nen:'Argentina 2024 Jersey',car:'الأرجنتين',cen:'Argentina',flag:'🇦🇷',price:510,region:'america',imgs:['https://picsum.photos/seed/ar24a/600/450'],sizes:['S','M','L','XL'],soldOut:false},
  {id:'p9',nar:'قميص المنتخب الياباني',nen:'Japan National Jersey',car:'اليابان',cen:'Japan',flag:'🇯🇵',price:420,region:'asia',imgs:['https://picsum.photos/seed/jp24a/600/450','https://picsum.photos/seed/jp24b/600/450'],sizes:['S','M','L'],soldOut:false}
];

// ─── I18N ───
var tx = {
  ar:{
    navHome:'المتجر', navAbout:'من نحن',
    hEyebrow:'★ الأصالة والأسلوب ★', hSub:'قمصان جميع المنتخبات العالمية — أصيلة وعصرية 🌍', hCta:'تسوق الآن',
    hs1:'قميص', hs2:'منتخب', hs3:'الأسود',
    fAll:'الكل', fAfrica:'إفريقيا', fEurope:'أوروبا', fAmerica:'أمريكا', fAsia:'آسيا',
    footer:'© 2024 — جميع الحقوق محفوظة', mad:'درهم',
    soldLabel:'نفد المخزون', orderWa:'اطلب عبر واتساب', back:'→ رجوع',
    pdSizeLbl:'اختر المقاس', suggTitle:'قمصان قد تعجبك',
    abTitle:'من نحن', abSub:'VINTAKIT — شغف بكرة القدم والأسلوب', abH2:'قصتنا',
    v1t:'الجودة', v1d:'قمصان أصيلة بأعلى معايير الجودة',
    v2t:'التنوع', v2d:'جميع المنتخبات من كل القارات',
    v3t:'السرعة', v3d:'توصيل سريع لباب منزلك',
    v4t:'التواصل', v4d:'خدمة عبر واتساب على مدار الساعة',
    pwSub:'لوحة تحكم الأدمين', pwBtn:'دخول', pwErr:'كلمة مرور خاطئة',
    admClose:'✕ إغلاق', stl1:'المنتجات', stl2:'متاح', stl3:'نفد',
    admWa:'رقم الواتساب', waSave:'حفظ',
    admAbout:'تعديل صفحة "من نحن"', abtSave:'حفظ النص',
    uploadLbl:'📸 اضغط أو اسحب لرفع الصور (حتى 3 صور)',
    editUploadLbl:'📸 اضغط لتغيير الصور أو إضافة المزيد (حتى 3)',
    editTitle:'تعديل القميص', saveEdit:'حفظ التعديلات', cancelEdit:'إلغاء',
    admAdd:'إضافة قميص جديد', admAddBtn:'+ إضافة القميص',
    admList:'إدارة القمصان',
    togAv:'متاح', togSo:'نفد المخزون', copyLink:'نسخ الرابط', del:'حذف',
    waMsg:'السلام عليكم،\nأريد طلب قميص من Vintakit:\n🏳 المنتخب: {country}\n👕 القميص: {name}\n📏 المقاس: {size}\n💰 السعر: {price} درهم',
    tSaved:'تم الحفظ ✓', tDel:'تم الحذف ✓', tAdded:'تمت الإضافة ✓',
    tWa:'تم حفظ الرقم ✓', tSize:'الرجاء اختيار المقاس أولاً',
    tCopy:'تم نسخ الرابط ✓', tAbout:'تم حفظ النص ✓', tFill:'الرجاء ملء الحقول الإلزامية',
    dir:'rtl', langBtn:'EN'
  },
  en:{
    navHome:'Store', navAbout:'About',
    hEyebrow:'★ Authenticity & Style ★', hSub:'All World National Team Jerseys — Authentic & Modern 🌍', hCta:'Shop Now',
    hs1:'Jerseys', hs2:'Nations', hs3:'Atlas Lions',
    fAll:'All', fAfrica:'Africa', fEurope:'Europe', fAmerica:'America', fAsia:'Asia',
    footer:'© 2024 — All Rights Reserved', mad:'MAD',
    soldLabel:'SOLD OUT', orderWa:'Order via WhatsApp', back:'← Back',
    pdSizeLbl:'Select Size', suggTitle:'You Might Also Like',
    abTitle:'About Us', abSub:'VINTAKIT — Passion for Football & Style', abH2:'Our Story',
    v1t:'Quality', v1d:'Authentic jerseys with highest standards',
    v2t:'Variety', v2d:'All national teams from every continent',
    v3t:'Speed', v3d:'Fast delivery to your door',
    v4t:'Support', v4d:'WhatsApp service around the clock',
    pwSub:'Admin Dashboard', pwBtn:'Login', pwErr:'Wrong password',
    admClose:'✕ Close', stl1:'Products', stl2:'Available', stl3:'Sold Out',
    admWa:'WhatsApp Number', waSave:'Save',
    admAbout:'Edit "About" Page', abtSave:'Save Text',
    uploadLbl:'📸 Click or drag to upload images (up to 3)',
    editUploadLbl:'📸 Click to change or add more images (up to 3)',
    editTitle:'Edit Jersey', saveEdit:'Save Changes', cancelEdit:'Cancel',
    admAdd:'Add New Jersey', admAddBtn:'+ Add Jersey',
    admList:'Manage Jerseys',
    togAv:'Available', togSo:'Sold Out', copyLink:'Copy Link', del:'Delete',
    waMsg:'Hello!\nI want to order from Vintakit:\n🏳 National Team: {country}\n👕 Jersey: {name}\n📏 Size: {size}\n💰 Price: {price} MAD',
    tSaved:'Saved ✓', tDel:'Deleted ✓', tAdded:'Added ✓',
    tWa:'Number saved ✓', tSize:'Please select a size first',
    tCopy:'Link copied ✓', tAbout:'Text saved ✓', tFill:'Please fill required fields',
    dir:'ltr', langBtn:'عر'
  }
};

function T(k){ return tx[lang][k] || ''; }

// ─── LANG ───
function applyLang(){
  document.documentElement.dir = T('dir');
  document.documentElement.lang = lang;
  document.getElementById('lang-btn').textContent = T('langBtn');
  // nav
  var nh = document.getElementById('nl-home'); nh.textContent = T('navHome'); nh.dataset.ar='المتجر'; nh.dataset.en='Store';
  var na = document.getElementById('nl-about'); na.textContent = T('navAbout');
  // hero
  document.getElementById('h-eyebrow').textContent = T('hEyebrow');
  document.getElementById('h-sub').textContent = T('hSub');
  document.getElementById('h-cta').textContent = T('hCta');
  document.getElementById('hs-lbl1').textContent = T('hs1');
  document.getElementById('hs-lbl2').textContent = T('hs2');
  document.getElementById('hs-lbl3').textContent = T('hs3');
  // filters
  document.getElementById('f-all').textContent = T('fAll');
  document.getElementById('f-africa').textContent = T('fAfrica');
  document.getElementById('f-europe').textContent = T('fEurope');
  document.getElementById('f-america').textContent = T('fAmerica');
  document.getElementById('f-asia').textContent = T('fAsia');
  // footer
  ['ft-home','ft-prod'].forEach(function(id){ var el=document.getElementById(id); if(el) el.textContent=T('footer'); });
  // product page
  document.getElementById('back-btn').textContent = T('back');
  document.getElementById('pd-size-lbl').textContent = T('pdSizeLbl');
  document.getElementById('pd-wa-txt').textContent = T('orderWa');
  document.getElementById('sugg-title').textContent = T('suggTitle');
  // about
  document.getElementById('ab-title').textContent = T('abTitle');
  document.getElementById('ab-sub').textContent = T('abSub');
  document.getElementById('ab-h2').textContent = T('abH2');
  document.getElementById('ab-text').textContent = aboutTexts[lang] || aboutTexts.ar;
  document.getElementById('v1t').textContent=T('v1t'); document.getElementById('v1d').textContent=T('v1d');
  document.getElementById('v2t').textContent=T('v2t'); document.getElementById('v2d').textContent=T('v2d');
  document.getElementById('v3t').textContent=T('v3t'); document.getElementById('v3d').textContent=T('v3d');
  document.getElementById('v4t').textContent=T('v4t'); document.getElementById('v4d').textContent=T('v4d');
  // admin
  document.getElementById('pw-sub').textContent = T('pwSub');
  document.getElementById('pw-btn').textContent = T('pwBtn');
  document.getElementById('adm-close-btn').textContent = T('admClose');
  document.getElementById('st-l1').textContent = T('stl1');
  document.getElementById('st-l2').textContent = T('stl2');
  document.getElementById('st-l3').textContent = T('stl3');
  document.getElementById('adm-wa-title').textContent = T('admWa');
  document.getElementById('wa-save-btn').textContent = T('waSave');
  document.getElementById('adm-about-title').textContent = T('admAbout');
  document.getElementById('abt-save-btn').textContent = T('abtSave');
  document.getElementById('adm-add-title').textContent = T('admAdd');
  document.getElementById('adm-add-btn').textContent = T('admAddBtn');
  document.getElementById('adm-list-title').textContent = T('admList');
  var ul = document.getElementById('upload-label'); if(ul) ul.textContent = T('uploadLbl');
  var el = document.getElementById('edit-upload-lbl'); if(el) el.textContent = T('editUploadLbl');
  var et = document.getElementById('edit-modal-title-txt'); if(et) et.textContent = T('editTitle');
  var se = document.getElementById('save-edit-btn'); if(se) se.textContent = T('saveEdit');
  var ce = document.getElementById('cancel-edit-btn'); if(ce) ce.textContent = T('cancelEdit');
  // stats
  updateHeroStats();
  renderGrid();
  renderAdmList();
  if(currentPid) renderProductPage(currentPid);
}

function toggleLang(){
  lang = lang === 'ar' ? 'en' : 'ar';
  localStorage.setItem('vk-lang', lang);
  applyLang();
}

// ─── PAGES ───
function goPage(p){
  document.querySelectorAll('.page').forEach(function(el){ el.classList.remove('active'); });
  document.getElementById('page-' + p).classList.add('active');
  document.querySelectorAll('.nav-link').forEach(function(el){ el.classList.remove('active'); });
  var nl = document.getElementById('nl-' + p);
  if(nl) nl.classList.add('active');
  window.scrollTo(0,0);
  if(p === 'product' && currentPid) renderProductPage(currentPid);
}

// ─── GRID ───
function updateHeroStats(){
  var nations = [...new Set(products.map(function(p){ return p.cen; }))].length;
  document.getElementById('hs-count').textContent = products.length;
  document.getElementById('hs-nations').textContent = nations;
}

function setFilter(f, btn){
  currentFilter = f;
  document.querySelectorAll('.filter-btn').forEach(function(b){ b.classList.remove('active'); });
  btn.classList.add('active');
  renderGrid();
}

function renderGrid(){
  var grid = document.getElementById('main-grid');
  var list = currentFilter === 'all' ? products : products.filter(function(p){ return p.region === currentFilter; });
  if(!list.length){
    grid.innerHTML = '<div class="empty-state">' + (lang==='ar'?'لا توجد قمصان في هذا القسم':'No jerseys in this section') + '</div>';
    return;
  }
  grid.innerHTML = list.map(function(p){
    var name = lang==='ar' ? p.nar : p.nen;
    var country = lang==='ar' ? p.car : p.cen;
    var img = p.imgs && p.imgs[0] ? p.imgs[0] : '';
    var imgHtml = img
      ? '<img src="'+img+'" alt="'+name+'" loading="lazy" onerror="this.parentNode.innerHTML=\'<div class=card-placeholder>👕</div>\'">'
      : '<div class="card-placeholder">👕</div>';
    var sel = selectedSizes[p.id] || '';
    var szHtml = p.sizes.map(function(s){
      return '<button class="sz'+(sel===s?' active':'')+'" onclick="event.stopPropagation();pickSize(\''+p.id+'\',\''+s+'\',this)">'+s+'</button>';
    }).join('');
    return '<div class="card" onclick="openProduct(\''+p.id+'\')">'
      + (p.soldOut ? '<div class="card-sold">'+T('soldLabel')+'</div>' : '')
      + '<div class="flag-badge">'+p.flag+'</div>'
      + '<div class="card-img-wrap">'+imgHtml+'</div>'
      + '<div class="card-body">'
      + '<div class="card-name">'+name+'</div>'
      + '<div class="card-country">'+p.flag+' '+country+'</div>'
      + '<div class="card-price">'+p.price+' <small>'+T('mad')+'</small></div>'
      + '<div class="sizes-row" id="sr-'+p.id+'" onclick="event.stopPropagation()">'+szHtml+'</div>'
      + '<button class="wa-btn" '+(p.soldOut?'disabled':'')+' onclick="event.stopPropagation();orderCard(\''+p.id+'\')">'
      + '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.554 4.116 1.523 5.845L0 24l6.324-1.5A11.933 11.933 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.846 0-3.574-.482-5.072-1.326l-.364-.215-3.753.89.943-3.648-.236-.374A9.96 9.96 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/></svg>'
      + T('orderWa') + '</button></div></div>';
  }).join('');
}

function pickSize(pid, sz, btn){
  selectedSizes[pid] = sz;
  var row = document.getElementById('sr-'+pid);
  if(row) row.querySelectorAll('.sz').forEach(function(b){ b.classList.toggle('active', b.textContent===sz); });
}

// ─── PRODUCT PAGE ───
function openProduct(pid){
  currentPid = pid;
  currentProdSize = null;
  goPage('product');
}

function renderProductPage(pid){
  var p = products.find(function(x){ return x.id===pid; });
  if(!p) return;
  var name = lang==='ar' ? p.nar : p.nen;
  var country = lang==='ar' ? p.car : p.cen;
  document.getElementById('pd-flag').textContent = p.flag;
  document.getElementById('pd-country').textContent = country;
  document.getElementById('pd-title').textContent = name;
  document.getElementById('pd-price').innerHTML = p.price + ' <small>'+T('mad')+'</small>';
  var soldBanner = document.getElementById('pd-sold');
  var waBtn = document.getElementById('pd-wa-btn');
  if(p.soldOut){ soldBanner.style.display='block'; soldBanner.textContent=T('soldLabel'); waBtn.disabled=true; }
  else { soldBanner.style.display='none'; waBtn.disabled=false; }
  // images
  var imgs = (p.imgs && p.imgs.length) ? p.imgs : [];
  var mainWrap = document.getElementById('prod-img-main');
  mainWrap.innerHTML = imgs[0]
    ? '<div class="magnifier-container" id="magnifier-container">'
      + '<img class="prod-main-img" id="main-img" src="'+imgs[0]+'" alt="'+name+'">'
      + '<div class="magnifier-lens" id="magnifier-lens"></div>'
      + '<div class="magnifier-zoom-box" id="magnifier-zoom-box"></div>'
      + '</div>'
    : '<div class="prod-placeholder">👕</div>';
  var thumbsEl = document.getElementById('prod-thumbs');
  thumbsEl.innerHTML = imgs.length > 1 ? imgs.map(function(img, i){
    return '<img class="prod-thumb'+(i===0?' active':'')+'" src="'+img+'" onclick="switchImg(\''+img+'\',this)" alt="">';
  }).join('') : '';
  // sizes
  currentProdSize = null;
  var szEl = document.getElementById('pd-sizes');
  szEl.innerHTML = p.sizes.map(function(s){
    return '<button class="prod-sz" onclick="pickProdSize(this,\''+s+'\')">'+s+'</button>';
  }).join('');
  // init magnifier
  setTimeout(initMagnifier, 80);

  // suggestions: same region first, exclude current
  var sugg = products.filter(function(x){ return x.id!==pid && x.region===p.region; });
  if(sugg.length < 4) sugg = sugg.concat(products.filter(function(x){ return x.id!==pid && x.region!==p.region; }));
  sugg = sugg.slice(0,4);
  var sg = document.getElementById('sugg-grid');
  sg.innerHTML = sugg.map(function(s){
    var sname = lang==='ar' ? s.nar : s.nen;
    var simg = s.imgs && s.imgs[0]
      ? '<img src="'+s.imgs[0]+'" style="width:100%;height:130px;object-fit:cover" loading="lazy" alt="'+sname+'" onerror="this.style.display=\'none\'">'
      : '<div style="height:130px;background:var(--royal);display:flex;align-items:center;justify-content:center;font-size:32px;color:rgba(255,255,255,.15)">👕</div>';
    return '<div class="card" onclick="openProduct(\''+s.id+'\')">'
      + (s.soldOut?'<div class="card-sold">'+T('soldLabel')+'</div>':'')
      + '<div class="flag-badge">'+s.flag+'</div>'
      + '<div class="card-img-wrap" style="height:130px">'+simg+'</div>'
      + '<div class="card-body">'
      + '<div class="card-name">'+sname+'</div>'
      + '<div class="card-price">'+s.price+' <small>'+T('mad')+'</small></div>'
      + '</div></div>';
  }).join('');
}

function switchImg(src, thumb){
  var main = document.getElementById('main-img');
  if(main) main.src = src;
  document.querySelectorAll('.prod-thumb').forEach(function(t){ t.classList.remove('active'); });
  thumb.classList.add('active');
  setTimeout(initMagnifier, 50);
}

// ─── MAGNIFIER ───
function initMagnifier(){
  var container = document.getElementById('magnifier-container');
  if(!container) return;
  var img  = container.querySelector('#main-img');
  var lens = container.querySelector('#magnifier-lens');
  var zoom = container.querySelector('#magnifier-zoom-box');
  if(!img || !lens || !zoom) return;

  var ZOOM = 2.0;

  // clone to remove old listeners
  var newC = container.cloneNode(true);
  container.parentNode.replaceChild(newC, container);
  img  = newC.querySelector('#main-img');
  lens = newC.querySelector('#magnifier-lens');
  zoom = newC.querySelector('#magnifier-zoom-box');

  function updateBg(){
    var src = img.src;
    var bw  = img.offsetWidth  * ZOOM;
    var bh  = img.offsetHeight * ZOOM;
    lens.style.backgroundImage = 'url("'+src+'")';
    lens.style.backgroundSize  = bw+'px '+bh+'px';
    zoom.style.backgroundImage = 'url("'+src+'")';
    zoom.style.backgroundSize  = bw+'px '+bh+'px';
  }

  function applyPosition(clientX, clientY){
    var rect = img.getBoundingClientRect();
    var x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    var y = Math.max(0, Math.min(clientY - rect.top,  rect.height));

    lens.style.left = x+'px';
    lens.style.top  = y+'px';

    var bx = x * ZOOM - lens.offsetWidth  / 2;
    var by = y * ZOOM - lens.offsetHeight / 2;
    lens.style.backgroundPosition = '-'+bx+'px -'+by+'px';

    var zx = x * ZOOM - zoom.offsetWidth  / 2;
    var zy = y * ZOOM - zoom.offsetHeight / 2;
    zoom.style.backgroundPosition = '-'+zx+'px -'+zy+'px';
  }

  // Mouse
  newC.addEventListener('mouseenter', function(){
    updateBg();
    lens.style.display = 'block';
    zoom.style.display = 'block';
  });
  newC.addEventListener('mouseleave', function(){
    lens.style.display = 'none';
    zoom.style.display = 'none';
  });
  newC.addEventListener('mousemove', function(e){
    applyPosition(e.clientX, e.clientY);
  });

  // Touch (mobile) - تتبع الإصبع بشكل صحيح
  newC.addEventListener('touchstart', function(e){
    e.preventDefault();
    updateBg();
    lens.style.display = 'block';
    applyPosition(e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: false });

  newC.addEventListener('touchmove', function(e){
    e.preventDefault();
    applyPosition(e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: false });

  newC.addEventListener('touchend', function(){
    lens.style.display = 'none';
  });
}

function pickProdSize(btn, sz){
  currentProdSize = sz;
  document.querySelectorAll('.prod-sz').forEach(function(b){ b.classList.remove('active'); });
  btn.classList.add('active');
}

function orderFromProduct(){
  var p = products.find(function(x){ return x.id===currentPid; });
  if(!p || p.soldOut) return;
  if(!currentProdSize){ toast(T('tSize')); return; }
  sendWa(p, currentProdSize);
}

function orderCard(pid){
  var p = products.find(function(x){ return x.id===pid; });
  if(!p || p.soldOut) return;
  if(!selectedSizes[pid]){ toast(T('tSize')); return; }
  sendWa(p, selectedSizes[pid]);
}

function sendWa(p, size){
  var name = lang==='ar' ? p.nar : p.nen;
  var country = lang==='ar' ? p.car : p.cen;
  var msg = T('waMsg').replace('{country}',country).replace('{name}',name).replace('{size}',size).replace('{price}',p.price);
  window.open('https://wa.me/'+waNum+'?text='+encodeURIComponent(msg),'_blank');
}

// ─── ADMIN ───
function openAdmin(){
  document.getElementById('admin-overlay').classList.add('open');
  document.getElementById('pw-inp').value = '';
  document.getElementById('pw-err').textContent = '';
  // If already signed in on this device, skip straight to the panel.
  if(auth.currentUser){
    showAdminPanel();
  } else {
    document.getElementById('pw-screen').style.display = 'flex';
    document.getElementById('adm-panel').style.display = 'none';
  }
}

function closeAdmin(){ document.getElementById('admin-overlay').classList.remove('open'); }

function showAdminPanel(){
  document.getElementById('pw-screen').style.display = 'none';
  document.getElementById('adm-panel').style.display = 'block';
  document.getElementById('wa-inp').value = waNum;
  document.getElementById('abt-ar').value = aboutTexts.ar || '';
  document.getElementById('abt-en').value = aboutTexts.en || '';
  // populate theme inputs from saved theme
  var saved = JSON.parse(localStorage.getItem('vk-theme') || 'null') || DEFAULT_THEME;
  populateThemeInputs(saved);
  updateStats(); renderAdmList();
}

function checkPw(){
  var email = document.getElementById('pw-email').value.trim();
  var pass = document.getElementById('pw-inp').value;
  var btn = document.getElementById('pw-btn');
  var errEl = document.getElementById('pw-err');
  errEl.textContent = '';
  if(!email || !pass){ errEl.textContent = T('pwErr'); return; }
  btn.disabled = true;
  auth.signInWithEmailAndPassword(email, pass).then(function(){
    btn.disabled = false;
    showAdminPanel();
  }).catch(function(){
    btn.disabled = false;
    errEl.textContent = T('pwErr');
  });
}

function adminLogout(){
  auth.signOut().then(function(){ closeAdmin(); });
}

function updateStats(){
  document.getElementById('st-total').textContent = products.length;
  document.getElementById('st-avail').textContent = products.filter(function(p){ return !p.soldOut; }).length;
  document.getElementById('st-sold').textContent = products.filter(function(p){ return p.soldOut; }).length;
}

function renderAdmList(){
  var el = document.getElementById('adm-list');
  if(!el) return;
  if(!products.length){ el.innerHTML = '<div style="color:var(--text-light);font-size:13px;padding:10px">لا توجد منتجات</div>'; return; }
  el.innerHTML = products.map(function(p){
    var name = lang==='ar' ? p.nar : p.nen;
    var link = window.location.origin + window.location.pathname + '?product=' + p.id;
    return '<div class="prod-row">'
      + '<span class="pr-flag">'+p.flag+'</span>'
      + '<span class="pr-name">'+name+'</span>'
      + '<span class="pr-price">'+p.price+' '+T('mad')+'</span>'
      + '<div class="pr-actions">'
      + '<button class="'+(p.soldOut?'tog-so':'tog-av')+'" onclick="toggleSold(\''+p.id+'\')">'+(p.soldOut?T('togSo'):T('togAv'))+'</button>'
      + '<button class="copy-btn" style="background:#e8f5ee;color:var(--green)" onclick="openEdit(\''+p.id+'\')">✏ '+(lang==='ar'?'تعديل':'Edit')+'</button>'
      + '<button class="copy-btn" onclick="copyLink(\''+link+'\')">🔗 '+T('copyLink')+'</button>'
      + '<button class="del-btn" onclick="delProd(\''+p.id+'\')">'+T('del')+'</button>'
      + '</div></div>';
  }).join('');
}

function toggleSold(pid){
  var p = products.find(function(x){ return x.id===pid; });
  if(!p) return;
  db.collection('products').doc(pid).update({ soldOut: !p.soldOut })
    .then(function(){ toast(T('tSaved')); })
    .catch(function(err){ toast((lang==='ar'?'خطأ: ':'Error: ')+err.message); });
}

function delProd(pid){
  if(!confirm(lang==='ar'?'هل أنت متأكد من الحذف؟':'Are you sure?')) return;
  db.collection('products').doc(pid).delete()
    .then(function(){ toast(T('tDel')); })
    .catch(function(err){ toast((lang==='ar'?'خطأ: ':'Error: ')+err.message); });
}

function addProduct(){
  var nar=document.getElementById('f-nar').value.trim();
  var nen=document.getElementById('f-nen').value.trim();
  var car=document.getElementById('f-car').value.trim();
  var cen=document.getElementById('f-cen').value.trim();
  var flag=document.getElementById('f-flag').value.trim()||'🏳';
  var price=parseInt(document.getElementById('f-price').value)||0;
  var region=document.getElementById('f-region').value;
  if(!nar||!nen||!car||!cen||!price){ toast(T('tFill')); return; }
  var seed = Date.now();
  var imgs = pendingImgs.length ? pendingImgs.slice() : ['https://picsum.photos/seed/'+seed+'a/600/450'];
  var newProduct = {id:'p'+seed,nar:nar,nen:nen,car:car,cen:cen,flag:flag,price:price,region:region,imgs:imgs,sizes:['S','M','L','XL','XXL'],soldOut:false};
  db.collection('products').doc(newProduct.id).set(newProduct).then(function(){
    ['f-nar','f-nen','f-car','f-cen','f-flag','f-price'].forEach(function(id){ document.getElementById(id).value=''; });
    pendingImgs = [];
    document.getElementById('img-previews').innerHTML = '';
    toast(T('tAdded'));
  }).catch(function(err){ toast((lang==='ar'?'خطأ: ':'Error: ')+err.message); });
}

// ─── EDIT PRODUCT ───
function openEdit(pid){
  var p = products.find(function(x){ return x.id===pid; });
  if(!p) return;
  editingPid = pid;
  editImgs = p.imgs ? p.imgs.slice() : [];
  document.getElementById('e-nar').value = p.nar;
  document.getElementById('e-nen').value = p.nen;
  document.getElementById('e-car').value = p.car;
  document.getElementById('e-cen').value = p.cen;
  document.getElementById('e-flag').value = p.flag;
  document.getElementById('e-price').value = p.price;
  document.getElementById('e-region').value = p.region;
  renderPreviews('edit-previews', editImgs, null);
  document.getElementById('edit-modal-overlay').classList.add('open');
}

function closeEdit(){
  document.getElementById('edit-modal-overlay').classList.remove('open');
  editingPid = null; editImgs = [];
}

function saveEdit(){
  var p = products.find(function(x){ return x.id===editingPid; });
  if(!p) return;
  var updated = {
    nar: document.getElementById('e-nar').value.trim() || p.nar,
    nen: document.getElementById('e-nen').value.trim() || p.nen,
    car: document.getElementById('e-car').value.trim() || p.car,
    cen: document.getElementById('e-cen').value.trim() || p.cen,
    flag: document.getElementById('e-flag').value.trim() || p.flag,
    price: parseInt(document.getElementById('e-price').value) || p.price,
    region: document.getElementById('e-region').value
  };
  if(editImgs.length) updated.imgs = editImgs.slice();
  var savingEditPid = editingPid;
  db.collection('products').doc(savingEditPid).update(updated).then(function(){
    if(currentPid === savingEditPid) renderProductPage(savingEditPid);
    closeEdit(); toast(T('tSaved'));
  }).catch(function(err){ toast((lang==='ar'?'خطأ: ':'Error: ')+err.message); });
}

function saveWa(){
  var newWa = document.getElementById('wa-inp').value.trim();
  db.collection('meta').doc('settings').set({ waNum: newWa }, { merge: true })
    .then(function(){ toast(T('tWa')); })
    .catch(function(err){ toast((lang==='ar'?'خطأ: ':'Error: ')+err.message); });
}

function saveAbout(){
  var ar = document.getElementById('abt-ar').value.trim();
  var en = document.getElementById('abt-en').value.trim();
  db.collection('meta').doc('about').set({ ar: ar, en: en }, { merge: true })
    .then(function(){ toast(T('tAbout')); })
    .catch(function(err){ toast((lang==='ar'?'خطأ: ':'Error: ')+err.message); });
}

function copyLink(url){
  navigator.clipboard.writeText(url).then(function(){ toast(T('tCopy')); }).catch(function(){
    var ta = document.createElement('textarea');
    ta.value = url; document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); document.body.removeChild(ta);
    toast(T('tCopy'));
  });
}

// ─── THEME CUSTOMIZER ───
var DEFAULT_THEME = {
  royal:      '#1B3F8B',
  royalDeep:  '#0D2359',
  gold:       '#F2A500',
  green:      '#1A9E60',
  cardRadius: 14,
  cardNameFs: 13,
  cardPriceFs:17,
  heroTitleAr:'',
  heroTitleEn:'',
  heroSubAr:  '',
  heroSubEn:  '',
  heroBadgeAr:'',
  heroBadgeEn:'',
  heroCtaAr:  '',
  heroCtaEn:  '',
  storeName:  '',
  heroBrand1: '',
  heroBrand2: ''
};

function loadTheme(){
  var saved = JSON.parse(localStorage.getItem('vk-theme') || 'null');
  var theme = Object.assign({}, DEFAULT_THEME, saved || {});
  applyThemeToDOM(theme);
  // sync Firestore if logged in
  if(saved) return; // already applied from localStorage
}

function applyThemeToDOM(theme){
  var r = document.documentElement.style;

  // CSS vars
  r.setProperty('--royal',      theme.royal);
  r.setProperty('--royal-deep', theme.royalDeep);
  r.setProperty('--royal-mid',  adjustColor(theme.royal, 20));
  r.setProperty('--gold',       theme.gold);
  r.setProperty('--gold-light', adjustColor(theme.gold, 30));
  r.setProperty('--green',      theme.green);

  // card radius
  var cr = theme.cardRadius + 'px';
  document.querySelectorAll('.card').forEach(function(el){ el.style.borderRadius = cr; });

  // card name font size
  document.querySelectorAll('.card-name').forEach(function(el){ el.style.fontSize = theme.cardNameFs + 'px'; });

  // card price font size
  document.querySelectorAll('.card-price').forEach(function(el){ el.style.fontSize = theme.cardPriceFs + 'px'; });

  // texts — only override if set
  var isAr = lang === 'ar';
  if(theme.heroTitleAr || theme.heroTitleEn){
    var ht = isAr ? (theme.heroTitleAr||theme.heroTitleEn) : (theme.heroTitleEn||theme.heroTitleAr);
    // update i18n
    if(theme.heroTitleAr) tx.ar.hSub = theme.heroSubAr || tx.ar.hSub;
    if(theme.heroTitleEn) tx.en.hSub = theme.heroSubEn || tx.en.hSub;
  }
  if(theme.heroSubAr)   tx.ar.hSub      = theme.heroSubAr;
  if(theme.heroSubEn)   tx.en.hSub      = theme.heroSubEn;
  if(theme.heroBadgeAr) tx.ar.hEyebrow  = theme.heroBadgeAr;
  if(theme.heroBadgeEn) tx.en.hEyebrow  = theme.heroBadgeEn;
  if(theme.heroCtaAr)   tx.ar.hCta      = theme.heroCtaAr;
  if(theme.heroCtaEn)   tx.en.hCta      = theme.heroCtaEn;
  if(theme.heroTitleAr) tx.ar.navHome   = tx.ar.navHome; // keep

  // hero brand words
  var hb1 = theme.heroBrand1 || 'VINTA';
  var hb2 = theme.heroBrand2 || 'STORE';
  var heroTitle = document.querySelector('.hero-title');
  if(heroTitle) heroTitle.innerHTML = hb1 + ' <em>' + hb2 + '</em>';

  // store name (nav + footer)
  var sn = theme.storeName;
  if(sn){
    document.querySelectorAll('.nav-logo, .footer-logo, .pw-logo, .adm-nav-logo').forEach(function(el){
      if(el.classList.contains('adm-nav-logo')) el.textContent = sn + ' ADMIN';
      else el.textContent = sn;
    });
  }

  // hero sub / eyebrow / cta — live update
  var hEyebrow = document.getElementById('h-eyebrow');
  var hSub     = document.getElementById('h-sub');
  var hCta     = document.getElementById('h-cta');
  if(hEyebrow && (theme.heroBadgeAr || theme.heroBadgeEn)){
    hEyebrow.textContent = isAr ? (theme.heroBadgeAr||theme.heroBadgeEn) : (theme.heroBadgeEn||theme.heroBadgeAr);
  }
  if(hSub && (theme.heroSubAr || theme.heroSubEn)){
    hSub.textContent = isAr ? (theme.heroSubAr||theme.heroSubEn) : (theme.heroSubEn||theme.heroSubAr);
  }
  if(hCta && (theme.heroCtaAr || theme.heroCtaEn)){
    hCta.textContent = isAr ? (theme.heroCtaAr||theme.heroCtaEn) : (theme.heroCtaEn||theme.heroCtaAr);
  }
}

// Lighten/darken hex color by amount
function adjustColor(hex, amount){
  hex = hex.replace('#','');
  if(hex.length === 3) hex = hex.split('').map(function(c){ return c+c; }).join('');
  var r = Math.min(255, parseInt(hex.slice(0,2),16)+amount);
  var g = Math.min(255, parseInt(hex.slice(2,4),16)+amount);
  var b = Math.min(255, parseInt(hex.slice(4,6),16)+amount);
  return '#'+[r,g,b].map(function(v){ return ('0'+v.toString(16)).slice(-2); }).join('');
}

function previewTheme(){
  // Update hex labels
  ['royal','royal-deep','gold','green'].forEach(function(k){
    var inp = document.getElementById('tc-'+k);
    var val = document.getElementById('tv-'+k);
    if(inp && val) val.textContent = inp.value;
  });
  // Update range labels
  document.getElementById('trv-card-name').textContent  = document.getElementById('tr-card-name').value  + 'px';
  document.getElementById('trv-card-price').textContent = document.getElementById('tr-card-price').value + 'px';
  document.getElementById('trv-radius').textContent     = document.getElementById('tr-radius').value     + 'px';

  applyThemeToDOM(readThemeInputs());
}

function readThemeInputs(){
  return {
    royal:       document.getElementById('tc-royal').value,
    royalDeep:   document.getElementById('tc-royal-deep').value,
    gold:        document.getElementById('tc-gold').value,
    green:       document.getElementById('tc-green').value,
    cardRadius:  parseInt(document.getElementById('tr-radius').value),
    cardNameFs:  parseInt(document.getElementById('tr-card-name').value),
    cardPriceFs: parseInt(document.getElementById('tr-card-price').value),
    heroTitleAr: document.getElementById('ti-hero-title-ar').value.trim(),
    heroTitleEn: document.getElementById('ti-hero-title-en').value.trim(),
    heroSubAr:   document.getElementById('ti-hero-sub-ar').value.trim(),
    heroSubEn:   document.getElementById('ti-hero-sub-en').value.trim(),
    heroBadgeAr: document.getElementById('ti-hero-badge-ar').value.trim(),
    heroBadgeEn: document.getElementById('ti-hero-badge-en').value.trim(),
    heroCtaAr:   document.getElementById('ti-hero-cta-ar').value.trim(),
    heroCtaEn:   document.getElementById('ti-hero-cta-en').value.trim(),
    storeName:   document.getElementById('ti-store-name').value.trim(),
    heroBrand1:  document.getElementById('ti-hero-brand1').value.trim(),
    heroBrand2:  document.getElementById('ti-hero-brand2').value.trim()
  };
}

function populateThemeInputs(theme){
  document.getElementById('tc-royal').value      = theme.royal      || DEFAULT_THEME.royal;
  document.getElementById('tc-royal-deep').value = theme.royalDeep  || DEFAULT_THEME.royalDeep;
  document.getElementById('tc-gold').value       = theme.gold       || DEFAULT_THEME.gold;
  document.getElementById('tc-green').value      = theme.green      || DEFAULT_THEME.green;
  document.getElementById('tr-radius').value     = theme.cardRadius  !== undefined ? theme.cardRadius  : DEFAULT_THEME.cardRadius;
  document.getElementById('tr-card-name').value  = theme.cardNameFs  !== undefined ? theme.cardNameFs  : DEFAULT_THEME.cardNameFs;
  document.getElementById('tr-card-price').value = theme.cardPriceFs !== undefined ? theme.cardPriceFs : DEFAULT_THEME.cardPriceFs;
  document.getElementById('ti-hero-title-ar').value = theme.heroTitleAr || '';
  document.getElementById('ti-hero-title-en').value = theme.heroTitleEn || '';
  document.getElementById('ti-hero-sub-ar').value   = theme.heroSubAr   || '';
  document.getElementById('ti-hero-sub-en').value   = theme.heroSubEn   || '';
  document.getElementById('ti-hero-badge-ar').value = theme.heroBadgeAr || '';
  document.getElementById('ti-hero-badge-en').value = theme.heroBadgeEn || '';
  document.getElementById('ti-hero-cta-ar').value   = theme.heroCtaAr   || '';
  document.getElementById('ti-hero-cta-en').value   = theme.heroCtaEn   || '';
  document.getElementById('ti-store-name').value    = theme.storeName   || '';
  document.getElementById('ti-hero-brand1').value   = theme.heroBrand1  || '';
  document.getElementById('ti-hero-brand2').value   = theme.heroBrand2  || '';
  // update labels
  ['royal','royal-deep','gold','green'].forEach(function(k){
    var inp = document.getElementById('tc-'+k);
    var val = document.getElementById('tv-'+k);
    if(inp && val) val.textContent = inp.value;
  });
  document.getElementById('trv-card-name').textContent  = document.getElementById('tr-card-name').value  + 'px';
  document.getElementById('trv-card-price').textContent = document.getElementById('tr-card-price').value + 'px';
  document.getElementById('trv-radius').textContent     = document.getElementById('tr-radius').value     + 'px';
}

function saveTheme(){
  var theme = readThemeInputs();
  localStorage.setItem('vk-theme', JSON.stringify(theme));
  // also save to Firestore so all devices get it
  if(db){
    db.collection('meta').doc('theme').set(theme)
      .then(function(){ toast(lang==='ar' ? 'تم حفظ التخصيصات ✓' : 'Theme saved ✓'); })
      .catch(function(){ toast(lang==='ar' ? 'تم الحفظ محلياً ✓' : 'Saved locally ✓'); });
  } else {
    toast(lang==='ar' ? 'تم حفظ التخصيصات ✓' : 'Theme saved ✓');
  }
  applyThemeToDOM(theme);
}

function resetTheme(){
  if(!confirm(lang==='ar' ? 'هل أنت متأكد من إعادة الضبط؟' : 'Reset to defaults?')) return;
  localStorage.removeItem('vk-theme');
  if(db) db.collection('meta').doc('theme').delete().catch(function(){});
  populateThemeInputs(DEFAULT_THEME);
  applyThemeToDOM(DEFAULT_THEME);
  toast(lang==='ar' ? 'تم إعادة الضبط ✓' : 'Reset done ✓');
}

// ─── TOAST ───
function toast(msg){
  var el = document.getElementById('toast');
  el.textContent = msg; el.classList.add('show');
  setTimeout(function(){ el.classList.remove('show'); }, 2400);
}

// ─── INIT ───
// Seed Firestore with the default products the very first time the
// store is opened (only runs if the "products" collection is empty).
function seedIfEmpty(){
  return db.collection('products').limit(1).get().then(function(snap){
    if(snap.empty){
      var batch = db.batch();
      DEFAULT_PRODUCTS.forEach(function(p){
        batch.set(db.collection('products').doc(p.id), p);
      });
      return batch.commit();
    }
  }).catch(function(err){
    console.error('Firestore seed error:', err);
  });
}

function initApp(){
  // Apply saved theme immediately (before network)
  var savedTheme = JSON.parse(localStorage.getItem('vk-theme') || 'null');
  if(savedTheme) applyThemeToDOM(savedTheme);

  // Render the page shell immediately (with placeholder data) so the UI
  // isn't blank while we wait for the network.
  applyLang();

  // Live products listener — fires immediately with cached/local data,
  // then again whenever anything changes on any device.
  db.collection('products').onSnapshot(function(snap){
    products = snap.docs.map(function(d){ return d.data(); });
    updateHeroStats();
    renderGrid();
    if(document.getElementById('admin-overlay').classList.contains('open')){
      updateStats();
      renderAdmList();
    }
    if(currentPid) renderProductPage(currentPid);

    // Handle ?product=xxx deep link on first load only
    if(firstProductsLoad){
      firstProductsLoad = false;
      var urlParams = new URLSearchParams(window.location.search);
      var prodParam = urlParams.get('product');
      if(prodParam && products.find(function(p){ return p.id===prodParam; })){
        currentPid = prodParam;
        document.querySelectorAll('.page').forEach(function(el){ el.classList.remove('active'); });
        document.getElementById('page-product').classList.add('active');
        renderProductPage(currentPid);
      }
    }
  }, function(err){
    console.error('Firestore products error:', err);
    toast(lang==='ar' ? 'تعذر تحميل البيانات، تحقق من الاتصال' : 'Failed to load data, check your connection');
  });

  // Live WhatsApp number listener
  db.collection('meta').doc('settings').onSnapshot(function(doc){
    if(doc.exists){
      waNum = doc.data().waNum || waNum;
      var waInp = document.getElementById('wa-inp');
      if(waInp) waInp.value = waNum;
    }
  });

  // Live theme listener
  db.collection('meta').doc('theme').onSnapshot(function(doc){
    if(doc.exists){
      var theme = Object.assign({}, DEFAULT_THEME, doc.data());
      localStorage.setItem('vk-theme', JSON.stringify(theme));
      applyThemeToDOM(theme);
    }
  });

  // Live "About us" text listener
  db.collection('meta').doc('about').onSnapshot(function(doc){
    if(doc.exists){
      var d = doc.data();
      aboutTexts.ar = d.ar || aboutTexts.ar;
      aboutTexts.en = d.en || aboutTexts.en;
      var abText = document.getElementById('ab-text');
      if(abText) abText.textContent = aboutTexts[lang] || aboutTexts.ar;
      var abtAr = document.getElementById('abt-ar'); if(abtAr) abtAr.value = aboutTexts.ar;
      var abtEn = document.getElementById('abt-en'); if(abtEn) abtEn.value = aboutTexts.en;
    }
  });
}

seedIfEmpty().then(initApp);

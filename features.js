// ═══════════════ SEARCH ═══════════════
function doSearch(q){
  const res=document.getElementById('search-results');
  q=q.trim().toLowerCase();
  if(!q){res.innerHTML='<div class="empty-state">Start typing to search...</div>';return;}
  const results=[];
  notes.forEach(n=>{
    const co=courses.find(x=>x.id===n.courseId),su=subjects.find(x=>x.id===n.subjectId),fo=folders.find(x=>x.id===n.folderId);
    if(n.topic.toLowerCase().includes(q)||(n.desc||'').toLowerCase().includes(q)||(su&&su.name.toLowerCase().includes(q)))
      results.push({type:'NOTE',icon:'🗂️',title:n.topic,sub:[co&&co.name,su&&su.name,fo&&fo.name].filter(Boolean).join(' › '),action:()=>openPDF(n)});
  });
  videos.forEach(v=>{
    const co=courses.find(x=>x.id===v.courseId),su=subjects.find(x=>x.id===v.subjectId);
    if(v.title.toLowerCase().includes(q)||(v.desc||'').toLowerCase().includes(q)||(su&&su.name.toLowerCase().includes(q)))
      results.push({type:'VIDEO',icon:'🎥',title:v.title,sub:[co&&co.name,su&&su.name].filter(Boolean).join(' › '),action:()=>window.open(v.link,'_blank')});
  });
  if(!results.length){res.innerHTML='<div class="empty-state">No results for "'+q+'"</div>';return;}
  res.innerHTML='';
  results.forEach(r=>{
    const d=document.createElement('div');d.className='sr-item';
    d.innerHTML=`<span style="font-size:20px">${r.icon}</span><div style="flex:1"><div class="sr-title">${r.title}</div><div class="sr-sub">${r.sub}</div></div><span class="sr-type">${r.type}</span>`;
    d.addEventListener('click',r.action);res.appendChild(d);
  });
}

// ═══════════════ AI CHAT ═══════════════
const WORKER_URL='https://calm-lake-2eaf.medistudy2026.workers.dev';
const SYSTEM=`You are MediBot, an expert MBBS tutor. Cover all subjects: Anatomy, Physiology, Biochemistry, Pathology, Pharmacology, Microbiology, Medicine, Surgery, OBG, Paediatrics, ENT, Ophthalmology. Explain simply using short lines and plain text only. Do NOT use markdown symbols like **, ##, or - for formatting, since your answer is shown as plain text, not rendered markdown. For emphasis, use CAPITAL LETTERS or simply write the key term plainly instead of surrounding it with asterisks. For lists, start each line with a number like "1." or a bullet character "•" instead of a dash or asterisk. Add mnemonics. For MCQs give 4 options with correct answer and explanation. Be encouraging and exam-focused.`;
function chatKey(e){if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMsg();}}
async function sendQ(q){goPage('tutor');document.getElementById('chat-input').value=q;await sendMsg();}
async function sendMsg(){
  const inp=document.getElementById('chat-input'),text=inp.value.trim();
  if(!text||chatLoading)return;
  chatLoading=true;document.getElementById('chat-send').disabled=true;
  const w=document.getElementById('chat-welcome');if(w)w.remove();
  addChatMsg('user',text);chatHistory.push({role:'user',content:text});inp.value='';
  const td=document.createElement('div');td.className='msg ai';td.id='typing';
  td.innerHTML='<div class="msg-av">🧠</div><div class="msg-bubble"><div class="typing"><div class="tdot"></div><div class="tdot"></div><div class="tdot"></div></div></div>';
  document.getElementById('chat-msgs').appendChild(td);
  document.getElementById('chat-msgs').scrollTop=9999;
  try{
    // Send a user ID so Worker can track per-user limits
    const userId = localStorage.getItem('ms_chat_name') || localStorage.getItem('ms_user_id') || 'guest';
    const res=await fetch(WORKER_URL,{
      method:'POST',
      headers:{
        'Content-Type':'application/json'
      },
      body:JSON.stringify({
        userId: userId,
        model:'openai/gpt-oss-120b',
        messages:[
          {role:'system', content:SYSTEM},
          ...chatHistory
        ],
        max_tokens:1024,
        temperature:0.7
      })
    });
    const data=await res.json();
    document.getElementById('typing')?.remove();
    if(data.error){
      addChatMsg('ai','⚠️ AI Error: '+data.error.message+'. Please try again.');
    } else {
      const reply=data.choices?.[0]?.message?.content||'Sorry, could not respond. Please try again.';
      chatHistory.push({role:'assistant',content:reply});
      addChatMsg('ai',reply);
    }
  }catch(e){document.getElementById('typing')?.remove();console.error('MediBot error:',e);addChatMsg('ai','⚠️ Connection error: '+e.message+'. Please check internet.');}
  chatLoading=false;document.getElementById('chat-send').disabled=false;
}
function addChatMsg(role,text){
  const d=document.createElement('div');d.className='msg '+role;
  d.innerHTML=`<div class="msg-av">${role==='ai'?'🧠':'👤'}</div><div class="msg-bubble">${fmt(text)}</div>`;
  document.getElementById('chat-msgs').appendChild(d);document.getElementById('chat-msgs').scrollTop=9999;
}
function fmt(t){return t.replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>').replace(/\*(.*?)\*/g,'<em>$1</em>').replace(/\n/g,'<br>');}

// ═══════════════ PDF VIEWER (PDF.js) ═══════════════
let pdfJsDoc=null, pdfCurrentPage=1, pdfTotalPages=0, pdfRendering=false, pdfBlobUrl=null, pdfCurrentBlob=null;
let pdfImmersiveTimer=null;

// Configure PDF.js worker
if(typeof pdfjsLib!=='undefined'){
  pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

function _pdfSetProgress(pct){
  document.getElementById('pdf-progress-bar').style.width=pct+'%';
}
function _pdfShowLoading(msg){
  document.getElementById('pdf-loading').style.display='flex';
  document.getElementById('pdf-loading-msg').textContent=msg||'Opening document...';
  document.getElementById('pdf-canvas-container').style.display='none';
  document.getElementById('pdf-frame').style.display='none';
  document.getElementById('pdf-no-embed').style.display='none';
  document.getElementById('pdf-nav-bar').classList.remove('visible');
}
function _pdfShowCanvas(){
  document.getElementById('pdf-loading').style.display='none';
  const c=document.getElementById('pdf-canvas-container');
  c.style.display='block';
  c.onscroll=_onPdfScroll;
  document.getElementById('pdf-frame').style.display='none';
  document.getElementById('pdf-no-embed').style.display='none';
  document.getElementById('pdf-nav-bar').classList.add('visible');
  _pdfSetProgress(100);
  setTimeout(()=>_pdfSetProgress(0),600);
}
function _pdfShowFallbackIframe(url){
  document.getElementById('pdf-loading').style.display='none';
  document.getElementById('pdf-canvas-container').style.display='none';
  document.getElementById('pdf-frame').src=url;
  document.getElementById('pdf-frame').style.display='block';
  document.getElementById('pdf-no-embed').style.display='none';
  document.getElementById('pdf-nav-bar').classList.remove('visible');
  _pdfSetProgress(0);
}
function _pdfShowError(msg){
  document.getElementById('pdf-loading').style.display='none';
  document.getElementById('pdf-canvas-container').style.display='none';
  document.getElementById('pdf-frame').style.display='none';
  document.getElementById('pdf-no-embed').style.display='flex';
  document.getElementById('pdf-nav-bar').classList.remove('visible');
  if(msg) document.getElementById('pdf-no-embed-msg').innerHTML=msg;
  _pdfSetProgress(0);
}

async function _renderPdfFromBlob(blob){
  if(pdfBlobUrl){ URL.revokeObjectURL(pdfBlobUrl); pdfBlobUrl=null; }
  pdfCurrentBlob=blob;
  pdfBlobUrl=URL.createObjectURL(blob);

  if(typeof pdfjsLib==='undefined'){
    _pdfShowFallbackIframe(pdfBlobUrl);
    return;
  }

  try{
    _pdfSetProgress(30);
    const arrayBuf=await blob.arrayBuffer();
    _pdfSetProgress(60);
    pdfJsDoc=await pdfjsLib.getDocument({
      data:arrayBuf,
      standardFontDataUrl:'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/standard_fonts/'
    }).promise;
    pdfTotalPages=pdfJsDoc.numPages;
    pdfCurrentPage=1;
    _pdfSetProgress(80);
    _pdfShowCanvas();
    _updateNavBar();
    // Render all pages in a scrollable column — natural scroll like a document
    await _renderAllPages();
  }catch(e){
    console.warn('PDF.js render failed:',e);
    _pdfShowFallbackIframe(pdfBlobUrl);
  }
}

// ═══════════════ LAZY PDF RENDERER ═══════════════
// Renders only pages near the viewport — safe for 300-400 page PDFs
// RAM stays ~20MB regardless of total page count
const PDF_RENDER_AHEAD = 2;  // render 2 pages ahead of current
const PDF_RENDER_BEHIND = 1; // keep 1 page behind rendered
const PDF_UNLOAD_DISTANCE = 5; // recycle pages >5 away from current

let _pdfPageHeights = [];    // stores CSS height of each page (for placeholder sizing)
let _pdfRenderedPages = new Set(); // which page numbers are currently rendered
let _pdfRenderQueue = [];    // pages waiting to render
let _pdfRenderBusy = false;  // prevent concurrent renders
let _pdfQualityScale = 2.0;  // global quality scale set on init
let _pdfVw = 400;            // global viewport width set on init
let _pdfScrollTimer = null;  // debounce timer for scroll

async function _renderAllPages(preservePage){
  const container = document.getElementById('pdf-canvas-container');
  container.innerHTML = '';
  _pdfRenderedPages.clear();
  _pdfRenderQueue = [];
  _pdfRenderBusy = false;

  const dpr = window.devicePixelRatio || 1;
  // Adaptive quality: budget phones (low-DPI screens) get 2x — still sharp on their screen
  // Mid/flagship phones (high-DPI screens) get 3x — Drive-level quality
  _pdfQualityScale = dpr <= 1.5 ? Math.max(dpr, 2.0) : Math.max(dpr, 3.0);
  // Use container's actual inner width — avoids scrollbar/padding offset issues
  const _container = document.getElementById('pdf-canvas-container');
  _pdfVw = Math.min((_container ? _container.clientWidth : window.innerWidth) - 4, 800);

  // STEP 1: Get dimensions from page 1 only (fast — most PDFs are uniform size)
  // We use this to create same-height placeholders for all pages instantly
  _pdfPageHeights = [];
  _pdfSetProgress(85);
  const firstPage = await pdfJsDoc.getPage(1);
  const firstBase = firstPage.getViewport({scale: 1});
  const firstScale = (_pdfVw / firstBase.width) * _pdfQualityScale;
  const firstVp = firstPage.getViewport({scale: firstScale});
  const defaultCssW = Math.round(firstVp.width / _pdfQualityScale);
  const defaultCssH = Math.round(firstVp.height / _pdfQualityScale);
  // Store default dim for all pages — actual dims fetched when page renders
  for(let i = 1; i <= pdfTotalPages; i++){
    _pdfPageHeights.push({cssW: defaultCssW, cssH: defaultCssH});
  }
  _pdfSetProgress(90);

  // STEP 2: Create placeholder divs for every page (instant, zero RAM for pixels)
  _pdfPageHeights.forEach((dim, idx) => {
    const ph = document.createElement('div');
    ph.id = `pdf-page-${idx+1}`;
    ph.dataset.page = idx + 1;
    ph.style.cssText = `
      position:relative; display:block; margin:6px auto;
      width:${dim.cssW}px; height:${dim.cssH}px;
      background:#3a3a3a; box-shadow:0 2px 8px rgba(0,0,0,0.4);
    `;
    // Page number label inside placeholder
    const lbl = document.createElement('div');
    lbl.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:#888;font-size:13px;';
    lbl.textContent = `Page ${idx+1}`;
    ph.appendChild(lbl);
    container.appendChild(ph);
  });

  container.scrollTop = 0;
  pdfCurrentPage = 1;
  _updateNavBar();
  _pdfSetProgress(100);

  // If re-rendering after a rotation, jump back to where the student was reading
  if(preservePage && preservePage > 1 && preservePage <= pdfTotalPages){
    pdfCurrentPage = preservePage;
    _updateNavBar();
    const ph = document.getElementById(`pdf-page-${preservePage}`);
    if(ph) container.scrollTop = ph.offsetTop;
  }

  // STEP 3: Render first visible pages immediately
  await _lazyRenderAround(pdfCurrentPage);
}

// Re-render the open PDF at the new width when the phone is rotated,
// so pages actually fill the screen instead of staying sized for the old orientation.
let _pdfOrientationTimer = null;
window.addEventListener('resize', () => {
  if(!pdfJsDoc) return; // no PDF currently loaded
  const overlay = document.getElementById('pdf-overlay');
  if(!overlay || !overlay.classList.contains('open')) return; // PDF viewer not open
  clearTimeout(_pdfOrientationTimer);
  _pdfOrientationTimer = setTimeout(() => {
    _renderAllPages(pdfCurrentPage);
  }, 400); // wait for rotation animation to settle before re-measuring width
});

// Render pages around a given page number, unload far pages
async function _lazyRenderAround(centerPage){
  const from = Math.max(1, centerPage - PDF_RENDER_BEHIND);
  const to   = Math.min(pdfTotalPages, centerPage + PDF_RENDER_AHEAD);

  // Unload pages that are too far away (free RAM)
  for(const p of [..._pdfRenderedPages]){
    if(p < centerPage - PDF_UNLOAD_DISTANCE || p > centerPage + PDF_UNLOAD_DISTANCE){
      _unloadPage(p);
    }
  }

  // Queue pages to render (skip already rendered)
  for(let i = from; i <= to; i++){
    if(!_pdfRenderedPages.has(i)){
      _pdfRenderQueue.push(i);
    }
  }
  // Deduplicate queue
  _pdfRenderQueue = [...new Set(_pdfRenderQueue)];

  // Start processing queue
  _processRenderQueue();
}

async function _processRenderQueue(){
  if(_pdfRenderBusy || _pdfRenderQueue.length === 0) return;
  _pdfRenderBusy = true;
  while(_pdfRenderQueue.length > 0){
    const pageNum = _pdfRenderQueue.shift();
    if(!_pdfRenderedPages.has(pageNum)){
      await _renderSinglePage(pageNum);
    }
  }
  _pdfRenderBusy = false;
}

async function _renderSinglePage(pageNum){
  const container = document.getElementById('pdf-canvas-container');
  const placeholder = document.getElementById(`pdf-page-${pageNum}`);
  if(!placeholder || !pdfJsDoc) return;

  try{
    const page = await pdfJsDoc.getPage(pageNum);
    // Compute this page's actual dimensions (handles PDFs with mixed page sizes)
    const base = page.getViewport({scale: 1});
    const scale = (_pdfVw / base.width) * _pdfQualityScale;
    const viewport = page.getViewport({scale});
    const cssW = Math.round(viewport.width / _pdfQualityScale);
    const cssH = Math.round(viewport.height / _pdfQualityScale);
    // Update stored dimensions so placeholder height is exact after render
    _pdfPageHeights[pageNum-1] = {cssW, cssH};
    // Update placeholder height in case it differs from default
    if(placeholder) { placeholder.style.width=cssW+'px'; placeholder.style.height=cssH+'px'; }

    // Build canvas
    const canvas = document.createElement('canvas');
    canvas.width  = viewport.width;
    canvas.height = viewport.height;
    canvas.style.width  = cssW + 'px';
    canvas.style.height = cssH + 'px';
    canvas.style.display = 'block';

    // Clear placeholder and insert rendered canvas
    placeholder.innerHTML = '';
    placeholder.appendChild(canvas);

    // Render pixels (annotationMode 2 = render highlights/underlines into same canvas)
    await page.render({
      canvasContext: canvas.getContext('2d'),
      viewport,
      annotationMode: 2
    }).promise;

    _pdfRenderedPages.add(pageNum);
  }catch(e){
    console.warn('[PDF] Failed to render page', pageNum, e);
  }
}

function _unloadPage(pageNum){
  const placeholder = document.getElementById(`pdf-page-${pageNum}`);
  if(!placeholder) return;
  const dim = _pdfPageHeights[pageNum - 1];
  // Replace canvas with a lightweight placeholder (keeps scroll height intact)
  placeholder.innerHTML = '';
  const lbl = document.createElement('div');
  lbl.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:#666;font-size:12px;';
  lbl.textContent = `Page ${pageNum}`;
  placeholder.appendChild(lbl);
  _pdfRenderedPages.delete(pageNum);
}

// Scroll handler — debounced to avoid firing 60x per second
function _onPdfScroll(){
  if(!pdfJsDoc) return;
  if(_pdfScrollTimer) clearTimeout(_pdfScrollTimer);
  _pdfScrollTimer = setTimeout(_onPdfScrollDebounced, 120);
}

function _onPdfScrollDebounced(){
  const container = document.getElementById('pdf-canvas-container');
  if(!container) return;
  const scrollTop = container.scrollTop;
  const viewH = container.clientHeight;
  const containerTop = container.getBoundingClientRect().top;

  // Find which page is at the top of the visible area
  // Use getBoundingClientRect so positions are relative to viewport, not document
  let current = 1;
  const placeholders = container.querySelectorAll('[data-page]');
  placeholders.forEach(ph => {
    const rect = ph.getBoundingClientRect();
    // Page is considered "current" when its top edge enters the top half of container
    if(rect.top <= containerTop + viewH * 0.5) current = parseInt(ph.dataset.page);
  });

  // Clamp to valid range
  current = Math.max(1, Math.min(current, pdfTotalPages));

  if(current !== pdfCurrentPage){
    pdfCurrentPage = current;
    _updateNavBar();
  }
  _lazyRenderAround(current);
}

async function pdfPrevPage(){
  if(pdfCurrentPage<=1) return;
  pdfCurrentPage--;
  const ph=document.getElementById(`pdf-page-${pdfCurrentPage}`);
  if(ph) ph.scrollIntoView({behavior:'smooth'});
  _updateNavBar();
  _lazyRenderAround(pdfCurrentPage);
}
async function pdfNextPage(){
  if(pdfCurrentPage>=pdfTotalPages) return;
  pdfCurrentPage++;
  const ph=document.getElementById(`pdf-page-${pdfCurrentPage}`);
  if(ph) ph.scrollIntoView({behavior:'smooth'});
  _updateNavBar();
  _lazyRenderAround(pdfCurrentPage);
}
function _updateNavBar(){
  document.getElementById('pdf-page-info').textContent=`Page ${pdfCurrentPage} / ${pdfTotalPages}`;
  document.getElementById('pdf-prev-btn').disabled=pdfCurrentPage<=1;
  document.getElementById('pdf-next-btn').disabled=pdfCurrentPage>=pdfTotalPages;
}

// Download a PDF from Google Drive with retry (handles virus-scan warning page)
async function _driveDownloadWithConfirm(fileId){
  // Route through Cloudflare Worker to bypass Google Drive CORS block
  const workerUrl=`https://calm-lake-2eaf.medistudy2026.workers.dev/pdf?id=${fileId}`;
  _pdfDebugToast('Fetching via Worker: '+fileId.slice(0,12)+'...');
  try{
    const resp=await fetch(workerUrl);
    if(!resp.ok){ _pdfDebugToast('Worker error: HTTP '+resp.status); return null; }
    const blob=await resp.blob();
    if(blob.type.includes('text/html')||blob.size<5000){
      _pdfDebugToast('Worker returned HTML/tiny: '+blob.size+'b type:'+blob.type);
      return null;
    }
    _pdfDebugToast('Worker fetch OK: '+Math.round(blob.size/1024)+'KB');
    return blob;
  }catch(e){
    _pdfDebugToast('Worker fetch exception: '+(e.message||String(e)).slice(0,60));
    return null;
  }
}

async function openPDF(note){
  currentPDF=note;
  document.getElementById('pdf-overlay').classList.remove('immersive');
  schedulePDFAutoImmersive();
  document.getElementById('pdf-title').textContent=note.topic;
  document.getElementById('pdf-overlay').classList.add('open');
  try{ history.pushState({msPdfOpen:true},'',location.pathname+location.search); }catch(e){}
  pdfJsDoc=null; pdfCurrentPage=1; pdfTotalPages=0; pdfRendering=false;

  const m=note.link.match(/\/d\/([a-zA-Z0-9_-]+)/);
  const fileId=m?m[1]:null;
  const drivePreviewUrl=fileId?`https://drive.google.com/file/d/${fileId}/preview`:note.link;

  updatePDFSaveBtn(note.id);

  // ── STEP 1: Check IndexedDB first (works offline AND saves data online) ──
  _pdfShowLoading('Checking saved copy...');
  _pdfSetProgress(10);
  const cachedBlob=await getPdfBlob(note.id);

  if(cachedBlob){
    _pdfShowLoading('Opening saved copy...');
    await _renderPdfFromBlob(cachedBlob);
    return;
  }

  // ── STEP 2: Offline + no cache = show error ──
  if(!navigator.onLine){
    _pdfShowError('You are offline.<br>Open this note while online and tap <strong>💾 Save Offline</strong> to read anytime.');
    return;
  }

  // ── STEP 3: Online, no cache — try to download PDF for PDF.js rendering ──
  _pdfShowLoading('Downloading PDF...');
  _pdfSetProgress(20);

  if(fileId){
    // Try direct download via Drive export (best for PDF.js + offline caching)
    try{
      const blob = await _driveDownloadWithConfirm(fileId);
      if(blob){
        _pdfShowLoading('Rendering PDF...');
        await _renderPdfFromBlob(blob);
        savePdfBlobDirect(note.id, blob).then(()=>updatePDFSaveBtn(note.id));
        return;
      }
    }catch(e){ console.warn('Drive download failed, falling back to iframe',e); }
  }

  // ── STEP 4: Last resort — Drive preview iframe ──
  _pdfShowLoading('Loading preview...');
  _pdfShowFallbackIframe(drivePreviewUrl);
  // If iframe takes too long, show error with Save Offline suggestion
  const frame=document.getElementById('pdf-frame');
  let iframeTimer=setTimeout(()=>{
    // Still show the frame but also show a subtle hint
    const loadingEl=document.getElementById('pdf-loading');
    if(loadingEl) loadingEl.style.display='none';
  },5000);
  frame.onload=()=>clearTimeout(iframeTimer);
}

let _pdfClosingViaBack=false;
function closePDF(){
  const overlay=document.getElementById('pdf-overlay');
  const wasOpen=overlay.classList.contains('open');
  overlay.classList.remove('open');
  overlay.classList.remove('immersive');
  clearTimeout(pdfImmersiveTimer); pdfImmersiveTimer=null;
  document.getElementById('pdf-immersive-hint').classList.remove('show');
  // Cleanup
  if(pdfBlobUrl){ URL.revokeObjectURL(pdfBlobUrl); pdfBlobUrl=null; }
  pdfCurrentBlob=null;
  document.getElementById('pdf-frame').src='';
  document.getElementById('pdf-frame').style.display='none';
  document.getElementById('pdf-canvas-container').innerHTML='';
  document.getElementById('pdf-canvas-container').style.display='none';
  document.getElementById('pdf-loading').style.display='none';
  document.getElementById('pdf-no-embed').style.display='none';
  document.getElementById('pdf-nav-bar').classList.remove('visible');
  _pdfSetProgress(0);
  pdfJsDoc=null; pdfCurrentPage=1; pdfTotalPages=0; pdfRendering=false;
  currentPDF=null;
  // If this was closed via the ✕ Close button (not the phone/browser back button), pop the
  // history entry we pushed when opening the PDF so Back doesn't land on a leftover empty state.
  if(wasOpen && !_pdfClosingViaBack){
    try{ if(history.state && history.state.msPdfOpen) history.back(); }catch(e){}
  }
  _pdfClosingViaBack=false;
}

// ── Immersive reading mode: hide top/bottom bars to give full-screen space for the note ──
function togglePDFImmersive(){
  const overlay=document.getElementById('pdf-overlay');
  clearTimeout(pdfImmersiveTimer);
  overlay.classList.toggle('immersive');
  document.getElementById('pdf-immersive-hint').classList.remove('show');
}
// Tapping the note content itself toggles immersive mode (ignored if the tap was a drag/scroll or hit a control)
function onPdfContentTap(event){
  if(event.target.closest('button,a,select,input'))return;
  togglePDFImmersive();
}
// Auto-hide bars shortly after opening — landscape gets a quick auto-hide since screen height is tightest there;
// portrait leaves bars visible by default (plenty of room already) but tap-to-hide still works either way.
function schedulePDFAutoImmersive(){
  clearTimeout(pdfImmersiveTimer);
  const isLandscape=window.matchMedia('(orientation: landscape)').matches;
  const delay=isLandscape?1800:4000;
  pdfImmersiveTimer=setTimeout(()=>{
    document.getElementById('pdf-overlay').classList.add('immersive');
    const hint=document.getElementById('pdf-immersive-hint');
    hint.classList.add('show');
    setTimeout(()=>hint.classList.remove('show'),2200);
  },delay);
}
// If the phone is rotated while a note is open, re-arm the auto-hide for the new orientation
window.addEventListener('orientationchange',()=>{
  if(document.getElementById('pdf-overlay').classList.contains('open'))schedulePDFAutoImmersive();
});

function updatePDFSaveBtn(id){
  const btn=document.getElementById('pdf-save-bar-btn');
  const isSaved=savedNotes.some(s=>s.id===id);
  if(isSaved){
    btn.textContent='⏳ Checking...';
    btn.className='pdf-save-bar-btn saved-bar';
    hasPdfBlob(id).then(has=>{
      btn.textContent=has?'✅ Saved Offline':'⏳ Downloading...';
    });
  } else {
    btn.textContent='💾 Save Offline';
    btn.className='pdf-save-bar-btn';
  }
}
function toggleSaveFromViewer(){
  if(!currentPDF) return;
  const note=currentPDF;
  const btn=document.getElementById('pdf-save-bar-btn');
  const alreadySaved=isNoteSaved(note.id);

  if(alreadySaved){
    // UN-SAVE: remove from list and delete blob
    const idx=savedNotes.findIndex(s=>s.id===note.id);
    if(idx>=0) savedNotes.splice(idx,1);
    deletePdfBlob(note.id);
    saveSaved();
    if(btn){ btn.textContent='💾 Save Offline'; btn.className='pdf-save-bar-btn'; btn.disabled=false; }
    if(document.getElementById('page-saved').classList.contains('active')) renderSaved();
    return;
  }

  // SAVE: add to list and cache the blob
  savedNotes.push({...note, savedAt:Date.now()});
  saveSaved();
  if(document.getElementById('page-saved').classList.contains('active')) renderSaved();

  if(btn){ btn.textContent='⏳ Saving...'; btn.className='pdf-save-bar-btn saved-bar'; btn.disabled=true; }

  const _onSaveOk=()=>{
    if(btn){ btn.textContent='✅ Saved Offline'; btn.className='pdf-save-bar-btn saved-bar'; btn.disabled=false; }
  };
  const _onSaveFail=()=>{
    showOfflineToast('⚠️ Could not cache offline — note saved to list but not offline',false);
    if(btn){ btn.textContent='⚠️ Not cached'; btn.className='pdf-save-bar-btn saved-bar'; btn.disabled=false; }
  };

  const m=note.link?note.link.match(/\/d\/([a-zA-Z0-9_-]+)/):null;
  const fileId=m?m[1]:null;

  if(pdfCurrentBlob){
    // Blob already in memory from PDF.js render — save directly, instant, no download
    _pdfDebugToast('Blob in memory: '+Math.round(pdfCurrentBlob.size/1024)+'KB type:'+pdfCurrentBlob.type);
    savePdfBlobDirect(note.id, pdfCurrentBlob).then(ok=>{
      if(ok) _onSaveOk();
      else if(fileId) _tryDownloadAndCacheBlob(note.id, fileId, _onSaveOk, _onSaveFail);
      else _onSaveFail();
    });
  } else if(fileId){
    _tryDownloadAndCacheBlob(note.id, fileId, _onSaveOk, _onSaveFail);
  } else {
    _onSaveFail();
  }
}

function toggleSaveNote(note){
  // Used from notes list (not from PDF viewer). Simpler — just toggle saved state.
  const idx=savedNotes.findIndex(s=>s.id===note.id);
  if(idx>=0){
    savedNotes.splice(idx,1);
    deletePdfBlob(note.id);
  } else {
    savedNotes.push({...note, savedAt:Date.now()});
    // Try to cache blob in background (no UI feedback here — user is in notes list)
    const m=note.link?note.link.match(/\/d\/([a-zA-Z0-9_-]+)/):null;
    const fileId=m?m[1]:null;
    if(fileId) _tryDownloadAndCacheBlob(note.id, fileId, ()=>{}, ()=>{});
  }
  saveSaved();
  if(document.getElementById('page-saved').classList.contains('active')) renderSaved();
}
function toggleBookmarkFilter(){
  showBookmarkedOnly=!showBookmarkedOnly;
  renderMaterial();
}
function toggleBookmarkNote(note){
  const idx=bookmarkedNotes.findIndex(b=>b.id===note.id);
  if(idx>=0) bookmarkedNotes.splice(idx,1);
  else bookmarkedNotes.push({...note, bookmarkedAt:Date.now()});
  saveBookmarks();
  renderMaterial();
  if(document.getElementById('page-saved')?.classList.contains('active')) renderSaved();
}

// ═══════════════ NOTE CARD ⋮ MENU (Bookmark / Save Offline / Refresh) ═══════════════
function openNoteMenu(event,note){
  event.stopPropagation();
  closeNoteMenu();
  const btn=event.currentTarget;
  const rect=btn.getBoundingClientRect();
  const bookmarked=isNoteBookmarked(note.id);
  const saved=isNoteSaved(note.id);
  const pop=document.createElement('div');
  pop.className='note-menu-popup';
  pop.id='note-menu-popup';
  const safe=JSON.stringify(note).replace(/"/g,'&quot;');
  pop.innerHTML=`
    <button onclick='closeNoteMenu();toggleBookmarkNote(${safe})'>${bookmarked?'🔖 Remove Bookmark':'📑 Bookmark'}</button>
    <button onclick='closeNoteMenu();toggleSaveNote(${safe});renderMaterial()'>${saved?'✅ Remove Offline Copy':'💾 Save Offline'}</button>
    <button onclick='closeNoteMenu();refreshNoteFromList(${safe})'>🔄 Refresh (latest version)</button>
  `;
  document.body.appendChild(pop);
  const pw=pop.offsetWidth||190, ph=pop.offsetHeight||140;
  let left=rect.right-pw;
  if(left<8) left=8;
  if(left+pw>window.innerWidth-8) left=window.innerWidth-pw-8;
  let top=rect.bottom+6;
  if(top+ph>window.innerHeight-8) top=rect.top-ph-6;
  pop.style.left=left+'px';
  pop.style.top=top+'px';
  setTimeout(()=>document.addEventListener('click',closeNoteMenu,{once:true}),0);
}
function closeNoteMenu(){
  const pop=document.getElementById('note-menu-popup');
  if(pop)pop.remove();
}
async function refreshNoteFromList(note){
  showOfflineToast('🔄 Refreshing "'+note.topic+'"...',true);
  await deletePdfBlob(note.id);
  if(!navigator.onLine){
    showOfflineToast('⚠️ You are offline — connect to refresh.',false);
    return;
  }
  const m=note.link.match(/\/d\/([a-zA-Z0-9_-]+)/);
  const fileId=m?m[1]:null;
  if(!fileId){ showOfflineToast('⚠️ Could not refresh — invalid link.',false); return; }
  try{
    const blob=await _driveDownloadWithConfirm(fileId);
    if(blob){
      await savePdfBlobDirect(note.id, blob);
      showOfflineToast('✅ "'+note.topic+'" refreshed!',true);
      renderMaterial();
      return;
    }
  }catch(e){ console.warn('Refresh from list failed',e); }
  showOfflineToast('⚠️ Refresh failed — try opening the note instead.',false);
}

function _tryDownloadAndCacheBlob(noteId, fileId, onOk, onFail){
  const url=`https://drive.google.com/uc?export=download&id=${fileId}&confirm=t`;
  savePdfBlob(noteId, url).then(ok=>{ if(ok) onOk(); else onFail(); });
}
function isNoteSaved(id){return savedNotes.some(s=>s.id===id);}

// ═══════════════ NOTE LIKES (❤️) ═══════════════
let _likeRefs=[];
function detachLikeListeners(){
  _likeRefs.forEach(r=>r.off());
  _likeRefs=[];
}
function attachLikeListeners(noteIds){
  detachLikeListeners();
  if(!db) return;
  noteIds.forEach(id=>{
    const ref=db.ref('medistudy_likes/'+id);
    ref.on('value', snap=>{
      const data=snap.val()||{};
      const count=Object.keys(data).length;
      const likedByMe=!!(currentUser && data[currentUser.uid]);
      const btn=document.getElementById('likebtn-'+id);
      const cEl=document.getElementById('likecount-'+id);
      if(cEl) cEl.textContent=count;
      if(btn){
        btn.classList.toggle('liked', likedByMe);
        btn.firstChild.textContent = likedByMe ? '❤️ ' : '🤍 ';
      }
    });
    _likeRefs.push(ref);
  });
}
function toggleLikeNote(noteId){
  if(!currentUser){ alert('Please sign in to like notes!'); return; }
  if(!db){ alert('Not connected yet — please check your internet and try again.'); return; }
  const ref=db.ref('medistudy_likes/'+noteId+'/'+currentUser.uid);
  ref.once('value').then(snap=>{
    if(snap.exists()) ref.remove();
    else ref.set(true);
  });
}

// ═══════════════ SAVED PAGE ═══════════════
function renderSaved(){
  const c=document.getElementById('saved-container');
  if(!savedNotes.length && !savedVideos.length && !bookmarkedNotes.length){
    c.innerHTML='<div class="saved-empty"><div class="big-icon">💾</div><h3>Nothing saved yet</h3><p>Open any note or video and tap <strong>💾</strong> to save it for offline access, or <strong>📑</strong> to bookmark it.</p></div>';
    return;
  }
  let html='';
  // Bookmarked notes section
  if(bookmarkedNotes.length){
    html+=`<div class="saved-section-title">🔖 Bookmarked Notes (${bookmarkedNotes.length})</div>`;
    html+=bookmarkedNotes.map(n=>{
      const co=courses.find(x=>x.id===n.courseId),su=subjects.find(x=>x.id===n.subjectId),fo=folders.find(x=>x.id===n.folderId);
      const path=[co&&co.name,su&&su.name,fo&&fo.name].filter(Boolean).join(' › ');
      const safe=JSON.stringify(n).replace(/"/g,'&quot;');
      return`<div class="saved-note-card"><div class="note-icon">📄</div><div class="note-info"><div class="saved-badge">🔖 BOOKMARK</div><div class="note-title">${n.topic}</div><div class="note-meta">${path} · ${new Date(n.bookmarkedAt).toLocaleDateString()}</div></div><div class="note-actions"><button class="note-btn" onclick='openPDF(${safe})'>Open 📂</button><button class="note-btn" style="color:var(--accent2);border-color:var(--accent2)" onclick="removeBookmark('${n.id}')">✕</button></div></div>`;
    }).join('');
  }
  // Notes section
  if(savedNotes.length){
    html+=`<div class="saved-section-title">📄 Saved Notes (${savedNotes.length})</div>`;
    html+=savedNotes.map(n=>{
      const co=courses.find(x=>x.id===n.courseId),su=subjects.find(x=>x.id===n.subjectId),fo=folders.find(x=>x.id===n.folderId);
      const path=[co&&co.name,su&&su.name,fo&&fo.name].filter(Boolean).join(' › ');
      const safe=JSON.stringify(n).replace(/"/g,'&quot;');
      return`<div class="saved-note-card"><div class="note-icon">📄</div><div class="note-info"><div class="saved-badge">💾 NOTE</div><div class="note-title">${n.topic}</div><div class="note-meta">${path} · ${new Date(n.savedAt).toLocaleDateString()}</div></div><div class="note-actions"><button class="note-btn" onclick='openPDF(${safe})'>Open 📂</button><button class="note-btn" style="color:var(--accent2);border-color:var(--accent2)" onclick="removeSaved('${n.id}')">✕</button></div></div>`;
    }).join('');
  }
  // Videos section
  if(savedVideos.length){
    html+=`<div class="saved-section-title">🎥 Saved Videos (${savedVideos.length})</div>`;
    html+=savedVideos.map(v=>{
      const co=courses.find(x=>x.id===v.courseId),su=subjects.find(x=>x.id===v.subjectId);
      const path=[co&&co.name,su&&su.name].filter(Boolean).join(' › ');
      return`<div class="saved-video-card"><div class="note-icon" style="background:#1a0e0e;">🎥</div><div class="note-info"><div class="saved-video-badge">💾 VIDEO</div><div class="note-title">${v.title}</div><div class="note-meta">${path} · ${new Date(v.savedAt).toLocaleDateString()}</div></div><div class="note-actions"><button class="note-btn" onclick="openVideo(this)" data-link="${v.link}" data-title="${v.title}">Play ▶</button><button class="note-btn" style="color:var(--accent2);border-color:var(--accent2)" onclick="removeSavedVideo('${v.id}')">✕</button></div></div>`;
    }).join('');
  }
  c.innerHTML=html;
}
function removeSaved(id){savedNotes=savedNotes.filter(s=>s.id!==id);saveSaved();renderSaved();}
function removeBookmark(id){bookmarkedNotes=bookmarkedNotes.filter(b=>b.id!==id);saveBookmarks();renderSaved();if(document.getElementById('page-material').classList.contains('active'))renderMaterial();}
function removeSavedVideo(id){savedVideos=savedVideos.filter(v=>v.id!==id);saveSavedVideos();renderSaved();}

// ═══════════════ STUDY MATERIAL ═══════════════
let smView={level:'courses'};
function courseIcon(i){return COURSE_ICONS[i%COURSE_ICONS.length];}
// If the student has picked their course in Profile, content is locked to just that course — like batch selection in Physics Wallah/Unacademy
function getStudentCourseId(){
  if(!userProfile||!userProfile.course)return null;
  return courses.find(c=>c.id===userProfile.course)?userProfile.course:null;
}

function renderMaterial(){
  const c=document.getElementById('material-container');
  if(smView.level==='courses'){detachLikeListeners();renderCoursesList(c);}
  else if(smView.level==='subjects'){detachLikeListeners();smView._subjTab=null;renderSubjectsList(c);}
  else if(smView.level==='folders'){detachLikeListeners();renderFoldersList(c, smView._subjTab);}
  else renderNotesList(c);
}

function renderCoursesList(c){
  if(!courses.length){c.innerHTML='<div class="empty-state">📭 No courses yet.<br>Add via Admin → Structure!</div>';return;}
  c.innerHTML=`<div class="folders-grid">${courses.map((co,i)=>`
    <div class="folder-card" onclick="goMaterialView({level:'subjects',courseId:'${co.id}'})">
      <div class="folder-icon">${courseIcon(i)}</div>
      <div style="flex:1"><div class="folder-name">${co.name}</div><div class="folder-count">${subjects.filter(s=>s.courseId===co.id).length} subjects</div></div>
      <div class="folder-arrow">→</div></div>`).join('')}</div>`;
}

function renderSubjectsList(c){
  const co=courses.find(x=>x.id===smView.courseId),coIdx=courses.indexOf(co);
  const subs=subjects.filter(s=>s.courseId===smView.courseId);
  const lc=getStudentCourseId();
  const rootCrumb=lc?`<span class="bc-cur">${courseIcon(coIdx)} ${co?co.name:''}</span>`:`<span class="bc-link" onclick="goMaterialView({level:'courses'})">📚 Material</span><span class="bc-sep">›</span><span class="bc-cur">${courseIcon(coIdx)} ${co?co.name:''}</span>`;
  c.innerHTML=`<div class="breadcrumb">${rootCrumb}</div>
  <div class="folders-grid">${subs.length?subs.map(s=>{
    const fc=folders.filter(f=>f.subjectId===s.id).length,nc=notes.filter(n=>n.subjectId===s.id).length,vc=videos.filter(v=>v.subjectId===s.id).length;
    return`<div class="folder-card" onclick="goMaterialView({level:'folders',courseId:'${smView.courseId}',subjectId:'${s.id}'})">
      <div class="folder-icon">🔬</div><div style="flex:1"><div class="folder-name">${s.name}</div><div class="folder-count">${fc} folders · ${nc} notes · ${vc} videos</div></div><div class="folder-arrow">→</div></div>`;
  }).join(''):'<div class="empty-state" style="grid-column:span 2">📭 No subjects yet.<br>Add via Admin → Structure!</div>'}</div>`;
}

function renderFoldersList(c, activeTab){
  activeTab = activeTab || smView._subjTab || 'notes';
  smView._subjTab = activeTab;
  const co=courses.find(x=>x.id===smView.courseId),su=subjects.find(x=>x.id===smView.subjectId),coIdx=courses.indexOf(co);
  const fols=folders.filter(f=>f.subjectId===smView.subjectId);
  const vids=videos.filter(v=>v.subjectId===smView.subjectId);

  // Build breadcrumb
  const breadcrumb=`<div class="breadcrumb">
    <span class="bc-link" onclick="goMaterialView({level:'courses'})">📚 Material</span><span class="bc-sep">›</span>
    <span class="bc-link" onclick="goMaterialView({level:'subjects',courseId:'${smView.courseId}'})">${courseIcon(coIdx)} ${co?co.name:''}</span><span class="bc-sep">›</span>
    <span class="bc-cur">🔬 ${su?su.name:''}</span></div>`;

  // Build subject tabs
  const tabs=`<div class="subject-inner-tabs">
    <button class="sit ${activeTab==='notes'?'active':''}" onclick="renderFoldersList(document.getElementById('material-container'),'notes')">📝 Notes</button>
    <button class="sit ${activeTab==='videos'?'active':''}" onclick="renderFoldersList(document.getElementById('material-container'),'videos')">🎥 Videos</button>
    <button class="sit ${activeTab==='mcqs'?'active':''}" onclick="renderFoldersList(document.getElementById('material-container'),'mcqs')">🧠 MCQs</button>
  </div>`;

  let contentHtml='';

  if(activeTab==='notes'){
    let fHtml=fols.map((f,i)=>{const nc=notes.filter(n=>n.folderId===f.id).length;
      return`<div class="folder-card" onclick="goMaterialView({...smView,level:'notes',folderId:'${f.id}'})">
        <div class="folder-icon">${FOLDER_ICONS[i%FOLDER_ICONS.length]}</div>
        <div style="flex:1"><div class="folder-name">${f.name}</div><div class="folder-count">${nc} note${nc!==1?'s':''}</div></div><div class="folder-arrow">→</div></div>`;
    }).join('');
    if(!fHtml)fHtml='<div class="empty-state" style="grid-column:span 2">📭 No folders yet.<br>Add via Admin → Structure → Folders!</div>';
    contentHtml=`<div class="folders-grid">${fHtml}</div>`;

  } else if(activeTab==='videos'){
    if(!vids.length){
      contentHtml='<div class="empty-state">📭 No videos for this subject yet.</div>';
    } else {
      contentHtml=`<div class="videos-list">${vids.map(v=>`<div class="video-card">
        <div class="video-thumb"><span class="yt-icon">▶️</span><span class="v-subject">${su?su.name.toUpperCase():''}</span></div>
        <div class="video-body"><div class="video-info"><div class="video-title">${v.title}</div><div class="video-meta">${v.desc||'Video Lecture'}</div></div>
        <div style="display:flex;gap:6px;flex-shrink:0;">
          <button class="watch-btn" onclick="openVideo(this)" data-link="${v.link}" data-title="${v.title}">Watch ▶</button>
          <button class="note-btn ${isVideoSaved(v.id)?'saved':''}" style="padding:6px 8px;" onclick="toggleSaveVideo(${JSON.stringify(v).replace(/"/g,'&quot;')});renderFoldersList(document.getElementById('material-container'),'videos')">${isVideoSaved(v.id)?'✅':'💾'}</button>
        </div></div></div>`).join('')}</div>`;
    }

  } else if(activeTab==='mcqs'){
    contentHtml='<div id="sm-mcq-list"><div style="text-align:center;padding:20px;font-size:13px;color:var(--muted);">Loading MCQs...</div></div>';
  }

  c.innerHTML=breadcrumb+tabs+contentHtml;

  // Load MCQs from Firebase if on MCQ tab — filtered by subjectId
  if(activeTab==='mcqs'){
    const filterSubjectId=smView.subjectId;
    if(!db){
      document.getElementById('sm-mcq-list').innerHTML='<div class="empty-state">📡 Requires internet connection.</div>';
    } else {
      db.ref('medistudy_mcq').orderByChild('ts').once('value',snap=>{
        const el=document.getElementById('sm-mcq-list');
        if(!el)return;
        if(!snap||!snap.exists()){el.innerHTML='<div class="empty-state">📭 No MCQs for this subject yet.</div>';return;}
        let html='';
        snap.forEach(c2=>{
          const m=c2.val();
          // Only show MCQs linked to this subject
          if(m.subjectId && m.subjectId!==filterSubjectId) return;
          // Also hide MCQs that are linked to a DIFFERENT subject (old MCQs with no subjectId show everywhere)
          html=`<div class="note-card" style="cursor:pointer;" onclick="goPage('quiz');setTimeout(()=>startQuiz('${m.id}'),300)">
            <div class="note-icon" style="background:#1a0e2a;">🧠</div>
            <div class="note-info">
              <div class="note-title">${escapeHTML(m.subject)}</div>
              <div class="note-meta">${m.count} questions · ${new Date(m.ts).toLocaleDateString()}</div>
            </div>
            <div class="note-actions"><button class="note-btn" style="background:var(--purple);color:#fff;border-color:var(--purple);">Start →</button></div>
          </div>`+html;
        });
        el.innerHTML=html||'<div class="empty-state">📭 No MCQs for this subject yet.</div>';
      });
    }
  }
}

function renderNotesList(c){
  const co=courses.find(x=>x.id===smView.courseId),su=subjects.find(x=>x.id===smView.subjectId),coIdx=courses.indexOf(co);
  const isVid=smView.folderId==='__videos__';
  const fo=!isVid?folders.find(x=>x.id===smView.folderId):null;
  const folName=isVid?'Videos':(fo?fo.name:'Notes');
  let inner='';
  if(isVid){
    detachLikeListeners();
    const vids=videos.filter(v=>v.subjectId===smView.subjectId);
    inner=vids.length?`<div class="videos-list">${vids.map(v=>`<div class="video-card">
      <div class="video-thumb"><span class="yt-icon">▶️</span><span class="v-subject">${su?su.name.toUpperCase():''}</span></div>
      <div class="video-body"><div class="video-info"><div class="video-title">${v.title}</div><div class="video-meta">${v.desc||'Video Lecture'}</div></div>
      <div style="display:flex;gap:6px;flex-shrink:0;"><button class="watch-btn" onclick="openVideo(this)" data-link="${v.link}" data-title="${v.title}">Watch ▶</button><button class="note-btn ${isVideoSaved(v.id)?'saved':''}" style="padding:6px 8px;" onclick="toggleSaveVideo(${JSON.stringify(v).replace(/"/g,'&quot;')});renderMaterial()">${isVideoSaved(v.id)?'✅':'💾'}</button></div></div></div>`).join('')}</div>`
      :'<div class="empty-state">📭 No videos here yet.</div>';
  } else {
    const allNts=notes.filter(n=>n.folderId===smView.folderId);
    const nts=showBookmarkedOnly?allNts.filter(n=>isNoteBookmarked(n.id)):allNts;
    const bmToggle=`<div class="bm-filter-row" onclick="toggleBookmarkFilter()">
      <span>🔖 Bookmarked only</span>
      <span class="bm-switch ${showBookmarkedOnly?'on':''}"><span class="bm-knob"></span></span>
    </div>`;
    inner=bmToggle+(nts.length?`<div class="notes-list">${nts.map(n=>{
      const saved=isNoteSaved(n.id);
      const bookmarked=isNoteBookmarked(n.id);
      const safe=JSON.stringify(n).replace(/"/g,'&quot;');
      return`<div class="note-card" id="nc-${n.id}"><div class="note-icon">📄</div>
        <div class="note-info"><div class="note-title">${n.topic}</div><div class="note-meta">${n.desc||'Study Notes'}${saved?' · 💾':''}</div></div>
        <div class="note-actions">
          <button class="like-btn" id="likebtn-${n.id}" onclick='toggleLikeNote("${n.id}")'>🤍 <span class="like-count" id="likecount-${n.id}">0</span></button>
          <button class="note-btn" onclick='openPDF(${safe})'>Open 📂</button>
          <button class="note-btn" onclick='openNoteMenu(event,${safe})' title="More">⋮</button>
        </div></div>`;
    }).join('')}</div>`:(showBookmarkedOnly?'<div class="empty-state">🔖 No bookmarked notes here yet.<br>Tap 📑 on any note to save it here.</div>':'<div class="empty-state">📭 No notes here yet.<br>Add via Admin → Note!</div>'));
    // After render: async update ✅/📥 status for saved notes
    const savedNtIds=nts.filter(n=>isNoteSaved(n.id)).map(n=>n.id);
    if(savedNtIds.length){
      setTimeout(async()=>{
        for(const id of savedNtIds){
          const hasBlob=await hasPdfBlob(id);
          const btn=document.getElementById('savebtn-'+id);
          if(btn) btn.textContent=hasBlob?'✅':'📥';
          const card=document.getElementById('nc-'+id);
          if(card&&hasBlob) card.style.borderLeft='3px solid var(--green)';
        }
      },0);
    }
    attachLikeListeners(nts.map(n=>n.id));
  }
  c.innerHTML=`<div class="breadcrumb">
    <span class="bc-link" onclick="goMaterialView({level:'courses'})">📚 Material</span><span class="bc-sep">›</span>
    <span class="bc-link" onclick="goMaterialView({level:'subjects',courseId:'${smView.courseId}'})">${courseIcon(coIdx)} ${co?co.name:''}</span><span class="bc-sep">›</span>
    <span class="bc-link" onclick="goMaterialView({level:'folders',courseId:'${smView.courseId}',subjectId:'${smView.subjectId}'})">🔬 ${su?su.name:''}</span><span class="bc-sep">›</span>
    <span class="bc-cur">${folName}</span></div>${inner}`;
}

// ═══════════════ VIDEOS PAGE ═══════════════
function renderVideosPage(){
  const tabs=document.getElementById('vid-page-tabs');
  const lc=getStudentCourseId();
  if(lc){
    tabs.innerHTML='';
    filterVP(lc,null);
    return;
  }
  tabs.innerHTML=`<button class="vpt active" onclick="filterVP('all',this)">All (${videos.length})</button>`
    +courses.filter(co=>videos.some(v=>v.courseId===co.id)).map(co=>`<button class="vpt" onclick="filterVP('${co.id}',this)">${co.name} (${videos.filter(v=>v.courseId===co.id).length})</button>`).join('');
  filterVP('all',tabs.querySelector('.vpt'));
}
function filterVP(cId,el){
  document.querySelectorAll('.vpt').forEach(t=>t.classList.remove('active'));if(el)el.classList.add('active');
  const filtered=cId==='all'?videos:videos.filter(v=>v.courseId===cId);
  const list=document.getElementById('videos-list');
  if(!filtered.length){list.innerHTML='<div class="empty-state">📭 No videos yet.</div>';return;}
  list.innerHTML=filtered.map(v=>{
    const co=courses.find(x=>x.id===v.courseId),su=subjects.find(x=>x.id===v.subjectId);
    return`<div class="video-card">
      <div class="video-thumb"><span class="yt-icon">▶️</span>${co?`<span class="v-subject">${co.name.toUpperCase()}</span>`:''}${su?`<span style="font-size:10px;color:var(--muted);margin-left:6px">${su.name}</span>`:''}
      </div><div class="video-body"><div class="video-info"><div class="video-title">${v.title}</div><div class="video-meta">${v.desc||'Video Lecture'}</div></div>
      <div style="display:flex;gap:6px;flex-shrink:0;align-items:center;"><button class="watch-btn" onclick="openVideo(this)" data-link="${v.link}" data-title="${v.title}">Watch ▶</button><button class="note-btn ${isVideoSaved(v.id)?'saved':''}" style="padding:6px 8px;" onclick="toggleSaveVideo(${JSON.stringify(v).replace(/"/g,'&quot;')});renderVideosPage()">${isVideoSaved(v.id)?'✅':'💾'}</button></div></div></div>`;
  }).join('');
}

// ═══════════════ PLANNER ═══════════════
function todayKey(){return new Date().toISOString().slice(0,10);}
function logHours(){const h=parseFloat(document.getElementById('log-hrs').value)||0,k=todayKey();weekLog[k]=(weekLog[k]||0)+h;localStorage.setItem('ms_weeklog',JSON.stringify(weekLog));syncToFirebase('weeklog',weekLog);updateHoursLB();renderPlanner();}
function addExam(){const n=document.getElementById('exam-name').value.trim(),d=document.getElementById('exam-date').value;if(!n||!d){alert('Fill exam name and date!');return;}exams.push({name:n,date:d});localStorage.setItem('ms_exams',JSON.stringify(exams));syncToFirebase('exams',exams);document.getElementById('exam-name').value='';document.getElementById('exam-date').value='';renderPlanner();}
function delExam(i){exams.splice(i,1);localStorage.setItem('ms_exams',JSON.stringify(exams));syncToFirebase('exams',exams);renderPlanner();}
function addGoal(){const t=document.getElementById('goal-input').value.trim();if(!t)return;goals.push({text:t,done:false,date:todayKey()});localStorage.setItem('ms_goals',JSON.stringify(goals));syncToFirebase('goals',goals);document.getElementById('goal-input').value='';renderPlanner();}
function toggleGoal(i){goals[i].done=!goals[i].done;localStorage.setItem('ms_goals',JSON.stringify(goals));syncToFirebase('goals',goals);renderPlanner();}
function delGoal(i){goals.splice(i,1);localStorage.setItem('ms_goals',JSON.stringify(goals));syncToFirebase('goals',goals);renderPlanner();}
function renderPlanner(){
  const today=todayKey(),todayHrs=weekLog[today]||0,todayGoals=goals.filter(g=>g.date===today),done=todayGoals.filter(g=>g.done).length;
  document.getElementById('ps-hours').textContent=todayHrs.toFixed(1);
  document.getElementById('ps-goals').textContent=done+'/'+todayGoals.length;
  const days=[];for(let i=6;i>=0;i--){const d=new Date();d.setDate(d.getDate()-i);days.push(d.toISOString().slice(0,10));}
  document.getElementById('week-log').innerHTML=`<div style="display:flex;flex-direction:column;gap:5px;margin-top:8px">${days.map(d=>{const h=weekLog[d]||0,label=d===today?'Today':d.slice(5).replace('-','/');return`<div class="planner-day"><span style="font-size:12px;color:var(--muted)">${label}</span><div style="flex:1;margin:0 10px;height:6px;background:var(--border);border-radius:3px;overflow:hidden"><div style="height:100%;width:${Math.min(h/8*100,100)}%;background:var(--accent);border-radius:3px"></div></div><span style="font-size:12px;font-weight:700;color:var(--accent)">${h.toFixed(1)}h</span></div>`;}).join('')}</div>`;
  document.getElementById('exams-list').innerHTML=exams.length?exams.map((e,i)=>{const d=Math.ceil((new Date(e.date)-new Date())/(864e5)),cls=d<=3?'urgent':d<=7?'soon':'ok';return`<div class="exam-item"><div><div class="exam-name">${e.name}</div><div style="font-size:11px;color:var(--muted)">${e.date}</div></div><div style="display:flex;align-items:center;gap:8px"><span class="exam-days ${cls}">${d<0?'Passed':d===0?'Today!':d+'d left'}</span><button class="del-btn" onclick="delExam(${i})">✕</button></div></div>`;}).join(''):'<div style="font-size:13px;color:var(--muted);text-align:center;padding:12px">No exams yet</div>';
  document.getElementById('goals-list').innerHTML=todayGoals.length?todayGoals.map(g=>{const idx=goals.indexOf(g);return`<div class="goal-item"><div class="goal-cb ${g.done?'done':''}" onclick="toggleGoal(${idx})">${g.done?'✓':''}</div><span class="goal-text ${g.done?'done':''}">${g.text}</span><button class="goal-del" onclick="delGoal(${idx})">🗑️</button></div>`;}).join(''):'<div style="font-size:13px;color:var(--muted);padding:10px 0">No goals for today. Add one above!</div>';
}

// ═══════════════ LEADERBOARD (fully automatic — MCQ marks + study hours) ═══════════════
function renderLB(){
  populateLBCourseSelect();
  renderQuizLB();
  renderHoursLB();
}
function populateLBCourseSelect(){
  const sel=document.getElementById('lb-course-sel');
  const label=document.getElementById('lb-course-locked-label');
  if(!sel)return;
  const lc=getStudentCourseId();
  if(lc){
    // Locked to the student's own course — same as Study Material/Videos/MCQ
    sel.style.display='none';
    if(label){
      const co=courses.find(c=>c.id===lc);
      label.style.display='block';
      label.textContent='📌 Showing rankings for your course: '+(co?co.name:'');
    }
    return;
  }
  sel.style.display='';
  if(label)label.style.display='none';
  const prev=sel.value;
  sel.innerHTML='<option value="">— Select Course —</option>'+courses.map(c=>`<option value="${c.id}">${escapeHTML(c.name)}</option>`).join('');
  if(prev && courses.find(c=>c.id===prev)) sel.value=prev;
  else if(courses.length) sel.value=courses[0].id;
}
function renderQuizLB(){
  const list=document.getElementById('lb-quiz-list');
  if(!list)return;
  const lc=getStudentCourseId();
  const sel=document.getElementById('lb-course-sel');
  const courseId=lc||(sel?sel.value:'');
  if(!courseId){list.innerHTML='<div class="empty-state">📭 Select a course to see rankings.</div>';return;}
  if(!db){list.innerHTML='<div class="empty-state">📭 Not connected.</div>';return;}
  db.ref('medistudy_quiz_lb/'+courseId).once('value').then(snap=>{
    const d=snap.val();
    if(!d){list.innerHTML='<div class="empty-state">📭 No quiz scores yet for this course. Be the first!</div>';return;}
    const arr=Object.values(d).sort((a,b)=>b.best-a.best).slice(0,10);
    const medals=['🥇','🥈','🥉'],cls=['gold','silver','bronze'];
    list.innerHTML=arr.map((e,i)=>`<div class="lb-item"><div class="lb-rank ${cls[i]||''}">${i<3?medals[i]:i+1}</div><div class="lb-info2"><div class="lb-name">${escapeHTML(e.name)}</div><div class="lb-score-row"><span class="lb-badge">📝 Best: ${e.best}%</span></div></div><div class="lb-total">${e.best}</div></div>`).join('');
  }).catch(()=>{list.innerHTML='<div class="empty-state">📭 Could not load rankings.</div>';});
}
function renderHoursLB(){
  const list=document.getElementById('lb-hours-list');
  if(!list)return;
  if(!db){list.innerHTML='<div class="empty-state">📭 Not connected.</div>';return;}
  db.ref('medistudy_hours_lb').once('value').then(snap=>{
    const d=snap.val();
    if(!d){list.innerHTML='<div class="empty-state">📭 No study hours logged yet. Be the first!</div>';return;}
    const arr=Object.values(d).sort((a,b)=>b.totalHours-a.totalHours).slice(0,10);
    const medals=['🥇','🥈','🥉'],cls=['gold','silver','bronze'];
    list.innerHTML=arr.map((e,i)=>`<div class="lb-item"><div class="lb-rank ${cls[i]||''}">${i<3?medals[i]:i+1}</div><div class="lb-info2"><div class="lb-name">${escapeHTML(e.name)}</div><div class="lb-score-row"><span class="lb-badge">⏱ ${e.totalHours}h total</span></div></div><div class="lb-total">${e.totalHours}</div></div>`).join('');
  }).catch(()=>{list.innerHTML='<div class="empty-state">📭 Could not load rankings.</div>';});
}
// Push this student's total study hours to the public leaderboard — called automatically whenever hours are logged
function updateHoursLB(){
  if(!currentUser||!db)return;
  const total=Object.values(weekLog).reduce((a,b)=>a+(parseFloat(b)||0),0);
  const name=(userProfile&&userProfile.name)||currentUser.displayName||(currentUser.email?currentUser.email.split('@')[0]:'Student');
  db.ref('medistudy_hours_lb/'+currentUser.uid).set({name,totalHours:Math.round(total*10)/10,ts:Date.now()}).catch(e=>console.warn('Hours LB sync failed:',e));
}

// ═══════════════ VIDEO PLAYER ═══════════════
let currentVideo = null;
let currentEmbedUrl = '';

function updateVideoSaveBtn() {
  if(!currentVideo) return;
  const btn = document.getElementById('video-save-bar-btn');
  const saved = isVideoSaved(currentVideo.id);
  btn.textContent = saved ? '✅ Saved' : '💾 Save';
  btn.className = saved ? 'pdf-save-bar-btn saved-bar' : 'pdf-save-bar-btn';
}

function toggleSaveFromVideoViewer() {
  if(!currentVideo) return;
  toggleSaveVideo(currentVideo);
  updateVideoSaveBtn();
}

// Extract YouTube video ID from any YouTube URL
function getYTVideoId(link) {
  const short = link.match(/youtu\.be\/([a-zA-Z0-9_-]+)/);
  if(short) return short[1];
  const watch = link.match(/[?&]v=([a-zA-Z0-9_-]+)/);
  if(watch) return watch[1];
  const embed = link.match(/\/embed\/([a-zA-Z0-9_-]+)/);
  if(embed) return embed[1];
  return null;
}

// Check if running on mobile browser
function isMobile() {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

function openVideo(elOrLink, ttlOverride, linkOverride) {
  let link, ttl;
  if(elOrLink===null){
    link=linkOverride; ttl=ttlOverride;
  } else if(typeof elOrLink === 'string') {
    link = elOrLink; ttl = ttlOverride||elOrLink;
  } else {
    link = elOrLink.getAttribute('data-link');
    ttl  = elOrLink.getAttribute('data-title');
  }

  currentVideo = videos.find(v=>v.link===link) || {id:'_'+link.slice(-8),link,title:ttl,courseId:'',subjectId:''};

  const ytId = getYTVideoId(link);
  currentEmbedUrl = ytId
    ? `https://www.youtube.com/embed/${ytId}?autoplay=1&rel=0`
    : link;

  // Set titles and fallback link
  document.getElementById('video-title').textContent = ttl || 'Video Lecture';
  document.getElementById('video-fallback-title').textContent = ttl || 'Video Lecture';
  document.getElementById('video-fallback-link').href = link;

  // Show YouTube thumbnail if we have the video ID
  const thumbImg = document.getElementById('video-thumb-img');
  if(ytId) {
    thumbImg.src = `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`;
    thumbImg.style.display = 'block';
  } else {
    thumbImg.style.display = 'none';
  }

  document.getElementById('video-overlay').classList.add('open');

  // Always try the embedded player first (big, primary view) on every device.
  // Only drop to the "Watch on YouTube" fallback screen if it's actually blocked.
  tryEmbedVideo();
  setTimeout(() => {
    try {
      const f = document.getElementById('video-frame');
      if(f.contentDocument !== null) showVideoFallback(); // loaded blank = blocked
    } catch(e) {
      // Cross-origin error = YouTube loaded fine, do nothing
    }
  }, 3500);

  if(typeof gtag !== 'undefined') {
    const vco = courses.find(c=>c.id===currentVideo.courseId);
    const vsu = vco && vco.subjects ? vco.subjects.find(s=>s.id===currentVideo.subjectId) : null;
    gtag('event', 'video_opened', { event_category: 'Videos', event_label: ttl, course: vco?vco.name:'', subject: vsu?vsu.name:'' });
  }
  setTimeout(updateVideoSaveBtn, 100);
}

function tryEmbedVideo() {
  const frameWrap = document.getElementById('video-frame-wrap');
  const fallback  = document.getElementById('video-fallback');
  const frame     = document.getElementById('video-frame');
  frameWrap.style.display = 'block';
  fallback.style.display  = 'none';
  frame.src = currentEmbedUrl;
}

function showVideoFallback() {
  document.getElementById('video-frame-wrap').style.display = 'none';
  document.getElementById('video-fallback').style.display = 'flex';
  document.getElementById('video-frame').src = ''; // stop loading
}

function closeVideo() {
  document.getElementById('video-overlay').classList.remove('open');
  document.getElementById('video-frame').src = '';
  document.getElementById('video-frame-wrap').style.display = 'block';
  document.getElementById('video-fallback').style.display = 'none';
}
// ═══════════════ FEEDBACK & SUPPORT ═══════════════
let fbRating=0, fbCategory='';
function setFbRating(v){
  fbRating=v;
  document.querySelectorAll('#fb-star-rating .star').forEach(s=>{
    s.classList.toggle('on', parseInt(s.dataset.v)<=v);
  });
}
function setFbCategory(v){
  fbCategory=v;
  document.querySelectorAll('#fb-cat-row .fb-cat-btn').forEach(b=>{
    b.classList.toggle('on', b.dataset.v===v);
  });
}
function submitFeedback(){
  const text=document.getElementById('fb-text-input').value.trim();
  if(!fbRating){ alert('Please tap a star to rate the app!'); return; }
  if(!fbCategory){ alert('Please choose what this is about (Bug, Suggestion, Praise, Other)!'); return; }
  if(!text){ alert('Please write a short message!'); return; }
  if(!currentUser){ alert('Please sign in first so I know who this is from!'); return; }
  if(!db){ alert('Not connected yet — please check your internet and try again.'); return; }
  const courseObj = (typeof courses!=='undefined') ? courses.find(c=>c.id===userProfile.course) : null;
  const entry={
    uid: currentUser.uid,
    name: userProfile.name || currentUser.email || 'Unknown',
    course: courseObj ? courseObj.name : (userProfile.course||'—'),
    rating: fbRating,
    category: fbCategory,
    text: text,
    timestamp: Date.now()
  };
  db.ref('medistudy_feedback').push(entry).then(()=>{
    document.getElementById('fb-success').style.display='block';
    setTimeout(()=>{document.getElementById('fb-success').style.display='none';},3000);
    document.getElementById('fb-text-input').value='';
    fbRating=0; fbCategory='';
    document.querySelectorAll('#fb-star-rating .star').forEach(s=>s.classList.remove('on'));
    document.querySelectorAll('#fb-cat-row .fb-cat-btn').forEach(b=>b.classList.remove('on'));
    loadMyFeedback();
  }).catch(e=>{
    alert('Could not send feedback — please try again. ('+e.message+')');
  });
}

// Student's own submitted feedback — newest 50, with status + any reply from admin
function loadMyFeedback(){
  const listEl=document.getElementById('my-feedback-list');
  if(!listEl)return;
  if(!currentUser){ listEl.innerHTML='Sign in to see feedback from everyone.'; return; }
  if(!db){ listEl.innerHTML='Not connected yet.'; return; }
  listEl.innerHTML='Loading...';
  db.ref('medistudy_feedback').orderByChild('timestamp').limitToLast(50).once('value',snap=>{
    const data=snap.val()||{};
    const rows=Object.keys(data).map(key=>{
      const f=data[key]||{};
      return {
        key,
        name: f.name||'Unknown',
        course: f.course||'—',
        rating: f.rating||0,
        category: f.category||'Other',
        text: f.text||'',
        timestamp: f.timestamp||0,
        status: f.status||'New',
        reply: f.reply||''
      };
    }).sort((a,b)=>b.timestamp-a.timestamp);
    if(!rows.length){ listEl.innerHTML='No feedback yet — be the first!'; return; }
    listEl.innerHTML=rows.map(f=>{
      const when=f.timestamp?new Date(f.timestamp).toLocaleDateString():'—';
      const stars='★'.repeat(f.rating)+'☆'.repeat(5-f.rating);
      const statusColor=f.status==='New'?'#3b82f6':(f.status==='Seen'?'#eab308':'#22c55e');
      const statusLabel=f.status==='New'?'🔵 New':(f.status==='Seen'?'🟡 Seen':'🟢 Resolved');
      return `<div style="background:var(--card);border:1px solid var(--border);border-radius:10px;padding:10px 12px;margin-bottom:8px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;gap:8px;flex-wrap:wrap;">
          <div style="font-weight:700;font-size:12px;color:var(--text);">${escapeHTML(f.name)} <span style="color:var(--muted);font-weight:400;">· ${escapeHTML(f.course)}</span></div>
          <span style="background:${statusColor}22;border:1px solid ${statusColor};color:${statusColor};border-radius:6px;padding:2px 8px;font-size:11px;font-weight:700;">${statusLabel}</span>
        </div>
        <div style="color:var(--accent);font-size:12px;margin-bottom:4px;">${stars}</div>
        <div style="white-space:pre-wrap;font-size:12px;color:var(--text);margin-bottom:4px;">${escapeHTML(f.text)}</div>
        <div style="font-size:11px;color:var(--muted);">🕒 ${when}</div>
        ${f.reply?`<div style="margin-top:8px;padding:8px 10px;background:var(--bg);border-left:3px solid var(--accent);border-radius:6px;font-size:12px;"><strong>Reply:</strong> ${escapeHTML(f.reply)}</div>`:''}
      </div>`;
    }).join('');
  },err=>{
    listEl.innerHTML='<span style="color:#e85d38;">Could not load your feedback.</span>';
    console.error(err);
  });
}

function checkAnnouncements(){
  if(!db)return;
  const dismissed=JSON.parse(localStorage.getItem('ms_dismissed_anns')||'[]');
  db.ref('medistudy_announcements').orderByChild('expiry').startAt(Date.now()).limitToLast(1).once('value',snap=>{
    if(!snap||!snap.exists())return;
    snap.forEach(c=>{
      const a=c.val();
      if(dismissed.includes(a.id))return;
      showAnnouncementBanner(a);
    });
  });
}

function showAnnouncementBanner(a){
  const banner=document.getElementById('ann-banner');
  if(!banner)return;
  const col=ANN_COLORS[a.type]||ANN_COLORS.info;
  banner.style.background=col.bg;
  banner.style.border='1px solid '+col.border;
  banner.style.color=col.color;
  banner.dataset.id=a.id;
  document.getElementById('ann-banner-title').textContent='📢 '+a.title;
  document.getElementById('ann-banner-msg').textContent=a.msg;
  banner.style.display='block';
}

function dismissAnnouncement(){
  const banner=document.getElementById('ann-banner');
  if(!banner)return;
  const id=banner.dataset.id;
  if(id){
    const dismissed=JSON.parse(localStorage.getItem('ms_dismissed_anns')||'[]');
    if(!dismissed.includes(id)){dismissed.push(id);}
    localStorage.setItem('ms_dismissed_anns',JSON.stringify(dismissed));
  }
  banner.style.display='none';
}

// ═══════════════ STUDENT ESSENTIALS ═══════════════
// Public reference section: registration, SIM card, medical checkup, university rules etc.
function renderEssentials(){
  const el=document.getElementById('ess-list');
  if(!el)return;
  if(!db){el.innerHTML='<div style="color:var(--muted);font-size:12px;">Not connected.</div>';return;}
  db.ref('medistudy_essentials').orderByChild('order').once('value',snap=>{
    if(!snap||!snap.exists()){el.innerHTML='<div style="color:var(--muted);font-size:13px;padding:20px 0;text-align:center;">Nothing added yet. Check back soon!</div>';return;}
    const items=[];
    snap.forEach(c=>items.push(c.val()));
    el.innerHTML=items.map((it,i)=>`
      <div class="ess-card">
        <div class="ess-title" onclick="toggleEss(${i})"><span>${escapeHTML(it.title)}</span><span class="ess-arrow" id="ess-arrow-${i}">▾</span></div>
        <div class="ess-content" id="ess-content-${i}" style="display:none;">${escapeHTML(it.content)}</div>
      </div>`).join('');
  });
}
function toggleEss(i){
  const c=document.getElementById('ess-content-'+i),a=document.getElementById('ess-arrow-'+i);
  if(!c)return;
  const open=c.style.display!=='none';
  c.style.display=open?'none':'block';
  if(a)a.textContent=open?'▾':'▴';
}
// Generic dropdown toggle — used by About page sections (Why I built this, Data & Privacy, and future ones)
function toggleAcc(id){
  const c=document.getElementById(id),a=document.getElementById('arrow-'+id);
  if(!c)return;
  const open=c.style.display!=='none';
  c.style.display=open?'none':'block';
  if(a)a.textContent=open?'▾':'▴';
}
// ── Admin/Sponsor: add, list, delete essentials ──
// ═══════════════ MCQ SYSTEM ═══════════════
let currentQuizSet=null, currentQuizQs=[], currentQIdx=0, quizAnswers=[], quizSelected=null;

// ── Student: Quiz UI ──
function showQuizHome(){
  document.getElementById('quiz-home').style.display='block';
  document.getElementById('quiz-active').style.display='none';
  document.getElementById('quiz-result').style.display='none';
  if(!db){document.getElementById('quiz-sets-list').innerHTML='<div style="color:var(--muted);text-align:center;padding:30px;">Requires internet connection.</div>';return;}
  document.getElementById('quiz-sets-list').innerHTML='<div style="color:var(--muted);text-align:center;padding:20px;">Loading...</div>';
  const lc=getStudentCourseId();
  db.ref('medistudy_mcq').orderByChild('ts').once('value',snap=>{
    if(!snap||!snap.exists()){
      document.getElementById('quiz-sets-list').style.display='none';
      document.getElementById('quiz-empty').style.display='block';
      return;
    }
    let html='';
    let count=0;
    snap.forEach(c=>{
      const m=c.val();
      if(lc && m.courseId!==lc)return;
      count++;
      html=`<div class="card" style="margin-bottom:10px;cursor:pointer;display:flex;align-items:center;justify-content:space-between;" onclick="startQuiz('${m.id}')">
        <div>
          <div style="font-weight:700;font-size:14px;">📝 ${escapeHTML(m.subject)}</div>
          <div style="font-size:11px;color:var(--muted);margin-top:2px;">${m.count} questions</div>
        </div>
        <div style="font-size:20px;">→</div>
      </div>`+html;
    });
    if(!count){
      document.getElementById('quiz-sets-list').style.display='none';
      document.getElementById('quiz-empty').style.display='block';
      return;
    }
    document.getElementById('quiz-empty').style.display='none';
    document.getElementById('quiz-sets-list').style.display='block';
    document.getElementById('quiz-sets-list').innerHTML=html;
  });
}

function startQuiz(id){
  if(!db)return;
  db.ref('medistudy_mcq/'+id).once('value',snap=>{
    if(!snap||!snap.exists())return;
    const set=snap.val();
    currentQuizSet=set;
    currentQuizQs=set.qs;
    currentQIdx=0;
    quizAnswers=[];
    quizSelected=null;
    document.getElementById('quiz-home').style.display='none';
    document.getElementById('quiz-result').style.display='none';
    document.getElementById('quiz-active').style.display='block';
    showQuestion();
    if(typeof gtag !== 'undefined'){
      gtag('event','quiz_started',{event_category:'Quiz', event_label: set.title||id});
    }
  });
}

function showQuestion(){
  const q=currentQuizQs[currentQIdx];
  const total=currentQuizQs.length;
  document.getElementById('quiz-progress-label').textContent=`Question ${currentQIdx+1} of ${total}`;
  document.getElementById('quiz-progress-bar').style.width=((currentQIdx/total)*100)+'%';
  document.getElementById('quiz-question').textContent=q.q;
  document.getElementById('quiz-explanation').style.display='none';
  document.getElementById('quiz-next-btn').style.display='none';
  quizSelected=null;
  const opts=document.getElementById('quiz-options');
  opts.innerHTML=q.options.map((o,i)=>`
    <button onclick="selectOption(${i})" id="qopt-${i}" style="width:100%;text-align:left;padding:10px 14px;border-radius:10px;border:1px solid var(--border);background:var(--card);color:var(--text);font-family:var(--sans);font-size:13px;cursor:pointer;transition:all 0.2s;">
      <span style="font-weight:700;margin-right:8px;">${['A','B','C','D'][i]}.</span>${escapeHTML(o)}
    </button>`).join('');
}

function selectOption(idx){
  if(quizSelected!==null)return; // already answered
  quizSelected=idx;
  const q=currentQuizQs[currentQIdx];
  quizAnswers.push({q:q.q,options:q.options,answer:q.answer,selected:idx,explanation:q.explanation||''});
  // Color options
  q.options.forEach((_,i)=>{
    const btn=document.getElementById('qopt-'+i);
    if(!btn)return;
    btn.style.cursor='default';
    if(i===q.answer) btn.style.background='#052e16',btn.style.borderColor='#16a34a',btn.style.color='#86efac';
    else if(i===idx&&idx!==q.answer) btn.style.background='#2d0a0a',btn.style.borderColor='#dc2626',btn.style.color='#fca5a5';
  });
  // Show explanation
  if(q.explanation){
    const ex=document.getElementById('quiz-explanation');
    ex.innerHTML=`💡 <strong>Explanation:</strong> ${escapeHTML(q.explanation)}`;
    ex.style.display='block';
  }
  document.getElementById('quiz-next-btn').style.display='block';
  document.getElementById('quiz-next-btn').textContent=currentQIdx+1<currentQuizQs.length?'Next →':'See Results';
}

function nextQuestion(){
  currentQIdx++;
  if(currentQIdx<currentQuizQs.length){showQuestion();}
  else{showQuizResult();}
}

function showQuizResult(){
  document.getElementById('quiz-active').style.display='none';
  document.getElementById('quiz-result').style.display='block';
  document.getElementById('quiz-review-list').style.display='none';
  const correct=quizAnswers.filter(a=>a.selected===a.answer).length;
  const total=quizAnswers.length;
  const pct=Math.round((correct/total)*100);
  document.getElementById('quiz-result-score').textContent=`${correct} / ${total} correct (${pct}%)`;
  let emoji='😔',msg='Keep studying — you can do it!';
  if(pct>=80){emoji='🎉';msg='Excellent work! You really know this topic.';}
  else if(pct>=60){emoji='👍';msg='Good effort! Review the ones you missed.';}
  else if(pct>=40){emoji='📚';msg='Keep going — revise and try again.';}
  document.getElementById('quiz-result-emoji').textContent=emoji;
  document.getElementById('quiz-result-msg').textContent=msg;
  if(typeof gtag !== 'undefined'){
    gtag('event','quiz_completed',{event_category:'Quiz', event_label: currentQuizSet?currentQuizSet.title:'', value: pct});
  }
  // Save this student's best score to the automatic course leaderboard.
  // Use Firebase's own live session (auth.currentUser) as a fallback in case our
  // cached `currentUser` variable went stale without a fresh sign-in event firing
  // (same staleness issue fixed for study-hours sync — see flushActiveTime()).
  const lbUser=currentUser||(auth && auth.currentUser)||null;
  if(lbUser){
    if(!currentUser) currentUser=lbUser; // self-heal our cached copy
    if(db&&currentQuizSet&&currentQuizSet.courseId){
      const lbRef=db.ref('medistudy_quiz_lb/'+currentQuizSet.courseId+'/'+lbUser.uid);
      lbRef.once('value').then(snap=>{
        const existing=snap.val();
        if(!existing||pct>existing.best){
          const name=(userProfile&&userProfile.name)||lbUser.displayName||(lbUser.email?lbUser.email.split('@')[0]:'Student');
          lbRef.set({name,best:pct,ts:Date.now()}).catch(e=>console.warn('Quiz LB sync failed:',e));
        }
      }).catch(e=>console.warn('Quiz LB read failed:',e));
    }
  }
}

function reviewQuiz(){
  const list=document.getElementById('quiz-review-list');
  list.style.display='block';
  list.innerHTML=quizAnswers.map((a,i)=>{
    const correct=a.selected===a.answer;
    return `<div style="background:var(--card);border:1px solid ${correct?'#16a34a':'#dc2626'};border-radius:10px;padding:12px;margin-bottom:10px;">
      <div style="font-size:12px;font-weight:700;margin-bottom:6px;">${i+1}. ${escapeHTML(a.q)}</div>
      ${a.options.map((o,j)=>`<div style="font-size:11px;padding:3px 8px;border-radius:5px;margin-bottom:2px;${j===a.answer?'color:#86efac;':j===a.selected&&!correct?'color:#fca5a5;':'color:var(--muted);'}">
        ${['A','B','C','D'][j]}. ${escapeHTML(o)} ${j===a.answer?'✓':j===a.selected&&!correct?'✗':''}
      </div>`).join('')}
      ${a.explanation?`<div style="font-size:11px;color:var(--muted);margin-top:6px;font-style:italic;">💡 ${escapeHTML(a.explanation)}</div>`:''}
    </div>`;
  }).join('');
}

function retryQuiz(){
  if(!currentQuizSet)return;
  currentQIdx=0;quizAnswers=[];quizSelected=null;
  document.getElementById('quiz-result').style.display='none';
  document.getElementById('quiz-active').style.display='block';
  showQuestion();
}

function exitQuiz(){
  currentQuizSet=null;currentQuizQs=[];currentQIdx=0;quizAnswers=[];
  showQuizHome();
}

// ═══════════════ ANALYTICS TRACKING ═══════════════
// Track time spent in app
let sessionStart = Date.now();
let activeStart = Date.now();
let totalActiveTime = 0;

// Track page views
const originalGoPage = goPage;
window.goPage = function(id) {
  originalGoPage(id);
  gtag('event', 'page_view', {
    page_title: id,
    page_location: window.location.href + '#' + id
  });
};

// Track note opens
const originalOpenPDF = openPDF;
window.openPDF = function(note) {
  originalOpenPDF(note);
  const ctx = getMaterialContext();
  gtag('event', 'note_opened', {
    event_category: 'Study Material',
    event_label: note.topic,
    course: ctx.course,
    subject: ctx.subject
  });
};

// Track how long each note stays open — lets Ankit see which notes/sections get the most reading time
let _noteOpenTs = null, _noteOpenMeta = null;
const openPDFForTiming = window.openPDF;
window.openPDF = function(note) {
  openPDFForTiming(note);
  _noteOpenTs = Date.now();
  const ctx = getMaterialContext();
  _noteOpenMeta = { title: note.topic, course: ctx.course, subject: ctx.subject };
};
function _flushNoteTime(){
  if(!_noteOpenTs)return;
  const seconds = Math.round((Date.now()-_noteOpenTs)/1000);
  if(seconds>=2){ // ignore accidental instant taps
    const minutes = Math.round((seconds/60)*10)/10; // e.g. 2.5 minutes, rounded to 1 decimal
    gtag('event','note_time_spent',{
      event_category:'Study Material',
      event_label: _noteOpenMeta?_noteOpenMeta.title:'',
      course: _noteOpenMeta?_noteOpenMeta.course:'',
      subject: _noteOpenMeta?_noteOpenMeta.subject:'',
      value: minutes
    });
  }
  _noteOpenTs=null;_noteOpenMeta=null;
}
const originalClosePDF = closePDF;
window.closePDF = function(){
  _flushNoteTime();
  originalClosePDF();
};

// Track note saves
const originalToggleSave = toggleSaveNote;
window.toggleSaveNote = function(note) {
  originalToggleSave(note);
  const isSaved = !savedNotes.some(s => s.id === note.id); // after toggle
  gtag('event', isSaved ? 'note_saved' : 'note_unsaved', {
    event_category: 'Offline',
    event_label: note.topic
  });
};

// Helper: get current course/subject names from smView, for tagging events with context
function getMaterialContext(){
  try{
    const co = courses.find(c=>c.id===smView.courseId);
    const su = co && co.subjects ? co.subjects.find(s=>s.id===smView.subjectId) : null;
    return { course: co?co.name:'', subject: su?su.name:'' };
  }catch(e){ return { course:'', subject:'' }; }
}

// Track course/subject/folder browsing inside Study Material
const originalGoMaterialView = goMaterialView;
window.goMaterialView = function(view){
  originalGoMaterialView(view);
  if(view.level==='subjects'){
    const co = courses.find(c=>c.id===view.courseId);
    gtag('event','course_viewed',{event_category:'Study Material', event_label: co?co.name:''});
  } else if(view.level==='folders'){
    const ctx = getMaterialContext();
    gtag('event','subject_viewed',{event_category:'Study Material', event_label: ctx.subject, course: ctx.course});
  }
};

// Track AI chat usage
const originalSendMsg = sendMsg;
window.sendMsg = async function() {
  // ── Daily limit: 15 questions per day ──
  const today = new Date().toDateString();
  const limitKey = 'ms_medibot_' + today;
  const count = parseInt(localStorage.getItem(limitKey) || '0');
  const DAILY_LIMIT = 15;

  if(count >= DAILY_LIMIT){
    // Show limit message in chat
    const w = document.getElementById('chat-welcome');
    if(w) w.remove();
    addChatMsg('ai', '⚠️ **Daily limit reached!** You have used all ' + DAILY_LIMIT + ' MediBot questions for today. Your limit resets at midnight. Use this time to revise what you\'ve learned! 📚');
    return;
  }

  // Increment count
  localStorage.setItem(limitKey, count + 1);

  // Show remaining count if getting low
  if(count >= 10){
    const remaining = DAILY_LIMIT - count - 1;
    if(remaining >= 0){
      setTimeout(()=>{
        addChatMsg('ai', '💡 *(' + remaining + ' MediBot question' + (remaining===1?'':'s') + ' remaining today)*');
      }, 100);
    }
  }

  gtag('event', 'ai_question_asked', { event_category: 'AI Tutor', value: count + 1 });
  return originalSendMsg();
};

// ═══════════════ PDF BLOB STORAGE (Cache API + IndexedDB fallback) ═══════════════
// Cache API is more reliable on Android Chrome than IndexedDB for large blobs
const PDF_CACHE_NAME = 'MediStudyPDFs-v1';
const PDF_DB_NAME = 'MediStudyPDFs', PDF_DB_VER = 1, PDF_STORE = 'pdfs';
let pdfDB = null;

// Primary: Cache API (works on Android Chrome, GitHub Pages, PWA)
async function _saveBlobToCache(noteId, blob){
  try{
    if(!('caches' in window)) throw new Error('Cache API not available in this browser');
    const cache = await caches.open(PDF_CACHE_NAME);
    const url = `/__pdf__/${noteId}`;
    const resp = new Response(blob, {headers:{'Content-Type': blob.type||'application/pdf'}});
    await cache.put(url, resp);
    console.log('[MediStudy] Cache API save OK:', noteId, blob.size, 'bytes');
    return true;
  }catch(e){
    const msg = e && e.message ? e.message : String(e);
    console.warn('[MediStudy] Cache API save FAILED:', msg);
    // Show error visually so we can debug without DevTools
    _pdfDebugToast('CacheAPI fail: ' + msg.slice(0,80));
    return false;
  }
}
function _pdfDebugToast(msg){
  let el = document.getElementById('pdf-debug-toast');
  if(!el){
    el = document.createElement('div');
    el.id = 'pdf-debug-toast';
    el.style.cssText = 'position:fixed;bottom:80px;left:8px;right:8px;background:#1a1a2e;color:#ff9;border:1px solid #ff9;border-radius:8px;padding:10px;font-size:12px;z-index:9999;word-break:break-all;';
    document.body.appendChild(el);
  }
  el.textContent = '🔍 DEBUG: ' + msg;
  el.style.display = 'block';
  setTimeout(()=>{ if(el) el.style.display='none'; }, 10000);
}
async function _getBlobFromCache(noteId){
  try{
    const cache = await caches.open(PDF_CACHE_NAME);
    const resp = await cache.match(`/__pdf__/${noteId}`);
    if(!resp) return null;
    return await resp.blob();
  }catch(e){ return null; }
}
async function _deleteBlobFromCache(noteId){
  try{
    const cache = await caches.open(PDF_CACHE_NAME);
    await cache.delete(`/__pdf__/${noteId}`);
  }catch(e){}
}
async function _hasBlobInCache(noteId){
  try{
    const cache = await caches.open(PDF_CACHE_NAME);
    const resp = await cache.match(`/__pdf__/${noteId}`);
    return !!resp;
  }catch(e){ return false; }
}

// Fallback: IndexedDB
function openPdfDB(){
  return new Promise((res, rej) => {
    if(pdfDB){res(pdfDB);return;}
    const req = indexedDB.open(PDF_DB_NAME, PDF_DB_VER);
    req.onupgradeneeded = e => e.target.result.createObjectStore(PDF_STORE, {keyPath:'id'});
    req.onsuccess = e => { pdfDB = e.target.result; res(pdfDB); };
    req.onerror = (e) => rej('IndexedDB failed: ' + e.target.error);
  });
}
async function savePdfBlob(noteId, url){
  async function _fetchPdfBlob(fetchUrl){
    const resp = await fetch(fetchUrl, {mode:'cors'});
    if(!resp.ok) return null;
    const blob = await resp.blob();
    if(blob.type.includes('text/html') || blob.size < 5000) return null;
    return blob;
  }
  try {
    let blob = await _fetchPdfBlob(url);
    if(!blob){
      console.warn('[MediStudy] savePdfBlob: got HTML on first try, retrying in 1.5s...');
      await new Promise(r=>setTimeout(r,1500));
      blob = await _fetchPdfBlob(url);
    }
    if(!blob){ console.warn('[MediStudy] savePdfBlob: both attempts failed.'); return false; }
    const db = await openPdfDB();
    return new Promise(res => {
      const tx = db.transaction(PDF_STORE,'readwrite');
      tx.objectStore(PDF_STORE).put({id: noteId, blob, savedAt: Date.now()});
      tx.oncomplete = () => res(true);
      tx.onerror = () => res(false);
    });
  } catch(e){ console.warn('[MediStudy] savePdfBlob error:',e); return false; }
}
// ── Blob storage: Cache API (primary) + IndexedDB (fallback) ──
async function savePdfBlobDirect(noteId, blob){
  // Try Cache API first — most reliable on Android Chrome + GitHub Pages
  const cacheOk = await _saveBlobToCache(noteId, blob);
  if(cacheOk) return true;
  // Fallback: IndexedDB
  try{
    _pdfDebugToast('Trying IndexedDB fallback...');
    const db = await openPdfDB();
    return new Promise(res=>{
      const tx=db.transaction(PDF_STORE,'readwrite');
      tx.objectStore(PDF_STORE).put({id:noteId, blob, savedAt:Date.now()});
      tx.oncomplete=()=>{ _pdfDebugToast('IndexedDB save OK!'); res(true); };
      tx.onerror=(e)=>{ _pdfDebugToast('IDB error: '+(e.target.error||'unknown')); res(false); };
    });
  }catch(e){ _pdfDebugToast('IDB exception: '+(e.message||String(e))); return false; }
}
async function getPdfBlob(noteId){
  // Try Cache API first
  const b = await _getBlobFromCache(noteId);
  if(b) return b;
  // Fallback: IndexedDB
  try {
    const db = await openPdfDB();
    return new Promise(res => {
      const req = db.transaction(PDF_STORE,'readonly').objectStore(PDF_STORE).get(noteId);
      req.onsuccess = e => res(e.target.result ? e.target.result.blob : null);
      req.onerror = () => res(null);
    });
  } catch(e){ return null; }
}
async function deletePdfBlob(noteId){
  await _deleteBlobFromCache(noteId);
  try {
    const db = await openPdfDB();
    const tx = db.transaction(PDF_STORE,'readwrite');
    tx.objectStore(PDF_STORE).delete(noteId);
  } catch(e){}
}
async function hasPdfBlob(noteId){
  if(await _hasBlobInCache(noteId)) return true;
  const blob = await getPdfBlob(noteId);
  return blob !== null;
}


function showOfflineToast(msg, isOnline){
  const t=document.getElementById('offline-toast');
  t.textContent=msg;
  t.style.background=isOnline?'#0e2a1a':'#2a0e0e';
  t.style.color=isOnline?'var(--green)':'#e85d38';
  t.style.border=`1px solid ${isOnline?'var(--green)':'#e85d38'}`;
  t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),3500);
}
window.addEventListener('offline',()=>{
  showOfflineToast('📡 You are offline — saved notes still work!',false);
  updateHomeBanner();
});
window.addEventListener('online',()=>{
  showOfflineToast('✅ Back online!',true);
  updateHomeBanner();
  if(fbConnected&&db) pullFromFirebase();
});
// Override updateHomeBanner to show offline state
const _origUpdateHomeBanner = updateHomeBanner;
window.updateHomeBanner = function(){
  _origUpdateHomeBanner();
  if(!navigator.onLine){
    const el=document.getElementById('home-fb-banner');
    if(el) el.innerHTML=`<div class="offline-banner">📡 <span>You are <strong>offline</strong> — saved notes & videos still available</span></div>`;
  }
};

// ═══════════════ NOTIFICATIONS ═══════════════
let notifEnabled=localStorage.getItem('ms_notif_on')==='1';
let notifTime=localStorage.getItem('ms_notif_time')||'08:00';
let notifInterval=null;

function toggleNotification(){
  notifEnabled=document.getElementById('notif-toggle').checked;
  localStorage.setItem('ms_notif_on',notifEnabled?'1':'0');
  if(notifEnabled){
    requestNotifPermission();
  } else {
    clearInterval(notifInterval);
    document.getElementById('notif-status').textContent='🔕 Reminders off';
  }
}
function saveNotifTime(){
  notifTime=document.getElementById('notif-time').value;
  localStorage.setItem('ms_notif_time',notifTime);
  if(notifEnabled) scheduleNotif();
}
function requestNotifPermission(){
  if(!('Notification' in window)){
    document.getElementById('notif-status').textContent='❌ Notifications not supported in this browser.';
    document.getElementById('notif-toggle').checked=false;
    return;
  }
  Notification.requestPermission().then(p=>{
    if(p==='granted'){
      document.getElementById('notif-status').textContent=`✅ Reminders on! Will notify at ${notifTime} daily.`;
      scheduleNotif();
    } else {
      document.getElementById('notif-status').textContent='❌ Permission denied. Allow notifications in browser settings.';
      document.getElementById('notif-toggle').checked=false;
      notifEnabled=false;
      localStorage.setItem('ms_notif_on','0');
    }
  });
}
function scheduleNotif(){
  clearInterval(notifInterval);
  notifInterval=setInterval(()=>{
    const now=new Date();
    const [hh,mm]=notifTime.split(':').map(Number);
    if(now.getHours()===hh&&now.getMinutes()===mm){
      if(Notification.permission==='granted'){
        new Notification('📚 MediStudy Reminder',{
          body:'Time to study! Open MediStudy and hit your goals today 🩺',
          icon:'https://img.icons8.com/fluency/96/stethoscope.png'
        });
      }
    }
  },60000);
}
function initNotifUI(){
  const tog=document.getElementById('notif-toggle');
  if(tog){tog.checked=notifEnabled;document.getElementById('notif-time').value=notifTime;}
  if(notifEnabled&&Notification.permission==='granted'){
    document.getElementById('notif-status').textContent=`✅ Reminders on at ${notifTime} daily.`;
    scheduleNotif();
  } else if(notifEnabled){
    document.getElementById('notif-status').textContent='⚠️ Tap toggle to reactivate reminders.';
  }
}

// ═══════════════ QUICK NOTES ═══════════════
let qNotes=JSON.parse(localStorage.getItem('ms_qnotes')||'[]');
let currentQNote=null;
let qnAutoSave=null;

function saveQNotes(){localStorage.setItem('ms_qnotes',JSON.stringify(qNotes));}

function newQNote(){
  const note={id:uid(),title:'',body:'',createdAt:Date.now(),updatedAt:Date.now()};
  qNotes.unshift(note);saveQNotes();
  openQNote(note.id);
}
function openQNote(id){
  const note=qNotes.find(n=>n.id===id);if(!note)return;
  currentQNote=note;
  document.getElementById('qn-title-input').value=note.title;
  document.getElementById('qn-body-input').value=note.body;
  document.getElementById('qn-editor').style.display='block';
  document.getElementById('qn-save-status').textContent='Auto-saved ✓';
  document.getElementById('qn-title-input').focus();
}
function closeQNEditor(){
  saveCurrentQNote();
  document.getElementById('qn-editor').style.display='none';
  currentQNote=null;
  renderQNotes();
}
function saveCurrentQNote(){
  if(!currentQNote)return;
  currentQNote.title=document.getElementById('qn-title-input').value||'Untitled';
  currentQNote.body=document.getElementById('qn-body-input').value;
  currentQNote.updatedAt=Date.now();
  saveQNotes();
  document.getElementById('qn-save-status').textContent='Saved ✓';
}
function deleteQNote(){
  if(!currentQNote)return;
  if(!confirm('Delete this note?'))return;
  qNotes=qNotes.filter(n=>n.id!==currentQNote.id);saveQNotes();
  document.getElementById('qn-editor').style.display='none';
  currentQNote=null;renderQNotes();
}
function renderQNotes(){
  const q=(document.getElementById('qn-search')?.value||'').toLowerCase();
  const filtered=q?qNotes.filter(n=>(n.title+n.body).toLowerCase().includes(q)):qNotes;
  const list=document.getElementById('qn-list');
  if(!filtered.length){
    list.innerHTML=`<div class="empty-state" style="padding:40px 20px;">📝<br>${q?'No notes match your search':'Tap <strong>+ New Note</strong> to start!'}</div>`;return;
  }
  list.innerHTML=filtered.map(n=>`<div class="qn-card" onclick="openQNote('${n.id}')">
    <div class="qn-card-title">${n.title||'Untitled'}</div>
    <div class="qn-card-preview">${n.body||'Empty note...'}</div>
    <div class="qn-card-date">${new Date(n.updatedAt).toLocaleString()}</div>
  </div>`).join('');
}
// Auto-save while typing
document.addEventListener('input',e=>{
  if(e.target.id==='qn-title-input'||e.target.id==='qn-body-input'){
    clearTimeout(qnAutoSave);
    qnAutoSave=setTimeout(()=>{saveCurrentQNote();},800);
  }
});

// ═══════════════ PROGRESS TRACKER ═══════════════
let progData=JSON.parse(localStorage.getItem('ms_progress')||'{}');
// progData = { subjectId: { topics: [{id,name,done}] } }
function saveProgress(){localStorage.setItem('ms_progress',JSON.stringify(progData));}

function renderProgress(){
  const container=document.getElementById('prog-container');
  const summary=document.getElementById('prog-summary');
  const lc=getStudentCourseId();
  const subjectsForProgress=lc?subjects.filter(s=>s.courseId===lc):subjects;
  if(!subjectsForProgress.length){
    container.innerHTML='<div class="empty-state">📭 No subjects yet. Add via Admin → Structure first!</div>';
    summary.innerHTML='';return;
  }
  // Calculate overall stats
  let totalTopics=0,doneTopics=0;
  subjectsForProgress.forEach(s=>{
    const d=progData[s.id];
    if(d&&d.topics){totalTopics+=d.topics.length;doneTopics+=d.topics.filter(t=>t.done).length;}
  });
  const pct=totalTopics?Math.round(doneTopics/totalTopics*100):0;
  summary.innerHTML=`
    <div class="prog-stat"><div class="prog-stat-val">${pct}%</div><div class="prog-stat-label">OVERALL</div></div>
    <div class="prog-stat"><div class="prog-stat-val">${doneTopics}</div><div class="prog-stat-label">DONE</div></div>
    <div class="prog-stat"><div class="prog-stat-val">${totalTopics-doneTopics}</div><div class="prog-stat-label">PENDING</div></div>`;
  container.innerHTML=subjectsForProgress.map(s=>{
    if(!progData[s.id])progData[s.id]={topics:[]};
    const topics=progData[s.id].topics;
    const done=topics.filter(t=>t.done).length;
    const total=topics.length;
    const pct=total?Math.round(done/total*100):0;
    const co=courses.find(c=>c.id===s.courseId);
    return`<div class="prog-subject-card">
      <div class="prog-subj-header">
        <div><div class="prog-subj-name">🔬 ${s.name}</div><div style="font-size:10px;color:var(--muted)">${co?co.name:''}</div></div>
        <div class="prog-pct">${done}/${total} · ${pct}%</div>
      </div>
      <div class="prog-bar-wrap"><div class="prog-bar-fill" style="width:${pct}%"></div></div>
      <div class="prog-topics">
        ${topics.map(t=>`<div class="prog-topic-row">
          <div class="prog-cb ${t.done?'done':''}" onclick="toggleProgTopic('${s.id}','${t.id}')">${t.done?'✓':''}</div>
          <span class="prog-topic-name ${t.done?'done':''}">${t.name}</span>
          <button class="goal-del" onclick="delProgTopic('${s.id}','${t.id}')">🗑️</button>
        </div>`).join('')}
        ${total===0?'<div style="font-size:12px;color:var(--muted);padding:4px 0;">Add topics to track below ↓</div>':''}
      </div>
      <div class="prog-add-row">
        <input class="prog-add-inp" id="prog-inp-${s.id}" placeholder="Add topic to track..." onkeydown="if(event.key==='Enter')addProgTopic('${s.id}')">
        <button class="prog-add-btn" onclick="addProgTopic('${s.id}')">+ Add</button>
      </div>
    </div>`;
  }).join('');
}
function addProgTopic(subjectId){
  const inp=document.getElementById('prog-inp-'+subjectId);
  const name=inp?.value.trim();if(!name)return;
  if(!progData[subjectId])progData[subjectId]={topics:[]};
  progData[subjectId].topics.push({id:uid(),name,done:false});
  saveProgress();inp.value='';renderProgress();
}
function toggleProgTopic(subjectId,topicId){
  const t=progData[subjectId]?.topics.find(x=>x.id===topicId);
  if(!t)return;t.done=!t.done;saveProgress();renderProgress();
}
function delProgTopic(subjectId,topicId){
  if(!progData[subjectId])return;
  progData[subjectId].topics=progData[subjectId].topics.filter(t=>t.id!==topicId);
  saveProgress();renderProgress();
}

// ═══════════════ BATCH CHAT ═══════════════
let chatUserName = localStorage.getItem('ms_chat_name') || '';
let batchChatListener = null;
let chatInitAttempts = 0;
let chatInitTimer = null;

function showChatEl(which){
  ['chat-name-setup','chat-offline-notice','batch-chat-box','chat-loading'].forEach(id=>{
    const el=document.getElementById(id);
    if(el) el.style.display='none';
  });
  const el=document.getElementById(which);
  if(el) el.style.display = which==='batch-chat-box'?'block':'flex';
}

function initBatchChat(){
  // Reset counter each time user opens the chat page fresh
  // (only the retry chain inside increments it)
  if(chatInitAttempts === 0){
    // Clear any pending retry timer from a previous visit
    if(chatInitTimer){ clearTimeout(chatInitTimer); chatInitTimer=null; }
  }

  // Offline
  if(!navigator.onLine){
    chatInitAttempts = 0;
    showChatEl('chat-offline-notice'); return;
  }

  // Firebase ready
  if(fbConnected && db){
    chatInitAttempts = 0;
    if(chatInitTimer){ clearTimeout(chatInitTimer); chatInitTimer=null; }
    cleanOldChatMessages(); // silently remove messages older than 3 days
    if(!chatUserName){
      showChatEl('chat-name-setup');
    } else {
      showChatEl('batch-chat-box');
      document.getElementById('batch-chat-name-display').textContent='💬 '+chatUserName;
      startBatchChatListener();
    }
    return;
  }

  // Firebase not ready yet — show loading and try to connect
  showChatEl('chat-loading');

  if(chatInitAttempts === 0){
    // First attempt: kick off Firebase init
    if(typeof initFirebase === 'function'){
      initFirebase(()=>{
        if(fbConnected && db){ chatInitAttempts=0; initBatchChat(); }
      });
    }
  }

  chatInitAttempts++;

  if(chatInitAttempts <= 5){
    chatInitTimer = setTimeout(()=>{
      chatInitTimer = null;
      if(!fbConnected) initBatchChat();
      else { chatInitAttempts=0; initBatchChat(); }
    }, 2000);
  } else {
    chatInitAttempts = 0;
    chatInitTimer = null;
    showChatEl('chat-offline-notice');
  }
}

function setChatName(){
  const name=document.getElementById('chat-username-input').value.trim();
  if(!name){alert('Enter your name!');return;}
  chatUserName=name;
  localStorage.setItem('ms_chat_name',name);
  chatInitAttempts=0;
  initBatchChat();
}
function changeChatName(){
  chatUserName='';
  localStorage.removeItem('ms_chat_name');
  chatInitAttempts=0;
  initBatchChat();
}

let _chatRef = null; // store the exact ref used for .on() so .off() works correctly

function cleanOldChatMessages(){
  if(!db) return;
  const cutoff = Date.now() - (3 * 24 * 60 * 60 * 1000); // 3 days ago
  db.ref('medistudy_chat').orderByChild('ts').endAt(cutoff).once('value', snap=>{
    if(!snap || !snap.exists()) return;
    const updates = {};
    snap.forEach(c=>{ updates[c.key] = null; }); // null = delete in Firebase
    if(Object.keys(updates).length > 0){
      db.ref('medistudy_chat').update(updates);
    }
  });
}

function startBatchChatListener(){
  if(!db) return;
  // Remove old listener using the SAME ref object
  if(batchChatListener && _chatRef){
    try{ _chatRef.off('value', batchChatListener); }catch(e){}
    batchChatListener=null;
    _chatRef=null;
  }
  const msgEl=document.getElementById('batch-msgs');
  msgEl.innerHTML='<div style="text-align:center;padding:20px;font-size:13px;color:var(--muted)">Loading messages...</div>';

  _chatRef = db.ref('medistudy_chat').limitToLast(50);
  batchChatListener = _chatRef.on('value', snap=>{
    const msgs=[];
    if(snap && snap.exists()){
      snap.forEach(c=>{ const v=c.val(); if(v&&v.text)msgs.push({...v,_key:c.key}); });
    }
    if(!msgs.length){
      msgEl.innerHTML='<div style="text-align:center;padding:40px;font-size:13px;color:var(--muted)">No messages yet. Say hello! 👋</div>';
      return;
    }
    const wasAtBottom = msgEl.scrollHeight - msgEl.scrollTop - msgEl.clientHeight < 60;
    msgEl.innerHTML=msgs.map(m=>{
      const mine=m.name===chatUserName;
      const time=new Date(m.ts).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
      const k=m._key||'';
      return`<div class="batch-msg ${mine?'mine':'theirs'}" data-key="${k}">
        <div class="batch-msg-name">${mine?'You':escapeHTML(m.name||'')}</div>
        <div class="batch-msg-bubble">${escapeHTML(m.text||'')}</div>
        <div class="batch-msg-reactions" id="rxn-${k}">
          <button class="react-add-btn" onclick="openEmojiPicker(event,'${k}')" title="React">+</button>
        </div>
        <div class="batch-msg-time">${time}</div>
      </div>`;
    }).join('');
    if(wasAtBottom) msgEl.scrollTop=msgEl.scrollHeight;
    msgs.forEach(m=>{ if(m._key) loadReactions(m._key); });
  }, err=>{
    console.error('Chat listener error:', err);
    msgEl.innerHTML='<div style="text-align:center;padding:20px;font-size:13px;color:#e85d38">⚠️ Connection lost. Check internet.</div>';
  });
}

function sendBatchMsg(){
  const inp=document.getElementById('batch-input');
  const text=inp.value.trim();
  if(!text||!chatUserName) return;
  if(!fbConnected||!db){
    showOfflineToast('📡 No connection — cannot send message',false); return;
  }
  inp.value='';
  // Optimistic UI: show message immediately before Firebase echoes it back
  const msgEl=document.getElementById('batch-msgs');
  const time=new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
  const tempDiv=document.createElement('div');
  tempDiv.className='batch-msg mine';
  tempDiv.innerHTML=`<div class="batch-msg-name">You</div><div class="batch-msg-bubble">${escapeHTML(text)}</div><div class="batch-msg-time">${time}</div>`;
  // Remove "no messages" placeholder if present
  if(msgEl.children.length===1 && msgEl.children[0].style.textAlign==='center') msgEl.innerHTML='';
  msgEl.appendChild(tempDiv);
  msgEl.scrollTop=msgEl.scrollHeight;

  db.ref('medistudy_chat').push({
    name:chatUserName, text, ts:Date.now()
  }).catch(()=>{
    inp.value=text;
    tempDiv.remove();
    showOfflineToast('❌ Failed to send — try again',false);
  });
}

function escapeHTML(str){
  if(!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ═══════════════ CHAT REACTIONS ═══════════════
const REACTION_EMOJIS=['👍','❤️','😂','😮','🙏'];
let _reactionListeners={}; // msgKey -> {ref, cb} so we can detach old listeners and avoid duplicates

function reactUserKey(){
  // Firebase keys can't contain . # $ [ ] /  — sanitize the chat display name to use as this user's reaction key
  return (chatUserName||'guest').replace(/[.#$\[\]\/]/g,'_');
}

function openEmojiPicker(event,msgKey){
  event.stopPropagation();
  closeEmojiPicker();
  const btn=event.currentTarget;
  const rect=btn.getBoundingClientRect();
  const pop=document.createElement('div');
  pop.className='emoji-picker-popup';
  pop.id='emoji-picker-popup';
  pop.innerHTML=REACTION_EMOJIS.map(e=>`<button onclick="selectReaction('${msgKey}','${e}')">${e}</button>`).join('');
  document.body.appendChild(pop);
  const pw=pop.offsetWidth||200;
  let left=rect.left;
  if(left+pw>window.innerWidth-8) left=window.innerWidth-pw-8;
  if(left<8) left=8;
  let top=rect.top-46;
  if(top<8) top=rect.bottom+6;
  pop.style.left=left+'px';
  pop.style.top=top+'px';
  setTimeout(()=>document.addEventListener('click',closeEmojiPicker,{once:true}),0);
}

function closeEmojiPicker(){
  const pop=document.getElementById('emoji-picker-popup');
  if(pop)pop.remove();
}

function selectReaction(msgKey,emoji){
  closeEmojiPicker();
  if(!db||!fbConnected){showOfflineToast('📡 No connection',false);return;}
  const uKey=reactUserKey();
  const baseRef=db.ref('medistudy_chat_reactions/'+msgKey);
  baseRef.once('value',snap=>{
    const data=snap.val()||{};
    const updates={};
    let alreadyThisEmoji=false;
    REACTION_EMOJIS.forEach(e=>{
      const users=data[e];
      if(users&&users[uKey]){
        if(e===emoji)alreadyThisEmoji=true;
        updates[e+'/'+uKey]=null;
      }
    });
    if(!alreadyThisEmoji)updates[emoji+'/'+uKey]=true;
    baseRef.update(updates);
  });
}

function loadReactions(msgKey){
  if(!db)return;
  if(_reactionListeners[msgKey]){
    try{ _reactionListeners[msgKey].ref.off('value',_reactionListeners[msgKey].cb); }catch(e){}
  }
  const ref=db.ref('medistudy_chat_reactions/'+msgKey);
  const cb=ref.on('value',snap=>{
    const el=document.getElementById('rxn-'+msgKey);
    if(!el)return; // message not currently on screen (scrolled off / replaced)
    const data=snap.val()||{};
    const uKey=reactUserKey();
    let chips='';
    REACTION_EMOJIS.forEach(e=>{
      const users=data[e];
      const keys=users?Object.keys(users):[];
      if(keys.length){
        const mine=!!users[uKey];
        chips+=`<span class="react-chip ${mine?'mine':''}" onclick="selectReaction('${msgKey}','${e}')">${e}<span class="rc-count">${keys.length}</span></span>`;
      }
    });
    el.innerHTML=chips+`<button class="react-add-btn" onclick="openEmojiPicker(event,'${msgKey}')" title="React">+</button>`;
  });
  _reactionListeners[msgKey]={ref,cb};
}

function trimChatMessages(){
  if(!fbConnected||!db)return;
  db.ref('medistudy_chat').once('value',snap=>{
    const keys=[];snap.forEach(c=>keys.push(c.key));
    if(keys.length>200){
      keys.slice(0,keys.length-200).forEach(k=>db.ref('medistudy_chat/'+k).remove());
    }
  });
}


// Track time on app when user leaves — logs to Google Analytics AND auto-adds to today's study hours
function flushActiveTime(){
  const now = Date.now();
  const elapsed = now - activeStart;
  activeStart = now;
  if(typeof _flushNoteTime==='function')_flushNoteTime();
  if(elapsed<=0) return;
  totalActiveTime += elapsed;
  const minutes = Math.round(totalActiveTime / 60000);
  if(minutes > 0 && typeof gtag !== 'undefined') {
    gtag('event', 'time_spent', {
      event_category: 'Engagement',
      event_label: 'minutes',
      value: minutes
    });
  }
  // Auto-add this chunk of active app time to today's study hours (ignore tiny sub-minute blips)
  const hrs = elapsed/3600000;
  if(hrs >= (1/60)){
    const k=todayKey();
    weekLog[k]=Math.round(((weekLog[k]||0)+hrs)*100)/100;
    localStorage.setItem('ms_weeklog',JSON.stringify(weekLog));
    // Use Firebase's own live session (auth.currentUser) as a fallback in case our
    // cached `currentUser` variable went stale without a fresh sign-in event firing.
    // This is read-only — it never changes sign-in state, just re-checks it.
    const liveUser = currentUser || (auth && auth.currentUser) || null;
    if(liveUser && db){
      if(!currentUser) currentUser = liveUser; // self-heal our cached copy
      syncToFirebase('weeklog',weekLog);
      updateHoursLB();
    }
    if(document.getElementById('page-planner')&&document.getElementById('page-planner').classList.contains('active'))renderPlanner();
  }
}
document.addEventListener('visibilitychange', () => {
  if(document.hidden) flushActiveTime();
  else activeStart = Date.now();
});
// Safety net for mobile browsers/PWAs that close without a clean visibilitychange
window.addEventListener('pagehide', flushActiveTime);
// Second safety net: periodically save progress during long continuous sessions,
// so a force-swipe-close (which can skip the events above on some Android devices)
// only loses a few minutes instead of the whole session.
setInterval(() => {
  if(!document.hidden) flushActiveTime();
}, 5*60*1000); // every 5 minutes

// Track session start
gtag('event', 'session_start', {
  event_category: 'Engagement',
  event_label: 'app_opened'
});

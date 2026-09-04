// ═══════════════ DATA ═══════════════
let courses  = JSON.parse(localStorage.getItem('ms4_courses')  || '[]');
let subjects = JSON.parse(localStorage.getItem('ms4_subjects') || '[]');
let folders  = JSON.parse(localStorage.getItem('ms4_folders')  || '[]');
let notes    = JSON.parse(localStorage.getItem('ms4_notes')    || '[]');
let videos   = JSON.parse(localStorage.getItem('ms4_videos')   || '[]');
let exams    = JSON.parse(localStorage.getItem('ms_exams')     || '[]');
let goals    = JSON.parse(localStorage.getItem('ms_goals')     || '[]');
let weekLog  = JSON.parse(localStorage.getItem('ms_weeklog')   || '{}');
let savedNotes  = JSON.parse(localStorage.getItem('ms4_saved')   || '[]');
let savedVideos = JSON.parse(localStorage.getItem('ms4_savedvids') || '[]');
let bookmarkedNotes = JSON.parse(localStorage.getItem('ms4_bookmarks') || '[]');
let showBookmarkedOnly = false;
let fbConfig = JSON.parse(localStorage.getItem('ms4_fbconfig') || 'null');
let fbConnected=false, db=null, adminUnlocked=false;
let chatHistory=[], chatLoading=false, currentPDF=null;
const PASS_HASH='226a0d3bb5dd67d71cd7158a8615bdef9c13dc01123137396dc94c038b0bbd57';
// Limited "Sponsor" access — sees only Announcements + Student Essentials, nothing else. Default password: Yulia@2026 (Ankit can change this by editing the hash below)
const SPONSOR_HASH='f5a0025e6984519a96aa0e64b229b8fc38464e09d09cb4ca7061ec7f310ebf89';
// Limited "Editor" access — sees only Structure, Notes, Videos, Manage, MCQ. No Announce/Essentials/Students/Firebase. Default password: Editor@2026
const EDITOR_HASH='b2cb491f327eab7dee2b56732e0183918e692bfab65ca5b340fc1596d2361775';
let adminRole=null; // 'admin', 'sponsor', or 'editor'
const COURSE_ICONS=['📘','📗','📙','📕','📓','📔'];
const FOLDER_ICONS=['📁','📝','⚡','💡','📌','🗒️','📊','🔖'];

if(!courses.length){
  courses=[{id:'c1',name:'1st Course'},{id:'c2',name:'2nd Course'},{id:'c3',name:'3rd Course'}];
  saveLocal();
}
function uid(){return '_'+Math.random().toString(36).slice(2,9);}
function saveLocal(){
  localStorage.setItem('ms4_courses',JSON.stringify(courses));
  localStorage.setItem('ms4_subjects',JSON.stringify(subjects));
  localStorage.setItem('ms4_folders',JSON.stringify(folders));
  localStorage.setItem('ms4_notes',JSON.stringify(notes));
  localStorage.setItem('ms4_videos',JSON.stringify(videos));
}
function saveSaved(){localStorage.setItem('ms4_saved',JSON.stringify(savedNotes));syncToFirebase('saved',savedNotes);}
function saveSavedVideos(){localStorage.setItem('ms4_savedvids',JSON.stringify(savedVideos));syncToFirebase('savedvids',savedVideos);}
function saveBookmarks(){localStorage.setItem('ms4_bookmarks',JSON.stringify(bookmarkedNotes));syncToFirebase('bookmarks',bookmarkedNotes);}
function isNoteBookmarked(id){return bookmarkedNotes.some(b=>b.id===id);}
function isVideoSaved(id){return savedVideos.some(s=>s.id===id);}
function toggleSaveVideo(video){
  const idx=savedVideos.findIndex(s=>s.id===video.id);
  if(idx>=0)savedVideos.splice(idx,1);
  else savedVideos.push({...video,savedAt:Date.now()});
  saveSavedVideos();
  if(document.getElementById('page-saved').classList.contains('active'))renderSaved();
}

// ═══════════════ FIREBASE ═══════════════
let _fbSDKState = null; // null=not started, Array=loading, true=done
function loadFirebaseSDK(cb){
  if(_fbSDKState === true || (window.firebase && window.firebase.database && window.firebase.auth)){cb();return;}
  if(Array.isArray(_fbSDKState)){_fbSDKState.push(cb);return;}
  _fbSDKState = [cb];
  const s=document.createElement('script');
  s.src='https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js';
  s.onload=()=>{
    const s2=document.createElement('script');
    s2.src='https://www.gstatic.com/firebasejs/9.23.0/firebase-database-compat.js';
    s2.onload=()=>{
      const s3=document.createElement('script');
      s3.src='https://www.gstatic.com/firebasejs/9.23.0/firebase-auth-compat.js';
      s3.onload=()=>{
        const pending=_fbSDKState;
        _fbSDKState=true;
        pending.forEach(fn=>fn());
      };
      document.head.appendChild(s3);
    };
    document.head.appendChild(s2);
  };
  document.head.appendChild(s);
}
function connectFirebase(){
  const apiKey=document.getElementById('fb-api-key').value.trim();
  const databaseURL=document.getElementById('fb-db-url').value.trim();
  const projectId=document.getElementById('fb-project-id').value.trim();
  if(!apiKey||!databaseURL||!projectId){alert('Fill all Firebase fields!');return;}
  fbConfig={apiKey,databaseURL,projectId,authDomain:`${projectId}.firebaseapp.com`};
  localStorage.setItem('ms4_fbconfig',JSON.stringify(fbConfig));
  initFirebase(()=>{flashSuccess('fb-success','✅ Firebase connected!');updateFBStatus();updateHomeBanner();});
}
let auth=null, currentUser=null, authReady=false;
// Fallback: if Firebase Auth doesn't load in 8s, unlock all pages anyway
setTimeout(()=>{ if(!authReady){ authReady=true; } restoreLastScreen(); }, 8000);

function initFirebase(cb){
  if(!fbConfig){updateFBStatus();return;}
  loadFirebaseSDK(()=>{
    try{
      if(!firebase.apps.length)firebase.initializeApp(fbConfig);
      db=firebase.database();fbConnected=true;
      // Init Auth
      if(firebase.auth && !auth){
        auth=firebase.auth();
        auth.onAuthStateChanged(function(user){
          currentUser=user;
          authReady=true;
          updateAuthUI();
          restoreLastScreen();
          const warnEl=document.getElementById('admin-signedin-warning');
          if(warnEl) warnEl.style.display = currentUser ? 'none' : 'block';
          if(user){
            loadUserDataFromFirebase();
            // Record login info so the admin panel can show who used the app and when
            db.ref('users/'+user.uid).update({
              email: user.email||'',
              lastLogin: Date.now()
            }).catch(e=>console.warn('Login log failed:',e));
          }
        });
      }
      if(cb)cb();
      checkAnnouncements();
    }catch(e){fbConnected=false;console.error(e);}
    updateFBStatus();updateHomeBanner();
  });
}
function pushToFirebase(successId,_retries){
  _retries = _retries||0;
  if(!fbConnected||!db){
    if(_retries<10){ setTimeout(()=>pushToFirebase(successId,_retries+1), 500); return; }
    alert('Still connecting to the server. Please check your internet connection and try again in a few seconds.');
    return;
  }
  db.ref('medistudy').set({courses,subjects,folders,notes,videos,updatedAt:Date.now()})
    .then(()=>flashSuccess(successId||'fb-success','✅ Pushed! Friends can now pull.'))
    .catch(e=>alert('Push failed: '+e.message));
}
function pullFromFirebase(_retries){
  _retries = _retries||0;
  if(!fbConnected||!db){
    if(_retries<10){ setTimeout(()=>pullFromFirebase(_retries+1), 500); return; }
    alert('Still connecting to the server. Please check your internet connection and try again in a few seconds.');
    return;
  }
  db.ref('medistudy').once('value').then(snap=>{
    const d=snap.val();if(!d){alert('No data on Firebase yet.');return;}
    courses=d.courses||courses;subjects=d.subjects||subjects;folders=d.folders||folders;notes=d.notes||notes;videos=d.videos||videos;
    saveLocal();flashSuccess('fb-success','✅ Pulled from Firebase!');renderMaterial();
  }).catch(e=>alert('Pull failed: '+e.message));
}
function updateFBStatus(){
  const el=document.getElementById('fb-status-text');if(!el)return;
  if(fbConnected)el.innerHTML=`<span style="color:var(--green)">✅ Connected! Project: <strong>${fbConfig.projectId}</strong></span><br>Push your data so friends can see it. Pull to get the latest from Firebase.`;
  else if(fbConfig)el.innerHTML=`<span style="color:var(--accent)">⚠️ Config saved, not connected. Reload app to reconnect.</span>`;
  else el.innerHTML=`<span style="color:#e85d38">❌ Not connected.</span> Enter Firebase config below to share notes with friends.`;
}
function updateHomeBanner(){
  const el=document.getElementById('home-fb-banner');if(!el)return;
  el.innerHTML=fbConnected
    ?`<div class="fb-banner"><div class="fb-dot online"></div><span style="color:var(--green);font-weight:600;">Live</span> — Connected to Firebase. Notes sync across all devices.</div>`
    :`<div class="fb-banner"><div class="fb-dot local"></div><span>Local mode</span> — <span style="color:var(--muted);">Notes only on this device. <span style="color:var(--accent);cursor:pointer" onclick="location.reload()">Refresh →</span></span></div>`;
}

// ═══════════════ THEME ═══════════════
let isDark=localStorage.getItem('ms_theme')!=='light';
function applyTheme(){document.body.classList.toggle('light',!isDark);document.getElementById('theme-btn').textContent=isDark?'🌙':'☀️';}
function toggleTheme(){isDark=!isDark;localStorage.setItem('ms_theme',isDark?'dark':'light');applyTheme();}
applyTheme();

// ═══════════════ NAVIGATION ═══════════════
const LOGIN_GATED={'tutor':'MediBot AI','chat':'Batch Chat','planner':'Planner','progress':'Progress Tracker','quiz':'MCQ Quiz'};
let isBackNav=false;
// Remember which screen the student was on, so a refresh reopens it instead of always jumping to Home
function saveLastScreen(id){
  try{
    const data={id:id};
    if(id==='material') data.smView=smView;
    localStorage.setItem('ms_lastScreen', JSON.stringify(data));
  }catch(e){}
}
let lastScreenRestored=false;
function restoreLastScreen(){
  if(lastScreenRestored) return;
  lastScreenRestored=true;
  try{
    const raw=localStorage.getItem('ms_lastScreen');
    if(!raw){ saveLastScreen('home'); return; }
    const data=JSON.parse(raw);
    if(!data || !data.id || data.id==='home' || data.id==='about'){ saveLastScreen('home'); return; }
    // Don't auto-reopen a locked page if the student isn't signed in — just stay on Home for now
    // (don't overwrite the saved screen here: if auth is just slow to resolve, we don't want to
    // permanently forget a gated page the student was legitimately signed into)
    if(LOGIN_GATED[data.id] && !currentUser) return;
    if(!document.getElementById('page-'+data.id)){ saveLastScreen('home'); return; }
    goPage(data.id, true);
    if(data.id==='material' && data.smView) goMaterialView(data.smView);
  }catch(e){}
}
function goPage(id,addToHistory=true){
  // Gate check for protected pages
  if(authReady && LOGIN_GATED[id] && !currentUser){
    openLoginModal('Sign in to use '+LOGIN_GATED[id]);
    return;
  }
  const wasBackNav=isBackNav;
  if(addToHistory && !isBackNav){ try{ history.pushState({msPage:id},'',location.pathname+location.search); }catch(e){} }
  isBackNav=false;
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t=>t.classList.remove('active'));
  document.getElementById('page-'+id).classList.add('active');
  const map={home:0,search:1,tutor:2,material:3,videos:4,saved:5,planner:6,leaderboard:7,quicknotes:8,progress:9,chat:10,quiz:11,about:12,essentials:13};
  if(map[id]!==undefined)document.querySelectorAll('.nav-tab')[map[id]].classList.add('active');
  if(id!=='material') detachLikeListeners();
  if(id==='material'){if(!wasBackNav){const lc=getStudentCourseId();smView=lc?{level:'subjects',courseId:lc}:{level:'courses'};}renderMaterial();}
  if(id==='videos')renderVideosPage();
  if(id==='saved')renderSaved();
  if(id==='planner')renderPlanner();
  if(id==='leaderboard')renderLB();
  if(id==='search')document.getElementById('search-input').focus();
  if(id==='quicknotes')renderQNotes();
  if(id==='progress')renderProgress();
  if(id==='chat'){chatInitAttempts=0;initBatchChat();}
  if(id==='quiz')showQuizHome();
  if(id==='essentials')renderEssentials();
  saveLastScreen(id);
}
// Change the view WITHIN Study Material (course/subject/folder drill-down) and track it in history
function goMaterialView(view){
  const lc=getStudentCourseId();
  if(lc && view.level==='courses'){ view={level:'subjects',courseId:lc}; }
  smView=view;
  showBookmarkedOnly=false;
  try{ history.pushState({msPage:'material',smView:view},'',location.pathname+location.search); }catch(e){}
  renderMaterial();
  saveLastScreen('material');
}
// Set the very first history entry to Home so the first back press always lands there before exiting the app
try{ history.replaceState({msPage:'home'},'',location.pathname+location.search); }catch(e){}
// When the device/browser back button is pressed, move one step back inside the app instead of quitting
window.addEventListener('popstate',(e)=>{
  // If a PDF is open, Back should just close it — the page underneath is already correct as-is
  const pdfOverlay=document.getElementById('pdf-overlay');
  if(pdfOverlay && pdfOverlay.classList.contains('open')){
    _pdfClosingViaBack=true;
    closePDF();
    return;
  }
  isBackNav=true;
  const state=e.state||{msPage:'home'};
  if(state.msPage==='material'){
    const lc=getStudentCourseId();
    let view=state.smView||{level:'courses'};
    // A locked student should never land back on the full course list — send them to their own course's subjects instead
    if(lc && view.level==='courses'){ view={level:'subjects',courseId:lc}; }
    smView=view;
  }
  goPage(state.msPage||'home',false);
});

// ═══════════════ INIT ═══════════════
// Init runs after all scripts load
window.addEventListener('load', function(){
  renderMaterial();renderVideosPage();renderPlanner();renderLB();renderSaved();updateHomeBanner();
  initNotifUI();
  renderQNotes();
  updateProfileUI();
  if(!navigator.onLine) showOfflineToast('📡 You are offline — saved content still works!',false);
  maybeShowProfilePrompt();
});

// Hardcoded Firebase config — always connected!
if(!fbConfig){
  fbConfig = {
    apiKey: "AIzaSyCUvf8Diw5UODQZ_FI7n1YAJCVWtiPkkHQ",
    authDomain: "medistudy-16a82.firebaseapp.com",
    databaseURL: "https://medistudy-16a82-default-rtdb.firebaseio.com",
    projectId: "medistudy-16a82",
    storageBucket: "medistudy-16a82.firebasestorage.app",
    messagingSenderId: "334907868236",
    appId: "1:334907868236:web:3859f868178e89c4fee0e9"
  };
  localStorage.setItem('ms4_fbconfig', JSON.stringify(fbConfig));
}
initFirebase(function(){
  // Real-time sync — when admin pushes, all devices update automatically
  if(!db) return;
  db.ref('medistudy').on('value', function(snap){
    const d = snap.val();
    if(!d) return;
    courses  = d.courses  || courses;
    subjects = d.subjects || subjects;
    folders  = d.folders  || folders;
    notes    = d.notes    || notes;
    videos   = d.videos   || videos;
    saveLocal();
    // Refresh current view if on material or videos page
    if(document.getElementById('page-material').classList.contains('active')) renderMaterial();
    if(document.getElementById('page-videos').classList.contains('active')) renderVideosPage();
  });
});
// ═══════════════ PWA ═══════════════
let deferredPrompt = null;

// Register service worker for offline support
// ═══════════════ SERVICE WORKER (TRUE OFFLINE) ═══════════════
// The SW is embedded as a base64 data URI so it survives refreshes
// (blob: URLs are destroyed on reload — this is the fix)
// ═══════════════════════════════════════════════════
// ROCK SOLID OFFLINE ENGINE — MediStudy
// Strategy: Cache the app shell directly from the page
// No blob SW tricks — use Cache API directly
// ═══════════════════════════════════════════════════
const MS_CACHE = 'medistudy-shell-v2';

// STEP 1: When online, save the full page HTML into Cache API
// This is the most reliable offline strategy
function cacheAppShell(){
  if(!('caches' in window) || !navigator.onLine) return;
  try {
    const html = '<!DOCTYPE html>' + document.documentElement.outerHTML;
    const opts = {headers:{'Content-Type':'text/html;charset=utf-8'}};
    caches.open(MS_CACHE).then(cache => {
      // Cache under the exact current URL — works for any hosting path
      [location.href, location.href.replace(/\/[^\/]*$/, '/'), location.href.replace(/\/[^\/]*$/, '/index.html')].forEach(url => {
        cache.put(url, new Response(html, opts));
      });
    }).catch(()=>{});
  } catch(e){}
}

// STEP 2: Register the external sw.js service worker
// sw.js must be deployed alongside index.html in your repo root
if('serviceWorker' in navigator){
  // Auto-detect base path (works on GitHub Pages /medistudy/ and any domain)
  const _base = location.pathname.replace(/\/[^\/]*$/, '/');
  navigator.serviceWorker.register(_base + 'sw.js', {scope: _base})
    .then(reg=>{
      console.log('[MediStudy] SW registered, scope:', reg.scope);
      // Force immediate activation of any waiting SW
      if(reg.waiting) reg.waiting.postMessage({type:'SKIP_WAITING'});
      reg.addEventListener('updatefound', ()=>{
        const newSW = reg.installing;
        newSW.addEventListener('statechange', ()=>{
          if(newSW.state==='installed' && navigator.serviceWorker.controller){
            newSW.postMessage({type:'SKIP_WAITING'});
          }
        });
      });
    })
    .catch(err=>{ console.warn('[MediStudy] SW registration failed:', err); });
}

// Cache shell 3 seconds after load (page fully rendered by then)
window.addEventListener('load', ()=>{ setTimeout(cacheAppShell, 3000); });
// Also re-cache when coming back online
window.addEventListener('online', ()=>{ setTimeout(cacheAppShell, 1000); });




window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredPrompt = e;
  // Show banner after 3 seconds
  setTimeout(() => {
    if(!localStorage.getItem('pwa_dismissed')) {
      document.getElementById('pwa-banner').classList.add('show');
    }
  }, 3000);
});

function installPWA(){
  if(!deferredPrompt) return;
  deferredPrompt.prompt();
  deferredPrompt.userChoice.then(result => {
    if(result.outcome === 'accepted'){
      gtag('event', 'pwa_installed', {event_category: 'PWA'});
      document.getElementById('pwa-banner').classList.remove('show');
    }
    deferredPrompt = null;
  });
}

function installPWAFromAbout(){
  const btn = document.getElementById('pwa-about-install-btn');
  const manualSteps = document.getElementById('pwa-manual-steps');
  if(deferredPrompt){
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then(result => {
      if(result.outcome === 'accepted'){
        btn.textContent = '✅ App Installed!';
        btn.disabled = true;
        gtag('event', 'pwa_installed', {event_category: 'PWA', event_label: 'from_about'});
      }
      deferredPrompt = null;
    });
  } else {
    // Show manual instructions based on device
    const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    const isAndroid = /Android/i.test(navigator.userAgent);
    manualSteps.classList.add('show');
    if(isIOS){
      manualSteps.innerHTML = `<strong style="color:var(--accent)">📱 On iPhone/iPad:</strong><br>
        1️⃣ Tap the <strong>Share</strong> button (box with arrow) at bottom<br>
        2️⃣ Scroll down and tap <strong>"Add to Home Screen"</strong><br>
        3️⃣ Tap <strong>Add</strong> — done! 🎉`;
    } else if(isAndroid){
      manualSteps.innerHTML = `<strong style="color:var(--accent)">📱 On Android:</strong><br>
        1️⃣ Tap the <strong>⋮ menu</strong> (3 dots) in your browser<br>
        2️⃣ Tap <strong>"Add to Home Screen"</strong> or <strong>"Install App"</strong><br>
        3️⃣ Tap <strong>Add</strong> — done! 🎉`;
    } else {
      manualSteps.innerHTML = `<strong style="color:var(--accent)">💻 On Desktop (Chrome):</strong><br>
        1️⃣ Click the <strong>⊕ install icon</strong> in the address bar<br>
        2️⃣ Click <strong>Install</strong><br><br>
        <strong style="color:var(--accent)">📱 On Mobile:</strong><br>
        Use your browser's <strong>Share → Add to Home Screen</strong> option`;
    }
  }
}

// Update install button when prompt becomes available
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredPrompt = e;
  // Update about page button if visible
  const btn = document.getElementById('pwa-about-install-btn');
  if(btn){ btn.textContent = '⬇️ Install App'; btn.disabled = false; }
  // Show banner after 3 seconds
  setTimeout(() => {
    if(!localStorage.getItem('pwa_dismissed')) {
      document.getElementById('pwa-banner').classList.add('show');
    }
  }, 3000);
});

// ═══════════════ PROFILE ═══════════════
let userProfile = JSON.parse(localStorage.getItem('ms_profile') || '{"name":"","course":"","gender":"","age":""}');

function getInitials(name){
  if(!name) return '👤';
  return name.trim().split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
}

function updateProfileUI(){
  // If auth is ready, let updateAuthUI handle profile modal display
  if(authReady){ updateAuthUI(); }
  // Still update avatar button regardless
  const initials = getInitials(userProfile.name);
  const btn = document.getElementById('profile-avatar-btn');
  if(btn) btn.textContent = userProfile.name ? initials : '👤';
  // Profile modal only — NEVER touch the About page (that always shows Ankit Lal Sahu)
  const nameDis = document.getElementById('profile-name-display');
  const courseDis = document.getElementById('profile-course-display');
  const avatarBig = document.getElementById('profile-avatar-big');
  if(nameDis) nameDis.textContent = userProfile.name || 'Set your name';
  if(courseDis) courseDis.textContent = (courses.find(c=>c.id===userProfile.course)||{}).name || 'Tap Edit to set up your profile';
  if(avatarBig) avatarBig.textContent = userProfile.name ? initials : '👤';
}

function openProfile(){
  showProfileView();
  document.getElementById('profile-modal-overlay').classList.add('open');
}
function closeProfile(){
  document.getElementById('profile-modal-overlay').classList.remove('open');
}
function showProfileView(){
  updateAuthUI();
  document.getElementById('profile-edit-form').style.display='none';
}
function showProfileEdit(){
  document.getElementById('profile-name-inp').value = userProfile.name;
  const courseSel=document.getElementById('profile-course-inp');
  courseSel.innerHTML='<option value="">Select your course...</option>'+courses.map(c=>`<option value="${c.id}">${escapeHTML(c.name)}</option>`).join('');
  courseSel.value = courses.find(c=>c.id===userProfile.course) ? userProfile.course : '';
  document.getElementById('profile-gender-inp').value = userProfile.gender||'';
  document.getElementById('profile-age-inp').value = userProfile.age||'';
  document.getElementById('profile-loggedout-view').style.display='none';
  document.getElementById('profile-view').style.display='none';
  document.getElementById('profile-edit-form').style.display='block';
}
function saveProfile(){
  const prevCourse=userProfile.course;
  userProfile.name = document.getElementById('profile-name-inp').value.trim();
  userProfile.course = document.getElementById('profile-course-inp').value;
  userProfile.gender = document.getElementById('profile-gender-inp').value;
  const ageVal = document.getElementById('profile-age-inp').value;
  userProfile.age = ageVal ? parseInt(ageVal) : '';
  localStorage.setItem('ms_profile', JSON.stringify(userProfile));
  syncToFirebase('profile', userProfile);
  updateProfileUI();
  showProfileView();
  // If the course changed, refresh any course-locked pages so the switch takes effect immediately
  if(prevCourse!==userProfile.course){
    const lc=getStudentCourseId();
    smView = lc?{level:'subjects',courseId:lc}:{level:'courses'};
    if(document.getElementById('page-material').classList.contains('active'))renderMaterial();
    if(document.getElementById('page-videos').classList.contains('active'))renderVideosPage();
    if(document.getElementById('page-quiz').classList.contains('active'))showQuizHome();
  }
  // Pre-fill batch chat name
  if(userProfile.name && !chatUserName){
    chatUserName = userProfile.name;
    localStorage.setItem('ms_chat_name', chatUserName);
  }
}

// Prompt students to complete their profile (name + course) — auto-opens on first launch and
// keeps gently re-prompting each session until a course is actually set, since course-locking
// (Study Material / Videos / MCQ / Leaderboard all showing only their own course) depends on it.
function maybeShowProfilePrompt(){
  if(userProfile && userProfile.course) return; // already set — stop nagging
  setTimeout(()=>{
    if(userProfile && userProfile.course) return; // could've been set in the meantime
    const loginModal=document.getElementById('login-modal');
    if(loginModal && loginModal.classList.contains('open')) return; // don't stack on top of another modal
    const adminModal=document.getElementById('admin-modal');
    if(adminModal && adminModal.classList.contains('open')) return;
    openProfile();
    showProfileEdit();
  }, 1200);
}


// ═══════════════ AUTH ═══════════════

// ── Firebase user data sync ──
function getUserRef(){
  if(!currentUser||!db) return null;
  return db.ref('users/'+currentUser.uid);
}

function syncToFirebase(key, value){
  const ref = getUserRef();
  if(!ref) return;
  const update = {};
  update[key] = value;
  ref.update(update).catch(e=>console.warn('Sync failed:',e));
}

function loadUserDataFromFirebase(){
  const ref = getUserRef();
  if(!ref) return;
  ref.once('value', snap=>{
    if(!snap||!snap.exists()) return;
    const d = snap.val();
    // Merge Firebase data into local — Firebase wins (it's the source of truth)
    if(d.profile){
      userProfile = Object.assign(userProfile, d.profile);
      localStorage.setItem('ms_profile', JSON.stringify(userProfile));
      updateProfileUI();
    }
    if(d.exams){
      exams = d.exams;
      localStorage.setItem('ms_exams', JSON.stringify(exams));
    }
    if(d.goals){
      goals = d.goals;
      localStorage.setItem('ms_goals', JSON.stringify(goals));
    }
    if(d.weeklog){
      weekLog = d.weeklog;
      localStorage.setItem('ms_weeklog', JSON.stringify(weekLog));
    }
    if(d.saved){
      savedNotes = d.saved;
      localStorage.setItem('ms4_saved', JSON.stringify(savedNotes));
    }
    if(d.savedvids){
      savedVideos = d.savedvids;
      localStorage.setItem('ms4_savedvids', JSON.stringify(savedVideos));
    }
    if(d.bookmarks){
      bookmarkedNotes = d.bookmarks;
      localStorage.setItem('ms4_bookmarks', JSON.stringify(bookmarkedNotes));
    }
    // Refresh UI with synced data
    if(document.getElementById('page-planner').classList.contains('active')) renderPlanner();
    if(document.getElementById('page-saved').classList.contains('active')) renderSaved();
  });
}

function openLoginModal(sub){
  const subEl=document.getElementById('login-modal-sub');
  if(sub&&subEl) subEl.textContent=sub;
  document.getElementById('login-modal').classList.add('open');
  switchLoginTab('signin');
}
function closeLoginModal(){
  document.getElementById('login-modal').classList.remove('open');
  // Clear errors
  ['li-err','su-err','google-err'].forEach(id=>{
    const el=document.getElementById(id);if(el){el.style.display='none';el.textContent='';}
  });
}
function switchLoginTab(tab){
  const isSignin=tab==='signin';
  document.getElementById('lform-signin').style.display=isSignin?'block':'none';
  document.getElementById('lform-signup').style.display=isSignin?'none':'block';
  const tabSI=document.getElementById('ltab-signin');
  const tabSU=document.getElementById('ltab-signup');
  tabSI.style.background=isSignin?'var(--accent)':'transparent';
  tabSI.style.color=isSignin?'#0e0f13':'var(--muted)';
  tabSU.style.background=isSignin?'transparent':'var(--accent)';
  tabSU.style.color=isSignin?'var(--muted)':'#0e0f13';
}
function showAuthError(id,msg){
  const el=document.getElementById(id);
  if(!el)return;
  el.textContent=msg;el.style.display='block';
}
function authErrMsg(code){
  const map={
    'auth/invalid-email':'Invalid email address.',
    'auth/user-not-found':'No account found with this email.',
    'auth/wrong-password':'Incorrect password.',
    'auth/email-already-in-use':'An account with this email already exists.',
    'auth/weak-password':'Password must be at least 6 characters.',
    'auth/too-many-requests':'Too many attempts. Try again later.',
    'auth/network-request-failed':'Google Sign-in requires VPN in Russia. Use email/password instead.',
    'auth/popup-closed-by-user':'Sign-in popup was closed.',
    'auth/popup-blocked':'Popup was blocked. Allow popups for this site.',
  };
  return map[code]||'Something went wrong. Please try again.';
}
function doEmailSignIn(){
  const email=document.getElementById('li-email').value.trim();
  const pass=document.getElementById('li-password').value;
  if(!email||!pass){showAuthError('li-err','Please fill in all fields.');return;}
  if(!auth){showAuthError('li-err','App still loading. Try again in a moment.');return;}
  const btn=document.getElementById('li-btn');
  btn.textContent='Signing in...';btn.disabled=true;
  auth.signInWithEmailAndPassword(email,pass)
    .then(()=>{
      gtag('event','login',{method:'email'});
      closeLoginModal();
    })
    .catch(e=>{showAuthError('li-err',authErrMsg(e.code));})
    .finally(()=>{btn.textContent='Sign In →';btn.disabled=false;});
}
function doEmailSignUp(){
  const name=document.getElementById('su-name').value.trim();
  const email=document.getElementById('su-email').value.trim();
  const pass=document.getElementById('su-password').value;
  if(!name||!email||!pass){showAuthError('su-err','Please fill in all fields.');return;}
  if(!auth){showAuthError('su-err','App still loading. Try again in a moment.');return;}
  const btn=document.getElementById('su-btn');
  btn.textContent='Creating account...';btn.disabled=true;
  auth.createUserWithEmailAndPassword(email,pass)
    .then(cred=>{
      // Save display name
      return cred.user.updateProfile({displayName:name}).then(()=>{
        gtag('event','sign_up',{method:'email'});
        userProfile.name=name;
        localStorage.setItem('ms_profile',JSON.stringify(userProfile));
        closeLoginModal();
      });
    })
    .catch(e=>{showAuthError('su-err',authErrMsg(e.code));})
    .finally(()=>{btn.textContent='Create Account →';btn.disabled=false;});
}
function doGoogleSignIn(){
  if(!auth||!firebase.auth){showAuthError('google-err','App still loading. Try again.');return;}
  const provider=new firebase.auth.GoogleAuthProvider();
  const btn=document.getElementById('google-signin-btn');
  btn.textContent='Opening Google...';btn.disabled=true;
  auth.signInWithPopup(provider)
    .then((result)=>{
      const isNew = result.additionalUserInfo && result.additionalUserInfo.isNewUser;
      gtag('event', isNew ? 'sign_up' : 'login', {method:'google'});
      closeLoginModal();
    })
    .catch(e=>{showAuthError('google-err',authErrMsg(e.code));})
    .finally(()=>{
      btn.innerHTML=`<svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg> Continue with Google`;
      btn.disabled=false;
    });
}
function doSignOut(){
  if(!auth)return;
  auth.signOut().then(()=>{closeProfile();});
}
function updateAuthUI(){
  const avatarBtn=document.getElementById('profile-avatar-btn');
  const avatarBig=document.getElementById('profile-avatar-big');
  const nameDis=document.getElementById('profile-name-display');
  const courseDis=document.getElementById('profile-course-display');
  const loggedOutView=document.getElementById('profile-loggedout-view');
  const loggedInView=document.getElementById('profile-view');
  const authEmailEl=document.getElementById('profile-auth-email');
  if(!loggedOutView||!loggedInView)return; // DOM not ready

  if(currentUser){
    // Logged in
    const displayName=currentUser.displayName||userProfile.name||'';
    const initials=getInitials(displayName)||'👤';
    if(avatarBtn) avatarBtn.textContent=initials;
    if(avatarBig) avatarBig.textContent=initials;
    if(nameDis) nameDis.textContent=displayName||'Welcome!';
    if(courseDis) courseDis.textContent=(courses.find(c=>c.id===userProfile.course)||{}).name||'Set your course below';
    if(authEmailEl) authEmailEl.textContent='📧 '+currentUser.email;
    if(loggedOutView) loggedOutView.style.display='none';
    if(loggedInView) loggedInView.style.display='block';
    // Sync name to local profile if blank
    if(!userProfile.name&&displayName){
      userProfile.name=displayName;
      localStorage.setItem('ms_profile',JSON.stringify(userProfile));
    }
  } else {
    // Logged out
    if(avatarBtn) avatarBtn.textContent='👤';
    if(avatarBig) avatarBig.textContent='👤';
    if(nameDis) nameDis.textContent='Not signed in';
    if(courseDis) courseDis.textContent='Sign in to sync your data';
    if(loggedOutView) loggedOutView.style.display='block';
    if(loggedInView) loggedInView.style.display='none';
  }
}
// Gate: require login for certain features
function requireLogin(featureName, onSuccess){
  if(currentUser){onSuccess();return;}
  openLoginModal('Sign in to use '+featureName);
}

// ═══════════════ ANNOUNCEMENTS ═══════════════
const ANN_COLORS = {
  info:    {bg:'#0e2a4a',border:'#2563eb',color:'#93c5fd'},
  success: {bg:'#052e16',border:'#16a34a',color:'#86efac'},
  warning: {bg:'#2d1a00',border:'#d97706',color:'#fcd34d'},
  urgent:  {bg:'#2d0a0a',border:'#dc2626',color:'#fca5a5'},
};

function dismissPWA(){
  document.getElementById('pwa-banner').classList.remove('show');
  localStorage.setItem('pwa_dismissed', '1');
}

// Hide banner when app is already installed
window.addEventListener('appinstalled', () => {
  document.getElementById('pwa-banner').classList.remove('show');
  const btn = document.getElementById('pwa-about-install-btn');
  if(btn){ btn.textContent='✅ App Installed!'; btn.disabled=true; }
});


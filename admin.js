// ═══════════════ ADMIN ═══════════════
// Which university's content the admin/editor is currently managing (Structure/
// Notes/Videos/Manage/MCQ + the Push button all act on this one). Defaults to
// Ulyanovsk since that's the original/primary university.
let ADMIN_ACTIVE_UNIVERSITY_ID = localStorage.getItem('ms4_admin_uni') || DEFAULT_UNIVERSITY_ID;

// Which universities this person may manage: super admin = all, university admin = only their own
function adminAllowedUniversities(){
  if(!adminUniversities) return universities;
  return universities.filter(u=>adminUniversities.includes(u.id));
}
function populateAdminUniversitySelect(){
  const sel=document.getElementById('admin-university-sel');
  if(!sel) return;
  function render(){
    const list=adminAllowedUniversities();
    sel.innerHTML = list.map(u=>`<option value="${u.id}">${escapeHTML(u.name)}</option>`).join('');
    if(list.some(u=>u.id===ADMIN_ACTIVE_UNIVERSITY_ID)) sel.value = ADMIN_ACTIVE_UNIVERSITY_ID;
    else if(list.length){
      ADMIN_ACTIVE_UNIVERSITY_ID = list[0].id;
      localStorage.setItem('ms4_admin_uni', ADMIN_ACTIVE_UNIVERSITY_ID);
      sel.value = ADMIN_ACTIVE_UNIVERSITY_ID;
      ensureFullAdminDataLoaded(refreshAdminViews);
    }
  }
  if(universities.length || !db){ render(); return; }
  sel.innerHTML = '<option value="">Loading...</option>';
  db.ref('medistudy_universities').once('value').then(snap=>{
    const d=snap.val();
    if(d){ universities=d; localStorage.setItem('ms4_universities', JSON.stringify(universities)); }
    render();
  }).catch(render);
}
function switchAdminUniversity(){
  const sel=document.getElementById('admin-university-sel');
  if(!sel||!sel.value) return;
  if(adminUniversities && !adminUniversities.includes(sel.value)) return; // not allowed
  ADMIN_ACTIVE_UNIVERSITY_ID = sel.value;
  localStorage.setItem('ms4_admin_uni', ADMIN_ACTIVE_UNIVERSITY_ID);
  ensureFullAdminDataLoaded(refreshAdminViews);
}
function populateAnnouncementAudienceSelect(){
  const sel=document.getElementById('ann-audience');
  if(!sel) return;
  function render(){
    const prev=sel.value;
    const list=adminAllowedUniversities();
    const allOpt = adminUniversities ? '' : '<option value="">🌐 All Universities</option>';
    sel.innerHTML = allOpt + list.map(u=>`<option value="${u.id}">🏫 ${escapeHTML(u.name)} only</option>`).join('');
    if(list.some(u=>u.id===prev)) sel.value=prev;
    else sel.value = adminUniversities ? ADMIN_ACTIVE_UNIVERSITY_ID : '';
  }
  if(universities.length || !db){ render(); return; }
  db.ref('medistudy_universities').once('value').then(snap=>{
    const d=snap.val();
    if(d){ universities=d; localStorage.setItem('ms4_universities', JSON.stringify(universities)); }
    render();
  }).catch(render);
}
function addUniversity(){
  if(adminRole!=='super'){alert('Only the super admin can add a university.');return;}
  const nameInp=document.getElementById('new-uni-name'), idInp=document.getElementById('new-uni-id');
  const name=nameInp.value.trim(), id=idInp.value.trim().toLowerCase();
  if(!name||!id){alert('Enter both a name and a short id.');return;}
  if(!/^[a-z0-9_-]+$/.test(id)){alert('Short id should be simple letters/numbers only, e.g. ksmu');return;}
  if(!fbConnected||!db){alert('Not connected to Firebase.');return;}
  db.ref('medistudy_universities').once('value').then(snap=>{
    const list = snap.val()||[];
    if(list.some(u=>u.id===id)){alert('That id already exists — pick a different one.');return;}
    const updated=[...list,{id,name}];
    const updates={};
    updates['medistudy_universities']=updated;
    updates[`medistudy_courses/${id}`]=[{id:'c1',name:'1st Course'},{id:'c2',name:'2nd Course'},{id:'c3',name:'3rd Course'}];
    const joinCode=randomJoinCode();
    updates[`medistudy_join_codes/${id}`]=joinCode;
    db.ref().update(updates).then(()=>{
      universities=updated;
      nameInp.value='';idInp.value='';
      populateAdminUniversitySelect();
      alert('✅ '+name+' added with 1st/2nd/3rd Course.\n\nJoin code for its students: '+joinCode+'\n(You can see or change it any time in Structure → Join code.)\nSelect it above to manage its content.');
    }).catch(e=>alert('Failed: '+e.message));
  }).catch(e=>alert('Failed: '+e.message));
}

function openAdmin(){
  document.getElementById('admin-modal').classList.add('open');
  if(adminUnlocked){ showPanel(); return; }
  document.getElementById('admin-login').style.display='block';
  document.getElementById('admin-panel').style.display='none';
  document.getElementById('admin-pw').value='';
  document.getElementById('login-err').style.display='none';
}
function closeAdmin(){document.getElementById('admin-modal').classList.remove('open');}

// Works out what THIS signed-in person may do, from Firebase (medistudy_admins/<uid>). The same table is what
// the Firebase security rules check, so nobody can get more than this by editing the app in their browser.
async function resolveAdminAccess(){
  const user = currentUser || (auth && auth.currentUser) || null;
  if(!user || !db) return null;
  if(user.uid===SUPER_UID) return {role:'super', universities:null};
  try{
    const v=(await db.ref('medistudy_admins/'+user.uid).once('value')).val();
    if(!v) return null;
    const unis=Object.keys(v.universities||{}).filter(k=>v.universities[k]===true);
    if(!unis.length) return null;
    return {role:'uni', universities:unis};
  }catch(e){ console.warn('Admin role lookup failed:', e); return null; }
}
function checkPw(){
  const input=document.getElementById('admin-pw').value;
  const errEl=document.getElementById('login-err');
  const showErr=m=>{errEl.textContent=m;errEl.style.display='block';};
  // Hash the input and compare
  const msgBuffer=new TextEncoder().encode(input);
  crypto.subtle.digest('SHA-256',msgBuffer).then(async hashBuffer=>{
    const hashArray=Array.from(new Uint8Array(hashBuffer));
    const hashHex=hashArray.map(b=>b.toString(16).padStart(2,'0')).join('');
    if(hashHex===SPONSOR_HASH){ adminUnlocked=true;adminRole='sponsor';adminUniversities=null;showPanel();return; }
    // Two locks: (1) a password for the account type, (2) the signed-in account itself.
    //   super admin → PASS_HASH password;  university admins → one shared EDITOR_HASH password.
    if(hashHex!==PASS_HASH && hashHex!==EDITOR_HASH){ showErr('❌ Wrong password.'); return; }
    if(!(currentUser||(auth&&auth.currentUser))){ showErr('❌ Sign in to MediStudy with your own account first (profile icon), then open this panel again.'); return; }
    const access=await resolveAdminAccess();
    if(!access){ showErr('❌ This account has no admin rights. Ask the super admin to add you.'); return; }
    const right = access.role==='super' ? PASS_HASH : EDITOR_HASH;
    if(hashHex!==right){ showErr('❌ Wrong password for your account type.'); return; }
    adminUnlocked=true; adminRole=access.role; adminUniversities=access.universities;
    showPanel();
  });
}
function showPanel(){
  document.getElementById('admin-login').style.display='none';
  document.getElementById('admin-panel').style.display='block';
  document.getElementById('admin-signedin-warning').style.display = currentUser ? 'none' : 'block';
  if(adminRole==='sponsor'){
    // Limited view: only Announcements + Student Essentials, nothing else
    document.getElementById('admin-university-bar').style.display='none';
    document.querySelectorAll('.atab').forEach(t=>t.style.display='none');
    document.getElementById('atab-announce').style.display='';
    document.getElementById('atab-essentials').style.display='';
    switchATab('announce', document.getElementById('atab-announce'));
    return;
  }
  const isSuper = adminRole==='super';
  if(!isSuper && adminUniversities && !adminUniversities.includes(ADMIN_ACTIVE_UNIVERSITY_ID)){
    ADMIN_ACTIVE_UNIVERSITY_ID = adminUniversities[0];
    localStorage.setItem('ms4_admin_uni', ADMIN_ACTIVE_UNIVERSITY_ID);
  }
  document.getElementById('admin-university-bar').style.display='';
  const addUni=document.getElementById('admin-add-university');
  if(addUni) addUni.style.display = isSuper ? '' : 'none';
  document.querySelectorAll('.atab').forEach(t=>t.style.display='none');
  const tabs = isSuper
    ? ['structure','dashboard','notes','videos','manage','announce','essentials','mcq','students','feedback','firebase']
    : ['structure','notes','videos','manage','mcq','announce','feedback','students','dashboard']; // university admin: no Essentials/Firebase; Students/Dashboard/Feedback show only their own university
  tabs.forEach(t=>{ const el=document.getElementById('atab-'+t); if(el) el.style.display=''; });
  populateAdminUniversitySelect();
  populateAllSelects();renderAdminCourses();renderAdminSubjects();updateFolderCourseSubject();
  ensureFullAdminDataLoaded(refreshAdminViews);
  if(isSuper){
    updateFBStatus();
    if(fbConfig){
      document.getElementById('fb-api-key').value=fbConfig.apiKey||'';
      document.getElementById('fb-db-url').value=fbConfig.databaseURL||'';
      document.getElementById('fb-project-id').value=fbConfig.projectId||'';
    }
    const savedGK=localStorage.getItem('ms4_groq_key');
    if(savedGK){document.getElementById('gemini-key-input').value=savedGK;document.getElementById('gemini-key-status').innerHTML='<span style="color:var(--green)">✅ Groq key active — AI Tutor working!</span>';}
    else{document.getElementById('gemini-key-input').value='';document.getElementById('gemini-key-status').innerHTML='<span style="color:var(--green)">✅ Secure Worker active — AI Tutor working!</span>';}
  }
  switchATab('structure', document.getElementById('atab-structure'));
}
function switchATab(tab,el){
  document.querySelectorAll('.atab').forEach(t=>t.classList.remove('active'));
  document.querySelectorAll('.aform').forEach(f=>f.classList.remove('active'));
  el.classList.add('active');document.getElementById('aform-'+tab).classList.add('active');
  if(tab==='manage')renderManage();
  if(tab==='dashboard')loadDashboard();
  if(tab==='notes'){updateNoteSubjects();updateNoteFolders();}
  if(tab==='videos')updateVidSubjects();
  if(tab==='firebase'){updateFBStatus();if(adminRole==='super')loadAdminRoles();}
  if(tab==='announce'){loadAdminAnnouncements();populateAnnouncementAudienceSelect();}
  if(tab==='essentials')loadAdminEssentials();
  if(tab==='mcq'){loadAdminMCQSets();populateMCQSubjectDropdowns();}
  if(tab==='students')loadStudentsList();
  if(tab==='feedback')loadFeedbackList();
}
function populateAllSelects(){
  ['struct-course-sel','note-course','vid-course','struct-fcourse'].forEach(id=>{
    const s=document.getElementById(id);if(!s)return;
    s.innerHTML=courses.map(c=>`<option value="${c.id}">${c.name}</option>`).join('');
  });
  updateNoteSubjects();updateVidSubjects();updateFolderCourseSubject();
}

// Courses
function renderAdminCourses(){
  const el=document.getElementById('admin-courses-list');
  el.innerHTML=courses.length?courses.map((co,i)=>`<div class="struct-item"><span class="struct-name">${courseIcon(i)} ${co.name}</span><div class="struct-actions"><button class="edit-btn" onclick="renameCourse('${co.id}')">✏️</button><button class="del-btn" onclick="deleteCourse('${co.id}')">Del</button></div></div>`).join(''):'<div style="font-size:12px;color:var(--muted)">No courses yet.</div>';
}
// ── Saving: every change writes ONLY the one item it touched, never a whole list ──
function adminBase(){ return 'medistudy_content/'+ADMIN_ACTIVE_UNIVERSITY_ID; }
function cleanItem(o){ return JSON.parse(JSON.stringify(o)); } // drops undefined (Firebase rejects it)
function itemPath(kind,item){ return adminBase()+'/'+item.courseId+'/'+kind+'/'+item.id; }
function refreshAdminViews(){ populateAllSelects();renderAdminCourses();renderAdminSubjects();updateFolderCourseSubject();renderManage();loadJoinCode();refreshActiveAdminTab(); }
// After switching "Managing University", reload whichever per-university tab is open
function refreshActiveAdminTab(){
  const act=document.querySelector('.aform.active'); if(!act) return;
  if(act.id==='aform-students') loadStudentsList();
  else if(act.id==='aform-dashboard') loadDashboard();
  else if(act.id==='aform-feedback') loadFeedbackList();
}
// updates = {firebasePath: value|null}. Resolves true if saved. On any failure it says so and reloads the real data,
// so the screen never silently shows something that was not actually saved.
// ── Save feedback: the admin always sees ⏳ Saving… → ✅ Saved or ❌ NOT saved (tap to dismiss) ──
let _toastEl=null,_toastTimer=null,_lastSaveErr='';
function adminToast(msg,kind,ms){
  if(!_toastEl){
    _toastEl=document.createElement('div');
    _toastEl.style.cssText='position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:5000;max-width:92vw;padding:10px 16px;border-radius:10px;font-size:13px;font-weight:700;text-align:center;box-shadow:0 6px 20px rgba(0,0,0,.45);display:none;cursor:pointer;';
    _toastEl.onclick=()=>{_toastEl.style.display='none';};
    document.body.appendChild(_toastEl);
  }
  const c={ok:['#0d2018','#38c49a'],err:['#2a0e0e','#e85d38'],wait:['#2d1a00','#e8a838']}[kind||'ok'];
  _toastEl.style.background=c[0]; _toastEl.style.color=c[1]; _toastEl.style.border='1px solid '+c[1];
  _toastEl.textContent=msg; _toastEl.style.display='block';
  clearTimeout(_toastTimer);
  if(ms) _toastTimer=setTimeout(()=>{_toastEl.style.display='none';},ms);
}
// Wraps a Firebase write. Resolves true only when Firebase has confirmed it. If there is no answer after 8s
// (usually no internet) it says so instead of staying silent, and turns into ✅ if the write lands later.
function adminTrack(promise, okMsg){
  adminToast('⏳ Saving…','wait');
  const slow=setTimeout(()=>adminToast('⏳ Still saving — no confirmation yet. Check your internet and keep the app open.','wait'),8000);
  return promise
    .then(()=>{ clearTimeout(slow); adminToast('✅ '+(okMsg||'Saved'),'ok',2500); return true; })
    .catch(e=>{ clearTimeout(slow); _lastSaveErr=e.message; adminToast('❌ NOT saved: '+e.message,'err',9000); return false; });
}
function adminTrackStrict(promise, okMsg){ // same toasts, but keeps rejecting so the caller's own .catch still runs
  return adminTrack(promise, okMsg).then(ok=>{ if(!ok) throw new Error(_lastSaveErr||'not saved'); });
}
function adminSave(updates, isContent){
  let problem=null;
  if(!fbConnected||!db) problem='Not connected to Firebase yet.';
  else if(!(currentUser||(auth&&auth.currentUser))) problem='You are not signed in.';
  else if(_adminDataLoading) problem='Still loading this university\'s data — try again in a second.';
  else if(isContent && _contentNeedsMigration) problem='This university\'s content is still in the old format. Super admin: Firebase tab → "Convert to per-item storage" first.';
  if(problem){ adminToast('❌ NOT saved: '+problem,'err',9000); alert('❌ Nothing was saved. '+problem); ensureFullAdminDataLoaded(refreshAdminViews); return Promise.resolve(false); }
  return adminTrack(db.ref().update(updates)).then(ok=>{
    if(!ok){
      alert('❌ NOT saved. The screen has been reloaded with what is really in Firebase — check it and try again. (If it keeps failing, your account may not have rights for this university.)');
      ensureFullAdminDataLoaded(refreshAdminViews);
    }
    return ok;
  });
}
function saveCoursesList(){ return adminSave({['medistudy_courses/'+ADMIN_ACTIVE_UNIVERSITY_ID]: cleanItem(courses)}, false); }
function addCourse(){
  const inp=document.getElementById('new-course-name'),n=inp.value.trim();if(!n)return;
  courses.push({id:uid(),name:n});saveLocal();inp.value='';renderAdminCourses();populateAllSelects();
  saveCoursesList().then(ok=>{if(ok)flashSuccess('struct-success');});
}
function renameCourse(id){
  const co=courses.find(c=>c.id===id);if(!co)return;
  const n=prompt('Rename:',co.name);
  if(n&&n.trim()){co.name=n.trim();saveLocal();renderAdminCourses();populateAllSelects();saveCoursesList();}
}
function deleteCourse(id){
  if(!confirm('Delete course and ALL its data?'))return;
  courses=courses.filter(c=>c.id!==id);subjects=subjects.filter(s=>s.courseId!==id);folders=folders.filter(f=>f.courseId!==id);notes=notes.filter(n=>n.courseId!==id);videos=videos.filter(v=>v.courseId!==id);
  saveLocal();renderAdminCourses();populateAllSelects();
  const updates={};
  updates[adminBase()+'/'+id]=null;
  updates['medistudy_courses/'+ADMIN_ACTIVE_UNIVERSITY_ID]=cleanItem(courses);
  adminSave(updates,false);
}

// Subjects
function renderAdminSubjects(){
  const courseId=document.getElementById('struct-course-sel').value;
  const el=document.getElementById('admin-subjects-list');
  const subs=subjects.filter(s=>s.courseId===courseId);
  el.innerHTML=subs.length?subs.map(s=>`<div class="struct-item"><span class="struct-name">🔬 ${s.name}</span><div class="struct-actions"><button class="edit-btn" onclick="renameSubject('${s.id}')">✏️</button><button class="del-btn" onclick="deleteSubject('${s.id}')">Del</button></div></div>`).join(''):'<div style="font-size:12px;color:var(--muted);margin-bottom:6px">No subjects yet.</div>';
}
function addSubject(){
  const courseId=document.getElementById('struct-course-sel').value,inp=document.getElementById('new-subject-name'),n=inp.value.trim();if(!n)return;
  if(!courseId){alert('Select a course first!');return;}
  const s={id:uid(),courseId,name:n,order:Date.now()};
  subjects.push(s);saveLocal();inp.value='';renderAdminSubjects();populateAllSelects();updateFolderCourseSubject();
  adminSave({[itemPath('subjects',s)]:cleanItem(s)},true).then(ok=>{if(ok)flashSuccess('struct-success');});
}
function renameSubject(id){
  const s=subjects.find(x=>x.id===id);if(!s)return;
  const n=prompt('Rename:',s.name);
  if(n&&n.trim()){s.name=n.trim();saveLocal();renderAdminSubjects();populateAllSelects();updateFolderCourseSubject();adminSave({[itemPath('subjects',s)]:cleanItem(s)},true);}
}
function deleteSubject(id){
  if(!confirm('Delete subject and all its folders, notes, videos?'))return;
  const updates={};
  const s=subjects.find(x=>x.id===id);
  if(s) updates[itemPath('subjects',s)]=null;
  folders.filter(f=>f.subjectId===id).forEach(f=>{updates[itemPath('folders',f)]=null;});
  notes.filter(n=>n.subjectId===id).forEach(n=>{updates[itemPath('notes',n)]=null;});
  videos.filter(v=>v.subjectId===id).forEach(v=>{updates[itemPath('videos',v)]=null;});
  subjects=subjects.filter(s=>s.id!==id);folders=folders.filter(f=>f.subjectId!==id);notes=notes.filter(n=>n.subjectId!==id);videos=videos.filter(v=>v.subjectId!==id);
  saveLocal();renderAdminSubjects();populateAllSelects();updateFolderCourseSubject();
  adminSave(updates,true);
}

// Folders
function updateFolderCourseSubject(){
  const s=document.getElementById('struct-fcourse');if(!s)return;
  s.innerHTML=courses.map(c=>`<option value="${c.id}">${c.name}</option>`).join('');
  updateFolderSubjects();
}
function updateFolderSubjects(){
  const courseId=document.getElementById('struct-fcourse').value;
  const sel=document.getElementById('struct-fsubject');
  const subs=subjects.filter(s=>s.courseId===courseId);
  sel.innerHTML=subs.length?subs.map(s=>`<option value="${s.id}">${s.name}</option>`):'<option value="">— No subjects —</option>';
  renderAdminFolders();
}
function renderAdminFolders(){
  const subjectId=document.getElementById('struct-fsubject').value;
  const el=document.getElementById('admin-folders-list');
  const fols=folders.filter(f=>f.subjectId===subjectId);
  el.innerHTML=fols.length?fols.map(f=>`<div class="struct-item"><span class="struct-name">📁 ${f.name}${f.desc?' 📝':''}</span><div class="struct-actions"><button class="edit-btn" onclick="renameFolder('${f.id}')">✏️</button><button class="edit-btn" title="Edit description" onclick="editFolderDesc('${f.id}')">📝</button><button class="del-btn" onclick="deleteFolder('${f.id}')">Del</button></div></div>`).join(''):'<div style="font-size:12px;color:var(--muted);margin-bottom:6px">No folders yet.</div>';
}
function addFolder(){
  const subjectId=document.getElementById('struct-fsubject').value,courseId=document.getElementById('struct-fcourse').value;
  if(!subjectId){alert('Select a subject first!');return;}
  const inp=document.getElementById('new-folder-name'),n=inp.value.trim();if(!n)return;
  const dInp=document.getElementById('new-folder-desc'),d=dInp?dInp.value.trim():'';
  const f={id:uid(),subjectId,courseId,name:n,desc:d,order:Date.now()};
  folders.push(f);saveLocal();inp.value='';if(dInp)dInp.value='';renderAdminFolders();updateNoteFolders();
  adminSave({[itemPath('folders',f)]:cleanItem(f)},true).then(ok=>{if(ok)flashSuccess('struct-success');});
}
function renameFolder(id){
  const f=folders.find(x=>x.id===id);if(!f)return;
  const n=prompt('Rename:',f.name);
  if(n&&n.trim()){f.name=n.trim();saveLocal();renderAdminFolders();updateNoteFolders();adminSave({[itemPath('folders',f)]:cleanItem(f)},true);}
}
function editFolderDesc(id){
  const f=folders.find(x=>x.id===id);if(!f)return;
  const d=prompt('Folder description (shown to students). Leave empty to remove:',f.desc||'');
  if(d===null)return; // cancelled
  f.desc=d.trim();saveLocal();renderAdminFolders();
  adminSave({[itemPath('folders',f)]:cleanItem(f)},true);
}
function deleteFolder(id){
  if(!confirm('Delete folder and all notes inside?'))return;
  const updates={};
  const f=folders.find(x=>x.id===id);
  if(f) updates[itemPath('folders',f)]=null;
  notes.filter(n=>n.folderId===id).forEach(n=>{updates[itemPath('notes',n)]=null;});
  folders=folders.filter(f=>f.id!==id);notes=notes.filter(n=>n.folderId!==id);
  saveLocal();renderAdminFolders();updateNoteFolders();
  adminSave(updates,true);
}

// Note form
function updateNoteSubjects(){
  const sel=document.getElementById('note-subject');if(!sel)return;
  const cId=document.getElementById('note-course')?.value;
  const subs=subjects.filter(s=>s.courseId===cId);
  sel.innerHTML=subs.length?subs.map(s=>`<option value="${s.id}">${s.name}</option>`):'<option value="">— No subjects —</option>';
  updateNoteFolders();
}
function updateNoteFolders(){
  const sel=document.getElementById('note-folder');if(!sel)return;
  const sId=document.getElementById('note-subject')?.value;
  const fols=folders.filter(f=>f.subjectId===sId);
  sel.innerHTML=fols.length?fols.map(f=>`<option value="${f.id}">${f.name}</option>`):'<option value="">— No folders —</option>';
}
function updateVidSubjects(){
  const sel=document.getElementById('vid-subject');if(!sel)return;
  const cId=document.getElementById('vid-course')?.value;
  const subs=subjects.filter(s=>s.courseId===cId);
  sel.innerHTML=subs.length?subs.map(s=>`<option value="${s.id}">${s.name}</option>`):'<option value="">— No subjects —</option>';
}

// Add Note
let editingNoteId=null;
function addNote(){
  const cId=document.getElementById('note-course').value,sId=document.getElementById('note-subject').value,fId=document.getElementById('note-folder').value;
  const topic=document.getElementById('note-topic').value.trim(),desc=document.getElementById('note-desc').value.trim(),link=document.getElementById('note-link').value.trim();
  if(!topic||!link){alert('Fill Topic and Google Drive link!');return;}
  if(!fId){alert('Create a folder first in Structure → Folders!');return;}

  if(editingNoteId){
    // UPDATE existing note in place — keeps same id, so likes/bookmarks aren't lost. Saves just this one note.
    const n=notes.find(x=>x.id===editingNoteId);
    if(!n){ cancelEditNote(); return; }
    const updates={};
    if(n.courseId!==cId) updates[itemPath('notes',n)]=null; // moved to another course: remove the old copy
    n.courseId=cId; n.subjectId=sId; n.folderId=fId; n.topic=topic; n.desc=desc; n.link=link;
    updates[itemPath('notes',n)]=cleanItem(n);
    saveLocal();
    adminSave(updates,true).then(ok=>{ if(ok){ cancelEditNote(); flashSuccess('note-success'); renderManage(); } });
    return;
  }

  const n={id:uid(),courseId:cId,subjectId:sId,folderId:fId,topic,desc,link,order:Date.now()};
  notes.push(n);saveLocal();
  adminSave({[itemPath('notes',n)]:cleanItem(n)},true).then(ok=>{
    if(ok){ ['note-topic','note-desc','note-link'].forEach(id=>document.getElementById(id).value=''); flashSuccess('note-success'); }
  });
}
function editNote(id){
  const n=notes.find(x=>x.id===id);
  if(!n)return;
  editingNoteId=id;
  document.getElementById('note-course').value=n.courseId;
  updateNoteSubjects();
  document.getElementById('note-subject').value=n.subjectId;
  updateNoteFolders();
  document.getElementById('note-folder').value=n.folderId;
  document.getElementById('note-topic').value=n.topic;
  document.getElementById('note-desc').value=n.desc||'';
  document.getElementById('note-link').value=n.link;
  document.getElementById('note-submit-btn').textContent='💾 Update Note';
  document.getElementById('note-cancel-edit-btn').style.display='block';
  document.getElementById('atab-notes').click();
}
function cancelEditNote(){
  editingNoteId=null;
  ['note-topic','note-desc','note-link'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('note-submit-btn').textContent='➕ Add Note';
  document.getElementById('note-cancel-edit-btn').style.display='none';
}
// Add Video
let editingVideoId=null;
function addVideo(){
  const cId=document.getElementById('vid-course').value,sId=document.getElementById('vid-subject').value;
  const title=document.getElementById('vid-title').value.trim(),desc=document.getElementById('vid-desc').value.trim(),link=document.getElementById('vid-link').value.trim();
  if(!title||!link||!sId){alert('Select subject, fill Title and YouTube link!');return;}

  if(editingVideoId){
    const v=videos.find(x=>x.id===editingVideoId);
    if(!v){ cancelEditVideo(); return; }
    const updates={};
    if(v.courseId!==cId) updates[itemPath('videos',v)]=null;
    v.courseId=cId; v.subjectId=sId; v.title=title; v.desc=desc; v.link=link;
    updates[itemPath('videos',v)]=cleanItem(v);
    saveLocal();
    adminSave(updates,true).then(ok=>{ if(ok){ cancelEditVideo(); flashSuccess('vid-success'); renderManage(); } });
    return;
  }

  const v={id:uid(),courseId:cId,subjectId:sId,title,desc,link,order:Date.now()};
  videos.push(v);saveLocal();
  adminSave({[itemPath('videos',v)]:cleanItem(v)},true).then(ok=>{
    if(ok){ ['vid-title','vid-desc','vid-link'].forEach(id=>document.getElementById(id).value=''); flashSuccess('vid-success'); }
  });
}
function editVideo(id){
  const v=videos.find(x=>x.id===id);
  if(!v)return;
  editingVideoId=id;
  document.getElementById('vid-course').value=v.courseId;
  updateVidSubjects();
  document.getElementById('vid-subject').value=v.subjectId;
  document.getElementById('vid-title').value=v.title;
  document.getElementById('vid-desc').value=v.desc||'';
  document.getElementById('vid-link').value=v.link;
  document.getElementById('vid-submit-btn').textContent='💾 Update Video';
  document.getElementById('vid-cancel-edit-btn').style.display='block';
  document.getElementById('atab-videos').click();
}
function cancelEditVideo(){
  editingVideoId=null;
  ['vid-title','vid-desc','vid-link'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('vid-submit-btn').textContent='➕ Add Video';
  document.getElementById('vid-cancel-edit-btn').style.display='none';
}
// Manage
function renderManage(){
  document.getElementById('manage-notes').innerHTML=notes.length?renderNotesTree():'<div style="font-size:12px;color:var(--muted)">No notes yet.</div>';
  document.getElementById('manage-videos').innerHTML=videos.length?renderVideosTree():'<div style="font-size:12px;color:var(--muted)">No videos yet.</div>';
}
// Collapsible tree: Course > Subject > Folder > Notes
function renderNotesTree(){
  const tree={};
  notes.forEach(n=>{
    const co=courses.find(c=>c.id===n.courseId),su=subjects.find(s=>s.id===n.subjectId),fo=folders.find(f=>f.id===n.folderId);
    const cK=co?co.id:'none',sK=su?su.id:'none',fK=fo?fo.id:'none';
    tree[cK]=tree[cK]||{name:co?co.name:'(No course)',subjects:{}};
    tree[cK].subjects[sK]=tree[cK].subjects[sK]||{name:su?su.name:'(No subject)',folders:{}};
    tree[cK].subjects[sK].folders[fK]=tree[cK].subjects[sK].folders[fK]||{name:fo?fo.name:'(No folder)',items:[]};
    tree[cK].subjects[sK].folders[fK].items.push(n);
  });
  let html='';
  Object.keys(tree).sort((a,b)=>tree[a].name.localeCompare(tree[b].name)).forEach(cK=>{
    const c=tree[cK];
    const subjKeys=Object.keys(c.subjects).sort((a,b)=>c.subjects[a].name.localeCompare(c.subjects[b].name));
    const courseCount=subjKeys.reduce((s,sK)=>s+Object.values(c.subjects[sK].folders).reduce((s2,f)=>s2+f.items.length,0),0);
    html+=`<details class="mt-course"><summary>🏫 ${escapeHTML(c.name)} <span class="mt-count">(${courseCount})</span></summary><div style="padding-left:14px;">`;
    subjKeys.forEach(sK=>{
      const s=c.subjects[sK];
      const folderKeys=Object.keys(s.folders).sort((a,b)=>s.folders[a].name.localeCompare(s.folders[b].name));
      const subjCount=folderKeys.reduce((n,fK)=>n+s.folders[fK].items.length,0);
      html+=`<details class="mt-subject"><summary>📘 ${escapeHTML(s.name)} <span class="mt-count">(${subjCount})</span></summary><div style="padding-left:14px;">`;
      folderKeys.forEach(fK=>{
        const fo=s.folders[fK];
        const items=[...fo.items]; // keep stored order — this is exactly the order students see
        html+=`<details class="mt-folder"><summary>📁 ${escapeHTML(fo.name)} <span class="mt-count">(${items.length})</span></summary><div class="reorder-list" style="padding-left:14px;padding-top:4px;">`;
        items.forEach(n=>{
          html+=`<div class="manage-item" data-id="${n.id}" style="margin-bottom:6px;"><div class="drag-handle" title="Hold and drag to reorder">☰</div><div style="flex:1;min-width:0;"><div class="mi-title">${escapeHTML(n.topic)}</div></div><div style="display:flex;gap:6px;"><button class="edit-btn" onclick="editNote('${n.id}')">✏️ Edit</button><button class="del-btn" onclick="delNote('${n.id}')">Delete</button></div></div>`;
        });
        html+='</div></details>';
      });
      html+='</div></details>';
    });
    html+='</div></details>';
  });
  return html;
}
// Collapsible tree: Course > Subject > Videos
function renderVideosTree(){
  const tree={};
  videos.forEach(v=>{
    const co=courses.find(c=>c.id===v.courseId),su=subjects.find(s=>s.id===v.subjectId);
    const cK=co?co.id:'none',sK=su?su.id:'none';
    tree[cK]=tree[cK]||{name:co?co.name:'(No course)',subjects:{}};
    tree[cK].subjects[sK]=tree[cK].subjects[sK]||{name:su?su.name:'(No subject)',items:[]};
    tree[cK].subjects[sK].items.push(v);
  });
  let html='';
  Object.keys(tree).sort((a,b)=>tree[a].name.localeCompare(tree[b].name)).forEach(cK=>{
    const c=tree[cK];
    const subjKeys=Object.keys(c.subjects).sort((a,b)=>c.subjects[a].name.localeCompare(c.subjects[b].name));
    const courseCount=subjKeys.reduce((s,sK)=>s+c.subjects[sK].items.length,0);
    html+=`<details class="mt-course"><summary>🏫 ${escapeHTML(c.name)} <span class="mt-count">(${courseCount})</span></summary><div style="padding-left:14px;">`;
    subjKeys.forEach(sK=>{
      const s=c.subjects[sK];
      const items=[...s.items].sort((a,b)=>a.title.localeCompare(b.title));
      html+=`<details class="mt-subject"><summary>📘 ${escapeHTML(s.name)} <span class="mt-count">(${items.length})</span></summary><div style="padding-left:14px;padding-top:4px;">`;
      items.forEach(v=>{
        html+=`<div class="manage-item" style="margin-bottom:6px;"><div><div class="mi-title">${escapeHTML(v.title)}</div></div><div style="display:flex;gap:6px;"><button class="edit-btn" onclick="editVideo('${v.id}')">✏️ Edit</button><button class="del-btn" onclick="delVideo('${v.id}')">Delete</button></div></div>`;
      });
      html+='</div></details>';
    });
    html+='</div></details>';
  });
  return html;
}
function delNote(id){if(!confirm('Delete?'))return;const n=notes.find(x=>x.id===id);notes=notes.filter(x=>x.id!==id);saveLocal();renderManage();if(n)adminSave({[itemPath('notes',n)]:null},true);}
function delVideo(id){if(!confirm('Delete?'))return;const v=videos.find(x=>x.id===id);videos=videos.filter(x=>x.id!==id);saveLocal();renderManage();if(v)adminSave({[itemPath('videos',v)]:null},true);}

// ═══════════════ SECRET ADMIN ACCESS ═══════════════
let tapCount = 0;
let tapTimer = null;

function secretTap(){
  tapCount++;
  clearTimeout(tapTimer);

  if(tapCount >= 5){
    tapCount = 0;
    openAdmin();
    return;
  }

  // Reset after 2 seconds of no tapping — completely silent
  tapTimer = setTimeout(()=>{ tapCount = 0; }, 2000);
}

// #admin URL secret access
if(window.location.hash === '#admin'){
  window.addEventListener('load', ()=>{ setTimeout(openAdmin, 500); });
}
// Also check hash on load
window.addEventListener('hashchange', ()=>{
  if(window.location.hash === '#admin') openAdmin();
});

function flashSuccess(id,msg){const el=document.getElementById(id);if(!el)return;if(msg)el.textContent=msg;el.style.display='block';setTimeout(()=>el.style.display='none',2500);}

function saveGeminiKey(){
  const key=document.getElementById('gemini-key-input').value.trim();
  if(!key||!key.startsWith('gsk_')){
    document.getElementById('gemini-key-status').innerHTML='<span style="color:#e85d38">❌ Invalid key. Groq keys start with gsk_</span>';
    return;
  }
  localStorage.setItem('ms4_groq_key', key);
  // Key now managed by Cloudflare Worker
  document.getElementById('gemini-key-status').innerHTML='<span style="color:var(--green)">✅ Key saved! AI Tutor is active.</span>';
}

// Load saved Groq key on startup
(function loadGroqKey(){
  const saved = localStorage.getItem('ms4_groq_key');
  if(saved) window.RUNTIME_GROQ_KEY = saved;
})();

// ═══════════════ ONE-TIME: CONVERT A UNIVERSITY'S CONTENT TO PER-ITEM STORAGE ═══════════════
// Old format: medistudy_content/<uni>/<course>/notes = one array. New format: .../notes/<noteId> = {...,order}.
// Once converted, every save touches only the one item that changed, so two admins can never overwrite each other.
// Acts on the university selected in "Managing University". Safe to re-run. Super admin only.
async function migrateContentToPerItem(){
  const statusEl=document.getElementById('fb-peritem-status');
  if(adminRole!=='super'){ statusEl.innerHTML='<span style="color:#e85d38">❌ Super admin only.</span>'; return; }
  if(!fbConnected||!db){ statusEl.innerHTML='<span style="color:#e85d38">❌ Not connected to Firebase.</span>'; return; }
  const uni=ADMIN_ACTIVE_UNIVERSITY_ID;
  if(!confirm('Convert "'+uni+'" content to per-item storage? Make sure you have a fresh database backup. Students on very old app versions may need to reopen the app.')) return;
  statusEl.innerHTML='⏳ Reading...';
  try{
    const snap=await db.ref('medistudy_content/'+uni).once('value');
    const content=snap.val()||{};
    const updates={}; let nodes=0, items=0, problems=[];
    Object.keys(content).forEach(cid=>{
      const c=content[cid]; if(!c||typeof c!=='object') return;
      ['subjects','folders','notes','videos'].forEach(kind=>{
        const raw=c[kind]; if(!raw) return;
        const obj={};
        fbList(raw).forEach((it,i)=>{
          if(!it||!it.id){ problems.push(cid+'/'+kind+' has an item with no id'); return; }
          if(obj[it.id]){ problems.push(cid+'/'+kind+' has a duplicate id '+it.id); return; }
          obj[it.id]=Object.assign({},it,{order:i+1}); items++;
        });
        updates['medistudy_content/'+uni+'/'+cid+'/'+kind]=obj; nodes++;
      });
    });
    if(problems.length){ statusEl.innerHTML='<span style="color:#e85d38">❌ Stopped, nothing changed: '+escapeHTML(problems.slice(0,5).join('; '))+'</span>'; return; }
    if(!nodes){ statusEl.innerHTML='✅ Nothing to convert for '+escapeHTML(uni)+'.'; return; }
    statusEl.innerHTML='⏳ Writing '+items+' items...';
    await db.ref().update(updates);
    statusEl.innerHTML='✅ Converted '+items+' items in '+nodes+' lists for <strong>'+escapeHTML(uni)+'</strong>. Check a few notes in the app.';
    ensureFullAdminDataLoaded(refreshAdminViews);
  }catch(e){
    statusEl.innerHTML='<span style="color:#e85d38">❌ Failed: '+escapeHTML(e.message)+'</span>';
  }
}

// ═══════════════ QUIZ LEADERBOARD MIGRATION (one-time, pure copy) ═══════════════
// Copies medistudy_quiz_lb/<courseId>/<uid> (old, course-only) into
// medistudy_quiz_lb/<universityId>/<courseId>/<uid> (new, university+course).
// All existing scores belong to Ulyanovsk since it's the only university with
// students so far. Old entries are left in place, untouched, harmless.
async function migrateQuizLeaderboard(){
  const statusEl = document.getElementById('fb-lb-migrate-status');
  if(!fbConnected||!db){ statusEl.innerHTML='<span style="color:#e85d38">❌ Not connected to Firebase.</span>'; return; }
  if(!confirm('This copies all existing quiz leaderboard scores into the new university-scoped structure, under Ulyanovsk. The old entries are left as-is. Continue?')) return;

  statusEl.innerHTML = '⏳ Reading current leaderboard...';
  try{
    const snap = await db.ref('medistudy_quiz_lb').once('value');
    const d = snap.val();
    if(!d){ statusEl.innerHTML = '<span style="color:#e85d38">❌ No leaderboard data found.</span>'; return; }

    const updates = {};
    let courseCount=0, scoreCount=0;
    Object.keys(d).forEach(courseId=>{
      // Skip anything that's already nested under a university id from a previous run
      if(typeof d[courseId]!=='object') return;
      const entries = d[courseId];
      const looksLikeScores = Object.values(entries).some(v=>v && typeof v.best!=='undefined');
      if(!looksLikeScores) return; // already university-scoped, or not score data — leave alone
      updates[`medistudy_quiz_lb/${DEFAULT_UNIVERSITY_ID}/${courseId}`] = entries;
      courseCount++;
      scoreCount += Object.keys(entries).length;
    });

    if(courseCount===0){ statusEl.innerHTML = '✅ Nothing to migrate — leaderboard already looks university-scoped.'; return; }

    statusEl.innerHTML = '⏳ Writing scoped leaderboard...';
    await db.ref().update(updates);
    statusEl.innerHTML = `✅ Migrated ${scoreCount} score${scoreCount!==1?'s':''} across ${courseCount} course${courseCount!==1?'s':''} into medistudy_quiz_lb/${DEFAULT_UNIVERSITY_ID}. Old entries left untouched.`;
  }catch(e){
    statusEl.innerHTML = '<span style="color:#e85d38">❌ Migration failed: '+e.message+'</span>';
  }
}

// ═══════════════ DRAG TO REORDER NOTES (Manage tab) ═══════════════
// Works with finger or mouse (pointer events). Drag the ☰ handle up/down inside
// a folder. Order of the global `notes` array is what students see, so on drop
// we rewrite that array: the folder's notes keep occupying the same slots, just
// in the new order. Then tap "Save & Push" to publish.
let _drag=null, _dragRaf=null;
function _dragScrollParent(el){
  let p=el.parentElement;
  while(p&&p!==document.body){
    const oy=getComputedStyle(p).overflowY;
    if((oy==='auto'||oy==='scroll')&&p.scrollHeight>p.clientHeight) return p;
    p=p.parentElement;
  }
  return document.scrollingElement||document.documentElement;
}
function _dragAutoScroll(){
  if(!_drag) return;
  const sp=_drag.scroller;
  const r=sp===document.scrollingElement||sp===document.documentElement?{top:0,bottom:window.innerHeight}:sp.getBoundingClientRect();
  const y=_drag.lastY, edge=60;
  if(y<r.top+edge) sp.scrollTop-=14;
  else if(y>r.bottom-edge) sp.scrollTop+=14;
  _drag.raf=requestAnimationFrame(_dragAutoScroll);
}
function _dragMoveTo(y){
  const {item,list}=_drag;
  const sibs=[...list.children].filter(x=>x.classList.contains('manage-item')&&x!==item);
  let before=null;
  for(const s of sibs){const r=s.getBoundingClientRect(); if(y<r.top+r.height/2){before=s;break;}}
  if(before){ if(item.nextElementSibling!==before) list.insertBefore(item,before); }
  else if(list.lastElementChild!==item) list.appendChild(item);
}
function commitNoteOrder(list){
  const ids=[...list.children].filter(x=>x.classList.contains('manage-item')).map(x=>x.dataset.id);
  const idSet=new Set(ids), slots=[], byId={};
  notes.forEach((n,i)=>{ if(idSet.has(n.id)){ slots.push(i); byId[n.id]=n; } });
  if(slots.length!==ids.length) return; // safety: something doesn't line up, don't touch data
  ids.forEach((id,k)=>{ notes[slots[k]]=byId[id]; byId[id].order=k+1; });
  saveLocal();
  // Save only this folder's new order — one small "order" field per note, nothing else is touched
  const updates={};
  ids.forEach(id=>{ updates[itemPath('notes',byId[id])+'/order']=byId[id].order; });
  adminSave(updates,true);
}
document.addEventListener('pointerdown',e=>{
  const h=e.target.closest&&e.target.closest('.drag-handle'); if(!h||_drag) return;
  const item=h.closest('.manage-item'), list=item&&item.parentElement;
  if(!list||!list.classList.contains('reorder-list')) return;
  e.preventDefault();
  _drag={item,list,handle:h,pointerId:e.pointerId,lastY:e.clientY,scroller:_dragScrollParent(list)};
  item.classList.add('dragging');
  try{h.setPointerCapture(e.pointerId);}catch(_){}
  _drag.raf=requestAnimationFrame(_dragAutoScroll);
});
document.addEventListener('pointermove',e=>{
  if(!_drag||e.pointerId!==_drag.pointerId) return;
  e.preventDefault();
  _drag.lastY=e.clientY;
  _dragMoveTo(e.clientY);
},{passive:false});
function _dragEnd(e){
  if(!_drag||e.pointerId!==_drag.pointerId) return;
  cancelAnimationFrame(_drag.raf);
  _drag.item.classList.remove('dragging');
  try{_drag.handle.releasePointerCapture(e.pointerId);}catch(_){}
  const list=_drag.list; _drag=null;
  commitNoteOrder(list);
}
document.addEventListener('pointerup',_dragEnd);
document.addEventListener('pointercancel',_dragEnd);

document.getElementById('admin-modal').addEventListener('click',function(e){if(e.target===this)closeAdmin();});

function postAnnouncement(){
  if(!db){alert('Firebase not connected.');return;}
  const title=document.getElementById('ann-title').value.trim();
  const msg=document.getElementById('ann-msg').value.trim();
  const type=document.getElementById('ann-type').value;
  const universityId=document.getElementById('ann-audience').value; // '' = all universities (super admin only)
  if(adminUniversities && !universityId){alert('Choose your university.');return;}
  const days=parseInt(document.getElementById('ann-expiry').value)||3;
  if(!title||!msg){alert('Fill in title and message.');return;}
  const expiry=Date.now()+(days*24*60*60*1000);
  const id='ann_'+Date.now();
  adminTrackStrict(db.ref('medistudy_announcements/'+id).set({id,title,msg,type,universityId,expiry,ts:Date.now()}),'Published')
    .then(()=>{
      document.getElementById('ann-title').value='';
      document.getElementById('ann-msg').value='';
      const s=document.getElementById('ann-success');
      s.style.display='block';setTimeout(()=>s.style.display='none',2500);
      loadAdminAnnouncements();
    })
    .catch(e=>alert('Failed: '+e.message));
}

function loadAdminAnnouncements(){
  if(!db)return;
  const el=document.getElementById('admin-ann-list');
  if(!el)return;
  db.ref('medistudy_announcements').orderByChild('expiry').once('value',snap=>{
    if(!snap||!snap.exists()){el.innerHTML='<div style="color:var(--muted);font-size:12px;">No active announcements.</div>';return;}
    const now=Date.now();
    let html='';
    snap.forEach(c=>{
      const a=c.val();
      if(adminUniversities && !adminUniversities.includes(a.universityId)) return; // another university's / global notice
      const expired=a.expiry<now;
      const col=ANN_COLORS[a.type]||ANN_COLORS.info;
      const uniName = a.universityId ? ((universities.find(u=>u.id===a.universityId)||{}).name || a.universityId) : null;
      html+=`<div style="background:${col.bg};border:1px solid ${col.border};border-radius:8px;padding:10px;margin-bottom:8px;position:relative;">
        <div style="font-weight:700;font-size:12px;color:${col.color};">${escapeHTML(a.title)} ${expired?'<span style="color:#e85d38;">[EXPIRED]</span>':''}</div>
        <div style="font-size:11px;color:var(--muted);margin-top:2px;">${escapeHTML(a.msg)}</div>
        <div style="font-size:10px;color:var(--muted);margin-top:4px;">${uniName?('🏫 '+escapeHTML(uniName)+' only'):'🌐 All Universities'} · Expires: ${new Date(a.expiry).toLocaleDateString()}</div>
        <button onclick="deleteAnnouncement('${a.id}')" style="position:absolute;top:8px;right:8px;background:#e85d38;border:none;border-radius:5px;color:#fff;font-size:10px;padding:2px 7px;cursor:pointer;">Delete</button>
      </div>`;
    });
    el.innerHTML=html||'<div style="color:var(--muted);font-size:12px;">No announcements.</div>';
  });
}

function deleteAnnouncement(id){
  if(!db||!id)return;
  adminTrack(db.ref('medistudy_announcements/'+id).remove(),'Announcement deleted').then(ok=>{ if(ok) loadAdminAnnouncements(); else alert('❌ Not deleted.'); });
}

function addEssential(){
  if(!db){alert('Firebase not connected.');return;}
  const title=document.getElementById('ess-title-input').value.trim();
  const content=document.getElementById('ess-content-input').value.trim();
  if(!title||!content){alert('Fill in title and content.');return;}
  const id='ess_'+Date.now();
  db.ref('medistudy_essentials/'+id).set({id,title,content,order:Date.now(),ts:Date.now()})
    .then(()=>{
      document.getElementById('ess-title-input').value='';
      document.getElementById('ess-content-input').value='';
      const s=document.getElementById('ess-success');
      s.style.display='block';setTimeout(()=>s.style.display='none',2500);
      loadAdminEssentials();
    })
    .catch(e=>alert('Failed: '+e.message));
}
function loadAdminEssentials(){
  if(!db)return;
  const el=document.getElementById('admin-ess-list');
  if(!el)return;
  db.ref('medistudy_essentials').orderByChild('order').once('value',snap=>{
    if(!snap||!snap.exists()){el.innerHTML='<div style="color:var(--muted);font-size:12px;">No essentials added yet.</div>';return;}
    let html='';
    snap.forEach(c=>{
      const it=c.val();
      html+=`<div style="background:var(--card);border:1px solid var(--border);border-radius:8px;padding:10px;margin-bottom:8px;position:relative;">
        <div style="font-weight:700;font-size:12px;padding-right:60px;">${escapeHTML(it.title)}</div>
        <div style="font-size:11px;color:var(--muted);margin-top:2px;white-space:pre-wrap;">${escapeHTML(it.content)}</div>
        <button onclick="deleteEssential('${it.id}')" style="position:absolute;top:8px;right:8px;background:#e85d38;border:none;border-radius:5px;color:#fff;font-size:10px;padding:2px 7px;cursor:pointer;">Delete</button>
      </div>`;
    });
    el.innerHTML=html;
  });
}
function deleteEssential(id){
  if(!db||!id)return;
  db.ref('medistudy_essentials/'+id).remove().then(()=>loadAdminEssentials());
}

// ── MCQ sub-tab switcher ──
function switchMCQTab(tab){
  const isAI=tab==='ai';
  document.getElementById('mcq-ai-panel').style.display=isAI?'block':'none';
  document.getElementById('mcq-manual-panel').style.display=isAI?'none':'block';
  document.getElementById('mcqtab-ai').style.background=isAI?'var(--accent)':'transparent';
  document.getElementById('mcqtab-ai').style.color=isAI?'#0e0f13':'var(--muted)';
  document.getElementById('mcqtab-manual').style.background=isAI?'transparent':'var(--accent)';
  document.getElementById('mcqtab-manual').style.color=isAI?'var(--muted)':'#0e0f13';
  if(!isAI) renderManualQList();
}

// ── Manual MCQ ──
let _manualQs=[];

function addManualQuestion(){
  const q=document.getElementById('mq-question').value.trim();
  const opts=[0,1,2,3].map(i=>document.getElementById('mq-opt'+i).value.trim());
  const answer=parseInt(document.getElementById('mq-answer').value);
  const explanation=document.getElementById('mq-explanation').value.trim();
  if(!q){alert('Please enter a question.');return;}
  if(opts.some(o=>!o)){alert('Please fill in all 4 options.');return;}
  _manualQs.push({q,options:opts,answer,explanation});
  // Clear form
  document.getElementById('mq-question').value='';
  [0,1,2,3].forEach(i=>document.getElementById('mq-opt'+i).value='');
  document.getElementById('mq-explanation').value='';
  document.getElementById('mq-answer').value='0';
  renderManualQList();
}

function renderManualQList(){
  const list=document.getElementById('mq-added-list');
  const countLabel=document.getElementById('mq-count-label');
  const pubBtn=document.getElementById('mq-pub-btn');
  if(!list)return;
  if(_manualQs.length===0){
    list.innerHTML='';
    countLabel.style.display='none';
    pubBtn.style.display='none';
    return;
  }
  countLabel.textContent=_manualQs.length+' question'+ (_manualQs.length>1?'s':'') +' added so far';
  countLabel.style.display='block';
  pubBtn.style.display='block';
  list.innerHTML=_manualQs.map((q,i)=>`
    <div style="background:var(--card);border:1px solid var(--border);border-radius:10px;padding:10px;margin-bottom:8px;">
      <div style="font-size:12px;font-weight:700;margin-bottom:6px;">Q${i+1}. ${escapeHTML(q.q)}</div>
      ${q.options.map((o,j)=>`
        <div style="font-size:11px;padding:3px 8px;border-radius:5px;margin-bottom:2px;${j===q.answer?'color:#86efac;font-weight:700;':'color:var(--muted);'}">
          ${['A','B','C','D'][j]}. ${escapeHTML(o)} ${j===q.answer?'✓':''}
        </div>`).join('')}
      ${q.explanation?`<div style="font-size:11px;color:var(--muted);margin-top:4px;font-style:italic;">💡 ${escapeHTML(q.explanation)}</div>`:''}
      <button onclick="deleteManualQ(${i})" style="margin-top:6px;font-size:10px;background:none;border:1px solid #e85d38;border-radius:5px;padding:2px 8px;color:#e85d38;cursor:pointer;">🗑 Remove</button>
    </div>`).join('');
}

function deleteManualQ(i){
  _manualQs.splice(i,1);
  renderManualQList();
}

// ── Bulk paste & auto-fill ──
function parseBulkMCQs(){
  const raw=document.getElementById('mq-bulk-paste').value;
  if(!raw||!raw.trim()){alert('Paste some MCQs first.');return;}

  // Split into per-question blocks: prefer '---' style separator lines
  let blocks=raw.split(/^[ \t]*[-=_]{3,}[ \t]*$/m).map(b=>b.trim()).filter(b=>b.length);
  if(blocks.length<2){
    // No separators found — fall back to splitting at each numbered question start
    const lines=raw.split('\n');
    const idxs=[];
    lines.forEach((l,i)=>{ if(/^\s*(?:Q(?:uestion)?\.?\s*)?\d{1,3}[.)]\s+\S/i.test(l)) idxs.push(i); });
    blocks = idxs.length>1
      ? idxs.map((start,k)=>lines.slice(start, k+1<idxs.length?idxs[k+1]:lines.length).join('\n').trim())
      : [raw.trim()];
  }

  const optRe=/^([A-Da-d])[.)\:]\s*(.+)$/;
  const ansRe=/^(?:correct\s*)?answ?e?r\s*[:\-]?\s*([A-Da-d])\b\s*(?:[—\-–:]\s*(.*))?$/i;
  let added=0, skipped=[];

  blocks.forEach((block,bi)=>{
    const lines=block.split('\n').map(l=>l.trim()).filter(l=>l.length);
    if(!lines.length)return;

    const optIdx={};
    let firstOptLine=-1;
    lines.forEach((l,i)=>{
      const m=l.match(optRe);
      if(m){
        const letter=m[1].toUpperCase();
        if(!(letter in optIdx)){ optIdx[letter]=i; if(firstOptLine===-1)firstOptLine=i; }
      }
    });
    if(!('A' in optIdx)||!('B' in optIdx)||!('C' in optIdx)||!('D' in optIdx)){
      skipped.push({num:bi+1, reason:'could not find all 4 options (A–D)', text:(lines[0]||'').slice(0,50)});
      return;
    }

    const qLines=lines.slice(0,firstOptLine);
    let qText=qLines.join(' ').replace(/^\s*(?:Q(?:uestion)?\.?\s*)?\d{1,3}[.)]\s*/i,'').trim();
    if(!qText){
      skipped.push({num:bi+1, reason:'no question text found', text:(lines[0]||'').slice(0,50)});
      return;
    }

    const opts=['A','B','C','D'].map(l=>{
      const m=lines[optIdx[l]].match(optRe);
      return m?m[2].trim():'';
    });
    if(opts.some(o=>!o)){
      skipped.push({num:bi+1, reason:'one or more options are empty', text:qText.slice(0,50)});
      return;
    }

    let answerLetter=null, explanation='';
    for(let i=firstOptLine;i<lines.length;i++){
      const m=lines[i].match(ansRe);
      if(m){
        answerLetter=m[1].toUpperCase();
        explanation=(m[2]||'').trim();
        break;
      }
    }
    if(!answerLetter){
      skipped.push({num:bi+1, reason:'no "Answer: X" line found', text:qText.slice(0,50)});
      return;
    }

    _manualQs.push({q:qText, options:opts, answer:{'A':0,'B':1,'C':2,'D':3}[answerLetter], explanation});
    added++;
  });

  renderManualQList();
  const statusEl=document.getElementById('mq-bulk-status');
  statusEl.style.display='block';
  if(added>0){
    let msg=`✅ Added ${added} question${added!==1?'s':''} below — check them over, then Publish.`;
    if(skipped.length)msg+=` ⚠️ Skipped ${skipped.length}: `+skipped.map(s=>`#${s.num} (${s.reason})`).join('; ')+'.';
    statusEl.textContent=msg;
    statusEl.style.color=skipped.length?'#f0b429':'#86efac';
    document.getElementById('mq-bulk-paste').value='';
  } else {
    statusEl.textContent='⚠️ Could not parse any questions. Skipped: '+skipped.map(s=>`#${s.num} (${s.reason})`).join('; ')+'. Check the format and try again.';
    statusEl.style.color='#e85d38';
  }
}


function populateMCQSubjectDropdowns(){
  // Populate both AI and Manual course dropdowns
  ['mcq-course-sel','mcq-manual-course-sel'].forEach(selId=>{
    const sel=document.getElementById(selId);
    if(!sel)return;
    sel.innerHTML='<option value="">— Select Course —</option>'+courses.map(c=>`<option value="${c.id}">${c.name}</option>`).join('');
    // Auto-select first course and populate subjects
    const paired=selId==='mcq-course-sel'?'mcq-subject-sel':'mcq-manual-subject-sel';
    if(courses.length){sel.value=courses[0].id;updateMCQSubjects(paired,selId);}
  });
}

function updateMCQSubjects(subSelId, courseSelId){
  const courseId=document.getElementById(courseSelId).value;
  const sel=document.getElementById(subSelId);
  if(!sel)return;
  const subs=subjects.filter(s=>s.courseId===courseId);
  sel.innerHTML='<option value="">— Select Subject —</option>'+subs.map(s=>`<option value="${s.id}">${s.name}</option>`).join('');
}

function publishManualMCQ(){
  if(!db){alert('Firebase not connected.');return;}
  const subject=document.getElementById('mcq-manual-subject').value.trim();
  if(!subject){alert('Please enter a subject/topic name.');return;}
  if(_manualQs.length===0){alert('Add at least one question first.');return;}
  const subjectId=document.getElementById('mcq-manual-subject-sel').value;
  const courseId=document.getElementById('mcq-manual-course-sel').value;
  if(!subjectId){alert('Please select which subject to link this MCQ to!');return;}
  const btn=document.getElementById('mq-pub-btn');
  btn.disabled=true;btn.textContent='Publishing...';
  const id='mcq_'+Date.now();
  adminTrackStrict(db.ref('medistudy_mcq/'+id).set({id,subject,subjectId,courseId,universityId:ADMIN_ACTIVE_UNIVERSITY_ID,qs:_manualQs,ts:Date.now(),count:_manualQs.length}),'Published')
    .then(()=>{
      const s=document.getElementById('mq-pub-success');
      s.style.display='block';setTimeout(()=>s.style.display='none',2500);
      _manualQs=[];
      document.getElementById('mcq-manual-subject').value='';
      renderManualQList();
      loadAdminMCQSets();
    })
    .catch(e=>alert('Failed: '+e.message))
    .finally(()=>{btn.disabled=false;btn.textContent='✅ Publish Set to Students';});
}
async function generateMCQ(){
  const subject=document.getElementById('mcq-subject').value.trim();
  const notes=document.getElementById('mcq-notes').value.trim();
  const count=parseInt(document.getElementById('mcq-count').value)||5;
  if(!subject||!notes){alert('Please fill in subject and notes.');return;}
  const btn=document.getElementById('mcq-gen-btn');
  const status=document.getElementById('mcq-gen-status');
  btn.disabled=true;btn.textContent='⏳ Generating...';
  status.style.display='block';

  // Generate in batches of 5 to avoid token limits
  const batchSize=5;
  const batches=Math.ceil(count/batchSize);
  let allQs=[];

  try{
    for(let b=0;b<batches;b++){
      const bCount=Math.min(batchSize, count-allQs.length);
      const prompt=`Generate exactly ${bCount} MBBS MCQ questions from these notes on "${subject}".
Return ONLY a JSON array. No markdown, no backticks, no explanation outside JSON.
Each item: {"q":"question","options":["A","B","C","D"],"answer":0,"explanation":"reason"}
answer is 0-3 index of correct option.

NOTES: ${notes.substring(0,2000)}`;

      const res=await fetch(WORKER_URL,{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          message:prompt,
          systemPrompt:'You are a medical MCQ generator. Return ONLY a valid JSON array. No markdown. No text before or after the array.'
        })
      });
      const data=await res.json();
      let text='';
      if(data.choices&&data.choices[0]) text=data.choices[0].message.content;
      else if(data.reply) text=data.reply;

      // Clean response
      text=text.replace(/```json|```/g,'').trim();
      // Fix truncated JSON — find last complete object
      const lastBrace=text.lastIndexOf('}');
      if(lastBrace!==-1) text=text.substring(0,lastBrace+1);
      // Ensure it's wrapped in array
      if(!text.startsWith('[')) text='['+text;
      if(!text.endsWith(']')) text=text+']';

      try{
        const qs=JSON.parse(text);
        if(Array.isArray(qs)) allQs=allQs.concat(qs);
      }catch(e){
        console.warn('Batch parse failed:',e);
      }

      if(allQs.length>=count) break;
    }

    if(allQs.length===0) throw new Error('Could not generate questions. Try shorter notes.');
    showMCQReview(subject, allQs.slice(0,count));
  }catch(e){
    alert('Generation failed: '+e.message+'\nTip: Use shorter notes (1-2 paragraphs) and try 5 questions first.');
  }finally{
    btn.disabled=false;btn.textContent='🤖 Generate MCQs';
    status.style.display='none';
  }
}

function showMCQReview(subject, qs){
  document.getElementById('mcq-step1').style.display='none';
  document.getElementById('mcq-step2').style.display='block';
  document.getElementById('mcq-review-title').textContent='Review: '+subject+' ('+qs.length+' questions)';
  // Store for publishing
  window._pendingMCQ={subject, qs};
  const list=document.getElementById('mcq-review-list');
  list.innerHTML=qs.map((q,i)=>`
    <div style="background:var(--card);border:1px solid var(--border);border-radius:10px;padding:12px;margin-bottom:10px;">
      <div style="font-size:12px;font-weight:700;margin-bottom:8px;">Q${i+1}. ${escapeHTML(q.q)}</div>
      ${q.options.map((o,j)=>`
        <div style="font-size:11px;padding:4px 8px;border-radius:6px;margin-bottom:3px;${j===q.answer?'background:#052e16;color:#86efac;border:1px solid #16a34a;':'background:var(--bg);border:1px solid var(--border);'}">
          ${['A','B','C','D'][j]}. ${escapeHTML(o)} ${j===q.answer?'✓':''}
        </div>`).join('')}
      <div style="font-size:11px;color:var(--muted);margin-top:6px;font-style:italic;">💡 ${escapeHTML(q.explanation||'')}</div>
      <button onclick="deletePendingQ(${i})" style="margin-top:6px;font-size:10px;background:none;border:1px solid #e85d38;border-radius:5px;padding:2px 8px;color:#e85d38;cursor:pointer;">🗑 Remove</button>
    </div>`).join('');
}

function deletePendingQ(i){
  if(!window._pendingMCQ)return;
  window._pendingMCQ.qs.splice(i,1);
  showMCQReview(window._pendingMCQ.subject, window._pendingMCQ.qs);
}

function resetMCQGen(){
  window._pendingMCQ=null;
  document.getElementById('mcq-step1').style.display='block';
  document.getElementById('mcq-step2').style.display='none';
}

function publishMCQSet(){
  if(!db||!window._pendingMCQ){alert('Nothing to publish.');return;}
  const {subject,qs}=window._pendingMCQ;
  if(qs.length===0){alert('No questions to publish.');return;}
  const subjectId=document.getElementById('mcq-subject-sel').value;
  const courseId=document.getElementById('mcq-course-sel').value;
  if(!subjectId){alert('Please select which subject to link this MCQ to!');return;}
  const id='mcq_'+Date.now();
  const btn=document.getElementById('mcq-pub-btn');
  btn.disabled=true;btn.textContent='Publishing...';
  adminTrackStrict(db.ref('medistudy_mcq/'+id).set({id,subject,subjectId,courseId,universityId:ADMIN_ACTIVE_UNIVERSITY_ID,qs,ts:Date.now(),count:qs.length}),'Published')
    .then(()=>{
      const s=document.getElementById('mcq-pub-success');
      s.style.display='block';setTimeout(()=>s.style.display='none',2500);
      resetMCQGen();
      document.getElementById('mcq-notes').value='';
      document.getElementById('mcq-subject').value='';
      loadAdminMCQSets();
    })
    .catch(e=>alert('Failed: '+e.message))
    .finally(()=>{btn.disabled=false;btn.textContent='✅ Publish to Students';});
}

function loadAdminMCQSets(){
  if(!db)return;
  const el=document.getElementById('admin-mcq-list');
  if(!el)return;
  db.ref('medistudy_mcq').orderByChild('ts').once('value',snap=>{
    if(!snap||!snap.exists()){el.innerHTML='<div style="color:var(--muted);">No MCQ sets published yet.</div>';return;}
    let html='';
    snap.forEach(c=>{
      const m=c.val();
      if((m.universityId||DEFAULT_UNIVERSITY_ID)!==ADMIN_ACTIVE_UNIVERSITY_ID) return; // other university's set
      html=`<div style="background:var(--card);border:1px solid var(--border);border-radius:8px;padding:10px;margin-bottom:8px;display:flex;align-items:center;justify-content:space-between;">
        <div>
          <div style="font-weight:700;font-size:12px;">📝 ${escapeHTML(m.subject)}</div>
          <div style="font-size:11px;color:var(--muted);">${m.count} questions • ${new Date(m.ts).toLocaleDateString()}</div>
        </div>
        <button onclick="deleteAdminMCQ('${m.id}')" style="background:#e85d38;border:none;border-radius:5px;color:#fff;font-size:10px;padding:4px 8px;cursor:pointer;">Delete</button>
      </div>`+html;
    });
    el.innerHTML=html||'<div style="color:var(--muted);">No MCQ sets yet.</div>';
  });
}

function deleteAdminMCQ(id){
  if(!db||!id)return;
  if(!confirm('Delete this MCQ set?'))return;
  adminTrack(db.ref('medistudy_mcq/'+id).remove(),'MCQ set deleted').then(ok=>{ if(ok) loadAdminMCQSets(); else alert('❌ Not deleted.'); });
}

// ═══════════════ ADMIN: STUDENTS LIST ═══════════════
// Per university: medistudy_directory/<uni> holds each student's name, course and last login (written by the student's
// own app). Only that university's admins and the super admin can read it. The super admin additionally sees
// email / gender / age from the users node, which nobody else can read.
let _allStudents=[];
let _totalStudyHours=0;
let _studentsAccountsOverall=null;
function uniDisplayName(id){ return (universities.find(u=>u.id===id)||{}).name||id; }
function loadStudentsList(){
  const listEl=document.getElementById('students-list');
  const sumEl=document.getElementById('students-summary');
  if(!db||!fbConnected){ listEl.innerHTML='<div style="color:var(--muted);font-size:12px;">Connect Firebase first.</div>'; return; }
  const uni=ADMIN_ACTIVE_UNIVERSITY_ID, isSuper=adminRole==='super';
  sumEl.textContent='Loading...';
  listEl.innerHTML='';
  Promise.all([
    db.ref('medistudy_directory/'+uni).once('value'),
    db.ref('medistudy_hours_lb').once('value'),
    isSuper ? db.ref('users').once('value') : Promise.resolve(null)
  ]).then(([dirSnap,hoursSnap,usersSnap])=>{
    if(uni!==ADMIN_ACTIVE_UNIVERSITY_ID) return; // admin switched university meanwhile
    const dir=dirSnap.val()||{};
    const hours=hoursSnap.val()||{};
    const users=usersSnap?(usersSnap.val()||{}):null;
    _allStudents=Object.keys(dir).map(uid=>{
      const d=dir[uid]||{};
      const u=users?(users[uid]||{}):{};
      const p=u.profile||{};
      const course=(courses.find(c=>c.id===d.course)||{}).name||(d.course?String(d.course):'—');
      return {
        uid,
        name: d.name||'(no name set)',
        email: users?(u.email||'—'):null,
        course,
        gender: users?(p.gender||'—'):null,
        age: users?(p.age||'—'):null,
        lastLogin: d.lastLogin||0,
        totalHours: (hours[uid]&&hours[uid].totalHours)||0
      };
    }).sort((a,b)=>b.lastLogin-a.lastLogin);
    _totalStudyHours=_allStudents.reduce((s,x)=>s+x.totalHours,0);
    _studentsAccountsOverall=users?Object.keys(users).length:null;
    renderStudentsList();
  },err=>{
    sumEl.textContent='';
    listEl.innerHTML='<div style="color:#e85d38;font-size:12px;">⚠️ Could not load students. If this is a permissions error, publish the latest Firebase rules and check your account is an admin of this university.</div>';
    console.error(err);
  });
}
function renderStudentsList(){
  const listEl=document.getElementById('students-list');
  const sumEl=document.getElementById('students-summary');
  const todayOnly=document.getElementById('students-today-only').checked;
  const startOfToday=new Date(); startOfToday.setHours(0,0,0,0);
  const todayTs=startOfToday.getTime();
  const rows=todayOnly?_allStudents.filter(s=>s.lastLogin>=todayTs):_allStudents;
  const totalDays=(_totalStudyHours/24).toFixed(1);
  const uniName=uniDisplayName(ADMIN_ACTIVE_UNIVERSITY_ID);
  sumEl.innerHTML=`🏫 <strong style="color:var(--text);">${escapeHTML(uniName)}</strong><br>${rows.length} of ${_allStudents.length} students`+(todayOnly?' (logged in today)':'')+
    `<br><strong style="color:var(--text);">⏱ Time in app (these students): ${_totalStudyHours.toFixed(1)}h (~${totalDays} days)</strong>`+
    (_studentsAccountsOverall!==null?`<br>All accounts, all universities: ${_studentsAccountsOverall}. A student appears here once they open the updated app, or after you run "Fill student directory" (Firebase tab).`:'');
  if(!rows.length){ listEl.innerHTML='<div style="color:var(--muted);font-size:12px;">No students found.</div>'; return; }
  listEl.innerHTML=rows.map(s=>{
    const when=s.lastLogin?new Date(s.lastLogin).toLocaleString():'never';
    return `<div style="background:var(--card);border:1px solid var(--border);border-radius:10px;padding:10px 12px;margin-bottom:8px;font-size:12px;">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:2px;">
        <div style="font-weight:700;">${escapeHTML(s.name)}</div>
        <button class="del-btn" title="Remove from this university so they can choose again" onclick="resetStudentUniversity('${s.uid}')">🔓 Reset university</button>
      </div>
      ${s.email!==null?`<div style="color:var(--muted);">✉️ ${escapeHTML(s.email)}</div>
      <div style="color:var(--muted);font-size:10px;">🆔 ${escapeHTML(s.uid)}</div>`:''}
      <div style="color:var(--muted);">🎓 ${escapeHTML(s.course)}${s.gender!==null?` &nbsp; ⚧ ${escapeHTML(s.gender)} &nbsp; 🎂 ${escapeHTML(String(s.age))}`:''}</div>
      <div style="color:var(--muted);">🕒 Last login: ${when} &nbsp; ⏱ ${s.totalHours.toFixed(1)}h logged</div>
    </div>`;
  }).join('');
}
// Removes the student's join record and directory entry for the selected university. Their app then asks them to
// choose a university and enter a join code again.
function resetStudentUniversity(uid){
  const uni=ADMIN_ACTIVE_UNIVERSITY_ID;
  if(!confirm('Reset the university for this student?\n\nThey will be removed from '+uniDisplayName(uni)+' and asked to choose a university and enter a join code again.')) return;
  const updates={};
  updates['medistudy_members/'+uni+'/'+uid]=null;
  updates['medistudy_directory/'+uni+'/'+uid]=null;
  adminTrack(db.ref().update(updates),'Student reset').then(ok=>{
    if(!ok){ alert('❌ Not reset.'); return; }
    _allStudents=_allStudents.filter(s=>s.uid!==uid);
    renderStudentsList();
  });
}

// ═══════════════ ADMIN: DASHBOARD ═══════════════
// Everything here is for the university selected in "Managing University".
function loadDashboard(){
  const cardsEl=document.getElementById('dash-summary-cards');
  const likedEl=document.getElementById('dash-top-liked');
  if(!db||!fbConnected){ cardsEl.innerHTML='<div style="color:var(--muted);font-size:12px;">Connect Firebase first.</div>'; return; }
  const uni=ADMIN_ACTIVE_UNIVERSITY_ID, isSuper=adminRole==='super';
  cardsEl.innerHTML='<div style="color:var(--muted);font-size:12px;">Loading...</div>';
  likedEl.innerHTML='';

  Promise.all([
    db.ref('medistudy_directory/'+uni).once('value'),
    db.ref('medistudy_hours_lb').once('value'),
    db.ref('medistudy_feedback').orderByChild('universityId').equalTo(uni).limitToLast(200).once('value'),
    db.ref('medistudy_likes').once('value'),
    isSuper ? db.ref('users').once('value') : Promise.resolve(null),
    db.ref('medistudy_guest_stats/'+uni).orderByKey().limitToLast(30).once('value').catch(()=>null) // null if the new rules are not published yet
  ]).then(([dirSnap,hoursSnap,fbSnap,likesSnap,usersSnap,guestSnap])=>{
    if(uni!==ADMIN_ACTIVE_UNIVERSITY_ID) return; // admin switched university meanwhile
    // Students of this university
    const dir=dirSnap.val()||{};
    const uids=Object.keys(dir);
    const hoursData=hoursSnap.val()||{};
    const totalHours=uids.reduce((s,id)=>s+((hoursData[id]&&hoursData[id].totalHours)||0),0);
    const startOfToday=new Date(); startOfToday.setHours(0,0,0,0);
    const activeToday=uids.filter(id=>((dir[id]||{}).lastLogin||0)>=startOfToday.getTime()).length;
    const overall=usersSnap?Object.keys(usersSnap.val()||{}).length:null;

    // New feedback count (this university)
    const fbData=fbSnap.val()||{};
    const newCount=Object.values(fbData).filter(f=>(f.status||'New')==='New').length;

    // Guests (not signed in): anonymous daily counters
    let guestHtml='';
    if(guestSnap){
      const gs=guestSnap.val()||{};
      const today=new Date().toISOString().slice(0,10);
      const days=Object.keys(gs).sort();
      const sum=(keys,f)=>keys.reduce((s,d)=>s+((gs[d]&&gs[d][f])||0),0);
      const last7=days.filter(d=>d>=new Date(Date.now()-6*864e5).toISOString().slice(0,10));
      guestHtml=`
      <div style="background:var(--card);border:1px solid var(--border);border-radius:10px;padding:12px 14px;">
        <div style="font-size:12px;color:var(--muted);">👀 Guests (not signed in)</div>
        <div style="font-size:18px;font-weight:800;">${(gs[today]&&gs[today].active)||0} <span style="font-size:12px;font-weight:400;color:var(--muted);">active today</span> &nbsp; ${(gs[today]&&gs[today].new)||0} <span style="font-size:12px;font-weight:400;color:var(--muted);">new today</span></div>
        <div style="font-size:11px;color:var(--muted);margin-top:2px;">Last 7 days: ${sum(last7,'active')} guest visits &nbsp;·&nbsp; Last 30 days: ${sum(days,'new')} new guests</div>
        <div style="font-size:10px;color:var(--muted);margin-top:2px;">Counted per phone, no personal data. Clearing browser data or using two phones can count the same person twice.</div>
      </div>`;
    } else {
      guestHtml=`<div style="background:var(--card);border:1px solid var(--border);border-radius:10px;padding:12px 14px;font-size:12px;color:var(--muted);">👀 Guests: publish the latest Firebase rules to see guest numbers.</div>`;
    }

    // Notes/Videos totals (already in memory for the selected university)
    const noteCount=notes.length, vidCount=videos.length;

    cardsEl.innerHTML=`
      <div style="font-size:12px;color:var(--muted);">🏫 <strong style="color:var(--text);">${escapeHTML(uniDisplayName(uni))}</strong></div>
      <div style="background:var(--card);border:1px solid var(--border);border-radius:10px;padding:12px 14px;">
        <div style="font-size:12px;color:var(--muted);">👥 Students</div>
        <div style="font-size:18px;font-weight:800;">${uids.length} <span style="font-size:12px;font-weight:400;color:var(--muted);">in this university</span> &nbsp; ${activeToday} <span style="font-size:12px;font-weight:400;color:var(--muted);">logged in today</span></div>
        <div style="font-size:12px;color:var(--muted);margin-top:2px;">⏱ ${totalHours.toFixed(1)}h combined time in app</div>
        ${overall!==null?`<div style="font-size:11px;color:var(--muted);margin-top:2px;">All accounts, all universities: ${overall}</div>`:''}
      </div>
      ${guestHtml}
      <div style="background:var(--card);border:1px solid var(--border);border-radius:10px;padding:12px 14px;">
        <div style="font-size:12px;color:var(--muted);">💬 Feedback</div>
        <div style="font-size:18px;font-weight:800;color:${newCount>0?'#3b82f6':'var(--text)'};">${newCount} <span style="font-size:12px;font-weight:400;color:var(--muted);">🔵 New (unreviewed)</span></div>
      </div>
      <div style="background:var(--card);border:1px solid var(--border);border-radius:10px;padding:12px 14px;">
        <div style="font-size:12px;color:var(--muted);">📚 Content</div>
        <div style="font-size:18px;font-weight:800;">${noteCount} <span style="font-size:12px;font-weight:400;color:var(--muted);">notes</span> &nbsp; ${vidCount} <span style="font-size:12px;font-weight:400;color:var(--muted);">videos</span></div>
      </div>
    `;

    // Top liked notes — only this university's own notes
    const likesData=likesSnap.val()||{};
    const myNoteIds=new Set(notes.map(n=>n.id));
    const likeCounts=Object.keys(likesData).filter(noteId=>myNoteIds.has(noteId)).map(noteId=>({
      noteId, count:Object.keys(likesData[noteId]||{}).length
    })).filter(x=>x.count>0).sort((a,b)=>b.count-a.count).slice(0,10);

    if(!likeCounts.length){ likedEl.innerHTML='<div style="font-size:12px;color:var(--muted);">No likes yet.</div>'; return; }
    likedEl.innerHTML=likeCounts.map((lc,i)=>{
      const n=notes.find(x=>x.id===lc.noteId);
      if(!n) return '';
      const co=courses.find(c=>c.id===n.courseId),su=subjects.find(s=>s.id===n.subjectId);
      return `<div style="background:var(--card);border:1px solid var(--border);border-radius:10px;padding:10px 12px;margin-bottom:6px;display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:12px;">
        <div><div style="font-weight:700;">${i+1}. ${escapeHTML(n.topic)}</div><div style="color:var(--muted);">${[co&&co.name,su&&su.name].filter(Boolean).join(' › ')}</div></div>
        <div style="color:var(--accent2);font-weight:700;white-space:nowrap;">❤️ ${lc.count}</div>
      </div>`;
    }).join('');
  },err=>{
    cardsEl.innerHTML='<div style="color:#e85d38;font-size:12px;">⚠️ Could not load dashboard data. Publish the latest Firebase rules and check your account is an admin of this university.</div>';
    console.error(err);
  });
}


const FB_CAT_ICON={Bug:'🐞',Suggestion:'💡',Praise:'❤️',Other:'✏️'};
const FB_STATUS_ICON={New:'🔵 New',Seen:'🟡 Seen',Resolved:'🟢 Resolved'};
function loadFeedbackList(){
  const listEl=document.getElementById('feedback-list');
  const sumEl=document.getElementById('feedback-summary');
  if(!db||!fbConnected){ listEl.innerHTML='<div style="color:var(--muted);font-size:12px;">Connect Firebase first.</div>'; return; }
  sumEl.textContent='Loading...';
  listEl.innerHTML='';
  db.ref('medistudy_feedback').orderByChild('universityId').equalTo(ADMIN_ACTIVE_UNIVERSITY_ID).limitToLast(50).once('value',snap=>{
    const data=snap.val()||{};
    _allFeedback=Object.keys(data).map(key=>{
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
    renderFeedbackList();
  },err=>{
    sumEl.textContent='';
    listEl.innerHTML='<div style="color:#e85d38;font-size:12px;">⚠️ Could not load feedback. If this is a permissions error, make sure the "medistudy_feedback" rule is added in Firebase.</div>';
    console.error(err);
  });
}
function renderFeedbackList(){
  const listEl=document.getElementById('feedback-list');
  const sumEl=document.getElementById('feedback-summary');
  const catFilter=document.getElementById('feedback-cat-filter').value;
  const statusFilter=document.getElementById('feedback-status-filter').value;
  let rows=_allFeedback;
  if(catFilter) rows=rows.filter(f=>f.category===catFilter);
  if(statusFilter) rows=rows.filter(f=>f.status===statusFilter);
  const avgRating=_allFeedback.length?(_allFeedback.reduce((s,f)=>s+f.rating,0)/_allFeedback.length).toFixed(1):'—';
  const newCount=_allFeedback.filter(f=>f.status==='New').length;
  sumEl.textContent=`🏫 ${uniDisplayName(ADMIN_ACTIVE_UNIVERSITY_ID)} · ${rows.length} of ${_allFeedback.length} loaded (newest 50) · ${newCount} New · avg rating ${avgRating}★`;
  if(!rows.length){ listEl.innerHTML='<div style="color:var(--muted);font-size:12px;">No feedback found.</div>'; return; }
  listEl.innerHTML=rows.map(f=>{
    const when=f.timestamp?new Date(f.timestamp).toLocaleString():'—';
    const stars='★'.repeat(f.rating)+'☆'.repeat(5-f.rating);
    const statusColor=f.status==='New'?'#3b82f6':(f.status==='Seen'?'#eab308':'#22c55e');
    return `<div style="background:var(--card);border:1px solid var(--border);border-radius:10px;padding:10px 12px;margin-bottom:8px;font-size:12px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;gap:8px;flex-wrap:wrap;">
        <div style="font-weight:700;">${escapeHTML(f.name)} <span style="color:var(--muted);font-weight:400;">· ${escapeHTML(f.course)}</span></div>
        <div style="display:flex;align-items:center;gap:8px;">
          <div style="color:var(--accent);">${stars}</div>
          <select onchange="setFeedbackStatus('${f.key}',this.value)" style="background:${statusColor}22;border:1px solid ${statusColor};color:${statusColor};border-radius:6px;padding:2px 6px;font-size:11px;font-weight:700;">
            <option value="New" ${f.status==='New'?'selected':''}>🔵 New</option>
            <option value="Seen" ${f.status==='Seen'?'selected':''}>🟡 Seen</option>
            <option value="Resolved" ${f.status==='Resolved'?'selected':''}>🟢 Resolved</option>
          </select>
          <button onclick="deleteFeedback('${f.key}')" title="Delete this feedback" style="background:#e85d3822;border:1px solid #e85d38;color:#e85d38;border-radius:6px;padding:3px 7px;font-size:12px;cursor:pointer;">🗑️</button>
        </div>
      </div>
      <div style="color:var(--muted);margin-bottom:4px;">${FB_CAT_ICON[f.category]||'✏️'} ${escapeHTML(f.category)} &nbsp; 🕒 ${when}</div>
      <div style="white-space:pre-wrap;margin-bottom:8px;">${escapeHTML(f.text)}</div>
      <div style="display:flex;gap:6px;align-items:center;">
        <input type="text" id="fb-reply-${f.key}" value="${escapeHTML(f.reply)}" placeholder="Write a reply the student will see (optional)..." style="flex:1;padding:6px 8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:11px;">
        <button onclick="saveFeedbackReply('${f.key}',this)" style="background:var(--accent);border:none;color:#fff;border-radius:6px;padding:6px 10px;font-size:11px;cursor:pointer;white-space:nowrap;">💾 Save</button>
      </div>
    </div>`;
  }).join('');
}
function setFeedbackStatus(key,status){
  if(!db)return;
  db.ref('medistudy_feedback/'+key).update({status}).then(()=>{
    const f=_allFeedback.find(x=>x.key===key);
    if(f)f.status=status;
    renderFeedbackList();
  }).catch(e=>alert('Could not update status: '+e.message));
}
function deleteFeedback(key){
  if(!db)return;
  if(!confirm('Delete this feedback permanently? This cannot be undone.'))return;
  db.ref('medistudy_feedback/'+key).remove().then(()=>{
    _allFeedback=_allFeedback.filter(x=>x.key!==key);
    renderFeedbackList();
  }).catch(e=>alert('Could not delete: '+e.message));
}
function saveFeedbackReply(key,btn){
  if(!db)return;
  const input=document.getElementById('fb-reply-'+key);
  const reply=input.value.trim();
  db.ref('medistudy_feedback/'+key).update({reply}).then(()=>{
    const f=_allFeedback.find(x=>x.key===key);
    if(f)f.reply=reply;
    const orig=btn.textContent;
    btn.textContent='✅ Saved';
    setTimeout(()=>{btn.textContent=orig;},1500);
  }).catch(e=>alert('Could not save reply: '+e.message));
}



// ═══════════════ ADMIN ROLES (super admin only) ═══════════════
// medistudy_admins/<uid> = { role:'uni', universities:{ <universityId>:true } }
// The Firebase rules read this same table, so a university admin physically cannot write to another university.
let _rolesCache={};
function loadAdminRoles(){
  const el=document.getElementById('admin-roles-list');
  const sel=document.getElementById('role-uni-sel');
  if(!el||!db) return;
  if(sel) sel.innerHTML=universities.map(u=>`<option value="${escapeHTML(u.id)}">${escapeHTML(u.name)} (${escapeHTML(u.id)})</option>`).join('');
  el.innerHTML='Loading...';
  Promise.all([db.ref('medistudy_admins').once('value'), db.ref('users').once('value')]).then(([aSnap,uSnap])=>{
    _rolesCache=aSnap.val()||{};
    const users=uSnap.val()||{};
    const uids=Object.keys(_rolesCache);
    if(!uids.length){ el.innerHTML='<div style="color:var(--muted);font-size:12px;">No university admins yet.</div>'; return; }
    el.innerHTML=uids.map(uid=>{
      const r=_rolesCache[uid]||{};
      const email=(users[uid]&&users[uid].email)||'(email unknown)';
      const unis=Object.keys(r.universities||{}).filter(k=>r.universities[k]===true);
      const chips=unis.map(u=>{
        const nm=(universities.find(x=>x.id===u)||{}).name||u;
        return `<span style="display:inline-flex;align-items:center;gap:6px;background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:2px 4px 2px 10px;font-size:11px;margin:3px 4px 0 0;">${escapeHTML(nm)} <button onclick="revokeUniversityAdmin('${uid}','${u}')" style="background:#e85d38;border:none;color:#fff;border-radius:50%;width:18px;height:18px;font-size:10px;cursor:pointer;">✕</button></span>`;
      }).join('');
      return `<div style="background:var(--card);border:1px solid var(--border);border-radius:9px;padding:9px 11px;margin-bottom:6px;"><div style="font-size:12px;font-weight:700;">${escapeHTML(email)}</div><div style="font-size:10px;color:var(--muted);word-break:break-all;">${escapeHTML(uid)}</div>${chips}</div>`;
    }).join('');
  }).catch(e=>{ el.innerHTML='<span style="color:#e85d38;font-size:12px;">Could not load: '+escapeHTML(e.message)+'</span>'; });
}
async function grantUniversityAdmin(){
  const st=document.getElementById('role-status');
  const who=document.getElementById('role-who-inp').value.trim();
  const uni=document.getElementById('role-uni-sel').value;
  const say=(m,bad)=>{ st.innerHTML=bad?'<span style="color:#e85d38">'+m+'</span>':m; };
  if(adminRole!=='super'){ say('❌ Super admin only.',true); return; }
  if(!who||!uni){ say('Enter their email (or UID) and pick a university.',true); return; }
  try{
    let uid=null;
    if(who.includes('@')){
      const users=(await db.ref('users').once('value')).val()||{};
      const hit=Object.keys(users).filter(k=>(((users[k]||{}).email)||'').toLowerCase()===who.toLowerCase());
      if(hit.length!==1){ say('❌ No single account found for that email. They must sign in to MediStudy once first — or paste their UID instead.',true); return; }
      uid=hit[0];
    } else {
      if(!/^[A-Za-z0-9]{20,40}$/.test(who)){ say('❌ That does not look like a UID.',true); return; }
      uid=who;
    }
    if(uid===SUPER_UID){ say('That is you — you are already super admin.',true); return; }
    const updates={};
    updates['medistudy_admins/'+uid+'/role']='uni';
    updates['medistudy_admins/'+uid+'/universities/'+uni]=true;
    await db.ref().update(updates);
    document.getElementById('role-who-inp').value='';
    say('✅ Done. They can now open the admin panel (with the admin/editor password) and manage '+escapeHTML(uni)+'.');
    loadAdminRoles();
  }catch(e){ say('❌ Failed: '+escapeHTML(e.message),true); }
}
function revokeUniversityAdmin(uid,uniId){
  if(!confirm('Remove admin rights for '+uniId+' from this person?')) return;
  const r=_rolesCache[uid]||{};
  const remaining=Object.keys(r.universities||{}).filter(k=>k!==uniId&&r.universities[k]===true);
  const updates={};
  if(remaining.length) updates['medistudy_admins/'+uid+'/universities/'+uniId]=null;
  else updates['medistudy_admins/'+uid]=null;
  db.ref().update(updates).then(loadAdminRoles).catch(e=>alert('Failed: '+e.message));
}


// ═══════════════ JOIN CODE (per university) ═══════════════
// medistudy_join_codes/<universityId> = the code. Only that university's admins and the super admin can read or change it.
// Students never read it: Firebase itself compares what they type with the stored code when they join.
function randomJoinCode(){
  const A='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I/L — easy to read out and type
  const b=new Uint8Array(8); crypto.getRandomValues(b);
  return Array.from(b).map(x=>A[x%A.length]).join('');
}
function loadJoinCode(){
  const el=document.getElementById('join-code-display');
  if(!el||!db) return;
  const uni=ADMIN_ACTIVE_UNIVERSITY_ID;
  el.textContent='…'; el.dataset.code='';
  db.ref('medistudy_join_codes/'+uni).once('value').then(s=>{
    if(uni!==ADMIN_ACTIVE_UNIVERSITY_ID) return; // admin switched university meanwhile
    const v=s.val();
    el.textContent=v||'No code yet'; el.dataset.code=v||'';
  }).catch(()=>{ el.textContent='—'; });
}
function newJoinCode(){
  const el=document.getElementById('join-code-display');
  const uni=ADMIN_ACTIVE_UNIVERSITY_ID;
  const name=(universities.find(u=>u.id===uni)||{}).name||uni;
  if(!confirm('Make a new join code for '+name+'?\n\nThe old code stops working for NEW students. Students who already joined stay joined.')) return;
  const code=randomJoinCode();
  adminTrack(db.ref('medistudy_join_codes/'+uni).set(code),'New join code saved').then(ok=>{
    if(!ok){ alert('❌ The new code was NOT saved. The old code is still active.'); return; }
    if(uni===ADMIN_ACTIVE_UNIVERSITY_ID && el){ el.textContent=code; el.dataset.code=code; }
  });
}
function copyJoinCode(){
  const el=document.getElementById('join-code-display');
  const code=el&&el.dataset.code;
  if(!code){ alert('No code yet — tap "New code" first.'); return; }
  if(navigator.clipboard&&navigator.clipboard.writeText) navigator.clipboard.writeText(code).then(()=>adminToast('📋 Copied: '+code,'ok',2000)).catch(()=>prompt('Copy this code:',code));
  else prompt('Copy this code:',code);
}


// ═══════════════ ONE-TIME TOOLS (super admin only) ═══════════════
// Fill every university's student directory from the existing accounts, so the Students tab and Dashboard are
// complete straight away instead of filling in as students open the updated app.
async function backfillDirectory(){
  const st=document.getElementById('fb-dir-status');
  const say=(m,bad)=>{ st.innerHTML=bad?'<span style="color:#e85d38">'+m+'</span>':m; };
  if(adminRole!=='super'){ say('❌ Super admin only.',true); return; }
  if(!fbConnected||!db){ say('❌ Not connected to Firebase.',true); return; }
  if(!confirm('Fill the student directory from existing accounts?\n\nAccounts that have not joined another university count as Ulyanovsk. Safe to re-run.')) return;
  say('⏳ Reading accounts...');
  try{
    const reads=await Promise.all([db.ref('users').once('value')].concat(universities.map(u=>db.ref('medistudy_members/'+u.id).once('value'))));
    const users=reads[0].val()||{};
    const memberOf={};
    universities.forEach((u,i)=>{ Object.keys(reads[i+1].val()||{}).forEach(uid=>{ if(!memberOf[uid]) memberOf[uid]=u.id; }); });
    const valid=new Set(universities.map(u=>u.id));
    const updates={}, per={}; let n=0;
    Object.keys(users).forEach(uid=>{
      const u=users[uid]||{}, p=u.profile||{};
      const uni=memberOf[uid]||(valid.has(p.university)?p.university:DEFAULT_UNIVERSITY_ID);
      updates['medistudy_directory/'+uni+'/'+uid]={name:p.name||'(no name set)', course:p.course||'', lastLogin:u.lastLogin||0};
      per[uni]=(per[uni]||0)+1; n++;
    });
    if(!n){ say('✅ No accounts found — nothing to fill.'); return; }
    const keys=Object.keys(updates);
    for(let i=0;i<keys.length;i+=400){
      say('⏳ Writing '+Math.min(i+400,keys.length)+' of '+keys.length+'...');
      const chunk={}; keys.slice(i,i+400).forEach(k=>{ chunk[k]=updates[k]; });
      await db.ref().update(chunk);
    }
    say('✅ Directory filled: '+Object.keys(per).map(k=>escapeHTML(uniDisplayName(k))+' '+per[k]).join(', ')+'.');
  }catch(e){ say('❌ Failed: '+escapeHTML(e.message),true); }
}
// Feedback is now kept per university. Old feedback has no university tag, so tag it as Ulyanovsk.
async function tagOldFeedback(){
  const st=document.getElementById('fb-tagfb-status');
  const say=(m,bad)=>{ st.innerHTML=bad?'<span style="color:#e85d38">'+m+'</span>':m; };
  if(adminRole!=='super'){ say('❌ Super admin only.',true); return; }
  if(!fbConnected||!db){ say('❌ Not connected to Firebase.',true); return; }
  if(!confirm('Tag all feedback that has no university as Ulyanovsk?')) return;
  say('⏳ Reading feedback...');
  try{
    const d=(await db.ref('medistudy_feedback').once('value')).val()||{};
    const updates={}; let n=0;
    Object.keys(d).forEach(k=>{ if(d[k] && typeof d[k]==='object' && d[k].universityId===undefined){ updates['medistudy_feedback/'+k+'/universityId']=DEFAULT_UNIVERSITY_ID; n++; } });
    if(!n){ say('✅ Nothing to tag — all feedback already has a university.'); return; }
    await db.ref().update(updates);
    say('✅ Tagged '+n+' feedback entr'+(n===1?'y':'ies')+' as Ulyanovsk.');
  }catch(e){ say('❌ Failed: '+escapeHTML(e.message),true); }
}

// ═══════════════ ADMIN ═══════════════
function openAdmin(){
  document.getElementById('admin-modal').classList.add('open');
  if(adminUnlocked)showPanel();
  else{document.getElementById('admin-login').style.display='block';document.getElementById('admin-panel').style.display='none';document.getElementById('admin-pw').value='';document.getElementById('login-err').style.display='none';}
}
function closeAdmin(){document.getElementById('admin-modal').classList.remove('open');}
function checkPw(){
  const input=document.getElementById('admin-pw').value;
  // Hash the input and compare
  const msgBuffer=new TextEncoder().encode(input);
  crypto.subtle.digest('SHA-256',msgBuffer).then(hashBuffer=>{
    const hashArray=Array.from(new Uint8Array(hashBuffer));
    const hashHex=hashArray.map(b=>b.toString(16).padStart(2,'0')).join('');
    if(hashHex===PASS_HASH){adminUnlocked=true;adminRole='admin';showPanel();}
    else if(hashHex===SPONSOR_HASH){adminUnlocked=true;adminRole='sponsor';showPanel();}
    else if(hashHex===EDITOR_HASH){adminUnlocked=true;adminRole='editor';showPanel();}
    else document.getElementById('login-err').style.display='block';
  });
}
function showPanel(){
  document.getElementById('admin-login').style.display='none';
  document.getElementById('admin-panel').style.display='block';
  document.getElementById('admin-signedin-warning').style.display = currentUser ? 'none' : 'block';
  if(adminRole==='sponsor'){
    // Limited view: only Announcements + Student Essentials, nothing else
    document.querySelectorAll('.atab').forEach(t=>t.style.display='none');
    document.getElementById('atab-announce').style.display='';
    document.getElementById('atab-essentials').style.display='';
    switchATab('announce', document.getElementById('atab-announce'));
    return;
  }
  if(adminRole==='editor'){
    // Limited view: Structure, Notes, Videos, Manage, MCQ only — no Announce/Essentials/Students/Firebase
    document.querySelectorAll('.atab').forEach(t=>t.style.display='none');
    ['atab-structure','atab-notes','atab-videos','atab-manage','atab-mcq'].forEach(id=>{document.getElementById(id).style.display='';});
    populateAllSelects();renderAdminCourses();renderAdminSubjects();updateFolderCourseSubject();
    switchATab('structure', document.getElementById('atab-structure'));
    return;
  }
  document.querySelectorAll('.atab').forEach(t=>t.style.display='');
  populateAllSelects();renderAdminCourses();renderAdminSubjects();updateFolderCourseSubject();updateFBStatus();
  if(fbConfig){
    document.getElementById('fb-api-key').value=fbConfig.apiKey||'';
    document.getElementById('fb-db-url').value=fbConfig.databaseURL||'';
    document.getElementById('fb-project-id').value=fbConfig.projectId||'';
  }
  const savedGK=localStorage.getItem('ms4_groq_key');
  if(savedGK){document.getElementById('gemini-key-input').value=savedGK;document.getElementById('gemini-key-status').innerHTML='<span style="color:var(--green)">✅ Groq key active — AI Tutor working!</span>';}
  else{document.getElementById('gemini-key-input').value='';document.getElementById('gemini-key-status').innerHTML='<span style="color:var(--green)">✅ Secure Worker active — AI Tutor working!</span>';}
}
function switchATab(tab,el){
  document.querySelectorAll('.atab').forEach(t=>t.classList.remove('active'));
  document.querySelectorAll('.aform').forEach(f=>f.classList.remove('active'));
  el.classList.add('active');document.getElementById('aform-'+tab).classList.add('active');
  if(tab==='manage')renderManage();
  if(tab==='dashboard')loadDashboard();
  if(tab==='notes'){updateNoteSubjects();updateNoteFolders();}
  if(tab==='videos')updateVidSubjects();
  if(tab==='firebase')updateFBStatus();
  if(tab==='announce')loadAdminAnnouncements();
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
function addCourse(){const inp=document.getElementById('new-course-name'),n=inp.value.trim();if(!n)return;courses.push({id:uid(),name:n});saveLocal();inp.value='';renderAdminCourses();populateAllSelects();flashSuccess('struct-success');}
function renameCourse(id){const co=courses.find(c=>c.id===id);if(!co)return;const n=prompt('Rename:',co.name);if(n&&n.trim()){co.name=n.trim();saveLocal();renderAdminCourses();populateAllSelects();}}
function deleteCourse(id){
  if(!confirm('Delete course and ALL its data?'))return;
  courses=courses.filter(c=>c.id!==id);subjects=subjects.filter(s=>s.courseId!==id);folders=folders.filter(f=>f.courseId!==id);notes=notes.filter(n=>n.courseId!==id);videos=videos.filter(v=>v.courseId!==id);
  saveLocal();renderAdminCourses();populateAllSelects();
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
  subjects.push({id:uid(),courseId,name:n});saveLocal();inp.value='';renderAdminSubjects();populateAllSelects();updateFolderCourseSubject();flashSuccess('struct-success');
}
function renameSubject(id){const s=subjects.find(x=>x.id===id);if(!s)return;const n=prompt('Rename:',s.name);if(n&&n.trim()){s.name=n.trim();saveLocal();renderAdminSubjects();populateAllSelects();updateFolderCourseSubject();}}
function deleteSubject(id){
  if(!confirm('Delete subject and all its folders, notes, videos?'))return;
  subjects=subjects.filter(s=>s.id!==id);folders=folders.filter(f=>f.subjectId!==id);notes=notes.filter(n=>n.subjectId!==id);videos=videos.filter(v=>v.subjectId!==id);
  saveLocal();renderAdminSubjects();populateAllSelects();updateFolderCourseSubject();
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
  el.innerHTML=fols.length?fols.map(f=>`<div class="struct-item"><span class="struct-name">📁 ${f.name}</span><div class="struct-actions"><button class="edit-btn" onclick="renameFolder('${f.id}')">✏️</button><button class="del-btn" onclick="deleteFolder('${f.id}')">Del</button></div></div>`).join(''):'<div style="font-size:12px;color:var(--muted);margin-bottom:6px">No folders yet.</div>';
}
function addFolder(){
  const subjectId=document.getElementById('struct-fsubject').value,courseId=document.getElementById('struct-fcourse').value;
  if(!subjectId){alert('Select a subject first!');return;}
  const inp=document.getElementById('new-folder-name'),n=inp.value.trim();if(!n)return;
  folders.push({id:uid(),subjectId,courseId,name:n});saveLocal();inp.value='';renderAdminFolders();updateNoteFolders();flashSuccess('struct-success');
}
function renameFolder(id){const f=folders.find(x=>x.id===id);if(!f)return;const n=prompt('Rename:',f.name);if(n&&n.trim()){f.name=n.trim();saveLocal();renderAdminFolders();updateNoteFolders();}}
function deleteFolder(id){
  if(!confirm('Delete folder and all notes inside?'))return;
  folders=folders.filter(f=>f.id!==id);notes=notes.filter(n=>n.folderId!==id);
  saveLocal();renderAdminFolders();updateNoteFolders();
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
    // UPDATE existing note in place — keeps same id, so likes/bookmarks aren't lost
    const n=notes.find(x=>x.id===editingNoteId);
    if(n){ n.courseId=cId; n.subjectId=sId; n.folderId=fId; n.topic=topic; n.desc=desc; n.link=link; }
    saveLocal();
    cancelEditNote();
    flashSuccess('note-success');
    renderManage();
    return;
  }

  notes.push({id:uid(),courseId:cId,subjectId:sId,folderId:fId,topic,desc,link});saveLocal();
  ['note-topic','note-desc','note-link'].forEach(id=>document.getElementById(id).value='');
  flashSuccess('note-success');
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
    if(v){ v.courseId=cId; v.subjectId=sId; v.title=title; v.desc=desc; v.link=link; }
    saveLocal();
    cancelEditVideo();
    flashSuccess('vid-success');
    renderManage();
    return;
  }

  videos.push({id:uid(),courseId:cId,subjectId:sId,title,desc,link});saveLocal();
  ['vid-title','vid-desc','vid-link'].forEach(id=>document.getElementById(id).value='');
  flashSuccess('vid-success');
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
        const items=[...fo.items].sort((a,b)=>a.topic.localeCompare(b.topic));
        html+=`<details class="mt-folder"><summary>📁 ${escapeHTML(fo.name)} <span class="mt-count">(${items.length})</span></summary><div style="padding-left:14px;padding-top:4px;">`;
        items.forEach(n=>{
          html+=`<div class="manage-item" style="margin-bottom:6px;"><div><div class="mi-title">${escapeHTML(n.topic)}</div></div><div style="display:flex;gap:6px;"><button class="edit-btn" onclick="editNote('${n.id}')">✏️ Edit</button><button class="del-btn" onclick="delNote('${n.id}')">Delete</button></div></div>`;
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
function delNote(id){if(!confirm('Delete?'))return;notes=notes.filter(n=>n.id!==id);saveLocal();renderManage();}
function delVideo(id){if(!confirm('Delete?'))return;videos=videos.filter(v=>v.id!==id);saveLocal();renderManage();}

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

document.getElementById('admin-modal').addEventListener('click',function(e){if(e.target===this)closeAdmin();});

function postAnnouncement(){
  if(!db){alert('Firebase not connected.');return;}
  const title=document.getElementById('ann-title').value.trim();
  const msg=document.getElementById('ann-msg').value.trim();
  const type=document.getElementById('ann-type').value;
  const days=parseInt(document.getElementById('ann-expiry').value)||3;
  if(!title||!msg){alert('Fill in title and message.');return;}
  const expiry=Date.now()+(days*24*60*60*1000);
  const id='ann_'+Date.now();
  db.ref('medistudy_announcements/'+id).set({id,title,msg,type,expiry,ts:Date.now()})
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
      const expired=a.expiry<now;
      const col=ANN_COLORS[a.type]||ANN_COLORS.info;
      html+=`<div style="background:${col.bg};border:1px solid ${col.border};border-radius:8px;padding:10px;margin-bottom:8px;position:relative;">
        <div style="font-weight:700;font-size:12px;color:${col.color};">${escapeHTML(a.title)} ${expired?'<span style="color:#e85d38;">[EXPIRED]</span>':''}</div>
        <div style="font-size:11px;color:var(--muted);margin-top:2px;">${escapeHTML(a.msg)}</div>
        <div style="font-size:10px;color:var(--muted);margin-top:4px;">Expires: ${new Date(a.expiry).toLocaleDateString()}</div>
        <button onclick="deleteAnnouncement('${a.id}')" style="position:absolute;top:8px;right:8px;background:#e85d38;border:none;border-radius:5px;color:#fff;font-size:10px;padding:2px 7px;cursor:pointer;">Delete</button>
      </div>`;
    });
    el.innerHTML=html||'<div style="color:var(--muted);font-size:12px;">No announcements.</div>';
  });
}

function deleteAnnouncement(id){
  if(!db||!id)return;
  db.ref('medistudy_announcements/'+id).remove().then(()=>loadAdminAnnouncements());
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
  db.ref('medistudy_mcq/'+id).set({id,subject,subjectId,courseId,qs:_manualQs,ts:Date.now(),count:_manualQs.length})
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
  db.ref('medistudy_mcq/'+id).set({id,subject,subjectId,courseId,qs,ts:Date.now(),count:qs.length})
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
  db.ref('medistudy_mcq/'+id).remove().then(()=>loadAdminMCQSets());
}

// ═══════════════ ADMIN: STUDENTS LIST ═══════════════
let _allStudents=[];
function loadStudentsList(){
  const listEl=document.getElementById('students-list');
  const sumEl=document.getElementById('students-summary');
  if(!db||!fbConnected){ listEl.innerHTML='<div style="color:var(--muted);font-size:12px;">Connect Firebase first.</div>'; return; }
  sumEl.textContent='Loading...';
  listEl.innerHTML='';
  Promise.all([
    db.ref('users').once('value'),
    db.ref('medistudy_hours_lb').once('value')
  ]).then(([usersSnap,hoursSnap])=>{
    const data=usersSnap.val()||{};
    const hoursData=hoursSnap.val()||{};
    _totalStudyHours=Object.values(hoursData).reduce((sum,h)=>sum+(h.totalHours||0),0);
    _allStudents=Object.keys(data).map(uid=>{
      const u=data[uid]||{};
      const p=u.profile||{};
      return {
        uid,
        name: p.name||'(no name set)',
        email: u.email||'—',
        course: p.course||'—',
        gender: p.gender||'—',
        age: p.age||'—',
        lastLogin: u.lastLogin||0,
        totalHours: (hoursData[uid]&&hoursData[uid].totalHours)||0
      };
    }).sort((a,b)=>b.lastLogin-a.lastLogin);
    renderStudentsList();
  },err=>{
    sumEl.textContent='';
    listEl.innerHTML='<div style="color:#e85d38;font-size:12px;">⚠️ Could not load students. If this is a permissions error, your Firebase rules need to allow your admin account to read the "users" node.</div>';
    console.error(err);
  });
}
let _totalStudyHours=0;
function renderStudentsList(){
  const listEl=document.getElementById('students-list');
  const sumEl=document.getElementById('students-summary');
  const todayOnly=document.getElementById('students-today-only').checked;
  const startOfToday=new Date(); startOfToday.setHours(0,0,0,0);
  const todayTs=startOfToday.getTime();
  const rows=todayOnly?_allStudents.filter(s=>s.lastLogin>=todayTs):_allStudents;
  const totalDays=(_totalStudyHours/24).toFixed(1);
  sumEl.innerHTML=`${rows.length} of ${_allStudents.length} total registered students`+(todayOnly?' (logged in today)':'')+
    `<br><strong style="color:var(--text);">⏱ Total time spent in app (all students combined): ${_totalStudyHours.toFixed(1)}h (~${totalDays} days)</strong>`;
  if(!rows.length){ listEl.innerHTML='<div style="color:var(--muted);font-size:12px;">No students found.</div>'; return; }
  listEl.innerHTML=rows.map(s=>{
    const when=s.lastLogin?new Date(s.lastLogin).toLocaleString():'never';
    return `<div style="background:var(--card);border:1px solid var(--border);border-radius:10px;padding:10px 12px;margin-bottom:8px;font-size:12px;">
      <div style="font-weight:700;margin-bottom:2px;">${escapeHTML(s.name)}</div>
      <div style="color:var(--muted);">✉️ ${escapeHTML(s.email)}</div>
      <div style="color:var(--muted);">🎓 ${escapeHTML(s.course)} &nbsp; ⚧ ${escapeHTML(s.gender)} &nbsp; 🎂 ${escapeHTML(String(s.age))}</div>
      <div style="color:var(--muted);">🕒 Last login: ${when} &nbsp; ⏱ ${s.totalHours.toFixed(1)}h logged</div>
    </div>`;
  }).join('');
}

// ═══════════════ ADMIN: DASHBOARD ═══════════════
function loadDashboard(){
  const cardsEl=document.getElementById('dash-summary-cards');
  const likedEl=document.getElementById('dash-top-liked');
  if(!db||!fbConnected){ cardsEl.innerHTML='<div style="color:var(--muted);font-size:12px;">Connect Firebase first.</div>'; return; }
  cardsEl.innerHTML='<div style="color:var(--muted);font-size:12px;">Loading...</div>';
  likedEl.innerHTML='';

  Promise.all([
    db.ref('users').once('value'),
    db.ref('medistudy_hours_lb').once('value'),
    db.ref('medistudy_feedback').orderByChild('timestamp').limitToLast(50).once('value'),
    db.ref('medistudy_likes').once('value')
  ]).then(([usersSnap,hoursSnap,fbSnap,likesSnap])=>{
    // Students summary
    const usersData=usersSnap.val()||{};
    const hoursData=hoursSnap.val()||{};
    const totalStudents=Object.keys(usersData).length;
    const totalHours=Object.values(hoursData).reduce((s,h)=>s+(h.totalHours||0),0);

    // New feedback count
    const fbData=fbSnap.val()||{};
    const newCount=Object.values(fbData).filter(f=>(f.status||'New')==='New').length;

    // Notes/Videos totals (already in-memory)
    const noteCount=notes.length, vidCount=videos.length;

    cardsEl.innerHTML=`
      <div style="background:var(--card);border:1px solid var(--border);border-radius:10px;padding:12px 14px;">
        <div style="font-size:12px;color:var(--muted);">👥 Students</div>
        <div style="font-size:18px;font-weight:800;">${totalStudents} <span style="font-size:12px;font-weight:400;color:var(--muted);">registered</span></div>
        <div style="font-size:12px;color:var(--muted);margin-top:2px;">⏱ ${totalHours.toFixed(1)}h combined time in app</div>
      </div>
      <div style="background:var(--card);border:1px solid var(--border);border-radius:10px;padding:12px 14px;">
        <div style="font-size:12px;color:var(--muted);">💬 Feedback</div>
        <div style="font-size:18px;font-weight:800;color:${newCount>0?'#3b82f6':'var(--text)'};">${newCount} <span style="font-size:12px;font-weight:400;color:var(--muted);">🔵 New (unreviewed)</span></div>
      </div>
      <div style="background:var(--card);border:1px solid var(--border);border-radius:10px;padding:12px 14px;">
        <div style="font-size:12px;color:var(--muted);">📚 Content</div>
        <div style="font-size:18px;font-weight:800;">${noteCount} <span style="font-size:12px;font-weight:400;color:var(--muted);">notes</span> &nbsp; ${vidCount} <span style="font-size:12px;font-weight:400;color:var(--muted);">videos</span></div>
      </div>
    `;

    // Top liked notes
    const likesData=likesSnap.val()||{};
    const likeCounts=Object.keys(likesData).map(noteId=>({
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
    cardsEl.innerHTML='<div style="color:#e85d38;font-size:12px;">⚠️ Could not load dashboard data.</div>';
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
  db.ref('medistudy_feedback').orderByChild('timestamp').limitToLast(50).once('value',snap=>{
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
  sumEl.textContent=`${rows.length} of ${_allFeedback.length} loaded (newest 50) · ${newCount} New · avg rating ${avgRating}★`;
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


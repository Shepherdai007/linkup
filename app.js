// ══════════════════════════════════════════════════════
//  LINKUP CHAT v3 — Production JS
//  Firebase Compat · No modules · Works from file://
// ══════════════════════════════════════════════════════════

/* ── INTRO: guaranteed timer, independent of Firebase ── */
setTimeout(function() {
  var el = document.getElementById('intro');
  el.classList.add('out');
  setTimeout(function() {
    el.style.display = 'none';
    document.getElementById('auth').classList.remove('hidden');
  }, 950);
}, 3200);

/* ─────────────────────────────────────────────
   FIREBASE INIT
───────────────────────────────────────────── */
firebase.initializeApp({
  apiKey:            "AIzaSyB2onIwFeuDxo5ILqx0DvVgaGXo0yLRfAg",
  authDomain:        "linkup-chat-8b593.firebaseapp.com",
  projectId:         "linkup-chat-8b593",
  storageBucket:     "linkup-chat-8b593.firebasestorage.app",
  messagingSenderId: "787859584741",
  appId:             "1:787859584741:web:a8e74686d6ceddc431860c"
});
var auth    = firebase.auth();
var db      = firebase.firestore();
var storage = firebase.storage();

/* ─────────────────────────────────────────────
   AUDIO ENGINE
───────────────────────────────────────────── */
var AC = null;
function getAC() { if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)(); return AC; }
function playIntro() {
  try {
    var c = getAC();
    [[440,0,.06],[554,.13,.05],[659,.26,.06],[880,.42,.05],[1047,.6,.07]].forEach(function(x) {
      var o = c.createOscillator(), g = c.createGain();
      o.connect(g); g.connect(c.destination); o.type='sine'; o.frequency.value=x[0];
      var s = c.currentTime + x[1];
      g.gain.setValueAtTime(0,s); g.gain.linearRampToValueAtTime(x[2],s+.04); g.gain.exponentialRampToValueAtTime(.001,s+.5);
      o.start(s); o.stop(s+.55);
    });
  } catch(e) {}
}
function playSend() {
  try {
    var c = getAC(), o = c.createOscillator(), g = c.createGain();
    o.connect(g); g.connect(c.destination); o.type='sine'; o.frequency.value=1047;
    var t = c.currentTime;
    g.gain.setValueAtTime(.07,t); g.gain.exponentialRampToValueAtTime(.001,t+.15);
    o.start(t); o.stop(t+.18);
  } catch(e) {}
}
var _sndDone = false;
document.addEventListener('click', function() {
  if (!_sndDone) { _sndDone = true; try { getAC(); } catch(e) {} }
});

/* ─────────────────────────────────────────────
   STATE
───────────────────────────────────────────── */
var ME      = null;   // current user object
var PARTNER = null;   // { id, username, email, online }
var CID     = null;   // chat document id

// Listeners — stored so we can unsub
var _mUnsub  = null;  // messages listener
var _uUnsub  = null;  // users listener
var _ptUnsub = null;  // partner typing listener

// In-memory user cache
var _userCache  = {};  // uid → user data
var _allUsers   = [];  // ordered user array
var _firstUsers = true;

// Message dedup
var _knownMsgIds = {};

// Typing debounce
var _typDebounce = null;
var _typActive   = false;

// Auto-scroll: only scroll if user is near bottom
function _nearBottom() {
  var a = document.getElementById('msgsArea');
  if (!a) return true;
  return (a.scrollHeight - a.scrollTop - a.clientHeight) < 120;
}
function scrollB(force) {
  var a = document.getElementById('msgsArea');
  if (!a) return;
  if (force || _nearBottom()) {
    setTimeout(function() { a.scrollTop = a.scrollHeight; }, 40);
  }
}

/* ─────────────────────────────────────────────
   AUTH STATE
───────────────────────────────────────────── */
firebase.auth().onAuthStateChanged(function(u) {
  if (u) {
    ME = u;
    db.collection('users').doc(u.uid).get()
      .then(function(s) {
        ME.un = s.exists ? s.data().username : (u.email ? u.email.split('@')[0] : 'User');
        showApp(); goOnline(true); startU();
      })
      .catch(function() {
        ME.un = u.email ? u.email.split('@')[0] : 'User';
        showApp(); goOnline(true); startU();
      });
  } else {
    ME = null;
    showAuth();
    cleanupListeners();
  }
});

function showApp() {
  document.getElementById('auth').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  document.getElementById('tbUser').textContent = ME.un || ME.email || 'User';
}
function showAuth() {
  document.getElementById('app').classList.add('hidden');
  document.getElementById('auth').classList.remove('hidden');
}
function cleanupListeners() {
  if (_mUnsub)  { _mUnsub();  _mUnsub  = null; }
  if (_uUnsub)  { _uUnsub();  _uUnsub  = null; }
  if (_ptUnsub) { _ptUnsub(); _ptUnsub = null; }
  _knownMsgIds = {};
}

/* ─────────────────────────────────────────────
   TAB SWITCHER
───────────────────────────────────────────── */
function switchTab(t) {
  document.getElementById('tL').classList.toggle('on', t==='l');
  document.getElementById('tS').classList.toggle('on', t==='s');
  document.getElementById('fL').classList.toggle('hidden', t!=='l');
  document.getElementById('fS').classList.toggle('hidden', t!=='s');
  document.getElementById('acSlider').classList.toggle('r', t==='s');
}

/* ─────────────────────────────────────────────
   AUTH — SIGNUP
───────────────────────────────────────────── */
function doSignup() {
  var u=gv('sU'), e=gv('sE'), p=gv('sP');
  var err=document.getElementById('sErr'), btn=document.getElementById('sBtn');
  err.classList.add('hidden');
  if (!u || u.length<3) return se(err,'Username must be 3+ characters.');
  if (!e)              return se(err,'Enter your email.');
  if (p.length<6)      return se(err,'Password needs 6+ characters.');
  load(btn, true);
  firebase.auth().createUserWithEmailAndPassword(e, p)
    .then(function(cr) {
      return db.collection('users').doc(cr.user.uid).set({
        uid: cr.user.uid, username: u, email: e,
        online: true,
        lastSeen:  firebase.firestore.FieldValue.serverTimestamp(),
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    })
    .catch(function(ex) { load(btn, false); console.error('Auth error:', ex.code, ex.message); se(err, fE(ex.code, ex.message)); });
}

/* ─────────────────────────────────────────────
   AUTH — LOGIN
───────────────────────────────────────────── */
function doLogin() {
  var e=gv('lE'), p=gv('lP');
  var err=document.getElementById('lErr'), btn=document.getElementById('lBtn');
  err.classList.add('hidden');
  if (!e) return se(err,'Enter your email.');
  if (!p) return se(err,'Enter your password.');
  load(btn, true);
  firebase.auth().signInWithEmailAndPassword(e, p)
    .catch(function(ex) { load(btn, false); console.error('Auth error:', ex.code, ex.message); se(err, fE(ex.code, ex.message)); });
}

/* ─────────────────────────────────────────────
   AUTH — LOGOUT
───────────────────────────────────────────── */
function doLogout() {
  cleanupListeners();
  cancelRecording();
  closeCamera();
  goOnline(false);
  firebase.auth().signOut();
}

/* ─────────────────────────────────────────────
   ONLINE PRESENCE
   ALL presence writes use .set({merge:true}) — never .update()
   so they never crash on missing docs
───────────────────────────────────────────── */
function goOnline(on) {
  if (!ME) return;
  db.collection('users').doc(ME.uid).set(
    { online: on, lastSeen: firebase.firestore.FieldValue.serverTimestamp() },
    { merge: true }
  ).catch(function(){});
}
window.addEventListener('beforeunload', function() { goOnline(false); });
document.addEventListener('visibilitychange', function() {
  if (ME) goOnline(!document.hidden);
});

/* ─────────────────────────────────────────────
   USER LIST — real-time, no flicker
───────────────────────────────────────────── */
function startU() {
  if (_uUnsub) { _uUnsub(); _uUnsub = null; }
  _uUnsub = db.collection('users').orderBy('username').onSnapshot(function(snap) {
    _allUsers = [];
    snap.forEach(function(d) {
      if (d.id === ME.uid) return;
      var data = Object.assign({ id: d.id }, d.data());
      _allUsers.push(data);
      _userCache[d.id] = data; // cache
    });
    renderU(_allUsers);
    var n = _allUsers.filter(function(u) { return u.online; }).length;
    document.getElementById('sbBadge').textContent = n + ' online';
    if (PARTNER) updHead();
  }, function(err) { console.warn('users snap error', err); });
}

function renderU(arr) {
  var el = document.getElementById('uList');
  var q  = (document.getElementById('srchIn').value || '').toLowerCase();
  var filtered = q ? arr.filter(function(u) {
    return u.username.toLowerCase().includes(q) || (u.email||'').toLowerCase().includes(q);
  }) : arr;
  if (!filtered.length) {
    el.innerHTML = '<div class="ulist-empty">' + (q ? 'No results.' : 'No users yet 👋') + '</div>';
    return;
  }
  // Update existing items in-place where possible to prevent flicker
  var existingIds = {};
  el.querySelectorAll('.uitem').forEach(function(x) { existingIds[x.dataset.uid] = x; });
  var newIds = {};
  filtered.forEach(function(u) { newIds[u.id] = true; });
  // Remove stale items
  Object.keys(existingIds).forEach(function(id) {
    if (!newIds[id]) existingIds[id].remove();
  });
  filtered.forEach(function(u, idx) {
    var existing = existingIds[u.id];
    var html = _buildUserItem(u);
    if (existing) {
      // update status dot and stat text without re-creating
      var dot  = existing.querySelector('.udot');
      var stat = existing.querySelector('.ustat');
      if (dot)  { dot.className  = 'udot' + (u.online ? ' on' : ''); }
      if (stat) { stat.className = 'ustat' + (u.online ? ' on' : ''); stat.textContent = u.online ? '● Online' : '○ Offline'; }
      existing.className = 'uitem' + (PARTNER && PARTNER.id===u.id ? ' act' : '');
    } else {
      var div = document.createElement('div');
      div.innerHTML = html;
      var item = div.firstChild;
      if (idx < el.children.length) {
        el.insertBefore(item, el.children[idx]);
      } else {
        el.appendChild(item);
      }
    }
  });
}
function _buildUserItem(u) {
  return '<div class="uitem' + (PARTNER&&PARTNER.id===u.id?' act':'') + '" data-uid="'+u.id+'"'+
    ' onclick="openChat(\''+u.id+'\',\''+esc(u.username)+'\',\''+esc(u.email||'')+'\','+(!!u.online)+')">' +
    '<div class="uava" style="background:'+ag(u.username)+'">'+u.username[0].toUpperCase()+
    '<span class="udot'+(u.online?' on':'')+'"></span></div>'+
    '<div class="uinfo"><div class="uname">'+esc(u.username)+'</div>'+
    '<div class="ustat'+(u.online?' on':'')+'">'+( u.online?'● Online':'○ Offline')+'</div></div></div>';
}
function filterU() { renderU(_allUsers); }

function updHead() {
  var p = _userCache[PARTNER ? PARTNER.id : null];
  if (!p) return;
  var d=document.getElementById('chDot'), s=document.getElementById('chStxt');
  if (p.online) { d.className='ch-dot on'; s.textContent='Online'; s.className='ch-stxt on'; }
  else          { d.className='ch-dot';    s.textContent='Offline'; s.className='ch-stxt'; }
}

/* ─────────────────────────────────────────────
   OPEN / CLOSE CHAT
───────────────────────────────────────────── */
function openChat(uid, un, email, online) {
  // Cleanup previous chat listeners
  if (_mUnsub)  { _mUnsub();  _mUnsub  = null; }
  if (_ptUnsub) { _ptUnsub(); _ptUnsub = null; }
  _knownMsgIds = {};
  clearTypSt();

  PARTNER = { id: uid, username: un, email: email, online: online };
  CID = [ME.uid, uid].sort().join('_');

  // UI
  document.getElementById('chatEmpty').classList.add('hidden');
  document.getElementById('chatActive').classList.remove('hidden');
  document.getElementById('chName').textContent = un;
  var ava = document.getElementById('chAva');
  ava.textContent = un[0].toUpperCase(); ava.style.background = ag(un);
  setPartnerStatus(online);
  document.querySelectorAll('.uitem').forEach(function(x) { x.classList.remove('act'); });
  var it = document.querySelector('[data-uid="'+uid+'"]'); if (it) it.classList.add('act');
  document.getElementById('sidebar').classList.add('mob-hide');

  // Show loading, clear messages
  document.getElementById('msgsInner').innerHTML = '';
  var ld = document.getElementById('chatLoading');
  ld.classList.remove('hidden');

  listenMsgs(function() {
    // Called once after first snapshot — hide loader
    ld.classList.add('hidden');
  });
  listenTyp();
  setTimeout(function() { document.getElementById('msgInp').focus(); }, 130);
}

function closeChat() {
  if (_mUnsub)  { _mUnsub();  _mUnsub  = null; }
  if (_ptUnsub) { _ptUnsub(); _ptUnsub = null; }
  clearTypSt();
  _knownMsgIds = {};
  PARTNER = null; CID = null;
  document.getElementById('sidebar').classList.remove('mob-hide');
  document.getElementById('chatEmpty').classList.remove('hidden');
  document.getElementById('chatActive').classList.add('hidden');
  document.querySelectorAll('.uitem').forEach(function(x) { x.classList.remove('act'); });
}

function setPartnerStatus(online) {
  var d=document.getElementById('chDot'), s=document.getElementById('chStxt');
  if (online) { d.className='ch-dot on'; s.textContent='Online'; s.className='ch-stxt on'; }
  else        { d.className='ch-dot';   s.textContent='Offline'; s.className='ch-stxt'; }
}

/* ─────────────────────────────────────────────
   MESSAGES — smart append, no duplicate renders
───────────────────────────────────────────── */
function listenMsgs(onFirstLoad) {
  var firstLoad = true;
  _mUnsub = db.collection('chats').doc(CID).collection('messages')
    .orderBy('timestamp', 'asc').limit(50)
    .onSnapshot(function(snap) {
      var inner = document.getElementById('msgsInner');
      if (!inner) return;

      snap.docChanges().forEach(function(change) {
        if (change.type === 'removed') {
          var el = document.getElementById('msg-'+change.doc.id);
          if (el) el.remove();
          return;
        }
        // Skip if already rendered (covers 'modified' for presence noise)
        if (_knownMsgIds[change.doc.id] && change.type !== 'modified') return;
        _knownMsgIds[change.doc.id] = true;

        var m  = change.doc.data();
        var dt = (m.timestamp && m.timestamp.toDate) ? m.timestamp.toDate() : new Date();
        var me = m.senderId === ME.uid;

        // Date divider
        var ds = fd(dt);
        var lastPill = inner.querySelector('.dpill:last-of-type');
        if (!lastPill || lastPill.dataset.date !== ds) {
          var pill = document.createElement('div');
          pill.className = 'dpill'; pill.dataset.date = ds;
          pill.innerHTML = '<span>'+ds+'</span>';
          inner.appendChild(pill);
        }

        // Build or update bubble
        var existing = document.getElementById('msg-'+change.doc.id);
        if (existing) return; // already in DOM

        var html = _buildMsgHtml(m);
        var row = document.createElement('div');
        row.className = 'mrow ' + (me ? 'me' : 'them');
        row.id = 'msg-' + change.doc.id;
        row.innerHTML = '<div class="mbubble">'+html+
          '<div class="mtime">'+ft(dt)+(me?'<span class="mcheck">✓✓</span>':'')+'</div></div>';
        inner.appendChild(row);
      });

      if (firstLoad) {
        firstLoad = false;
        scrollB(true);
        if (onFirstLoad) onFirstLoad();
      } else {
        scrollB(false);
      }
    }, function(err) { console.warn('messages snap error', err); });
}

function _buildMsgHtml(m) {
  if (m.type === 'image') {
    return '<img src="'+m.fileUrl+'" alt="image" onclick="window.open(this.src,\'_blank\')" loading="lazy"/>';
  } else if (m.type === 'audio') {
    return '<audio controls src="'+m.fileUrl+'"></audio>';
  } else if (m.type === 'file') {
    return '<a class="file-link" href="'+m.fileUrl+'" target="_blank" rel="noopener">'+
           '<span class="file-icon">📄</span>'+
           '<span class="file-name">'+esc(m.fileName||'File')+'</span></a>';
  } else {
    return esc(m.text || '');
  }
}

/* ─────────────────────────────────────────────
   SEND TEXT MESSAGE
───────────────────────────────────────────── */
function sendMsg() {
  var inp = document.getElementById('msgInp');
  var txt = inp.value.trim();
  if (!txt || !CID || !ME || !PARTNER) return;
  inp.value = '';
  clearTypSt();
  // Vibrate on mobile
  if (navigator.vibrate) navigator.vibrate(30);

  db.collection('chats').doc(CID).set({
    participants: [ME.uid, PARTNER.id],
    lastMessage:  txt,
    updatedAt:    firebase.firestore.FieldValue.serverTimestamp()
  }, { merge: true })
  .then(function() {
    return db.collection('chats').doc(CID).collection('messages').add({
      type:       'text',
      text:       txt,
      senderId:   ME.uid,
      senderName: ME.un,
      timestamp:  firebase.firestore.FieldValue.serverTimestamp()
    });
  })
  .then(function() { playSend(); })
  .catch(function() { toast('Send failed. Check connection.', 'err'); });
}
function onKey(e) { if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); } }

/* ─────────────────────────────────────────────
   TYPING INDICATOR — debounced, no spam
───────────────────────────────────────────── */
function onTyp() {
  if (!CID || !ME) return;
  if (!_typActive) {
    _typActive = true;
    _writeTyping(true);
  }
  clearTimeout(_typDebounce);
  _typDebounce = setTimeout(clearTypSt, 2000);
}
function clearTypSt() {
  if (!_typActive) return;
  _typActive = false;
  clearTimeout(_typDebounce);
  _writeTyping(false);
}
function _writeTyping(val) {
  if (!CID || !ME) return;
  var upd = {}; upd['typ_'+ME.uid] = val;
  db.collection('chats').doc(CID).set(upd, { merge: true }).catch(function(){});
}
function listenTyp() {
  if (_ptUnsub) { _ptUnsub(); _ptUnsub = null; }
  _ptUnsub = db.collection('chats').doc(CID).onSnapshot(function(snap) {
    if (!snap.exists || !PARTNER) return;
    var data = snap.data() || {};
    var is   = !!data['typ_'+PARTNER.id];
    document.getElementById('typName').textContent = PARTNER.username;
    document.getElementById('typRow').classList.toggle('hidden', !is);
    if (is) scrollB(false);
  });
}

/* ─────────────────────────────────────────────
   FILE UPLOAD — with 25MB limit, smooth progress, retry
───────────────────────────────────────────── */
var MAX_FILE = 25 * 1024 * 1024; // 25 MB

function pickFile() {
  if (!CID) return toast('Open a chat first.', 'err');
  document.getElementById('fileInp').click();
}

document.getElementById('fileInp').addEventListener('change', function(e) {
  var file = e.target.files[0];
  e.target.value = '';
  if (!file || !CID) return;
  if (file.size > MAX_FILE) {
    return toast('File too large. Max 25 MB.', 'err');
  }
  _uploadFile(file, 0);
});

function _uploadFile(file, attempt) {
  var bar  = document.getElementById('uploadBar');
  var path = 'chat_files/' + CID + '/' + Date.now() + '_' + file.name;
  bar.style.transition = 'transform .15s linear';
  bar.style.transform  = 'scaleX(0.04)';

  var ref  = storage.ref(path);
  var task = ref.put(file);

  task.on('state_changed',
    function(snap) {
      var pct = snap.totalBytes > 0 ? snap.bytesTransferred / snap.totalBytes : 0;
      bar.style.transform = 'scaleX(' + Math.max(pct, 0.04) + ')';
    },
    function(err) {
      bar.style.transform = 'scaleX(0)';
      if (attempt < 2) {
        toast('Upload failed, retrying…', 'info');
        setTimeout(function() { _uploadFile(file, attempt+1); }, 1500);
      } else {
        toast('Upload failed after 3 attempts.', 'err');
      }
    },
    function() {
      ref.getDownloadURL().then(function(url) {
        bar.style.transition = 'transform .4s var(--ease)';
        bar.style.transform  = 'scaleX(1)';
        setTimeout(function() { bar.style.transform = 'scaleX(0)'; }, 400);
        var msgType = file.type.startsWith('image') ? 'image' : 'file';
        return db.collection('chats').doc(CID).collection('messages').add({
          type:       msgType,
          fileName:   file.name,
          fileUrl:    url,
          senderId:   ME.uid,
          senderName: ME.un,
          timestamp:  firebase.firestore.FieldValue.serverTimestamp()
        });
      })
      .then(function() { playSend(); if (navigator.vibrate) navigator.vibrate(30); })
      .catch(function() { toast('Message send failed.', 'err'); });
    }
  );
}

/* ─────────────────────────────────────────────
   VOICE RECORDING — timer, cancel, improved UX
───────────────────────────────────────────── */
var _mediaRec    = null;
var _audioChunks = [];
var _isRec       = false;
var _recStream   = null;
var _recTimerInt = null;
var _recSecs     = 0;

function toggleRecording() {
  if (_isRec) { stopRecording(true); } else { startRecording(); }
}

function startRecording() {
  if (!CID) return toast('Open a chat first.', 'err');
  if (_isRec) return;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia)
    return toast('Microphone not supported on this device.', 'err');

  navigator.mediaDevices.getUserMedia({ audio: true }).then(function(stream) {
    _recStream   = stream;
    _isRec       = true;
    _audioChunks = [];
    _recSecs     = 0;

    document.getElementById('recBtn').classList.add('recording');
    document.getElementById('recStatus').classList.add('show');
    _updateRecTimer();
    _recTimerInt = setInterval(function() {
      _recSecs++;
      _updateRecTimer();
      if (_recSecs >= 60) stopRecording(true); // auto-stop at 60s
    }, 1000);

    _mediaRec = new MediaRecorder(stream);
    _mediaRec.ondataavailable = function(e) { if (e.data.size > 0) _audioChunks.push(e.data); };
    _mediaRec.onstop = function() {
      clearInterval(_recTimerInt);
      _recStream.getTracks().forEach(function(t) { t.stop(); });
      document.getElementById('recBtn').classList.remove('recording');
      document.getElementById('recStatus').classList.remove('show');
      _isRec = false;

      if (!_audioChunks.length) return;
      var blob = new Blob(_audioChunks, { type: 'audio/webm' });
      var ref  = storage.ref('chat_audio/' + CID + '/' + Date.now() + '.webm');
      ref.put(blob)
        .then(function() { return ref.getDownloadURL(); })
        .then(function(url) {
          return db.collection('chats').doc(CID).collection('messages').add({
            type: 'audio', fileUrl: url,
            senderId: ME.uid, senderName: ME.un,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
          });
        })
        .then(function() { playSend(); if (navigator.vibrate) navigator.vibrate(30); })
        .catch(function() { toast('Voice send failed.', 'err'); });
    };
    _mediaRec.start(250); // collect data every 250ms
  }).catch(function() { toast('Microphone access denied.', 'err'); });
}

function stopRecording(send) {
  if (!_isRec || !_mediaRec) return;
  if (!send) {
    // Cancel: discard chunks before stop fires
    _mediaRec.ondataavailable = function() {};
    _mediaRec.onstop = function() {
      clearInterval(_recTimerInt);
      if (_recStream) _recStream.getTracks().forEach(function(t) { t.stop(); });
      _isRec = false;
      document.getElementById('recBtn').classList.remove('recording');
      document.getElementById('recStatus').classList.remove('show');
    };
  }
  _mediaRec.stop();
}

function cancelRecording() { stopRecording(false); }

function _updateRecTimer() {
  var m = Math.floor(_recSecs / 60);
  var s = _recSecs % 60;
  document.getElementById('recTimer').textContent =
    (m < 10 ? '0'+m : m) + ':' + (s < 10 ? '0'+s : s);
}

/* ─────────────────────────────────────────────
   CAMERA
───────────────────────────────────────────── */
var _camStream  = null;
var _snapBlob   = null;

function openCamera() {
  if (!CID) return toast('Open a chat first.', 'err');
  if (!navigator.mediaDevices) return toast('Camera not supported.', 'err');

  document.getElementById('camModal').classList.remove('hidden');
  document.getElementById('camPreview').classList.remove('snapped');
  document.getElementById('camRetake').classList.add('hidden');
  document.getElementById('camSend').classList.add('hidden');
  document.querySelector('.cam-snap').classList.remove('hidden');
  _snapBlob = null;

  navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
    .then(function(stream) {
      _camStream = stream;
      var vid = document.getElementById('camVideo');
      vid.srcObject = stream;
      vid.play();
    })
    .catch(function() {
      closeCamera();
      toast('Camera access denied.', 'err');
    });
}

function closeCamera() {
  document.getElementById('camModal').classList.add('hidden');
  if (_camStream) {
    _camStream.getTracks().forEach(function(t) { t.stop(); });
    _camStream = null;
  }
  var vid = document.getElementById('camVideo');
  vid.srcObject = null;
  _snapBlob = null;
}

function snapPhoto() {
  var vid = document.getElementById('camVideo');
  var can = document.getElementById('camCanvas');
  can.width  = vid.videoWidth  || 640;
  can.height = vid.videoHeight || 480;
  can.getContext('2d').drawImage(vid, 0, 0, can.width, can.height);
  document.getElementById('camPreview').classList.add('snapped');
  document.querySelector('.cam-snap').classList.add('hidden');
  document.getElementById('camRetake').classList.remove('hidden');
  document.getElementById('camSend').classList.remove('hidden');

  can.toBlob(function(blob) { _snapBlob = blob; }, 'image/jpeg', 0.88);
}

function retakePhoto() {
  document.getElementById('camPreview').classList.remove('snapped');
  document.querySelector('.cam-snap').classList.remove('hidden');
  document.getElementById('camRetake').classList.add('hidden');
  document.getElementById('camSend').classList.add('hidden');
  _snapBlob = null;
}

function sendPhoto() {
  if (!_snapBlob || !CID) return;
  closeCamera();
  var blob = _snapBlob; _snapBlob = null;
  var ref  = storage.ref('chat_images/' + CID + '/' + Date.now() + '.jpg');
  var bar  = document.getElementById('uploadBar');
  bar.style.transform = 'scaleX(0.05)';

  var task = ref.put(blob, { contentType: 'image/jpeg' });
  task.on('state_changed',
    function(snap) {
      var pct = snap.totalBytes > 0 ? snap.bytesTransferred / snap.totalBytes : 0;
      bar.style.transform = 'scaleX(' + Math.max(pct, 0.05) + ')';
    },
    function() { bar.style.transform = 'scaleX(0)'; toast('Photo upload failed.', 'err'); },
    function() {
      ref.getDownloadURL().then(function(url) {
        bar.style.transform = 'scaleX(1)';
        setTimeout(function() { bar.style.transform = 'scaleX(0)'; }, 400);
        return db.collection('chats').doc(CID).collection('messages').add({
          type: 'image', fileUrl: url,
          senderId: ME.uid, senderName: ME.un,
          timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
      })
      .then(function() { playSend(); if (navigator.vibrate) navigator.vibrate(30); })
      .catch(function() { toast('Photo send failed.', 'err'); });
    }
  );
}

/* ─────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────── */
function gv(id) { return document.getElementById(id).value.trim(); }
function se(el, m) { el.textContent = m; el.classList.remove('hidden'); }
function load(btn, on) { btn.disabled = on; btn.classList.toggle('btn-loading', on); }

function fE(c, rawMsg) {
  var m = {
    'auth/user-not-found':         'No account found with that email.',
    'auth/wrong-password':         'Incorrect password. Try again.',
    'auth/invalid-credential':     'Wrong email or password.',
    'auth/email-already-in-use':   'Email already registered. Sign in instead.',
    'auth/invalid-email':          'Invalid email address.',
    'auth/weak-password':          'Password must be at least 6 characters.',
    'auth/too-many-requests':      'Too many attempts. Wait a moment.',
    'auth/network-request-failed': 'No internet connection.',
    'auth/operation-not-allowed':  'Email/Password sign-in is not enabled. Go to Firebase Console → Authentication → Sign-in method → Enable Email/Password.',
    'auth/unauthorized-domain':    'This origin (file://) is not authorized. Open the app via a local server, OR add file:// to Firebase Console → Authentication → Settings → Authorized domains.',
    'auth/internal-error':         'Firebase internal error. Check internet and try again.',
    'auth/configuration-not-found':'Firebase Auth not configured. Enable Email/Password in Firebase Console.',
    'auth/admin-restricted-operation': 'Sign-up is restricted. Enable Email/Password in Firebase Console → Authentication.'
  };
  if (m[c]) return m[c];
  return 'Error [' + (c||'unknown') + ']: ' + (rawMsg || 'Check browser console (F12) for details.');
}

function esc(s) {
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function ft(d) { return d.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' }); }

function fd(d) {
  var n  = new Date();
  var t  = new Date(n.getFullYear(), n.getMonth(), n.getDate());
  var dd = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  var diff = (t - dd) / 86400000;
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return d.toLocaleDateString([], { month:'short', day:'numeric', year:'numeric' });
}

function ag(name) {
  var gs = [
    'linear-gradient(135deg,#6c63ff,#ff6584)',
    'linear-gradient(135deg,#43e8d8,#6c63ff)',
    'linear-gradient(135deg,#ff6584,#ffb347)',
    'linear-gradient(135deg,#a78bfa,#6c63ff)',
    'linear-gradient(135deg,#34d399,#43e8d8)',
    'linear-gradient(135deg,#f472b6,#a78bfa)'
  ];
  var h = 0;
  for (var i = 0; i < name.length; i++) h = (h + name.charCodeAt(i)) % gs.length;
  return gs[h];
}

function toast(msg, type) {
  var el = document.createElement('div');
  el.className = 'toast' + (type ? ' '+type : '');
  el.textContent = msg;
  document.getElementById('toasts').appendChild(el);
  setTimeout(function() {
    el.style.transition = 'opacity .3s';
    el.style.opacity = '0';
    setTimeout(function() { el.remove(); }, 320);
  }, 3200);
}
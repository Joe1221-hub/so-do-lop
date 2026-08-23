let rowId = null; // sẽ tự lấy từ Supabase, không đoán id nữa
const SO_TO = 4, BAN_MOI_TO = 6;
const CLASS_ROSTER_SEED = ['An','Diệu Anh','Hải Anh','Đức Anh','N. Hà Anh','Phương Anh','T.Hà Anh','Bách','Khánh Chi','Diệp Chi','Thùy Dương','Duy Dương','Hương Giang','Hà','Minh Hải','Đình Hiếu','Chu Huyền','Đoàn Huyền','Khánh','Khôi','Ly','Mai','Đức Minh','Đắc Minh','Hữu Minh','V.Quang Minh','My','Nam','Ngọc','Nhi','Pháp','Phong','Phương','Sơn','Thanh','Thư','Thy','Trang','Trung','Vân','Vy','Vỹ', 'Cô Yến', 'Coca']; // đổi thành danh sách lớp thật

let state = { roster: [...CLASS_ROSTER_SEED], seats: {}, history: [] };
let me = null;       // tên học sinh đang chọn
let isOfficer = false; // đã mở khoá quyền sửa chưa
let pickingSeat = null;

// ---------- Danh tính ----------
let pendingName = null;

function initIdentity(){
  const saved = localStorage.getItem('me');
  const savedRole = localStorage.getItem('isOfficer') === 'true';
  if(saved){
    me = saved; isOfficer = savedRole;
    document.getElementById('identityModal').style.display = 'none';
    document.getElementById('appShell').style.display = 'block';
    afterIdentityReady();
  } else {
    const select = document.getElementById('nameSelect');
    select.innerHTML = state.roster.map(n => `<option value="${n}">${n}</option>`).join('');
  }
}

document.getElementById('confirmIdentityBtn').onclick = async () => {
  pendingName = document.getElementById('nameSelect').value;
  const { data } = await sb.from('profiles').select('pin').eq('name', pendingName).maybeSingle();

  document.getElementById('step1Box').style.display = 'none';
  document.getElementById('step2Box').style.display = 'block';
  document.getElementById('pinTitle').textContent = data
    ? 'Nhập mã PIN của bạn'
    : 'Chưa có PIN — đặt mã PIN mới (4-6 số)';
  document.getElementById('pinInput').dataset.hasPin = data ? '1' : '0';
  document.getElementById('pinInput').dataset.storedPin = data ? data.pin : '';
  document.getElementById('pinInput').focus();
};

document.getElementById('confirmPinBtn').onclick = async () => {
  const input = document.getElementById('pinInput');
  const pin = input.value.trim();
  const errEl = document.getElementById('pinError');

  if(pin.length < 4){
    errEl.textContent = 'PIN cần ít nhất 4 số.';
    return;
  }

  if(input.dataset.hasPin === '1'){
    if(pin !== input.dataset.storedPin){
      errEl.textContent = 'Sai PIN, thử lại.';
      return;
    }
  } else {
    const { error } = await sb
      .from('profiles')
      .insert({ name: pendingName, pin: pin });

    if(error){
      console.error(error);
      errEl.textContent = 'Lỗi khi tạo PIN, kiểm tra Console (F12).';
      return;
    }
  }

  me = pendingName;
  localStorage.setItem('me', me);

  document.getElementById('identityModal').style.display = 'none';
  document.getElementById('appShell').style.display = 'block';

  afterIdentityReady();
};

async function afterIdentityReady(){
  document.getElementById('meName').textContent = me + (isOfficer ? ' (cán bộ)' : '');
  updateEditVisibility();
  loadState();
  subscribeRealtime();
  loadFeed();
  subscribeFeed();
  await refreshMyAvatar();
}

async function refreshMyAvatar(){
  const { data } = await sb.from('profiles').select('avatar_url').eq('name', me).maybeSingle();
  const btn = document.getElementById('avatarBtn');
  const emoji = document.getElementById('avatarEmoji');
  if(data && data.avatar_url){
    btn.style.backgroundImage = `url(${data.avatar_url})`;
    btn.style.backgroundSize = 'cover';
    btn.style.backgroundPosition = 'center';
    if(emoji) emoji.style.display = 'none';
  }
}

function updateEditVisibility(){
  document.getElementById('editActions').style.display = isOfficer ? 'flex' : 'none';
  document.getElementById('addRow').style.display = isOfficer ? 'flex' : 'none';
  document.getElementById('groupActions').style.display = isOfficer ? 'flex' : 'none';
}

// ---------- Avatar menu ----------
document.getElementById('avatarBtn').onclick = (e) => {
  document.getElementById('avatarMenu').classList.toggle('show');
};
document.getElementById('logoutBtn').onclick = () => {
  localStorage.removeItem('me');
  localStorage.removeItem('isOfficer');
  location.reload();
};
document.getElementById('pinBtn').onclick = () => {
  const pin = prompt('Nhập mã cán bộ/giáo viên:');
  if(pin === OFFICER_PIN){
    isOfficer = true;
    localStorage.setItem('isOfficer', 'true');
    updateEditVisibility();
    document.getElementById('meName').textContent = me + ' (cán bộ)';
    alert('Đã mở quyền chỉnh sửa!');
  } else if(pin !== null){
    alert('Sai mã.');
  }
};
document.getElementById('editProfileBtn').onclick = () => alert('Tính năng hồ sơ cá nhân sẽ làm ở bước sau.');
document.getElementById('updateNoteBtn').onclick = () => alert('Tính năng note sẽ làm ở bước sau.');

// ---------- Tabs ----------
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
  };
});

// ---------- Supabase: đọc / ghi / realtime ----------
async function loadState(){
  const { data, error } = await sb.from('app_state').select('id, data').limit(1);
  if(error){
    console.error('Lỗi loadState:', error);
    render();
    return;
  }
  if(data && data.length > 0){
    rowId = data[0].id;
    if(data[0].data && Object.keys(data[0].data).length) state = data[0].data;
  } else {
    // Chưa có dòng nào trong bảng — tự tạo 1 dòng mới với state hiện tại
    const { data: inserted, error: insertError } = await sb
      .from('app_state').insert({ data: state }).select().single();
    if(insertError){
      console.error('Lỗi tạo dòng app_state:', insertError);
    } else {
      rowId = inserted.id;
    }
  }
  render();
}

async function saveState(actionLabel){
  if(actionLabel){
    state.history = state.history || [];
    state.history.unshift({ text: actionLabel, by: me, at: new Date().toISOString() });
    const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
    const cutoff = Date.now() - THREE_DAYS_MS;
    state.history = state.history.filter(h => new Date(h.at).getTime() >= cutoff);
  }
  if(rowId === null){
    console.error('Chưa có rowId — loadState() chưa chạy xong hoặc lỗi.');
    document.getElementById('status').textContent = 'Lỗi: chưa xác định được dòng dữ liệu.';
    return;
  }
  const { error } = await sb.from('app_state').update({ data: state }).eq('id', rowId);
  if(error){
    console.error('Lỗi saveState:', error);
    document.getElementById('status').textContent = 'Lỗi khi lưu! Mở Console (F12) xem chi tiết.';
    return;
  }
  document.getElementById('status').textContent = 'Đã lưu lúc ' + new Date().toLocaleTimeString('vi-VN');
}

function subscribeRealtime(){
  sb.channel('app_state_changes')
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'app_state' }, (payload) => {
      state = payload.new.data;
      render();
    })
    .subscribe();
}

// ---------- Logic xếp chỗ (giữ như cũ, chỉ đổi save() -> saveState()) ----------
function allSeatIds(){
  const ids = [];
  for(let b=1; b<=BAN_MOI_TO; b++) for(let z=1; z<=SO_TO; z++) ids.push(`${z}-${b}-L`, `${z}-${b}-R`);
  return ids;
}
function shuffleArray(arr){
  const a=[...arr];
  for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}
  return a;
}
function assign(seatId, name){
  for(const k in state.seats) if(state.seats[k]===name) delete state.seats[k];
  state.seats[seatId] = name;
  state.roster = state.roster.filter(n => n !== name);
  pickingSeat = null;
  render();
  saveState(`${me} xếp ${name} vào chỗ`);
}
function unassign(seatId){
  const name = state.seats[seatId];
  if(!name) return;
  delete state.seats[seatId];
  if(!state.roster.includes(name)) state.roster.push(name);
  render();
  saveState(`${me} bỏ chỗ của ${name}`);
}

function render(){
  const rosterEl = document.getElementById('rosterList');
  rosterEl.innerHTML = '';
  state.roster.forEach(name=>{
    const chip = document.createElement('div');
    chip.className = 'chip';
    chip.innerHTML = name + (isOfficer ? ' <span class="chip-x">✕</span>' : '');
    chip.onclick = (e) => {
  if(e.target.classList.contains('chip-x')){
    state.roster = state.roster.filter(n => n !== name);
    render(); saveState(`${me} xoá ${name} khỏi danh sách`);
  } else if(pickingSeat && isOfficer){
    assign(pickingSeat, name);
  } else {
    viewProfile(name);
  }
};
    rosterEl.appendChild(chip);
  });

  const zonesEl = document.getElementById('zones');
  zonesEl.innerHTML = '';
  for(let z=1; z<=SO_TO; z++){
    const zoneEl = document.createElement('div');
    const label = document.createElement('div');
    label.className = 'zone-label'; label.textContent = 'Tổ ' + z;
    zoneEl.appendChild(label);
    for(let b=1; b<=BAN_MOI_TO; b++){
      const desk = document.createElement('div'); desk.className = 'desk';
      ['L','R'].forEach(side=>{
        const seatId = `${z}-${b}-${side}`;
        const name = state.seats[seatId];
        const seat = document.createElement('div');
        seat.className = 'seat' + (!name ? ' empty' : '');
        seat.textContent = name || 'trống';
        seat.onclick = () => {
  if(!isOfficer){
    if(name) viewProfile(name);
    return;
  }
  if(name) unassign(seatId);
  else { pickingSeat = seatId; render(); }
};
        desk.appendChild(seat);
      });
      zoneEl.appendChild(desk);
    }
    zonesEl.appendChild(zoneEl);
  }
  renderGroups() ;
  renderHistory();
}

document.getElementById('addBtn').onclick = () => {
  const input = document.getElementById('nameInput');
  const name = input.value.trim();
  if(!name) return;
  state.roster.push(name);
  input.value = '';
  render(); saveState(`${me} thêm ${name} vào danh sách`);
};
document.getElementById('resetBtn').onclick = () => {
  if(!confirm('Xoá hết chỗ ngồi hiện tại?')) return;
  state.roster = [...state.roster, ...Object.values(state.seats)];
  state.seats = {};
  render(); saveState(`${me} xếp lại từ đầu`);
};
document.getElementById('shuffleBtn').onclick = () => {
  const everyone = shuffleArray([...state.roster, ...Object.values(state.seats)]);
  const seatIds = allSeatIds();
  state.seats = {}; state.roster = [];
  everyone.forEach((name, i) => { if(i < seatIds.length) state.seats[seatIds[i]] = name; else state.roster.push(name); });
  render(); saveState(`${me} xếp chỗ ngẫu nhiên cho cả lớp`);
};
document.getElementById('callBtn').onclick = () => {
  const assignedSeats = Object.keys(state.seats);
  if(assignedSeats.length === 0){ alert('Chưa có ai ngồi vào chỗ nào cả!'); return; }
  document.querySelectorAll('.seat.called').forEach(el => el.classList.remove('called'));
  const seatId = assignedSeats[Math.floor(Math.random()*assignedSeats.length)];
  const name = state.seats[seatId];
  const banner = document.getElementById('callBanner');
  banner.textContent = '🎯 ' + name;
  banner.classList.add('show');
  const seatEl = [...document.querySelectorAll('.seat')].find(el => el.textContent === name);
  if(seatEl) seatEl.classList.add('called');
};

// ---------- Lịch sử ----------
document.getElementById('historyBtn').onclick = () => {
  document.getElementById('historyPanel').classList.add('show');
};
document.getElementById('closeHistoryBtn').onclick = () => {
  document.getElementById('historyPanel').classList.remove('show');
};

function renderHistory(){
  const el = document.getElementById('historyList');
  const items = state.history || [];
  if(items.length === 0){
    el.innerHTML = '<p class="soon">Chưa có hoạt động nào.</p>';
    return;
  }
  el.innerHTML = items.map(h => `
    <div class="history-item">
      <div class="history-text">${h.text}</div>
      <div class="history-time">${new Date(h.at).toLocaleString('vi-VN')}</div>
    </div>
  `).join('');
}

// ---------- Hồ sơ cá nhân ----------
const PROFILE_FIELDS = [
  { key:'full_name', label:'Họ và tên', input:'pfFullName', vis:'pfFullNameVis' },
  { key:'dob', label:'Ngày sinh', input:'pfDob', vis:'pfDobVis' },
  { key:'hobbies', label:'Sở thích', input:'pfHobbies', vis:'pfHobbiesVis' },
  { key:'social_links', label:'Link MXH', input:'pfSocial', vis:'pfSocialVis' },
  { key:'goals', label:'Mục tiêu', input:'pfGoals', vis:'pfGoalsVis' },
];

let currentAvatarUrl = null;

document.getElementById('editProfileBtn').onclick = async () => {
  document.getElementById('avatarMenu').classList.remove('show');
  const { data } = await sb.from('profiles').select('*').eq('name', me).maybeSingle();
  const visibility = (data && data.visibility) || {};
  PROFILE_FIELDS.forEach(f => {
    document.getElementById(f.input).value = (data && data[f.key]) || '';
    document.getElementById(f.vis).checked = !!visibility[f.key];
  });
  currentAvatarUrl = (data && data.avatar_url) || null;
  document.getElementById('avatarPreview').innerHTML = currentAvatarUrl
    ? `<img src="${currentAvatarUrl}">` : '👤';
  document.getElementById('profileEditModal').style.display = 'flex';
};

document.getElementById('pfAvatarInput').onchange = () => {
  const file = document.getElementById('pfAvatarInput').files[0];
  if(!file) return;
  document.getElementById('avatarPreview').innerHTML = `<img src="${URL.createObjectURL(file)}">`;
};
document.getElementById('closeProfileEditBtn').onclick = () => {
  document.getElementById('profileEditModal').style.display = 'none';
};
document.getElementById('saveProfileBtn').onclick = async () => {
  const update = { visibility: {} };
  PROFILE_FIELDS.forEach(f => {
    const val = document.getElementById(f.input).value.trim();
    update[f.key] = val === '' ? null : val;
    update.visibility[f.key] = document.getElementById(f.vis).checked;
  });

  const avatarFile = document.getElementById('pfAvatarInput').files[0];
  if(avatarFile){
    const ext = (avatarFile.name.split('.').pop() || 'jpg').replace(/[^a-zA-Z0-9]/g, '');
const safeId = Math.random().toString(36).slice(2, 8);
const fileName = `avatar_${Date.now()}_${safeId}.${ext}`;
    const { error: upErr } = await sb.storage.from('feed-images').upload(fileName, avatarFile);
    if(upErr){ alert('Tải avatar thất bại: ' + upErr.message); return; }
    const { data: urlData } = sb.storage.from('feed-images').getPublicUrl(fileName);
    update.avatar_url = urlData.publicUrl;
  }

  const { error } = await sb.from('profiles').update(update).eq('name', me);
  if(error){ console.error(error); alert('Lưu hồ sơ thất bại: ' + error.message); return; }
  document.getElementById('pfAvatarInput').value = '';
  document.getElementById('profileEditModal').style.display = 'none';
  document.getElementById('pfAvatarInput').value = '';
document.getElementById('profileEditModal').style.display = 'none';
await refreshMyAvatar(); // thêm dòng này
};

let menuTargetName = null;

function viewProfile(name){
  menuTargetName = name;
  const menu = document.getElementById('nameMenu');
  menu.style.display = 'block';

  const x = Math.min(window.lastClickX || 100, window.innerWidth - 170);
  const y = Math.min(window.lastClickY || 100, window.innerHeight - 100);
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';
}

document.getElementById('menuViewProfile').onclick = () => {
  document.getElementById('nameMenu').style.display = 'none';
  openProfileModal(menuTargetName);
};

document.getElementById('menuViewAvatar').onclick = async () => {
  document.getElementById('nameMenu').style.display = 'none';

  const { data } = await sb.from('profiles')
    .select('avatar_url')
    .eq('name', menuTargetName)
    .maybeSingle();

  if(data && data.avatar_url) openLightbox(data.avatar_url);
  else alert('Bạn này chưa có avatar.');
};

document.addEventListener('click', (e) => {
  if(!e.target.closest('.mini-menu') &&
     !e.target.closest('.chip') &&
     !e.target.closest('.seat')){
    document.getElementById('nameMenu').style.display = 'none';
  }
});

async function openProfileModal(name){
  const { data, error } = await sb.from('profiles').select('*').eq('name', name).maybeSingle();
  document.getElementById('pvName').textContent = name;
  const el = document.getElementById('pvFields');

  if(error || !data){
    el.innerHTML = '<p class="soon">Bạn này chưa đăng nhập lần nào nên chưa có hồ sơ.</p>';
  } else {
    const visibility = data.visibility || {};
    const visibleFields = PROFILE_FIELDS.filter(f => visibility[f.key] && data[f.key]);

    el.innerHTML = visibleFields.length
      ? visibleFields.map(f => `<div class="pv-row"><strong>${f.label}:</strong> ${data[f.key]}</div>`).join('')
      : '<p class="soon">Bạn này chưa công khai thông tin nào.</p>';
  }

  document.getElementById('profileViewModal').style.display = 'flex';
}

document.getElementById('closeProfileViewBtn').onclick = () => {
  document.getElementById('profileViewModal').style.display = 'none';
};

// ---------- Feed ----------
document.getElementById('feedImageInput').onchange = () => {
  const files = document.getElementById('feedImageInput').files;
  document.getElementById('feedImageName').textContent = files.length ? `${files.length} tệp đã chọn` : '';
};

document.getElementById('postFeedBtn').onclick = async () => {
  const caption = document.getElementById('feedCaption').value.trim();
  const fileInput = document.getElementById('feedImageInput');
  const files = Array.from(fileInput.files);
  if(!caption && files.length === 0){ alert('Viết gì đó hoặc chọn ảnh/video trước đã.'); return; }

  const media = [];
  for(const file of files){
    const fileExt = (file.name.split('.').pop() || 'jpg').replace(/[^a-zA-Z0-9]/g, '');
    const fileName = `${Date.now()}_${Math.random().toString(36).slice(2,8)}.${fileExt}`;
    const { error: uploadError } = await sb.storage.from('feed-images').upload(fileName, file);
    if(uploadError){ console.error(uploadError); alert('Tải lên thất bại (' + file.name + '): ' + uploadError.message); return; }
    const { data: urlData } = sb.storage.from('feed-images').getPublicUrl(fileName);
    media.push({ url: urlData.publicUrl, type: file.type.startsWith('video') ? 'video' : 'image' });
  }

  const { error } = await sb.from('posts').insert({ author: me, caption, media });
  if(error){ console.error(error); alert('Đăng bài thất bại: ' + error.message); return; }

  document.getElementById('feedCaption').value = '';
  fileInput.value = '';
  document.getElementById('feedImageName').textContent = '';
};

async function loadFeed(){
  const { data, error } = await sb.from('posts').select('*').order('created_at', { ascending: false }).limit(50);
  if(error){ console.error(error); return; }
  const { data: profs } = await sb.from('profiles').select('name, avatar_url');
  const avatarMap = {};
  (profs || []).forEach(p => { if(p.avatar_url) avatarMap[p.name] = p.avatar_url; });
  renderFeed(data || [], avatarMap);
}

function hashColor(name){
  let hash = 0;
  for(let i=0;i<name.length;i++) hash = name.charCodeAt(i) + ((hash<<5)-hash);
  return GROUP_COLORS[Math.abs(hash) % GROUP_COLORS.length];
}

function relativeTime(iso){
  const diffSec = Math.floor((Date.now() - new Date(iso).getTime())/1000);
  if(diffSec < 60) return 'vừa xong';
  if(diffSec < 3600) return Math.floor(diffSec/60) + ' phút trước';
  if(diffSec < 86400) return Math.floor(diffSec/3600) + ' giờ trước';
  if(diffSec < 172800) return 'hôm qua';
  return new Date(iso).toLocaleDateString('vi-VN');
}

function renderFeed(posts, avatarMap){
  const el = document.getElementById('feedList');
  if(!posts.length){ el.innerHTML = '<p class="soon">Chưa có bài đăng nào.</p>'; return; }
  el.innerHTML = posts.map(p => {
  const likes = p.likes || [];
  const liked = likes.includes(me);
  const shared = p.shared_post; // bài gốc đã nhúng sẵn lúc share, xem bước 3
  return `
  <div class="feed-post">
      <div class="feed-post-head">
        ${avatarMap[p.author]
  ? `<img class="feed-avatar" src="${avatarMap[p.author]}" style="object-fit:cover;">`
  : `<div class="feed-avatar" style="background:${hashColor(p.author)}">${p.author.charAt(0).toUpperCase()}</div>`}
        <div class="feed-post-meta">
          <span class="feed-post-author">${p.author}</span>
          <span class="feed-post-time">${relativeTime(p.created_at)}</span>
        </div>
      </div>
      ${shared ? `
  <div class="shared-post-box">
    <div class="feed-post-head">
      <div class="feed-avatar" style="background:${hashColor(shared.author)}">${shared.author.charAt(0).toUpperCase()}</div>
      <div class="feed-post-meta">
        <span class="feed-post-author">${shared.author}</span>
        <span class="feed-post-time">${relativeTime(shared.created_at)}</span>
      </div>
    </div>
    ${shared.caption ? `<div class="feed-post-caption">${shared.caption}</div>` : ''}
    ${(shared.media && shared.media.length) ? `
      <div class="feed-media-grid">
        ${shared.media.map(m => m.type === 'video'
          ? `<video src="${m.url}" controls></video>`
          : `<img src="${m.url}">`
        ).join('')}
      </div>` : ''}
  </div>
` : ''}
      <div class="feed-post-actions">
  <button class="like-btn ${liked ? 'liked' : ''}" onclick="toggleLike(${p.id})">❤️ ${likes.length > 0 ? likes.length : ''} Thích</button>
  ${(p.author === me || isOfficer) ? `<button class="like-btn" onclick="deletePost(${p.id}, '${p.image_url || ''}')">🗑️ Xoá</button>` : ''}
</div>
<div class="feed-post-actions">
  <button class="like-btn ${liked ? 'liked' : ''}" onclick="toggleLike(${p.id})">❤️ ${likes.length > 0 ? likes.length : ''} Thích</button>
  <button class="like-btn" onclick="toggleComments(${p.id})" id="commentBtn-${p.id}">💬 Bình luận</button>
  <button class="like-btn" onclick="sharePost(${p.id})">🔁 Chia sẻ</button>
  ${(p.author === me || isOfficer) ? `<button class="like-btn" onclick="deletePost(${p.id}, '${p.image_url || ''}')">🗑️ Xoá</button>` : ''}
</div>
<div class="comments-section" id="comments-${p.id}" style="display:none;">
  <div class="comment-list" id="commentList-${p.id}"></div>
  <div class="comment-input-row">
    <input type="text" id="commentInput-${p.id}" placeholder="Viết bình luận...">
    <button onclick="postComment(${p.id})">Gửi</button>
  </div>
</div>
    </div>`;
  }).join('');
}

async function toggleLike(postId){
  const { data } = await sb.from('posts').select('likes').eq('id', postId).maybeSingle();
  let likes = (data && data.likes) || [];
  if(likes.includes(me)) likes = likes.filter(n => n !== me);
  else likes.push(me);
  await sb.from('posts').update({ likes }).eq('id', postId);
  loadFeed();
}

async function deletePost(postId, imageUrl){
  if(!confirm('Xoá bài đăng này?')) return;
  await sb.from('posts').delete().eq('id', postId);
  if(imageUrl){
    const fileName = imageUrl.split('/').pop();
    await sb.storage.from('feed-images').remove([fileName]);
  }
  loadFeed();
}

async function sharePost(postId){
  const { data: original, error } = await sb.from('posts').select('*').eq('id', postId).maybeSingle();
  if(error || !original){ alert('Không tìm thấy bài gốc.'); return; }

  const caption = prompt('Viết vài dòng cho bài chia sẻ (có thể để trống):', '') || '';
  const { error: insertError } = await sb.from('posts').insert({
    author: me,
    caption,
    media: [],
    shared_post: {
      author: original.author,
      caption: original.caption,
      media: original.media,
      created_at: original.created_at
    }
  });
  if(insertError){ console.error(insertError); alert('Chia sẻ thất bại: ' + insertError.message); return; }
  loadFeed();
}

function openLightbox(url){
  document.getElementById('lightboxImg').src = url;
  document.getElementById('lightbox').style.display = 'flex';
}
document.getElementById('closeLightboxBtn').onclick = () => {
  document.getElementById('lightbox').style.display = 'none';
};

function subscribeFeed(){
  sb.channel('posts_changes')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' }, () => loadFeed())
    .subscribe();
  sb.channel('comments_changes')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'comments' }, (payload) => {
      const postId = payload.new.post_id;
      const box = document.getElementById('comments-' + postId);
      if(box && box.style.display === 'block'){
        loadComments(postId);
      } else if(payload.new.author !== me){
        const btn = document.getElementById('commentBtn-' + postId);
        if(btn && !btn.querySelector('.comment-dot')){
          const dot = document.createElement('span');
          dot.className = 'comment-dot';
          btn.appendChild(dot);
        }
      }
    })
    .subscribe();
}

document.addEventListener('click', (e) => {
  window.lastClickX = e.clientX;
  window.lastClickY = e.clientY;
});

// ---------- Bình luận ----------
const commentCache = {};

async function toggleComments(postId){
  const box = document.getElementById('comments-' + postId);
  const isShowing = box.style.display === 'block';
  box.style.display = isShowing ? 'none' : 'block';
  if(!isShowing){
    await loadComments(postId);
    const dot = document.querySelector('#commentBtn-' + postId + ' .comment-dot');
    if(dot) dot.remove();
  }
}

async function loadComments(postId){
  const { data, error } = await sb.from('comments').select('*').eq('post_id', postId).order('created_at', { ascending: true });
  if(error){ console.error(error); return; }
  commentCache[postId] = data || [];
  renderComments(postId);
}

function renderComments(postId){
  const list = commentCache[postId] || [];
  const roots = list.filter(c => !c.parent_id);
  const repliesOf = (id) => list.filter(c => c.parent_id === id);

  function commentHtml(c){
    const replies = repliesOf(c.id);
    return `
      <div class="comment">
        <div class="comment-avatar" style="background:${hashColor(c.author)}">${c.author.charAt(0).toUpperCase()}</div>
        <div class="comment-body">
          <div class="comment-bubble">
            <span class="comment-author">${c.author}</span>
            <span class="comment-text">${c.content}</span>
          </div>
          <div class="comment-meta">
            <span>${relativeTime(c.created_at)}</span>
            <span onclick="showReplyBox(${postId}, ${c.id})">Trả lời</span>
          </div>
          <div class="reply-input-row" id="replyBox-${c.id}">
            <input type="text" id="replyInput-${c.id}" placeholder="Trả lời ${c.author}...">
            <button onclick="postComment(${postId}, ${c.id})">Gửi</button>
          </div>
          ${replies.length ? `<div class="comment-replies">${replies.map(commentHtml).join('')}</div>` : ''}
        </div>
      </div>
    `;
  }

  document.getElementById('commentList-' + postId).innerHTML =
    roots.length ? roots.map(commentHtml).join('') : '<p class="soon">Chưa có bình luận nào.</p>';
}

function showReplyBox(postId, commentId){
  document.querySelectorAll('.reply-input-row.show').forEach(el => el.classList.remove('show'));
  document.getElementById('replyBox-' + commentId).classList.add('show');
  document.getElementById('replyInput-' + commentId).focus();
}

async function postComment(postId, parentId){
  const inputId = parentId ? `replyInput-${parentId}` : `commentInput-${postId}`;
  const input = document.getElementById(inputId);
  const content = input.value.trim();
  if(!content) return;

  const { error } = await sb.from('comments').insert({
    post_id: postId, author: me, content, parent_id: parentId || null
  });
  if(error){ console.error(error); alert('Gửi bình luận thất bại: ' + error.message); return; }

  input.value = '';
  await loadComments(postId);
}
initIdentity();

// ---------- Chia nhóm ----------
document.getElementById('makeGroupsBtn').onclick = () => {
  const groupCount = parseInt(document.getElementById('groupCountInput').value, 10);
  if(!groupCount || groupCount < 2){
    alert('Nhập số nhóm hợp lệ (từ 2 trở lên).');
    return;
  }
  const everyone = shuffleArray([...state.roster, ...Object.values(state.seats)]);
  if(everyone.length < groupCount){
    alert('Số học sinh ít hơn số nhóm, không chia được.');
    return;
  }

  const groups = Array.from({ length: groupCount }, () => []);
  everyone.forEach((name, i) => {
    groups[i % groupCount].push(name); // rải đều, nhóm nào dư sẽ hơn 1 người
  });

  state.groups = groups;
  render();
  saveState(`${me} chia lớp thành ${groupCount} nhóm`);
};

const GROUP_COLORS = ['#e8c468','#c1554a','#4f9d69','#4a7ec1','#a15ec1','#c17e3f','#3fb0c1','#c14f8f'];

function renderGroups(){
  const el = document.getElementById('groupsResult');
  el.innerHTML = '';
  if(!state.groups || state.groups.length === 0){
    el.innerHTML = '<p class="soon">Chưa có nhóm nào. ' + (isOfficer ? 'Nhập số nhóm rồi bấm chia.' : 'Chờ cán bộ lớp chia nhóm.') + '</p>';
    return;
  }
  state.groups.forEach((members, i) => {
    const card = document.createElement('div');
    card.className = 'group-card';
    card.style.setProperty('--accent', GROUP_COLORS[i % GROUP_COLORS.length]);
   card.innerHTML = `
  <div class="group-head">
    <h3>Nhóm ${i + 1}</h3>
    <span class="count-pill">${members.length} người</span>
  </div>
  <div class="members"></div>
`;

const membersEl = card.querySelector('.members');
members.forEach(n => {
  const memberChip = document.createElement('span');
  memberChip.className = 'chip';
  memberChip.textContent = n;
  memberChip.onclick = () => viewProfile(n);
  membersEl.appendChild(memberChip);
});
    el.appendChild(card);
  });
}
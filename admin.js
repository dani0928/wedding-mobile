const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const BUCKET = 'gallery';

// ---- Pattern gate ----
const gate = document.getElementById('gate');
const app = document.getElementById('app');
const gateError = document.getElementById('gateError');

function enterApp() {
  gate.style.display = 'none';
  app.style.display = 'block';
  loadPhotos();
  loadContent();
  loadAccounts();
  loadRsvps();
  loadGuestbookAdmin();
  loadSnapsAdmin();
  loadBiometricDevices();
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : str;
  return div.innerHTML;
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ---- Tabs ----
document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
  });
});

const patternWrap = document.getElementById('patternWrap');
const patternGrid = document.getElementById('patternGrid');
const patternSvg = document.getElementById('patternSvg');
const patternDots = Array.from(patternGrid.querySelectorAll('.pattern-dot'));
const DOT_CENTERS = [
  [40, 40], [120, 40], [200, 40],
  [40, 120], [120, 120], [200, 120],
  [40, 200], [120, 200], [200, 200],
];
let currentPattern = [];
let patternDragging = false;

function pointToSvg(clientX, clientY) {
  const rect = patternWrap.getBoundingClientRect();
  return {
    x: ((clientX - rect.left) / rect.width) * 240,
    y: ((clientY - rect.top) / rect.height) * 240,
  };
}

function dotIndexAt(clientX, clientY) {
  const el = document.elementFromPoint(clientX, clientY);
  const dotEl = el && el.closest ? el.closest('.pattern-dot') : null;
  return dotEl ? Number(dotEl.dataset.index) : null;
}

function redrawPatternLines(cursorPoint) {
  let markup = '';
  for (let i = 1; i < currentPattern.length; i++) {
    const [x1, y1] = DOT_CENTERS[currentPattern[i - 1]];
    const [x2, y2] = DOT_CENTERS[currentPattern[i]];
    markup += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" />`;
  }
  if (cursorPoint && currentPattern.length > 0) {
    const [x1, y1] = DOT_CENTERS[currentPattern[currentPattern.length - 1]];
    markup += `<line x1="${x1}" y1="${y1}" x2="${cursorPoint.x}" y2="${cursorPoint.y}" />`;
  }
  patternSvg.innerHTML = markup;
}

function addPatternDot(index) {
  if (currentPattern.includes(index)) return;
  currentPattern.push(index);
  patternDots[index].classList.add('active');
}

function resetPattern() {
  currentPattern = [];
  patternDots.forEach((d) => d.classList.remove('active'));
  patternSvg.innerHTML = '';
  patternWrap.classList.remove('error');
  gateError.textContent = '';
}

function checkPattern() {
  const ok = currentPattern.length === ADMIN_PATTERN.length && currentPattern.every((v, i) => v === ADMIN_PATTERN[i]);
  if (ok) {
    sessionStorage.setItem('admin_unlocked', '1');
    enterApp();
    return;
  }
  gateError.textContent = '패턴이 올바르지 않습니다.';
  patternWrap.classList.add('error', 'shake');
  setTimeout(() => {
    patternWrap.classList.remove('shake');
    resetPattern();
  }, 400);
}

patternWrap.addEventListener('pointerdown', (e) => {
  resetPattern();
  patternDragging = true;
  patternWrap.setPointerCapture(e.pointerId);
  const idx = dotIndexAt(e.clientX, e.clientY);
  if (idx !== null) addPatternDot(idx);
  e.preventDefault();
});
patternWrap.addEventListener('pointermove', (e) => {
  if (!patternDragging) return;
  const idx = dotIndexAt(e.clientX, e.clientY);
  if (idx !== null) addPatternDot(idx);
  redrawPatternLines(pointToSvg(e.clientX, e.clientY));
});
patternWrap.addEventListener('pointerup', (e) => {
  if (!patternDragging) return;
  patternDragging = false;
  patternWrap.releasePointerCapture(e.pointerId);
  redrawPatternLines(null);
  if (currentPattern.length > 0) checkPattern();
});
patternWrap.addEventListener('pointercancel', () => {
  patternDragging = false;
  resetPattern();
});

// ---- Biometric (WebAuthn) ----
function bufToBase64Url(buf) {
  const bytes = new Uint8Array(buf);
  let str = '';
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBuf(b64url) {
  const padded = b64url.replace(/-/g, '+').replace(/_/g, '/').padEnd(b64url.length + ((4 - (b64url.length % 4)) % 4), '=');
  const str = atob(padded);
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) bytes[i] = str.charCodeAt(i);
  return bytes.buffer;
}

const webauthnSupported = !!(window.PublicKeyCredential && navigator.credentials);
const biometricBox = document.getElementById('biometricBox');
const biometricList = document.getElementById('biometricList');

async function platformAuthenticatorAvailable() {
  if (!webauthnSupported) return false;
  return PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable().catch(() => false);
}

async function registerBiometric() {
  if (!(await platformAuthenticatorAvailable())) {
    showToast('이 기기에서는 Face ID/지문 등록을 사용할 수 없습니다.');
    return;
  }
  const label = prompt('이 기기의 이름을 입력해주세요 (예: 진혁 아이폰)', '내 기기');
  if (label === null) return;
  try {
    const credential = await navigator.credentials.create({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rp: { name: '모바일청첩장 관리자', id: location.hostname },
        user: { id: crypto.getRandomValues(new Uint8Array(16)), name: 'admin', displayName: label || '관리자' },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },
          { type: 'public-key', alg: -257 },
        ],
        authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required' },
        timeout: 60000,
        attestation: 'none',
      },
    });
    const credentialId = bufToBase64Url(credential.rawId);
    const { error } = await sb.from('admin_credentials').insert({ credential_id: credentialId, label: label || '등록된 기기' });
    showToast(error ? '등록에 실패했습니다.' : '생체인증을 등록했습니다. 다음부터 자동으로 뜹니다.');
    if (!error) await loadBiometricDevices();
  } catch (e) {
    showToast('등록이 취소되었거나 실패했습니다.');
  }
}

async function tryBiometricLogin() {
  if (!(await platformAuthenticatorAvailable())) return false;
  const { data, error } = await sb.from('admin_credentials').select('credential_id');
  if (error || !data || data.length === 0) return false;
  try {
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        allowCredentials: data.map((r) => ({ type: 'public-key', id: base64UrlToBuf(r.credential_id) })),
        userVerification: 'required',
        timeout: 60000,
      },
    });
    return !!assertion;
  } catch (e) {
    return false;
  }
}

async function loadBiometricDevices() {
  if (!webauthnSupported) return;
  biometricBox.hidden = false;
  const { data, error } = await sb.from('admin_credentials').select('*').order('created_at', { ascending: false });
  if (error) return;
  biometricList.innerHTML = (data || [])
    .map(
      (c) => `
      <div class="admin-list-card" data-id="${c.id}">
        <div class="admin-list-main">
          <p class="admin-list-title">${escapeHtml(c.label || '등록된 기기')}</p>
          <p class="admin-list-date">${formatDate(c.created_at)}</p>
        </div>
        <button class="icon-btn danger" aria-label="삭제">✕</button>
      </div>`
    )
    .join('');
}

document.getElementById('registerBiometricBtn').addEventListener('click', registerBiometric);
biometricList.addEventListener('click', async (e) => {
  const btn = e.target.closest('.icon-btn');
  if (!btn) return;
  const id = btn.closest('.admin-list-card').dataset.id;
  if (!confirm('이 기기의 생체인증 등록을 삭제할까요?')) return;
  btn.disabled = true;
  const { error } = await sb.from('admin_credentials').delete().eq('id', id);
  showToast(error ? '삭제에 실패했습니다.' : '삭제했습니다.');
  if (!error) await loadBiometricDevices();
});

document.getElementById('lockBtn').addEventListener('click', () => {
  sessionStorage.removeItem('admin_unlocked');
  location.reload();
});

(async function initGate() {
  if (sessionStorage.getItem('admin_unlocked') === '1') {
    enterApp();
    return;
  }
  if (await tryBiometricLogin()) {
    sessionStorage.setItem('admin_unlocked', '1');
    enterApp();
  }
})();

// ---- Toast ----
const toast = document.getElementById('toast');
let toastTimer;
function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
}

// ---- Photo list ----
const photoList = document.getElementById('photoList');
let photos = [];

function publicUrl(path) {
  return sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

async function loadPhotos() {
  const { data, error } = await sb.from('gallery_photos').select('*').order('position', { ascending: true });
  if (error) {
    showToast('사진 목록을 불러오지 못했습니다.');
    return;
  }
  photos = data || [];
  render();
}

function render() {
  if (photos.length === 0) {
    photoList.innerHTML = '<p class="empty-note">아직 등록된 사진이 없습니다.</p>';
    return;
  }
  photoList.innerHTML = photos
    .map((p, i) => `
      <div class="photo-card" data-id="${p.id}">
        <img src="${publicUrl(p.file_path)}" alt="" loading="lazy" />
        <div class="photo-meta">
          <div class="photo-order">${i + 1} / ${photos.length}</div>
          ${p.is_hero ? '<span class="hero-badge">⭐ 대표사진</span>' : ''}
        </div>
        <div class="photo-actions">
          <button class="icon-btn" data-action="up" ${i === 0 ? 'disabled' : ''} aria-label="위로">↑</button>
          <button class="icon-btn" data-action="down" ${i === photos.length - 1 ? 'disabled' : ''} aria-label="아래로">↓</button>
          <button class="icon-btn hero-set" data-action="hero" aria-label="대표사진으로 지정">⭐</button>
          <button class="icon-btn" data-action="copy" aria-label="링크 복사">🔗</button>
          <button class="icon-btn danger" data-action="delete" aria-label="삭제">✕</button>
        </div>
      </div>
    `)
    .join('');
}

photoList.addEventListener('click', async (e) => {
  const btn = e.target.closest('.icon-btn');
  if (!btn || btn.disabled) return;
  const card = btn.closest('.photo-card');
  const id = card.dataset.id;
  const action = btn.dataset.action;
  const index = photos.findIndex((p) => p.id === id);
  if (index === -1) return;

  if (action === 'up' || action === 'down') {
    const otherIndex = action === 'up' ? index - 1 : index + 1;
    const a = photos[index];
    const b = photos[otherIndex];
    btn.disabled = true;
    await Promise.all([
      sb.from('gallery_photos').update({ position: b.position }).eq('id', a.id),
      sb.from('gallery_photos').update({ position: a.position }).eq('id', b.id),
    ]);
    await loadPhotos();
  } else if (action === 'hero') {
    btn.disabled = true;
    await sb.from('gallery_photos').update({ is_hero: false }).eq('is_hero', true);
    await sb.from('gallery_photos').update({ is_hero: true }).eq('id', id);
    showToast('대표사진으로 지정했습니다.');
    await loadPhotos();
  } else if (action === 'delete') {
    if (!confirm('이 사진을 삭제할까요?')) return;
    btn.disabled = true;
    const target = photos[index];
    await sb.storage.from(BUCKET).remove([target.file_path]);
    await sb.from('gallery_photos').delete().eq('id', id);
    showToast('삭제했습니다.');
    await loadPhotos();
  } else if (action === 'copy') {
    const url = publicUrl(photos[index].file_path);
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = url;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    showToast('사진 링크를 복사했습니다.');
  }
});

// ---- Share thumbnail (og:image / Kakao 공유 미리보기 전용, 갤러리에는 노출되지 않음) ----
const SHARE_THUMB_PATH = 'share-thumbnail.jpg';
const shareThumbInput = document.getElementById('shareThumbInput');
const shareThumbPreview = document.getElementById('shareThumbPreview');
const shareThumbStatus = document.getElementById('shareThumbStatus');

function loadShareThumbPreview() {
  shareThumbPreview.onload = () => { shareThumbPreview.style.visibility = 'visible'; };
  shareThumbPreview.onerror = () => { shareThumbPreview.style.visibility = 'hidden'; };
  shareThumbPreview.src = `${publicUrl(SHARE_THUMB_PATH)}?t=${Date.now()}`;
}
loadShareThumbPreview();

shareThumbInput.addEventListener('change', async () => {
  const file = shareThumbInput.files[0];
  if (!file) return;
  shareThumbStatus.textContent = '업로드 중...';
  const compressed = await compressImage(file);
  const { error } = await sb.storage.from(BUCKET).upload(SHARE_THUMB_PATH, compressed, { contentType: 'image/jpeg', upsert: true });
  shareThumbInput.value = '';
  if (error) {
    shareThumbStatus.textContent = '업로드에 실패했습니다. 다시 시도해주세요.';
    return;
  }
  shareThumbStatus.textContent = '공유 썸네일을 업데이트했습니다.';
  loadShareThumbPreview();
  showToast('공유 썸네일을 업데이트했습니다.');
});

// ---- Upload ----
const uploadBox = document.getElementById('uploadBox');
const fileInput = document.getElementById('fileInput');
const uploadStatus = document.getElementById('uploadStatus');

function compressImage(file, maxDim = 1600, quality = 0.82) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(url);
          resolve(blob || file);
        },
        'image/jpeg',
        quality
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file);
    };
    img.src = url;
  });
}

// Uploads a full-size version (used by the hero image and lightbox) plus a
// small "-thumb" version (used by the gallery grid, which is loaded on every
// site visit - keeping it small is what actually saves bandwidth).
async function uploadOne(file, position) {
  const compressed = await compressImage(file, 1600, 0.82);
  const thumb = await compressImage(file, 480, 0.75);
  const isCompressed = compressed !== file;
  const ext = isCompressed ? 'jpg' : file.name.split('.').pop() || 'jpg';
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const thumbPath = path.replace(/\.[^.]+$/, '-thumb.jpg');
  const contentType = isCompressed ? 'image/jpeg' : file.type || 'image/jpeg';
  const { error: uploadError } = await sb.storage.from(BUCKET).upload(path, compressed, { contentType });
  if (uploadError) throw uploadError;
  await sb.storage.from(BUCKET).upload(thumbPath, thumb, { contentType: 'image/jpeg' });
  const { error: insertError } = await sb.from('gallery_photos').insert({ file_path: path, position, is_hero: false });
  if (insertError) throw insertError;
}

async function handleFiles(fileList) {
  const files = Array.from(fileList).filter((f) => f.type.startsWith('image/'));
  if (files.length === 0) return;
  let nextPosition = photos.length ? Math.max(...photos.map((p) => p.position)) + 1 : 0;
  let done = 0;
  let failed = 0;
  for (const file of files) {
    uploadStatus.textContent = `업로드 중... (${done + 1}/${files.length})`;
    try {
      await uploadOne(file, nextPosition);
      nextPosition += 1;
      done += 1;
    } catch (err) {
      failed += 1;
    }
  }
  uploadStatus.textContent = failed > 0 ? `${done}장 업로드 완료, ${failed}장 실패` : `${done}장 업로드 완료`;
  fileInput.value = '';
  await loadPhotos();
  setTimeout(() => {
    uploadStatus.textContent = '';
  }, 3000);
}

fileInput.addEventListener('change', () => handleFiles(fileInput.files));

['dragover', 'dragenter'].forEach((evt) =>
  uploadBox.addEventListener(evt, (e) => {
    e.preventDefault();
    uploadBox.classList.add('drag');
  })
);
['dragleave', 'drop'].forEach((evt) =>
  uploadBox.addEventListener(evt, (e) => {
    e.preventDefault();
    uploadBox.classList.remove('drag');
  })
);
uploadBox.addEventListener('drop', (e) => {
  if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
});

// ---- Site content (text) ----
const CONTENT_KEYS = [
  'groom_name',
  'bride_name',
  'groom_parents',
  'bride_parents',
  'invitation_message',
  'invitation_signature',
  'wedding_datetime_text',
  'venue_name',
  'guest_snap_prize_note',
];

async function loadContent() {
  const { data, error } = await sb.from('site_content').select('key, value');
  if (error || !data) {
    showToast('문구를 불러오지 못했습니다.');
    return;
  }
  const content = Object.fromEntries(data.map((row) => [row.key, row.value]));
  CONTENT_KEYS.forEach((key) => {
    const el = document.getElementById(`cf-${key}`);
    if (el) el.value = content[key] || '';
  });
}

document.getElementById('saveContentBtn').addEventListener('click', async (e) => {
  const btn = e.target;
  btn.disabled = true;
  const rows = CONTENT_KEYS.map((key) => ({
    key,
    value: document.getElementById(`cf-${key}`).value,
  }));
  const { error } = await sb.from('site_content').upsert(rows, { onConflict: 'key' });
  btn.disabled = false;
  showToast(error ? '저장에 실패했습니다.' : '문구를 저장했습니다.');
});

// ---- Wedding accounts ----
let accounts = [];

async function loadAccounts() {
  const { data, error } = await sb.from('wedding_accounts').select('*').order('position', { ascending: true });
  if (error || !data) {
    showToast('계좌 목록을 불러오지 못했습니다.');
    return;
  }
  accounts = data;
  renderAccounts();
}

function accountCardHtml(a) {
  const id = a.id || '';
  return `
    <div class="account-card" data-id="${id}" data-side="${a.side}">
      <div class="field-group">
        <label>표시 이름</label>
        <input type="text" class="f-display_name" value="${escapeAttr(a.display_name)}" placeholder="예: 신랑 박진혁" />
      </div>
      <div class="account-card-row">
        <div class="field-group">
          <label>은행</label>
          <select class="f-bank_icon">
            <option value="kb" ${a.bank_icon === 'kb' ? 'selected' : ''}>KB국민은행</option>
            <option value="nh" ${a.bank_icon === 'nh' ? 'selected' : ''}>NH농협은행</option>
            <option value="none" ${a.bank_icon === 'none' ? 'selected' : ''}>기타(아이콘 없음)</option>
          </select>
        </div>
        <div class="field-group">
          <label>은행명 표시</label>
          <input type="text" class="f-bank_name" value="${escapeAttr(a.bank_name)}" placeholder="예: 국민은행" />
        </div>
      </div>
      <div class="field-group">
        <label>예금주</label>
        <input type="text" class="f-holder_name" value="${escapeAttr(a.holder_name)}" placeholder="예: 박진혁" />
      </div>
      <div class="field-group">
        <label>계좌번호</label>
        <input type="text" class="f-account_number" value="${escapeAttr(a.account_number)}" />
      </div>
      <div class="field-group">
        <label>카카오페이 송금 링크 (선택)</label>
        <input type="text" class="f-kakaopay_url" value="${escapeAttr(a.kakaopay_url || '')}" placeholder="https://qr.kakaopay.com/..." />
      </div>
      <div class="account-card-actions">
        <button class="save-account-btn">저장</button>
        <button class="delete-account-btn">삭제</button>
      </div>
    </div>
  `;
}

function escapeAttr(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function renderAccounts() {
  const groomEl = document.getElementById('groomAccountList');
  const brideEl = document.getElementById('brideAccountList');
  const groomAccounts = accounts.filter((a) => a.side === 'groom');
  const brideAccounts = accounts.filter((a) => a.side === 'bride');
  groomEl.innerHTML = groomAccounts.map(accountCardHtml).join('');
  brideEl.innerHTML = brideAccounts.map(accountCardHtml).join('');
}

function readCardFields(card) {
  return {
    display_name: card.querySelector('.f-display_name').value.trim(),
    bank_icon: card.querySelector('.f-bank_icon').value,
    bank_name: card.querySelector('.f-bank_name').value.trim(),
    holder_name: card.querySelector('.f-holder_name').value.trim(),
    account_number: card.querySelector('.f-account_number').value.trim(),
    kakaopay_url: card.querySelector('.f-kakaopay_url').value.trim() || null,
  };
}

document.getElementById('tab-accounts').addEventListener('click', async (e) => {
  const saveBtn = e.target.closest('.save-account-btn');
  const deleteBtn = e.target.closest('.delete-account-btn');
  const addBtn = e.target.closest('.add-account-btn');

  if (saveBtn) {
    const card = saveBtn.closest('.account-card');
    const fields = readCardFields(card);
    const id = card.dataset.id;
    saveBtn.disabled = true;
    let error;
    if (id) {
      ({ error } = await sb.from('wedding_accounts').update(fields).eq('id', id));
    } else {
      const side = card.dataset.side;
      const position = accounts.filter((a) => a.side === side).length;
      ({ error } = await sb.from('wedding_accounts').insert({ ...fields, side, position }));
    }
    saveBtn.disabled = false;
    showToast(error ? '저장에 실패했습니다.' : '계좌를 저장했습니다.');
    if (!error) await loadAccounts();
  } else if (deleteBtn) {
    const card = deleteBtn.closest('.account-card');
    const id = card.dataset.id;
    if (!id) {
      card.remove();
      return;
    }
    if (!confirm('이 계좌를 삭제할까요?')) return;
    deleteBtn.disabled = true;
    const { error } = await sb.from('wedding_accounts').delete().eq('id', id);
    deleteBtn.disabled = false;
    showToast(error ? '삭제에 실패했습니다.' : '삭제했습니다.');
    if (!error) await loadAccounts();
  } else if (addBtn) {
    const side = addBtn.dataset.side;
    const blank = { id: null, side, display_name: '', bank_icon: 'kb', bank_name: '', holder_name: '', account_number: '', kakaopay_url: '' };
    const listEl = document.getElementById(side === 'groom' ? 'groomAccountList' : 'brideAccountList');
    listEl.insertAdjacentHTML('beforeend', accountCardHtml(blank));
  }
});

// ---- RSVP submissions ----
const rsvpList = document.getElementById('rsvpList');

function updateRsvpStats(data) {
  let groomCount = 0;
  let brideCount = 0;
  let groomResponses = 0;
  let brideResponses = 0;
  let notComing = 0;
  data.forEach((r) => {
    if (r.attendance !== '참석') {
      if (r.attendance === '불참석') notComing++;
      return;
    }
    const count = Number(r.guest_count) > 0 ? Number(r.guest_count) : 1;
    if (r.side === '신랑측') {
      groomCount += count;
      groomResponses++;
    } else if (r.side === '신부측') {
      brideCount += count;
      brideResponses++;
    }
  });
  const total = groomCount + brideCount;
  const groomPct = total > 0 ? (groomCount / total) * 100 : 0;
  document.getElementById('rsvpDonut').style.setProperty('--groom-pct', `${groomPct}%`);
  document.getElementById('rsvpTotalCount').textContent = total;
  document.getElementById('rsvpGroomCount').textContent = groomCount;
  document.getElementById('rsvpBrideCount').textContent = brideCount;
  document.getElementById('rsvpGroomResponses').textContent = `${groomResponses}건`;
  document.getElementById('rsvpBrideResponses').textContent = `${brideResponses}건`;
  document.getElementById('rsvpNotComingNote').textContent = notComing > 0 ? `불참석 응답 ${notComing}건은 인원에 포함되지 않았습니다.` : '';
}

async function loadRsvps() {
  const { data, error } = await sb.from('rsvp_submissions').select('*').order('created_at', { ascending: false });
  if (error) {
    rsvpList.innerHTML = '<p class="empty-note">불러오지 못했습니다.</p>';
    return;
  }
  updateRsvpStats(data || []);
  if (!data || data.length === 0) {
    rsvpList.innerHTML = '<p class="empty-note">아직 참석 의사 응답이 없습니다.</p>';
    return;
  }
  rsvpList.innerHTML = data
    .map((r) => {
      const details = [
        r.attendance ? escapeHtml(r.attendance) : null,
        r.guest_count ? `${escapeHtml(r.guest_count)}명` : null,
        r.companion ? `동행: ${escapeHtml(r.companion)}` : null,
        r.meal_preference ? `식사: ${escapeHtml(r.meal_preference)}` : null,
      ]
        .filter(Boolean)
        .join(' · ');
      return `
      <div class="admin-list-card" data-id="${r.id}">
        <div class="admin-list-main">
          <p class="admin-list-title">${escapeHtml(r.name)}${r.side ? `<span class="admin-list-tag">${escapeHtml(r.side)}</span>` : ''}</p>
          <p class="admin-list-sub">${details}</p>
          <p class="admin-list-date">${formatDate(r.created_at)}</p>
        </div>
        <button class="icon-btn danger" aria-label="삭제">✕</button>
      </div>`;
    })
    .join('');
}

rsvpList.addEventListener('click', async (e) => {
  const btn = e.target.closest('.icon-btn');
  if (!btn) return;
  const id = btn.closest('.admin-list-card').dataset.id;
  if (!confirm('이 응답을 삭제할까요?')) return;
  btn.disabled = true;
  const { error } = await sb.from('rsvp_submissions').delete().eq('id', id);
  showToast(error ? '삭제에 실패했습니다.' : '삭제했습니다.');
  if (!error) await loadRsvps();
});

// ---- Guestbook messages ----
const guestbookAdminList = document.getElementById('guestbookAdminList');

async function loadGuestbookAdmin() {
  const { data, error } = await sb.from('guestbook_messages').select('*').order('created_at', { ascending: false });
  if (error) {
    guestbookAdminList.innerHTML = '<p class="empty-note">불러오지 못했습니다.</p>';
    return;
  }
  if (!data || data.length === 0) {
    guestbookAdminList.innerHTML = '<p class="empty-note">아직 방명록 메시지가 없습니다.</p>';
    return;
  }
  guestbookAdminList.innerHTML = data
    .map(
      (m) => `
      <div class="admin-list-card" data-id="${m.id}">
        <div class="admin-list-main">
          <p class="admin-list-title">${escapeHtml(m.author)}</p>
          <p class="admin-list-sub">${escapeHtml(m.content)}</p>
          <p class="admin-list-date">${formatDate(m.created_at)}</p>
        </div>
        <button class="icon-btn danger" aria-label="삭제">✕</button>
      </div>`
    )
    .join('');
}

guestbookAdminList.addEventListener('click', async (e) => {
  const btn = e.target.closest('.icon-btn');
  if (!btn) return;
  const id = btn.closest('.admin-list-card').dataset.id;
  if (!confirm('이 메시지를 삭제할까요?')) return;
  btn.disabled = true;
  const { error } = await sb.from('guestbook_messages').delete().eq('id', id);
  showToast(error ? '삭제에 실패했습니다.' : '삭제했습니다.');
  if (!error) await loadGuestbookAdmin();
});

// ---- Guest snap uploads ----
const SNAP_BUCKET = 'guest-snap';
const snapAdminList = document.getElementById('snapAdminList');

async function loadSnapsAdmin() {
  const { data, error } = await sb.from('guest_snaps').select('*').order('created_at', { ascending: false });
  if (error) {
    snapAdminList.innerHTML = '<p class="empty-note">불러오지 못했습니다.</p>';
    return;
  }
  if (!data || data.length === 0) {
    snapAdminList.innerHTML = '<p class="empty-note">아직 업로드된 게스트 스냅이 없습니다.</p>';
    return;
  }
  snapAdminList.innerHTML = data
    .map((s) => {
      const url = sb.storage.from(SNAP_BUCKET).getPublicUrl(s.file_path).data.publicUrl;
      const media =
        s.file_type === 'video'
          ? `<video class="admin-list-thumb" src="${url}" muted preload="metadata"></video>`
          : `<img class="admin-list-thumb" src="${url}" alt="" loading="lazy" />`;
      return `
      <div class="admin-list-card" data-id="${s.id}" data-file="${escapeHtml(s.file_path)}">
        ${media}
        <div class="admin-list-main">
          <p class="admin-list-title">${escapeHtml(s.author)}</p>
          ${s.caption ? `<p class="admin-list-sub">${escapeHtml(s.caption)}</p>` : ''}
          <p class="admin-list-date">${formatDate(s.created_at)}</p>
        </div>
        <button class="icon-btn danger" aria-label="삭제">✕</button>
      </div>`;
    })
    .join('');
}

snapAdminList.addEventListener('click', async (e) => {
  const btn = e.target.closest('.icon-btn');
  if (!btn) return;
  const card = btn.closest('.admin-list-card');
  const id = card.dataset.id;
  const filePath = card.dataset.file;
  if (!confirm('이 사진을 삭제할까요?')) return;
  btn.disabled = true;
  await sb.storage.from(SNAP_BUCKET).remove([filePath]);
  const { error } = await sb.from('guest_snaps').delete().eq('id', id);
  showToast(error ? '삭제에 실패했습니다.' : '삭제했습니다.');
  if (!error) await loadSnapsAdmin();
});

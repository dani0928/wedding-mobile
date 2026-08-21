const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const BUCKET = 'gallery';

// ---- Password gate ----
const gate = document.getElementById('gate');
const app = document.getElementById('app');
const pwInput = document.getElementById('pwInput');
const pwSubmit = document.getElementById('pwSubmit');
const gateError = document.getElementById('gateError');

function enterApp() {
  gate.style.display = 'none';
  app.style.display = 'block';
  loadPhotos();
}

function tryLogin() {
  if (pwInput.value === ADMIN_PASSWORD) {
    sessionStorage.setItem('admin_unlocked', '1');
    gateError.textContent = '';
    enterApp();
  } else {
    gateError.textContent = '비밀번호가 올바르지 않습니다.';
  }
}

pwSubmit.addEventListener('click', tryLogin);
pwInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') tryLogin();
});

document.getElementById('lockBtn').addEventListener('click', () => {
  sessionStorage.removeItem('admin_unlocked');
  location.reload();
});

if (sessionStorage.getItem('admin_unlocked') === '1') {
  enterApp();
}

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
  }
});

// ---- Upload ----
const uploadBox = document.getElementById('uploadBox');
const fileInput = document.getElementById('fileInput');
const uploadStatus = document.getElementById('uploadStatus');

function compressImage(file) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const maxDim = 1600;
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
        0.82
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file);
    };
    img.src = url;
  });
}

async function uploadOne(file, position) {
  const compressed = await compressImage(file);
  const isCompressed = compressed !== file;
  const ext = isCompressed ? 'jpg' : file.name.split('.').pop() || 'jpg';
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const contentType = isCompressed ? 'image/jpeg' : file.type || 'image/jpeg';
  const { error: uploadError } = await sb.storage.from(BUCKET).upload(path, compressed, { contentType });
  if (uploadError) throw uploadError;
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

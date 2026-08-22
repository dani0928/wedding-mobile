// ---- Tmap fallback (앱 미설치 시 스토어로 이동) ----
(function setupTmapFallback() {
  const link = document.getElementById('tmapLink');
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const storeUrl = isIOS
    ? 'https://apps.apple.com/kr/app/tmap-%ED%8B%B0%EB%A7%B5/id431589174'
    : 'https://play.google.com/store/apps/details?id=com.skt.tmap.ku';

  link.addEventListener('click', () => {
    const start = Date.now();
    setTimeout(() => {
      // 티맵이 실행되면 브라우저가 백그라운드로 전환되어 document.hidden이 true가 되거나
      // 페이지 이탈로 setTimeout 실행이 지연된다. 둘 다 아니면 앱 실행에 실패한 것으로 판단.
      if (!document.hidden && Date.now() - start < 2000) {
        window.location.href = storeUrl;
      }
    }, 1500);
  });
})();

// ---- Naver Map ----
(function setupNaverMap() {
  const VENUE_LAT = 37.2767512;
  const VENUE_LNG = 127.0074805;

  function initMap() {
    const center = new naver.maps.LatLng(VENUE_LAT, VENUE_LNG);
    const map = new naver.maps.Map('naverMap', {
      center,
      zoom: 16,
    });
    new naver.maps.Marker({ position: center, map });
  }

  const script = document.createElement('script');
  script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${NAVER_MAP_CLIENT_ID}`;
  script.onload = initMap;
  script.onerror = () => {
    document.getElementById('naverMap').innerHTML =
      '<p style="padding:16px;font-size:0.78rem;color:#6b6b6b;">지도를 불러오지 못했습니다.</p>';
  };
  document.head.appendChild(script);
})();

// ---- Loading screen: typewriter intro + confetti ----
(function setupLoadingScreen() {
  const screen = document.getElementById('loadingScreen');
  const textEl = document.getElementById('loadingTypewriterText');
  const fullText = '진혁 ♥ 하늘 결혼식에 초대합니다';
  const charDelay = 80;
  const startDelay = 400;

  function fireConfetti() {
    if (typeof confetti !== 'function') return;
    const count = 200;
    const defaults = { origin: { y: 0.7 }, zIndex: 300 };
    function fire(ratio, opts) {
      confetti(Object.assign({}, defaults, opts, { particleCount: Math.floor(count * ratio) }));
    }
    fire(0.25, { spread: 26, startVelocity: 55 });
    fire(0.2, { spread: 60 });
    fire(0.35, { spread: 100, decay: 0.91, scalar: 0.8 });
    fire(0.1, { spread: 120, startVelocity: 25, decay: 0.92, scalar: 1.2 });
    fire(0.1, { spread: 120, startVelocity: 45 });
  }

  function typeNext(i) {
    if (i > fullText.length) {
      fireConfetti();
      return;
    }
    const slice = fullText.slice(0, i);
    textEl.innerHTML = slice.replace('♥', '<span class="tw-heart">♥</span>');
    setTimeout(() => typeNext(i + 1), charDelay);
  }
  setTimeout(() => typeNext(0), startDelay);

  // 타이핑 + 컨페티 연출이 끝날 때까지는 최소한 보여준다
  const minShownAt = Date.now() + startDelay + fullText.length * charDelay + 2500;
  function hide() {
    const wait = Math.max(0, minShownAt - Date.now());
    setTimeout(() => screen.classList.add('hidden'), wait);
  }
  if (document.readyState === 'complete') {
    hide();
  } else {
    window.addEventListener('load', hide);
  }
  // 이미지가 많아 load 이벤트가 오래 걸릴 경우를 대비한 안전장치
  setTimeout(hide, 6000);
})();

// ---- Background music ----
(function setupBgm() {
  const bgm = document.getElementById('bgm');
  const toggleBtn = document.getElementById('musicToggle');
  bgm.volume = 0.5;

  function setPlayingUI(isPlaying) {
    toggleBtn.classList.toggle('playing', isPlaying);
  }

  function play() {
    bgm.play().then(() => setPlayingUI(true)).catch(() => setPlayingUI(false));
  }

  function pause() {
    bgm.pause();
    setPlayingUI(false);
  }

  // 모바일 브라우저는 사용자 상호작용 없이 자동재생을 막으므로,
  // 첫 로드시 재생을 시도하고 실패하면 최초 터치/클릭 시 재생한다.
  play();
  const resumeOnInteraction = () => {
    if (bgm.paused) play();
    document.removeEventListener('touchend', resumeOnInteraction);
    document.removeEventListener('click', resumeOnInteraction);
  };
  document.addEventListener('touchend', resumeOnInteraction, { once: true });
  document.addEventListener('click', resumeOnInteraction, { once: true });

  toggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (bgm.paused) {
      play();
    } else {
      pause();
    }
  });
})();

// ---- Scroll fade-in ----
const sections = document.querySelectorAll('.section:not(.hero)');
const io = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.classList.add('in-view');
      io.unobserve(entry.target);
    }
  });
}, { threshold: 0.15 });
sections.forEach((s) => io.observe(s));

// ---- Supabase client ----
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ---- Countdown ----
const WEDDING_DATE = new Date(2026, 9, 10, 17, 50, 0); // 2026-10-10 17:50 (오후 5시 50분)

function updateCountdown() {
  const now = new Date();
  let diff = WEDDING_DATE - now;
  if (diff < 0) diff = 0;
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
  const minutes = Math.floor((diff / (1000 * 60)) % 60);
  const seconds = Math.floor((diff / 1000) % 60);
  document.getElementById('cdDays').textContent = days;
  document.getElementById('cdHours').textContent = String(hours).padStart(2, '0');
  document.getElementById('cdMinutes').textContent = String(minutes).padStart(2, '0');
  document.getElementById('cdSeconds').textContent = String(seconds).padStart(2, '0');
  document.getElementById('cdDaysInline').textContent = days;
}
updateCountdown();
setInterval(updateCountdown, 1000);

// ---- Calendar ----
function renderCalendar() {
  const year = WEDDING_DATE.getFullYear();
  const month = WEDDING_DATE.getMonth();
  const targetDay = WEDDING_DATE.getDate();
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const dowNames = ['일', '월', '화', '수', '목', '금', '토'];
  let html = `<div class="calendar-title">${year}년 ${month + 1}월</div><div class="calendar-grid">`;
  dowNames.forEach((d) => (html += `<div class="dow">${d}</div>`));
  for (let i = 0; i < firstDow; i++) html += `<div class="day"></div>`;
  for (let d = 1; d <= daysInMonth; d++) {
    html += `<div class="day${d === targetDay ? ' highlight' : ''}">${d}</div>`;
  }
  html += `</div>`;
  document.getElementById('calendar').innerHTML = html;
}
renderCalendar();

// ---- Modals ----
function openModal(id) {
  document.getElementById(id).hidden = false;
}
function closeModal(id) {
  document.getElementById(id).hidden = true;
}
document.getElementById('openRsvpModal').addEventListener('click', () => openModal('rsvpModal'));
document.querySelectorAll('.modal-close').forEach((btn) => {
  btn.addEventListener('click', () => closeModal(btn.dataset.close));
});
document.querySelectorAll('.modal-overlay').forEach((overlay) => {
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.hidden = true;
  });
});

// ---- Gallery lightbox (swipeable, shared by gallery + guest snap grids) ----
const lightbox = document.getElementById('lightbox');
const lightboxImg = document.getElementById('lightboxImg');
const lightboxPrev = document.getElementById('lightboxPrev');
const lightboxNext = document.getElementById('lightboxNext');
let lightboxImages = [];
let lightboxIndex = 0;

function showLightboxImage(i) {
  lightboxIndex = (i + lightboxImages.length) % lightboxImages.length;
  lightboxImg.style.backgroundImage = `url("${lightboxImages[lightboxIndex]}")`;
}

function openLightbox(images, startIndex) {
  lightboxImages = images;
  showLightboxImage(startIndex);
  lightbox.hidden = false;
}

// Gallery photos render as background-image divs (not <img>) so that
// in-app browsers like KakaoTalk's, which attach their own long-press
// "save image" menu specifically to <img> elements, have nothing to hook.
function bindLightboxGroup(containerSelector) {
  document.querySelectorAll(containerSelector).forEach((container) => {
    const tiles = Array.from(container.querySelectorAll('.gallery-tile-img, img[data-lightbox]'));
    tiles.forEach((tile, i) => {
      const getSrc = (el) => el.dataset.src || el.src;
      tile.addEventListener('click', () => openLightbox(tiles.map(getSrc), i));
    });
  });
}

document.addEventListener('contextmenu', (e) => {
  if (e.target.closest('.gallery-tile-img') || e.target === lightboxImg) e.preventDefault();
});
document.addEventListener('dragstart', (e) => {
  if (e.target.closest('.gallery-tile-img') || e.target === lightboxImg) e.preventDefault();
});

// ---- Gallery + hero (Supabase-backed, managed via admin.html) ----
(async function loadGalleryFromSupabase() {
  const heroImg = document.getElementById('heroImg');
  const galleryGrid = document.getElementById('galleryCarousel');

  const { data, error } = await sb.from('gallery_photos').select('*').order('position', { ascending: true });
  if (error || !data || data.length === 0) return;

  const hero = data.find((p) => p.is_hero) || data[0];
  heroImg.onerror = null;
  heroImg.src = sb.storage.from('gallery').getPublicUrl(hero.file_path).data.publicUrl;

  const tiles = data.filter((p) => p.id !== hero.id);
  galleryGrid.innerHTML = tiles.map(() => '<div class="gallery-tile"><div class="gallery-tile-img" role="img"></div></div>').join('');
  Array.from(galleryGrid.querySelectorAll('.gallery-tile-img')).forEach((tile, i) => {
    const url = sb.storage.from('gallery').getPublicUrl(tiles[i].file_path).data.publicUrl;
    tile.dataset.src = url;
    tile.style.backgroundImage = `url("${url}")`;
  });

  bindLightboxGroup('#galleryCarousel');
})();

// ---- Site text content (Supabase-backed, managed via admin.html) ----
(async function loadSiteContent() {
  const { data, error } = await sb.from('site_content').select('key, value');
  if (error || !data) return;
  const content = Object.fromEntries(data.map((row) => [row.key, row.value]));

  const setText = (id, value) => {
    const el = document.getElementById(id);
    if (el && value != null) el.textContent = value;
  };

  setText('heroNames', content.groom_name && content.bride_name ? `${content.bride_name} · ${content.groom_name}` : null);
  setText('groomParents', content.groom_parents);
  setText('groomNameInv', content.groom_name);
  setText('brideParents', content.bride_parents);
  setText('brideNameInv', content.bride_name);
  setText('invitationSignature', content.invitation_signature);
  setText('cdGroomName', content.groom_name);
  setText('cdBrideName', content.bride_name);
  setText('countdownDateText', content.wedding_datetime_text);
  setText('guestSnapPrizeNote', content.guest_snap_prize_note);
  setText('footerNames', content.groom_name && content.bride_name ? `${content.groom_name} · ${content.bride_name}` : null);
  setText('footerDateText', content.wedding_datetime_text);
  setText('footerVenueText', content.venue_name);

  if (content.invitation_message) {
    const el = document.getElementById('invitationMessage');
    if (el) el.innerHTML = escapeHtml(content.invitation_message).split('\n').join('<br/>');
  }
})();

// ---- Wedding accounts (Supabase-backed, managed via admin.html) ----
(async function loadWeddingAccounts() {
  const { data, error } = await sb.from('wedding_accounts').select('*').order('position', { ascending: true });
  if (error || !data) return;

  const bankIcon = (icon, holder) => {
    if (icon === 'kb') return `<img class="bank-badge-img bank-badge-kb" src="img/icon-kb.png" alt="" />`;
    if (icon === 'nh') return `<img class="bank-badge-img" src="img/icon-nh.png" alt="" />`;
    return '';
  };

  const renderEntry = (a) => `
    <div class="account-entry">
      <p class="account-name">${escapeHtml(a.display_name)}</p>
      <div class="account-row">
        <div class="account-detail">
          <span class="account-number">${escapeHtml(a.account_number)}</span>
          <span class="bank-info">${bankIcon(a.bank_icon)}${escapeHtml(a.bank_name)} ${escapeHtml(a.holder_name)}</span>
        </div>
        <div class="account-actions">
          <button class="btn-copy" data-copy="${escapeHtml(a.account_number)}">복사</button>
          ${
            a.kakaopay_url
              ? `<a class="btn-kpay" href="${escapeHtml(a.kakaopay_url)}" target="_blank" rel="noopener" aria-label="카카오페이로 송금하기"><img class="kpay-icon" src="img/kpay.svg" alt="" /></a>`
              : ''
          }
        </div>
      </div>
    </div>
  `;

  const groomEl = document.getElementById('groomAccounts');
  const brideEl = document.getElementById('brideAccounts');
  const groomAccounts = data.filter((a) => a.side === 'groom');
  const brideAccounts = data.filter((a) => a.side === 'bride');
  if (groomEl) groomEl.innerHTML = groomAccounts.map(renderEntry).join('') || '<p class="empty-note">등록된 계좌가 없습니다.</p>';
  if (brideEl) brideEl.innerHTML = brideAccounts.map(renderEntry).join('') || '<p class="empty-note">등록된 계좌가 없습니다.</p>';
})();

document.getElementById('lightboxClose').addEventListener('click', () => {
  lightbox.hidden = true;
});
lightbox.addEventListener('click', (e) => {
  if (e.target === lightbox) lightbox.hidden = true;
});
lightboxPrev.addEventListener('click', (e) => {
  e.stopPropagation();
  showLightboxImage(lightboxIndex - 1);
});
lightboxNext.addEventListener('click', (e) => {
  e.stopPropagation();
  showLightboxImage(lightboxIndex + 1);
});
document.addEventListener('keydown', (e) => {
  if (lightbox.hidden) return;
  if (e.key === 'ArrowLeft') showLightboxImage(lightboxIndex - 1);
  if (e.key === 'ArrowRight') showLightboxImage(lightboxIndex + 1);
  if (e.key === 'Escape') lightbox.hidden = true;
});

let lightboxTouchStartX = null;
lightbox.addEventListener('touchstart', (e) => {
  lightboxTouchStartX = e.touches.length === 1 ? e.touches[0].clientX : null;
});
lightbox.addEventListener('touchmove', (e) => {
  if (e.touches.length > 1) lightboxTouchStartX = null;
});
lightbox.addEventListener('touchend', (e) => {
  if (lightboxTouchStartX === null) return;
  const dx = e.changedTouches[0].clientX - lightboxTouchStartX;
  if (Math.abs(dx) > 40) {
    showLightboxImage(dx < 0 ? lightboxIndex + 1 : lightboxIndex - 1);
  }
  lightboxTouchStartX = null;
});

// ---- RSVP auto popup (once per day) ----
(function autoRsvpPopup() {
  const key = 'rsvp_popup_last_shown';
  const today = new Date().toDateString();
  const last = localStorage.getItem(key);
  if (last === today) return;
  setTimeout(() => {
    openModal('rsvpModal');
  }, 2000);
})();

// ---- RSVP form toggles ----
function setupToggleGroup(groupId) {
  const group = document.getElementById(groupId);
  const buttons = group.querySelectorAll('.toggle-btn');
  buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
      buttons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
}
setupToggleGroup('rsvpSide');
setupToggleGroup('rsvpAttendance');
setupToggleGroup('rsvpMeal');

function getToggleValue(groupId) {
  const active = document.querySelector(`#${groupId} .toggle-btn.active`);
  return active ? active.dataset.value : '';
}

document.getElementById('rsvpForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const submitBtn = e.target.querySelector('button[type="submit"]');
  submitBtn.disabled = true;

  const { error } = await sb.from('rsvp_submissions').insert({
    side: getToggleValue('rsvpSide'),
    name: document.getElementById('rsvpName').value,
    attendance: getToggleValue('rsvpAttendance'),
    guest_count: document.getElementById('rsvpCount').value || null,
    companion: document.getElementById('rsvpCompanion').value || null,
    meal_preference: getToggleValue('rsvpMeal'),
  });

  submitBtn.disabled = false;

  if (error) {
    showToast('전송에 실패했습니다. 잠시 후 다시 시도해주세요.');
    return;
  }

  const dontShow = document.getElementById('rsvpDontShowToday').checked;
  if (dontShow) {
    localStorage.setItem('rsvp_popup_last_shown', new Date().toDateString());
  }

  showToast('참석 의사가 전달되었습니다. 감사합니다.');
  closeModal('rsvpModal');
  e.target.reset();
  document.querySelectorAll('.toggle-btn.active').forEach((b) => b.classList.remove('active'));
});

// ---- Accordion ----
document.querySelectorAll('.accordion-header').forEach((header) => {
  header.addEventListener('click', () => {
    header.parentElement.classList.toggle('open');
  });
});

// ---- Copy buttons (event delegation so dynamically-rendered accounts work too) ----
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.btn-copy');
  if (!btn) return;
  navigator.clipboard.writeText(btn.dataset.copy).then(() => showToast('복사되었습니다.'));
});
// ---- Kakao Share ----
(function setupKakaoShare() {
  const btn = document.getElementById('kakaoShareBtn');

  if (!KAKAO_JS_KEY) {
    btn.addEventListener('click', () => showToast('카카오톡 공유 설정이 아직 준비되지 않았습니다.'));
    return;
  }

  Kakao.init(KAKAO_JS_KEY);

  btn.addEventListener('click', () => {
    Kakao.Share.sendDefault({
      objectType: 'feed',
      content: {
        title: '박진혁 🖤 서하늘 결혼식에 초대합니다',
        description: '2026년 10월 10일 토요일 오후 5시 50분',
        imageUrl: 'https://qmqbsldraxuvfsjvkchk.supabase.co/storage/v1/object/public/gallery/share-thumbnail.jpg',
        link: { mobileWebUrl: window.location.href, webUrl: window.location.href },
      },
      buttons: [
        {
          title: '청첩장 보기',
          link: { mobileWebUrl: window.location.href, webUrl: window.location.href },
        },
      ],
    });
  });
})();

// ---- Toast ----
let toastTimer;
function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
}

// ---- Guest snap (Supabase Storage + realtime) ----
(function setupGuestSnap() {
  const fileInput = document.getElementById('snapFile');
  const fileNameEl = document.getElementById('snapFileName');
  const submitBtn = document.getElementById('snapSubmit');
  const grid = document.getElementById('guestSnapGrid');

  const weddingDayStart = new Date(WEDDING_DATE.getFullYear(), WEDDING_DATE.getMonth(), WEDDING_DATE.getDate(), 0, 0, 0);

  fileInput.addEventListener('change', () => {
    fileNameEl.textContent = fileInput.files[0] ? fileInput.files[0].name : '';
  });

  submitBtn.addEventListener('click', async () => {
    if (new Date() < weddingDayStart) {
      showToast('예식 당일부터 업로드가 가능합니다.');
      return;
    }
    const author = document.getElementById('snapAuthor').value.trim();
    const caption = document.getElementById('snapCaption').value.trim();
    const file = fileInput.files[0];
    if (!author || !file) {
      showToast('이름과 파일을 선택해주세요.');
      return;
    }
    const ext = file.name.split('.').pop() || 'jpg';
    const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    submitBtn.disabled = true;
    const { error: uploadError } = await sb.storage.from('guest-snap').upload(path, file);
    if (uploadError) {
      submitBtn.disabled = false;
      showToast('업로드에 실패했습니다. 잠시 후 다시 시도해주세요.');
      return;
    }
    const { error: insertError } = await sb.from('guest_snaps').insert({
      author,
      caption: caption || null,
      file_path: path,
      file_type: 'image',
    });
    submitBtn.disabled = false;

    if (insertError) {
      showToast('업로드에 실패했습니다. 잠시 후 다시 시도해주세요.');
      return;
    }
    document.getElementById('snapAuthor').value = '';
    document.getElementById('snapCaption').value = '';
    fileInput.value = '';
    fileNameEl.textContent = '';
    showToast('업로드되었습니다. 감사합니다!');
  });

  const guestSnaps = [];
  function renderGuestSnaps() {
    if (guestSnaps.length === 0) {
      grid.innerHTML = '<p class="snap-empty">아직 업로드된 사진이 없습니다.</p>';
      return;
    }
    grid.innerHTML = guestSnaps
      .map((s) => {
        const url = sb.storage.from('guest-snap').getPublicUrl(s.file_path).data.publicUrl;
        const media =
          s.file_type === 'video'
            ? `<video src="${url}" controls playsinline></video>`
            : `<img src="${url}" loading="lazy" alt="" data-lightbox="1" />`;
        const caption = s.caption ? `<span class="snap-caption">${escapeHtml(s.caption)} — ${escapeHtml(s.author)}</span>` : `<span class="snap-caption">${escapeHtml(s.author)}</span>`;
        return `<div class="snap-item">${media}${caption}</div>`;
      })
      .join('');
    const snapImgs = Array.from(grid.querySelectorAll('img[data-lightbox]'));
    snapImgs.forEach((img, i) => {
      img.addEventListener('click', () => openLightbox(snapImgs.map((el) => el.src), i));
    });
  }

  async function loadGuestSnaps() {
    const { data, error } = await sb.from('guest_snaps').select('*').order('created_at', { ascending: false });
    if (!error && data) {
      guestSnaps.push(...data);
      renderGuestSnaps();
    }
  }
  loadGuestSnaps();

  sb.channel('guest-snap-realtime')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'guest_snaps' }, (payload) => {
      guestSnaps.unshift(payload.new);
      renderGuestSnaps();
    })
    .subscribe();
})();

// ---- Guestbook (Supabase, realtime) ----
const GB_COLORS = ['#ffe8ec', '#e8f4ff', '#fff6d9', '#e9f9ec', '#f1e9ff', '#ffece0'];
const gbRotations = new Map(); // stable per-card rotation, keyed by message id
const guestbookMessages = [];

document.getElementById('gbSubmit').addEventListener('click', async () => {
  const author = document.getElementById('gbAuthor').value.trim();
  const content = document.getElementById('gbContent').value.trim();
  if (!author || !content) {
    showToast('이름과 메시지를 입력해주세요.');
    return;
  }
  const submitBtn = document.getElementById('gbSubmit');
  submitBtn.disabled = true;
  const { error } = await sb.from('guestbook_messages').insert({
    author,
    content,
    color_index: Math.floor(Math.random() * 6),
  });
  submitBtn.disabled = false;

  if (error) {
    showToast('등록에 실패했습니다. 잠시 후 다시 시도해주세요.');
    return;
  }
  document.getElementById('gbAuthor').value = '';
  document.getElementById('gbContent').value = '';
  showToast('메시지가 등록되었습니다. 감사합니다!');
  // 실제 카드는 realtime INSERT 이벤트를 통해 렌더링됩니다.
});

function cardRotation(id) {
  if (!gbRotations.has(id)) {
    gbRotations.set(id, (Math.random() * 6 - 3).toFixed(1));
  }
  return gbRotations.get(id);
}

function renderGuestbook() {
  const container = document.getElementById('guestbookList');
  if (guestbookMessages.length === 0) {
    container.innerHTML = '<p class="gb-empty">아직 축하 메시지가 없습니다. 첫 메시지를 남겨보세요!</p>';
    return;
  }
  container.innerHTML = guestbookMessages
    .map(
      (m) => `
    <div class="gb-card" style="background:${GB_COLORS[m.color_index] || GB_COLORS[0]}; transform: rotate(${cardRotation(m.id)}deg);">
      ${escapeHtml(m.content)}
      <span class="gb-author">— ${escapeHtml(m.author)}</span>
    </div>`
    )
    .join('');
}
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

async function loadGuestbook() {
  const { data, error } = await sb
    .from('guestbook_messages')
    .select('*')
    .order('created_at', { ascending: false });
  if (!error && data) {
    guestbookMessages.push(...data);
    renderGuestbook();
  }
}
loadGuestbook();

sb.channel('guestbook-realtime')
  .on(
    'postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'guestbook_messages' },
    (payload) => {
      guestbookMessages.unshift(payload.new);
      renderGuestbook();
    }
  )
  .subscribe();

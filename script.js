import { createClient } from '@supabase/supabase-js';
import { Upload as TusUpload } from 'tus-js-client';

const DEFAULT_SUPABASE_URL = 'https://eniqpgsoszwnjynwopjt.supabase.co';
const DEFAULT_SUPABASE_KEY = 'sb_publishable_pWpqpEJkIi4iJc955IPnKg_uOCpZZuK0';
const SUPABASE_URL = String(import.meta.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL).trim();
const SUPABASE_KEY = String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || DEFAULT_SUPABASE_KEY).trim();

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

const categories = {
  business: 'الأعمال',
  education: 'التعليم',
  health: 'الصحة',
  productivity: 'الإنتاجية',
  games: 'الألعاب',
  tools: 'الأدوات',
};

let apps = [];
let currentUser = null;
let currentProfile = null;
let bootFinished = false;

function escapeHTML(value = '') {
  return String(value).replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  }[char]));
}

function friendlyError(error, fallback = 'حدث خطأ غير متوقع.') {
  const raw = typeof error === 'string' ? error : (error?.message || error?.error_description || '');
  const message = String(raw).trim();
  const lower = message.toLowerCase();

  if (!message) return fallback;
  if (lower.includes('invalid login credentials')) return 'البريد الإلكتروني أو كلمة المرور غير صحيحة.';
  if (lower.includes('email not confirmed')) return 'الحساب لم يتم تأكيد بريده الإلكتروني بعد.';
  if (lower.includes('user already registered') || lower.includes('already registered')) return 'هذا البريد الإلكتروني مستخدم بالفعل.';
  if (lower.includes('jwt') || lower.includes('token')) return 'انتهت جلسة الدخول. سجّل الدخول مرة أخرى.';
  if (lower.includes('row-level security') || lower.includes('rls')) return 'تم رفض العملية بسبب صلاحيات قاعدة البيانات (RLS). تأكد أن الحساب Admin وأن سياسات Supabase مفعلة.';
  if (lower.includes('bucket') && lower.includes('not found')) return 'مجلد التخزين app-files غير موجود في Supabase.';
  if (lower.includes('mime') || lower.includes('content type')) return 'Supabase رفض نوع الملف. تأكد أن Bucket يسمح برفع الملفات.';
  if (lower.includes('payload too large') || lower.includes('too large') || lower.includes('413')) return 'حجم الملف كبير على طريقة الرفع الحالية.';
  if (lower.includes('failed to fetch') || lower.includes('network')) return 'تعذر الاتصال بـ Supabase. تحقق من الإنترنت وإعدادات المشروع.';
  return message;
}

function toast(message, type = 'success') {
  let box = document.getElementById('codexToast');
  if (!box) {
    box = document.createElement('div');
    box.id = 'codexToast';
    box.className = 'codex-toast';
    document.body.appendChild(box);
  }
  box.className = `codex-toast show ${type}`;
  box.textContent = message;
  clearTimeout(window.__codexToastTimer);
  window.__codexToastTimer = setTimeout(() => box.classList.remove('show'), 3200);
}

function formatFileSize(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value ?? '';
}

function initials(name = 'C') {
  const clean = String(name).trim();
  if (!clean) return 'C';
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
}

function appIconMarkup(app, cls = 'app-icon') {
  if (app?.icon_url) {
    return `<div class="${cls} has-image"><img src="${escapeHTML(app.icon_url)}" alt="${escapeHTML(app.name || 'Application')}" loading="lazy" onerror="this.style.display='none';this.parentElement.classList.remove('has-image');this.parentElement.classList.add('auto-initials');this.parentElement.textContent='${escapeHTML(initials(app?.name || app?.icon_text || 'C'))}';"></div>`;
  }
  return `<div class="${cls} auto-initials">${escapeHTML(initials(app?.name || app?.icon_text || 'C'))}</div>`;
}

function getFile(app, platform) {
  return (app?.app_files || []).find((file) => file.platform === platform);
}

function appTotalBytes(app) {
  const filesTotal = (app?.app_files || []).reduce((sum, file) => sum + Number(file.size_bytes || 0), 0);
  return filesTotal || Number(app?.total_size_bytes || 0);
}

function appSize(app) {
  return formatFileSize(appTotalBytes(app));
}

function platformName(app) {
  const platforms = (app?.app_files || []).map((file) => file.platform);
  if (platforms.includes('windows') && platforms.includes('android')) return 'Windows + Android';
  if (platforms.includes('android')) return 'Android';
  if (platforms.includes('windows')) return 'Windows';
  if (app?.platform) return app.platform;
  return '—';
}

function fileBadgeMarkup(app) {
  const files = app?.app_files || [];
  if (!files.length) return '<div class="file-badges empty"><span>لا توجد ملفات</span></div>';
  return `<div class="file-badges">${files.map((file) => `<span>${file.platform === 'windows' ? 'EXE' : 'APK'} · ${escapeHTML(formatFileSize(file.size_bytes))}</span>`).join('')}</div>`;
}

function publicUrl(path, downloadName = null, bucket = 'app-files') {
  const options = downloadName ? { download: downloadName } : undefined;
  return supabase.storage.from(bucket).getPublicUrl(path, options).data.publicUrl;
}

function withTimeout(promise, ms, message = 'انتهت مهلة الاتصال.') {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
  ]);
}

function ensurePageLoader() {
  let loader = document.getElementById('codexPageLoader');
  if (loader) return loader;
  loader = document.createElement('div');
  loader.id = 'codexPageLoader';
  loader.className = 'codex-page-loader';
  loader.innerHTML = `
    <div class="page-loader-card">
      <div class="page-loader-logo"><img src="assets/codex-logo.png" alt="CODEX"><strong>C</strong></div>
      <div class="page-loader-title">CODEX</div>
      <div class="page-loader-stage">جاري تجهيز الصفحة...</div>
      <div class="page-loader-track"><i></i></div>
    </div>`;
  document.body.appendChild(loader);
  requestAnimationFrame(() => loader.classList.add('visible'));
  return loader;
}

function hidePageLoader(delay = 250) {
  const loader = document.getElementById('codexPageLoader');
  if (!loader) return;
  setTimeout(() => {
    loader.classList.remove('visible');
    loader.classList.add('hide');
    setTimeout(() => loader.remove(), 500);
  }, delay);
}

function setupNavigationEffects() {
  // Keep navigation native and fast. No fullscreen loader and no tap animation.
  window.addEventListener('pageshow', () => {
    document.body.classList.remove('codex-navigating');
  }, { passive: true });
}

async function requireConfig() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    toast('إعدادات Supabase غير موجودة.', 'error');
    return false;
  }
  return true;
}

async function loadSession() {
  try {
    const result = await withTimeout(supabase.auth.getSession(), 8000, 'تعذر قراءة جلسة الدخول.');
    currentUser = result.data?.session?.user || null;
  } catch (error) {
    console.error('getSession', error);
    currentUser = null;
  }
  if (currentUser) await loadProfile();
  return currentUser;
}

async function loadProfile() {
  if (!currentUser) {
    currentProfile = null;
    return null;
  }
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', currentUser.id)
    .maybeSingle();

  if (error) {
    console.error('loadProfile', error);
    currentProfile = null;
    return null;
  }

  if (!data) {
    const profilePayload = {
      id: currentUser.id,
      name: String(currentUser.user_metadata?.name || currentUser.email?.split('@')[0] || 'مستخدم').trim(),
      email: currentUser.email || null,
      role: 'user',
    };
    const repair = await supabase.from('profiles').upsert(profilePayload, { onConflict: 'id' }).select().maybeSingle();
    if (!repair.error) currentProfile = repair.data;
  } else {
    currentProfile = data;
  }
  return currentProfile;
}

async function isAdmin() {
  if (!currentUser) return false;
  if (currentProfile?.role === 'admin') return true;
  try {
    const { data } = await withTimeout(supabase.rpc('is_admin'), 5000, 'تعذر التحقق من الصلاحيات.');
    return data === true;
  } catch (error) {
    console.error('isAdmin', error);
    return false;
  }
}

async function loadApps(showError = true) {
  try {
    const result = await withTimeout(
      supabase
        .from('apps')
        .select('id,name,slug,description,changelog,category,category_name,version,icon_text,icon_url,icon_storage_path,rating,download_url,download_count,total_size_bytes,platform,created_by,created_at,updated_at,app_files(id,app_id,platform,file_name,storage_path,mime_type,size_bytes,created_at)')
        .order('updated_at', { ascending: false }),
      12000,
      'انتهت مهلة تحميل التطبيقات.'
    );
    if (result.error) throw result.error;
    apps = result.data || [];
  } catch (error) {
    console.error('loadApps', error);
    if (showError) toast(friendlyError(error, 'تعذر تحميل التطبيقات.'), 'error');
  }
  return apps;
}

function setupNavbar() {
  const loginBtn = document.getElementById('loginBtn');
  if (loginBtn) {
    loginBtn.classList.remove('pending');
    if (currentUser) {
      loginBtn.setAttribute('href', 'account.html');
      loginBtn.textContent = currentProfile?.name || 'حسابي';
      loginBtn.setAttribute('aria-label', 'فتح الحساب');
    } else {
      loginBtn.setAttribute('href', 'login.html');
      loginBtn.textContent = 'تسجيل الدخول';
      loginBtn.setAttribute('aria-label', 'تسجيل الدخول');
    }
  }

  document.querySelectorAll('[data-logout]').forEach((button) => {
    button.onclick = async (event) => {
      event.preventDefault();
      button.disabled = true;
      button.textContent = 'جاري الخروج...';
      await supabase.auth.signOut();
      currentUser = null;
      currentProfile = null;
      location.href = 'index.html';
    };
  });

  document.querySelectorAll('.nav-actions').forEach((container) => {
    const old = container.querySelector('[data-dashboard-link]');
    if (old) old.remove();
    if (currentProfile?.role === 'admin') {
      container.insertAdjacentHTML('afterbegin', '<a class="secondary-btn" data-dashboard-link href="dashboard.html">لوحة التحكم</a>');
    }
  });
}

function displayApps(list) {
  const grid = document.getElementById('appsGrid');
  if (!grid) return;
  grid.innerHTML = list.length
    ? list.map((app) => `<article class="app-card reveal-in"><a class="app-card-link" href="app.html?id=${encodeURIComponent(app.id)}">${appIconMarkup(app)}<div class="app-card-content"><span>${escapeHTML(app.category_name || 'الأدوات')}</span><h3>${escapeHTML(app.name)}</h3><p>${escapeHTML(app.description)}</p><div class="app-meta"><span>v${escapeHTML(app.version)}</span><span>${escapeHTML(appSize(app))}</span></div>${fileBadgeMarkup(app)}</div></a></article>`).join('')
    : '<div class="empty-state reveal-in">لا توجد تطبيقات مطابقة.</div>';
}

function displayReleases() {
  const box = document.getElementById('releasesList');
  if (!box) return;
  box.innerHTML = apps.slice(0, 4).map((app) => `<article class="release-card reveal-in"><a href="app.html?id=${encodeURIComponent(app.id)}">${appIconMarkup(app, 'release-icon')}<div><span>v${escapeHTML(app.version)}</span><h3>${escapeHTML(app.name)}</h3><p>${escapeHTML(app.description)}</p></div></a></article>`).join('');
}

function filterHomeApps() {
  const query = (document.getElementById('searchInput')?.value || '').trim().toLowerCase();
  const active = document.querySelector('.category.active')?.dataset.category || 'all';
  const result = apps.filter((app) => {
    const categoryOK = active === 'all' || app.category === active;
    const queryOK = [app.name, app.description, app.category_name].some((value) => String(value || '').toLowerCase().includes(query));
    return categoryOK && queryOK;
  });
  displayApps(result);
}

function buildDownloadLink(file) {
  const url = publicUrl(file.storage_path, file.file_name);
  const label = file.platform === 'windows' ? 'Windows / EXE' : 'Android / APK';
  return `<a class="file-download-option" data-download-app="${escapeHTML(file.app_id || '')}" href="${escapeHTML(url)}" aria-label="تحميل ${escapeHTML(label)}"><span>تحميل ${label}</span><strong>${escapeHTML(formatFileSize(file.size_bytes))}</strong></a>`;
}

function favoriteStorageKey() {
  return `codex:favorites:${currentUser?.id || 'guest'}`;
}

function getFavoriteIds() {
  try {
    const value = JSON.parse(localStorage.getItem(favoriteStorageKey()) || '[]');
    return Array.isArray(value) ? value.map(String) : [];
  } catch (_) {
    return [];
  }
}

function isFavorite(appId) {
  return getFavoriteIds().includes(String(appId));
}

function setFavoriteState(button, appId) {
  if (!button || !appId) return;
  const active = isFavorite(appId);
  button.textContent = active ? '♥ محفوظ' : '♡ حفظ';
  button.classList.toggle('active', active);
  button.setAttribute('aria-pressed', active ? 'true' : 'false');
}

function bindFavoriteButton(appId) {
  const button = document.getElementById('favoriteBtn');
  if (!button || !appId) return;
  setFavoriteState(button, appId);
  button.onclick = () => {
    const ids = new Set(getFavoriteIds());
    const key = String(appId);
    if (ids.has(key)) {
      ids.delete(key);
      toast('تمت إزالة التطبيق من المحفوظات.', 'info');
    } else {
      ids.add(key);
      toast('تم حفظ التطبيق.', 'success');
    }
    try {
      localStorage.setItem(favoriteStorageKey(), JSON.stringify([...ids]));
    } catch (_) {}
    setFavoriteState(button, key);
  };
}

function humanDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' });
}

function renderAppFeatures(app) {
  const box = document.getElementById('detailsFeatures');
  if (!box) return;
  const windows = !!getFile(app, 'windows');
  const android = !!getFile(app, 'android');
  const features = [
    { icon: '🖥', title: 'Windows', text: windows ? 'نسخة EXE متاحة للتحميل.' : 'لا توجد نسخة Windows حاليًا.' },
    { icon: '📱', title: 'Android', text: android ? 'نسخة APK متاحة للتحميل.' : 'لا توجد نسخة Android حاليًا.' },
    { icon: '⬇', title: 'تحميل مباشر', text: (windows || android) ? 'الملفات محفوظة في Storage وتظهر من زر التحميل.' : 'لا يوجد ملف محلي متاح حاليًا.' },
    { icon: '🔄', title: 'آخر تحديث', text: humanDate(app.updated_at || app.created_at) },
  ];
  box.innerHTML = features.map((item) => `<div class="feature-card reveal-in"><span class="feature-icon">${item.icon}</span><h3>${escapeHTML(item.title)}</h3><p>${escapeHTML(item.text)}</p></div>`).join('');
}

function shareApp(app) {
  const shareData = { title: app?.name || 'CODEX App Store', text: app?.description || '', url: location.href };
  if (navigator.share) {
    navigator.share(shareData).catch(() => {});
    return;
  }
  navigator.clipboard?.writeText(location.href).then(
    () => toast('تم نسخ رابط التطبيق.', 'success'),
    () => toast('انسخ رابط الصفحة من شريط العنوان.', 'info'),
  );
}

async function recordDownload(appId) {
  try {
    await supabase.rpc('increment_app_download', { p_app_id: appId });
  } catch (error) {
    console.warn('increment_app_download', error);
  }
}

async function loadAppDetails() {
  const heading = document.getElementById('detailsName');
  if (!heading) return;
  const id = new URLSearchParams(location.search).get('id');
  if (!id) {
    heading.textContent = 'التطبيق غير موجود';
    return;
  }

  let app = apps.find((item) => item.id === id);
  if (!app) {
    const result = await supabase.from('apps').select('*,app_files(*)').eq('id', id).maybeSingle();
    if (result.error || !result.data) {
      heading.textContent = 'التطبيق غير موجود';
      return;
    }
    app = result.data;
  }

  document.title = `${app.name} | CODEX App Store`;
  setText('detailsName', app.name);
  setText('detailsDescription', app.description || '');
  setText('longDescription', app.description || 'لا توجد تفاصيل إضافية لهذا التطبيق.');
  setText('detailsCategory', app.category_name || 'الأدوات');
  setText('detailsCategoryInfo', app.category_name || 'الأدوات');
  setText('detailsRating', Number(app.rating || 0) > 0 ? String(app.rating) : 'غير متاح');
  setText('detailsVersion', app.version || '—');
  setText('detailsSize', appSize(app));
  setText('detailsPlatform', platformName(app));
  setText('detailsDownloads', Number(app.download_count || 0).toLocaleString('ar-EG'));
  setText('detailsUpdated', humanDate(app.updated_at || app.created_at));
  renderAppFeatures(app);

  const changelog = document.getElementById('detailsChangelog');
  if (changelog) {
    const value = String(app.changelog || '').trim();
    changelog.hidden = !value;
    changelog.innerHTML = value ? `<strong>ما الجديد؟</strong><p>${escapeHTML(value).replace(/\n/g, '<br>')}</p>` : '';
  }

  const icon = document.getElementById('detailsIcon');
  if (icon) {
    icon.className = `details-icon ${app.icon_url ? 'has-image' : 'auto-initials'}`;
    icon.innerHTML = app.icon_url
      ? `<img src="${escapeHTML(app.icon_url)}" alt="" onerror="this.style.display='none';this.parentElement.classList.remove('has-image');this.parentElement.classList.add('auto-initials');this.parentElement.textContent='${escapeHTML(initials(app.name))}';">`
      : escapeHTML(initials(app.name));
  }

  const options = document.getElementById('downloadOptions');
  const files = app.app_files || [];
  if (options) {
    options.innerHTML = files.map((file) => buildDownloadLink(file)).join('');
    options.classList.toggle('open', files.length > 0);
    options.querySelectorAll('[data-download-app]').forEach((link) => link.addEventListener('click', () => { void recordDownload(id); }));
  }

  const main = getFile(app, 'windows') || getFile(app, 'android');
  const downloadBtn = document.getElementById('downloadBtn');
  if (downloadBtn) {
    if (files.length > 1) {
      downloadBtn.disabled = false;
      downloadBtn.onclick = () => {
        options?.classList.add('open');
        options?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        toast('اختر نسخة Windows أو Android.', 'info');
      };
    } else if (main) {
      downloadBtn.disabled = false;
      downloadBtn.onclick = () => {
        const url = publicUrl(main.storage_path, main.file_name);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = main.file_name;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        const oldText = downloadBtn.textContent;
        downloadBtn.disabled = true;
        downloadBtn.textContent = 'جاري التحميل…';
        setTimeout(() => { downloadBtn.disabled = false; downloadBtn.textContent = oldText; }, 900);
        void recordDownload(app.id);
        toast(`جاري تجهيز تحميل ${main.file_name}.`, 'info');
      };
    } else if (app.download_url) {
      downloadBtn.disabled = false;
      downloadBtn.onclick = () => {
        window.open(app.download_url, '_blank', 'noopener,noreferrer');
        void recordDownload(app.id);
      };
    } else {
      downloadBtn.disabled = true;
      downloadBtn.onclick = null;
    }
  }

  const shareBtn = document.getElementById('shareBtn');
  if (shareBtn) shareBtn.onclick = () => shareApp(app);

  bindFavoriteButton(app.id);

  const similar = document.getElementById('similarApps');
  if (similar) {
    similar.innerHTML = apps.filter((item) => item.id !== app.id && item.category === app.category).slice(0, 3)
      .map((item) => `<article class="similar-app-card reveal-in">${appIconMarkup(item)}<div class="similar-info"><h3>${escapeHTML(item.name)}</h3><p>${escapeHTML(item.category_name)}</p></div><a class="mini-btn" href="app.html?id=${encodeURIComponent(item.id)}">عرض</a></article>`).join('') || '<div class="empty-state">لا توجد تطبيقات مشابهة حاليًا.</div>';
  }
}

function bindPasswordToggles() {
  document.querySelectorAll('[data-toggle-password]').forEach((button) => {
    button.onclick = () => {
      const input = document.getElementById(button.dataset.togglePassword);
      if (!input) return;
      input.type = input.type === 'password' ? 'text' : 'password';
      button.textContent = input.type === 'password' ? '👁' : '🙈';
    };
  });
}

function showAuthMessage(message, type = 'error') {
  const element = document.getElementById('authMessage');
  if (!element) return;
  element.textContent = message;
  element.className = message ? `auth-message ${type}` : 'auth-message';
}

async function setupAuth() {
  const login = document.getElementById('loginForm');
  const register = document.getElementById('registerForm');
  const resetForm = document.getElementById('passwordResetForm');
  if (!login && !register && !resetForm) return;

  bindPasswordToggles();
  const params = new URLSearchParams(location.search);
  const isReset = params.get('reset') === '1';

  const showMode = (mode) => {
    login?.classList.toggle('hidden', mode !== 'login');
    register?.classList.toggle('hidden', mode !== 'register');
    resetForm?.classList.toggle('hidden', mode !== 'reset');
    const registering = mode === 'register';
    setText('authTitle', mode === 'reset' ? 'تعيين كلمة المرور' : registering ? 'إنشاء حساب' : 'تسجيل الدخول');
    setText('authDescription', mode === 'reset' ? 'اكتب كلمة المرور الجديدة لحسابك.' : registering ? 'أنشئ حسابًا جديدًا في CODEX App Store.' : 'ادخل إلى حسابك للوصول إلى المتجر.');
    setText('switchText', mode === 'reset' ? 'العودة لتسجيل الدخول؟' : registering ? 'لديك حساب بالفعل؟' : 'ليس لديك حساب؟');
    const switchButton = document.getElementById('switchAuth');
    if (switchButton) switchButton.textContent = mode === 'reset' ? 'تسجيل الدخول' : registering ? 'تسجيل الدخول' : 'إنشاء حساب';
    const forgot = document.getElementById('forgotPasswordBtn');
    if (forgot) forgot.hidden = mode !== 'login';
    showAuthMessage('', '');
  };

  showMode(isReset ? 'reset' : 'login');

  login?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = login.querySelector('button[type="submit"]');
    const original = button?.textContent || 'تسجيل الدخول';
    const email = String(document.getElementById('loginEmail')?.value || '').trim().toLowerCase();
    const password = String(document.getElementById('loginPassword')?.value || '');
    if (!email || !password) return showAuthMessage('اكتب البريد الإلكتروني وكلمة المرور.', 'error');
    if (button) { button.disabled = true; button.textContent = 'جارٍ تسجيل الدخول…'; }
    showAuthMessage('جاري التحقق من البيانات…', 'success');
    try {
      const result = await withTimeout(supabase.auth.signInWithPassword({ email, password }), 12000, 'انتهت مهلة تسجيل الدخول. تحقق من اتصالك بالإنترنت.');
      if (result.error) throw result.error;
      currentUser = result.data?.user || result.data?.session?.user || null;
      if (!currentUser) throw new Error('تم تسجيل الدخول بدون إنشاء جلسة صالحة.');
      await loadProfile();
      showAuthMessage('تم تسجيل الدخول بنجاح. جاري فتح المتجر…', 'success');
      toast('تم تسجيل الدخول بنجاح.');
      setTimeout(() => { location.href = 'index.html'; }, 450);
    } catch (error) {
      console.error('login', error);
      showAuthMessage(friendlyError(error, 'فشل تسجيل الدخول.'), 'error');
    } finally {
      if (button) { button.disabled = false; button.textContent = original; }
    }
  });

  register?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = register.querySelector('button[type="submit"]');
    const original = button?.textContent || 'إنشاء الحساب';
    const name = String(document.getElementById('registerName')?.value || '').trim();
    const email = String(document.getElementById('registerEmail')?.value || '').trim().toLowerCase();
    const password = String(document.getElementById('registerPassword')?.value || '');
    const confirm = String(document.getElementById('registerConfirm')?.value || '');
    if (!name) return showAuthMessage('اكتب الاسم.', 'error');
    if (!email) return showAuthMessage('اكتب البريد الإلكتروني.', 'error');
    if (password.length < 6) return showAuthMessage('كلمة المرور يجب أن تكون 6 أحرف على الأقل.', 'error');
    if (password !== confirm) return showAuthMessage('كلمتا المرور غير متطابقتين.', 'error');
    if (button) { button.disabled = true; button.textContent = 'جارٍ إنشاء الحساب…'; }
    showAuthMessage('جاري إنشاء الحساب…', 'success');
    try {
      const result = await withTimeout(supabase.auth.signUp({ email, password, options: { data: { name } } }), 12000, 'انتهت مهلة إنشاء الحساب. تحقق من اتصالك بالإنترنت.');
      if (result.error) throw result.error;
      currentUser = result.data?.user || null;
      if (result.data?.session && currentUser) {
        await loadProfile();
        showAuthMessage('تم إنشاء الحساب وتسجيل الدخول بنجاح. جاري فتح المتجر…', 'success');
        toast('تم إنشاء الحساب بنجاح.');
        setTimeout(() => { location.href = 'index.html'; }, 450);
      } else {
        showAuthMessage('تم إنشاء الحساب. افتح رسالة تأكيد البريد الإلكتروني ثم سجّل الدخول.', 'success');
        toast('تم إنشاء الحساب. راجع بريدك الإلكتروني.', 'success');
      }
    } catch (error) {
      console.error('register', error);
      showAuthMessage(friendlyError(error, 'فشل إنشاء الحساب.'), 'error');
    } finally {
      if (button) { button.disabled = false; button.textContent = original; }
    }
  });

  document.getElementById('forgotPasswordBtn')?.addEventListener('click', async () => {
    const email = String(document.getElementById('loginEmail')?.value || '').trim().toLowerCase();
    if (!email) return showAuthMessage('اكتب إيميل حسابك أولًا ثم اضغط نسيت كلمة المرور.', 'error');
    const button = document.getElementById('forgotPasswordBtn');
    if (button) { button.disabled = true; button.textContent = 'جاري إرسال الرابط…'; }
    try {
      const redirectTo = `${location.origin}${location.pathname}?reset=1`;
      const { error } = await withTimeout(supabase.auth.resetPasswordForEmail(email, { redirectTo }), 12000, 'انتهت مهلة إرسال رابط الاستعادة.');
      if (error) throw error;
      showAuthMessage('تم إرسال رابط استعادة كلمة المرور إلى بريدك الإلكتروني.', 'success');
      toast('تم إرسال رابط الاستعادة.');
    } catch (error) {
      showAuthMessage(friendlyError(error, 'فشل إرسال رابط الاستعادة.'), 'error');
    } finally {
      if (button) { button.disabled = false; button.textContent = 'نسيت كلمة المرور؟'; }
    }
  });

  resetForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = resetForm.querySelector('button[type="submit"]');
    const password = String(document.getElementById('resetPassword')?.value || '');
    const confirm = String(document.getElementById('resetConfirm')?.value || '');
    if (password.length < 6) return showAuthMessage('كلمة المرور يجب أن تكون 6 أحرف على الأقل.', 'error');
    if (password !== confirm) return showAuthMessage('كلمتا المرور غير متطابقتين.', 'error');
    if (button) { button.disabled = true; button.textContent = 'جاري الحفظ…'; }
    try {
      const { error } = await withTimeout(supabase.auth.updateUser({ password }), 12000, 'انتهت مهلة تحديث كلمة المرور.');
      if (error) throw error;
      showAuthMessage('تم تغيير كلمة المرور بنجاح. يمكنك تسجيل الدخول الآن.', 'success');
      resetForm.reset();
      setTimeout(() => { location.href = 'login.html'; }, 700);
    } catch (error) {
      showAuthMessage(friendlyError(error, 'فشل تغيير كلمة المرور.'), 'error');
    } finally {
      if (button) { button.disabled = false; button.textContent = 'حفظ كلمة المرور الجديدة'; }
    }
  });

  document.getElementById('switchAuth')?.addEventListener('click', (event) => {
    event.preventDefault();
    const registering = register && !register.classList.contains('hidden');
    const reset = resetForm && !resetForm.classList.contains('hidden');
    showMode(reset ? 'login' : registering ? 'login' : 'register');
  });
}

async function setupAccount() {
  const formName = document.getElementById('accountNameForm');
  if (!formName) return;
  if (!currentUser) {
    location.href = 'login.html';
    return;
  }

  bindPasswordToggles();
  const displayName = currentProfile?.name || currentUser.email?.split('@')[0] || 'مستخدم';
  setText('accountName', displayName);
  setText('accountAvatar', initials(displayName));
  setText('accountEmail', currentProfile?.email || currentUser.email || '—');
  setText('accountRole', currentProfile?.role === 'admin' ? 'Admin' : 'User');
  setText('accountCreated', currentProfile?.created_at ? new Date(currentProfile.created_at).toLocaleDateString('ar-EG') : '—');

  const nameInput = document.getElementById('accountNameInput');
  const emailInput = document.getElementById('accountEmailInput');
  if (nameInput) nameInput.value = currentProfile?.name || '';
  if (emailInput) emailInput.value = currentProfile?.email || currentUser.email || '';

  const favoritesBox = document.getElementById('favoritesList');
  if (favoritesBox) {
    await loadApps(false);
    const renderFavorites = () => {
      const ids = new Set(getFavoriteIds());
      const favorites = apps.filter((item) => ids.has(String(item.id)));
      favoritesBox.innerHTML = favorites.length
        ? favorites.map((item) => `<div class="favorite-item">${appIconMarkup(item, 'favorite-icon')}<div><strong>${escapeHTML(item.name)}</strong><small>${escapeHTML(item.category_name)} · ${escapeHTML(appSize(item))}</small></div><div class="favorite-actions"><a class="mini-btn" href="app.html?id=${encodeURIComponent(item.id)}">فتح</a><button class="mini-btn" data-remove-favorite="${escapeHTML(item.id)}" type="button">إزالة</button></div></div>`).join('')
        : '<div class="empty-state">لم تحفظ أي تطبيقات بعد.</div>';
    };
    renderFavorites();
    favoritesBox.onclick = (event) => {
      const btn = event.target.closest('[data-remove-favorite]');
      if (!btn) return;
      const ids = new Set(getFavoriteIds());
      ids.delete(String(btn.dataset.removeFavorite));
      try { localStorage.setItem(favoriteStorageKey(), JSON.stringify([...ids])); } catch (_) {}
      renderFavorites();
      toast('تمت إزالة التطبيق من المحفوظات.', 'info');
    };
  }

  formName.onsubmit = async (event) => {
    event.preventDefault();
    const name = nameInput?.value.trim() || '';
    if (!name) return toast('اكتب الاسم الجديد.', 'error');
    const { error } = await supabase.from('profiles').update({ name, updated_at: new Date().toISOString() }).eq('id', currentUser.id);
    if (error) return toast(friendlyError(error), 'error');
    await loadProfile();
    setupNavbar();
    setText('accountName', currentProfile?.name || name);
    toast('تم تحديث الاسم.');
  };

  document.getElementById('accountEmailForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = event.target.querySelector('button[type=submit]');
    const original = button?.textContent || 'حفظ الإيميل';
    const email = emailInput?.value.trim().toLowerCase() || '';
    if (!email) return toast('اكتب البريد الإلكتروني الجديد.', 'error');
    if (email === String(currentUser.email || '').toLowerCase()) return toast('هذا هو بريدك الحالي.', 'info');
    if (button) { button.disabled = true; button.textContent = 'جاري الحفظ…'; }
    try {
      const { error } = await supabase.auth.updateUser({ email });
      if (error) throw error;
      toast('تم طلب تغيير البريد. أكّد الرسالة الجديدة من بريدك الإلكتروني.');
    } catch (error) {
      toast(friendlyError(error, 'فشل تحديث البريد الإلكتروني.'), 'error');
    } finally {
      if (button) { button.disabled = false; button.textContent = original; }
    }
  });

  document.getElementById('accountPasswordForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!currentUser?.email) return toast('تعذر تحديد حسابك الحالي.', 'error');
    const form = event.target;
    const button = form.querySelector('button[type=submit]');
    const original = button?.textContent || 'تغيير كلمة المرور';
    const currentPassword = document.getElementById('currentPassword')?.value || '';
    const password = document.getElementById('newPassword')?.value || '';
    const confirm = document.getElementById('confirmPassword')?.value || '';
    if (!currentPassword) return toast('اكتب كلمة المرور الحالية.', 'error');
    if (password.length < 6) return toast('كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل.', 'error');
    if (password !== confirm) return toast('كلمتا المرور غير متطابقتين.', 'error');
    if (password === currentPassword) return toast('اختر كلمة مرور جديدة مختلفة عن الحالية.', 'error');
    if (button) { button.disabled = true; button.textContent = 'جاري التحقق…'; }
    try {
      const check = await withTimeout(supabase.auth.signInWithPassword({ email: currentUser.email, password: currentPassword }), 12000, 'انتهت مهلة التحقق من كلمة المرور.');
      if (check.error) throw new Error('كلمة المرور الحالية غير صحيحة.');
      if (check.data?.user) currentUser = check.data.user;
      if (button) button.textContent = 'جاري تغيير كلمة المرور…';
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      form.reset();
      toast('تم تغيير كلمة المرور بنجاح.');
    } catch (error) {
      toast(friendlyError(error, 'فشل تغيير كلمة المرور.'), 'error');
    } finally {
      if (button) { button.disabled = false; button.textContent = original; }
    }
  });
}

async function requireAdmin() {
  if (!currentUser || !(await isAdmin())) {
    toast('هذه الصفحة متاحة للأدمن فقط.', 'error');
    setTimeout(() => { location.href = 'login.html'; }, 250);
    return false;
  }
  return true;
}

function makeSlug(name) {
  const base = String(name || 'app').trim().toLowerCase().normalize('NFKC')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'app';
  return `${base}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function validateUpload(file, kind) {
  if (!file) return true;
  if (!file.name || Number(file.size) <= 0) throw new Error('الملف المختار فارغ أو غير صالح.');
  const extension = (file.name.split('.').pop() || '').toLowerCase();
  if (kind === 'windows' && extension !== 'exe') throw new Error('ملف Windows يجب أن يكون بصيغة EXE.');
  if (kind === 'android' && extension !== 'apk') throw new Error('ملف Android يجب أن يكون بصيغة APK.');
  if (kind === 'icon' && !['png', 'jpg', 'jpeg', 'webp'].includes(extension)) throw new Error('صورة التطبيق يجب أن تكون PNG أو JPG أو JPEG أو WEBP.');
  if (kind === 'icon' && Number(file.size) > 8 * 1024 * 1024) throw new Error('صورة التطبيق كبيرة جدًا. الحد المسموح 8MB.');
  if (Number(file.size) > 5 * 1024 ** 3) throw new Error('الملف أكبر من الحد المسموح للتخزين (5GB).');
  return true;
}

function getMimeType(file) {
  const ext = (file?.name?.split('.').pop() || '').toLowerCase();
  if (ext === 'exe') return 'application/vnd.microsoft.portable-executable';
  if (ext === 'apk') return 'application/vnd.android.package-archive';
  if (ext === 'png') return 'image/png';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'webp') return 'image/webp';
  return file?.type || 'application/octet-stream';
}

function safeRandomId() {
  try { return crypto.randomUUID(); } catch (_) { return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`; }
}

async function resumableUpload(file, path, progress, label, bucket = 'app-files') {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (sessionError || !token) throw new Error('انتهت جلسة الأدمن. سجّل الدخول مرة أخرى قبل رفع الملف.');

  const projectRef = new URL(SUPABASE_URL).hostname.split('.')[0];
  const endpoint = `https://${projectRef}.storage.supabase.co/storage/v1/upload/resumable`;
  const chunkSize = 6 * 1024 * 1024;

  await new Promise((resolve, reject) => {
    const upload = new TusUpload(file, {
      endpoint,
      retryDelays: [0, 1000, 3000, 5000, 10000, 15000],
      chunkSize,
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      headers: {
        authorization: `Bearer ${token}`,
        apikey: SUPABASE_KEY,
        'x-upsert': 'true',
      },
      metadata: {
        bucketName: bucket,
        objectName: path,
        contentType: getMimeType(file),
        cacheControl: '3600',
      },
      onError: (error) => reject(new Error(`${label}: ${error?.message || 'فشل الرفع المتدرج.'}`)),
      onProgress: (bytesUploaded, bytesTotal) => {
        const percent = bytesTotal ? Math.round((bytesUploaded / bytesTotal) * 100) : 0;
        progress?.(percent, `${label} — ${percent}%`);
      },
      onSuccess: () => resolve(),
    });
    upload.start();
  });

  progress?.(100, `${label} — تم`);
  return path;
}

async function uploadStorageFile(file, path, progress, label = 'رفع الملف', bucket = 'app-files') {
  const kind = path.includes('/windows/') ? 'windows' : path.includes('/android/') ? 'android' : path.includes('/icons/') ? 'icon' : null;
  validateUpload(file, kind);
  const SIX_MB = 6 * 1024 * 1024;
  progress?.(0, `${label} — بدء الرفع`);

  // Large application files use TUS directly. This is the recommended path for uploads > 6MB.
  if (file.size > SIX_MB) {
    return resumableUpload(file, path, progress, label, bucket);
  }

  try {
    const { error } = await supabase.storage.from(bucket).upload(path, file, {
      upsert: true,
      contentType: getMimeType(file),
      cacheControl: '3600',
    });
    if (error) throw error;
    progress?.(100, `${label} — تم`);
    return path;
  } catch (error) {
    // A small file may still be rejected by a proxy/limit. One resumable retry avoids a false failure.
    if (file.size > 1024 * 1024) {
      try {
        progress?.(5, `${label} — إعادة المحاولة بطريقة قابلة للاستئناف`);
        return await resumableUpload(file, path, progress, label, bucket);
      } catch (retryError) {
        throw new Error(`${label}: ${friendlyError(retryError, retryError?.message || friendlyError(error, 'فشل رفع الملف.'))}`);
      }
    }
    throw new Error(`${label}: ${friendlyError(error, error?.message || 'فشل رفع الملف.')}`);
  }
}

async function uploadIcon(file, appId, progress) {
  if (!file) return null;
  validateUpload(file, 'icon');
  const extension = file.name.split('.').pop().toLowerCase();
  const path = `icons/${appId}/${safeRandomId()}.${extension}`;
  await uploadStorageFile(file, path, progress, 'رفع صورة التطبيق', 'app-icons');
  return { path, url: publicUrl(path, null, 'app-icons') };
}

async function saveAppFile(appId, platform, file, existing, progress) {
  if (!file) return existing || null;
  validateUpload(file, platform);
  const extension = file.name.split('.').pop().toLowerCase();
  const path = `apps/${appId}/${platform}/${safeRandomId()}.${extension}`;

  await uploadStorageFile(file, path, progress, `رفع ${platform === 'windows' ? 'EXE' : 'APK'}`, 'app-files');

  const row = {
    app_id: appId,
    platform,
    file_name: file.name,
    storage_path: path,
    mime_type: getMimeType(file),
    size_bytes: file.size,
  };

  const { data, error } = await supabase.from('app_files').upsert(row, { onConflict: 'app_id,platform' }).select().single();
  if (error) {
    await supabase.storage.from('app-files').remove([path]);
    throw new Error(`تم رفع الملف لكن تعذر تسجيله في قاعدة البيانات: ${friendlyError(error, error.message)}`);
  }
  return data;
}

function legacyIconRef(app) {
  if (app?.icon_storage_path) return { bucket: 'app-icons', path: app.icon_storage_path };
  if (!app?.icon_url) return null;
  try {
    const u = new URL(app.icon_url);
    const refs = [
      { prefix: '/storage/v1/object/public/app-icons/', bucket: 'app-icons' },
      { prefix: '/storage/v1/object/public/app-files/', bucket: 'app-files' },
    ];
    for (const ref of refs) {
      if (u.pathname.includes(ref.prefix)) return { bucket: ref.bucket, path: decodeURIComponent(u.pathname.split(ref.prefix)[1]) };
    }
  } catch (_) {}
  return null;
}

function legacyIconPath(app) {
  return legacyIconRef(app)?.path || null;
}

function selectedFilesSummary(form) {
  const exe = form.querySelector('#newAppExe')?.files?.[0] || null;
  const apk = form.querySelector('#newAppApk')?.files?.[0] || null;
  const icon = form.querySelector('#newAppIconFile')?.files?.[0] || null;
  const files = [exe, apk].filter(Boolean);
  return {
    exe,
    apk,
    icon,
    files,
    totalBytes: files.reduce((sum, file) => sum + file.size, 0),
    platform: exe && apk ? 'Windows + Android' : apk ? 'Android' : exe ? 'Windows' : '—',
  };
}

async function createAppRecord(form) {
  if (!(await requireAdmin())) return;
  if (form.dataset.busy === '1') return;

  const name = document.getElementById('newAppName')?.value.trim() || '';
  const description = document.getElementById('newAppDescription')?.value.trim() || '';
  const category = document.getElementById('newAppCategory')?.value || 'tools';
  const version = document.getElementById('newAppVersion')?.value.trim() || '';
  const changelog = document.getElementById('newAppChangelog')?.value.trim() || '';
  const summary = selectedFilesSummary(form);

  if (!name) return toast('اكتب اسم التطبيق.', 'error');
  if (!description) return toast('اكتب وصف التطبيق.', 'error');
  if (!version) return toast('اكتب رقم الإصدار.', 'error');
  if (!summary.files.length) return toast('اختر ملف EXE أو APK على الأقل قبل الضغط على رفع التطبيق.', 'error');

  try {
    validateUpload(summary.exe, 'windows');
    validateUpload(summary.apk, 'android');
    if (summary.icon) validateUpload(summary.icon, 'icon');
  } catch (error) {
    return toast(friendlyError(error), 'error');
  }

  form.dataset.busy = '1';
  const button = form.querySelector('button[type="submit"]');
  const originalButton = button?.textContent || 'رفع التطبيق وإضافته';
  if (button) { button.disabled = true; button.textContent = 'جاري الرفع…'; }

  const progress = showOperationProgress('إضافة تطبيق جديد');
  let app = null;
  const createdPaths = [];
  let warning = null;

  try {
    progress.update(8, 'التحقق من الملفات');
    const payload = {
      name,
      slug: makeSlug(name),
      description,
      category,
      category_name: categories[category] || categories.tools,
      version,
      changelog,
      icon_text: initials(name),
      created_by: currentUser.id,
      total_size_bytes: summary.totalBytes,
      platform: summary.platform,
      updated_at: new Date().toISOString(),
    };

    progress.update(15, 'إنشاء سجل التطبيق');
    const insert = await withTimeout(
      supabase.from('apps').insert(payload).select().single(),
      12000,
      'انتهت مهلة إنشاء التطبيق.'
    );
    if (insert.error) throw new Error(`إنشاء سجل التطبيق: ${friendlyError(insert.error, insert.error.message)}`);
    app = insert.data;

    const uploadTasks = [];
    if (summary.exe) uploadTasks.push(['windows', summary.exe]);
    if (summary.apk) uploadTasks.push(['android', summary.apk]);

    for (let index = 0; index < uploadTasks.length; index += 1) {
      const [platform, file] = uploadTasks[index];
      const start = 22 + index * (48 / uploadTasks.length);
      const end = start + 36;
      const row = await saveAppFile(app.id, platform, file, null, (local, label) => {
        const value = Math.round(start + (local / 100) * (end - start));
        progress.update(value, label);
      });
      createdPaths.push(row.storage_path);
    }

    progress.update(73, 'تأكيد الملفات وحساب الحجم');
    const filesResult = await supabase.from('app_files').select('id,app_id,platform,file_name,storage_path,mime_type,size_bytes').eq('app_id', app.id);
    if (filesResult.error) throw new Error(`قراءة ملفات التطبيق: ${friendlyError(filesResult.error, filesResult.error.message)}`);
    const files = filesResult.data || [];
    if (!files.length) throw new Error('تم رفع الملف لكن لم يتم تسجيله في قاعدة البيانات.');

    const total = files.reduce((sum, file) => sum + Number(file.size_bytes || 0), 0);
    const platform = files.some((file) => file.platform === 'windows') && files.some((file) => file.platform === 'android')
      ? 'Windows + Android'
      : files.some((file) => file.platform === 'android') ? 'Android' : 'Windows';
    const meta = await supabase.from('apps').update({ total_size_bytes: total, platform, updated_at: new Date().toISOString() }).eq('id', app.id);
    if (meta.error) throw new Error(`تحديث حجم التطبيق: ${friendlyError(meta.error, meta.error.message)}`);

    if (summary.icon) {
      progress.update(83, 'رفع الصورة الاختيارية');
      try {
        const iconResult = await uploadIcon(summary.icon, app.id, (local, label) => progress.update(83 + Math.round(local * 0.09), label));
        createdPaths.push({ bucket: 'app-icons', path: iconResult.path });
        const iconUpdate = await supabase.from('apps').update({ icon_url: iconResult.url, icon_storage_path: iconResult.path, updated_at: new Date().toISOString() }).eq('id', app.id);
        if (iconUpdate.error) throw iconUpdate.error;
      } catch (error) {
        warning = 'تم رفع البرنامج بنجاح، لكن الصورة الاختيارية لم تُرفع.';
        console.warn('optional icon upload failed', error);
      }
    }

    progress.update(95, 'تحديث المتجر ولوحة التحكم');
    await renderDashboard();
    form.reset();
    resetUploadFields();
    progress.done('تمت إضافة التطبيق بنجاح');
    toast(warning || 'تمت إضافة التطبيق وتحديث المتجر بنجاح.');
  } catch (error) {
    console.error('createAppRecord', error);
    if (app?.id) {
      try {
        const filePaths = createdPaths.filter((item) => typeof item === 'string');
        if (filePaths.length) await supabase.storage.from('app-files').remove(filePaths);
        const iconPaths = createdPaths.filter((item) => item?.bucket === 'app-icons').map((item) => item.path);
        if (iconPaths.length) await supabase.storage.from('app-icons').remove(iconPaths);
        await supabase.from('app_files').delete().eq('app_id', app.id);
        await supabase.from('apps').delete().eq('id', app.id);
      } catch (cleanupError) {
        console.warn('cleanup failed', cleanupError);
      }
    }
    const message = friendlyError(error, 'فشل رفع التطبيق.');
    progress.fail(message);
    toast(message, 'error');
  } finally {
    form.dataset.busy = '0';
    if (button) { button.disabled = false; button.textContent = originalButton; }
  }
}

async function renderDashboard() {
  await loadApps(false);
  setText('totalApps', apps.length);

  const usersResult = await withTimeout(
    supabase.from('profiles').select('id,name,email,role,created_at').order('created_at', { ascending: false }),
    12000,
    'انتهت مهلة تحميل المستخدمين.'
  );
  const users = usersResult.data || [];
  if (usersResult.error) {
    setText('totalUsers', '—');
    setText('totalAdmins', '—');
  } else {
    setText('totalUsers', users.length);
    setText('totalAdmins', users.filter((user) => String(user.role) === 'admin').length);
  }

  const box = document.getElementById('adminAppsList');
  if (box) {
    box.innerHTML = apps.length
      ? apps.map((app) => `<div class="admin-app-item reveal-in">${appIconMarkup(app, 'admin-app-icon')}<div class="admin-app-info"><strong>${escapeHTML(app.name)}</strong><span>${escapeHTML(app.category_name)} · v${escapeHTML(app.version)} · ${escapeHTML(appSize(app))} · ${escapeHTML(platformName(app))} · ${Number(app.download_count || 0).toLocaleString('ar-EG')} تحميل</span>${fileBadgeMarkup(app)}</div><div class="admin-actions"><a class="mini-btn" href="app.html?id=${encodeURIComponent(app.id)}" target="_blank" rel="noopener">فتح الصفحة</a><button class="mini-btn" data-edit-app="${escapeHTML(app.id)}" type="button">تعديل</button><button class="delete-app-btn" data-delete-app="${escapeHTML(app.id)}" type="button">حذف</button></div></div>`).join('')
      : '<div class="empty-state">لم تتم إضافة تطبيقات بعد.</div>';
  }
  await renderUsers();
}

async function renderUsers() {
  const box = document.getElementById('usersList');
  if (!box) return;
  const { data, error } = await supabase.from('profiles').select('id,name,email,role,created_at').order('created_at', { ascending: false });
  if (error) {
    box.innerHTML = `<div class="empty-state">${escapeHTML(friendlyError(error))}</div>`;
    return;
  }
  box.innerHTML = (data || []).map((user) => `<div class="user-item reveal-in"><div class="user-avatar">${escapeHTML(initials(user.name || 'U'))}</div><div class="user-info"><strong>${escapeHTML(user.name || 'مستخدم')}</strong><span>${escapeHTML(user.email || '')}</span><small>إنشاء: ${new Date(user.created_at).toLocaleDateString('ar-EG')}</small></div><span class="user-role">${user.role === 'admin' ? 'ADMIN' : 'USER'}</span><div class="user-actions"><button class="mini-btn" data-toggle-role="${escapeHTML(user.id)}" data-role="${escapeHTML(user.role)}" type="button">${user.id !== currentUser?.id ? (user.role === 'admin' ? 'جعله User' : 'جعله Admin') : 'الحساب الحالي'}</button><button class="mini-btn" data-reset-user="${escapeHTML(user.id)}" type="button">تغيير كلمة المرور</button>${user.id !== currentUser?.id ? `<button class="delete-user-btn" data-delete-user="${escapeHTML(user.id)}" type="button">حذف</button>` : ''}</div></div>`).join('') || '<div class="empty-state">لا توجد حسابات.</div>';
}

async function addAdmin(event) {
  event.preventDefault();
  if (!(await requireAdmin())) return;
  const form = event.target;
  if (form.dataset.busy === '1') return;
  const name = document.getElementById('adminNameInput')?.value.trim() || '';
  const email = document.getElementById('adminEmailInput')?.value.trim().toLowerCase() || '';
  const password = document.getElementById('adminPasswordInput')?.value || '';
  const confirm = document.getElementById('adminPasswordConfirm')?.value || '';
  const role = document.getElementById('adminRoleInput')?.value === 'admin' ? 'admin' : 'user';
  if (!name || !email) return toast('اكتب الاسم والإيميل.', 'error');
  if (password.length < 6 || password !== confirm) return toast('تحقق من كلمة المرور وتطابقها.', 'error');

  form.dataset.busy = '1';
  const button = form.querySelector('button[type="submit"]');
  const original = button?.textContent || '+ إضافة حساب';
  if (button) { button.disabled = true; button.textContent = 'جاري إنشاء الحساب…'; }
  const progress = showOperationProgress('إنشاء حساب جديد');
  try {
    progress.update(20, 'التحقق من صلاحيات الأدمن');
    const { data, error } = await supabase.functions.invoke('create-admin', { body: { name, email, password, role } });
    if (error || data?.error || data?.success === false) throw new Error(data?.error || error?.message || 'فشل إنشاء الحساب.');
    progress.update(80, 'تحديث قائمة المستخدمين');
    form.reset();
    await renderUsers();
    progress.done('تم إنشاء الحساب بنجاح');
    toast('تم إنشاء الحساب بنجاح.');
  } catch (error) {
    console.error('addAdmin', error);
    progress.fail(friendlyError(error, 'فشل إنشاء الحساب.'));
    toast(friendlyError(error, 'فشل إنشاء الحساب.'), 'error');
  } finally {
    form.dataset.busy = '0';
    if (button) { button.disabled = false; button.textContent = original; }
  }
}

async function deleteStorageFiles(app) {
  const appPaths = (app?.app_files || []).map((file) => file.storage_path).filter(Boolean);
  if (appPaths.length) {
    const { error } = await supabase.storage.from('app-files').remove(appPaths);
    if (error) console.warn('deleteStorageFiles(app-files)', error);
  }
  const iconRef = legacyIconRef(app);
  if (iconRef) {
    const { error } = await supabase.storage.from(iconRef.bucket).remove([iconRef.path]);
    if (error) console.warn(`deleteStorageFiles(${iconRef.bucket})`, error);
  }
}

async function deleteApp(id) {
  const app = apps.find((item) => item.id === id);
  if (!app) return;
  if (!confirm(`حذف "${app.name}" وملفاته؟`)) return;
  const progress = showOperationProgress('حذف التطبيق', 18);
  try {
    progress.update(45, 'حذف الملفات من التخزين');
    await deleteStorageFiles(app);
    const { error } = await supabase.from('apps').delete().eq('id', id);
    if (error) throw error;
    progress.update(85, 'تحديث المتجر');
    await renderDashboard();
    progress.done('تم حذف التطبيق');
    toast('تم حذف التطبيق.');
  } catch (error) {
    progress.fail(friendlyError(error, 'فشل حذف التطبيق.'));
    toast(friendlyError(error, 'فشل حذف التطبيق.'), 'error');
  }
}

function openAppEditor(id) {
  const app = apps.find((item) => item.id === id);
  const modal = document.getElementById('appEditModal');
  if (!app || !modal) return;
  modal.dataset.appId = id;
  const values = {
    name: app.name,
    description: app.description,
    version: app.version,
    category: app.category,
    downloadUrl: app.download_url || '',
    changelog: app.changelog || '',
  };
  Object.entries(values).forEach(([name, value]) => {
    const field = modal.querySelector(`[name="${name}"]`);
    if (field) field.value = value;
  });
  const preview = modal.querySelector('[data-icon-preview]');
  if (preview) {
    preview.className = `icon-preview ${app.icon_url ? 'has-image' : 'auto-initials'}`;
    preview.innerHTML = app.icon_url ? `<img src="${escapeHTML(app.icon_url)}" alt="">` : `<span>${escapeHTML(initials(app.name))}</span>`;
  }
  const currentFiles = modal.querySelector('[data-current-files]');
  const removeExe = modal.querySelector('[name="removeExe"]');
  const removeApk = modal.querySelector('[name="removeApk"]');
  const removeIcon = modal.querySelector('[name="removeIcon"]');
  if (removeExe) removeExe.checked = false;
  if (removeApk) removeApk.checked = false;
  if (removeIcon) removeIcon.checked = false;
  if (currentFiles) currentFiles.textContent = (app.app_files || []).map((file) => `${file.platform === 'windows' ? 'EXE' : 'APK'} · ${formatFileSize(file.size_bytes)}`).join('  |  ') || 'لا توجد ملفات';
  modal.classList.add('open');
}

async function updateApp(event) {
  event.preventDefault();
  if (!(await requireAdmin())) return;
  const modal = document.getElementById('appEditModal');
  const id = modal?.dataset.appId;
  const app = apps.find((item) => item.id === id);
  if (!app || event.target.dataset.busy === '1') return;
  const oldAppSnapshot = { name: app.name, description: app.description, version: app.version, category: app.category, category_name: app.category_name, icon_text: app.icon_text, icon_url: app.icon_url, icon_storage_path: app.icon_storage_path || legacyIconPath(app), download_url: app.download_url, changelog: app.changelog || '', total_size_bytes: app.total_size_bytes || 0, platform: app.platform };
  const oldFileSnapshot = (app.app_files || []).map((file) => ({ ...file }));
  const newUploadedPaths = [];
  const obsoleteStoragePaths = [];

  const form = event.target;
  const data = new FormData(form);
  const icon = form.querySelector('[name="iconFile"]')?.files?.[0] || null;
  const exe = form.querySelector('[name="exeFile"]')?.files?.[0] || null;
  const apk = form.querySelector('[name="apkFile"]')?.files?.[0] || null;
  const removeExe = !!form.querySelector('[name="removeExe"]')?.checked;
  const removeApk = !!form.querySelector('[name="removeApk"]')?.checked;
  const removeIcon = !!form.querySelector('[name="removeIcon"]')?.checked;

  try {
    if (icon) validateUpload(icon, 'icon');
    if (exe) validateUpload(exe, 'windows');
    if (apk) validateUpload(apk, 'android');
  } catch (error) {
    toast(friendlyError(error), 'error');
    return;
  }

  event.target.dataset.busy = '1';
  const button = form.querySelector('button[type="submit"]');
  const original = button?.textContent || 'حفظ التحديث والملفات';
  if (button) { button.disabled = true; button.textContent = 'جاري تحديث التطبيق…'; }

  const progress = showOperationProgress('تحديث التطبيق', 10);
  try {
    progress.update(18, 'حفظ بيانات التطبيق');
    const name = String(data.get('name') || '').trim();
    const description = String(data.get('description') || '').trim();
    const version = String(data.get('version') || '').trim();
    const category = String(data.get('category') || 'tools');
    const downloadUrl = String(data.get('downloadUrl') || '').trim() || null;
    const changelog = String(data.get('changelog') || '').trim();

    if (!name || !description || !version) throw new Error('أكمل اسم التطبيق والوصف والإصدار.');

    const updatedApp = await supabase.from('apps').update({
      name,
      description,
      version,
      category,
      category_name: categories[category] || categories.tools,
      icon_text: initials(name),
      download_url: downloadUrl,
      changelog,
      updated_at: new Date().toISOString(),
    }).eq('id', id);
    if (updatedApp.error) throw updatedApp.error;

    progress.update(40, 'تحديث ملفات البرنامج');
    const oldWindows = getFile(app, 'windows');
    const oldAndroid = getFile(app, 'android');
    if (exe) { const row = await saveAppFile(id, 'windows', exe, oldWindows, (local, label) => progress.update(40 + Math.round(local * 0.18), label)); newUploadedPaths.push(row.storage_path); if (oldWindows?.storage_path) obsoleteStoragePaths.push(oldWindows.storage_path); }
    if (apk) { const row = await saveAppFile(id, 'android', apk, oldAndroid, (local, label) => progress.update(40 + Math.round(local * 0.18), label)); newUploadedPaths.push(row.storage_path); if (oldAndroid?.storage_path) obsoleteStoragePaths.push(oldAndroid.storage_path); }

    if (removeExe && !exe && oldWindows) {
      obsoleteStoragePaths.push(oldWindows.storage_path);
      const removed = await supabase.from('app_files').delete().eq('id', oldWindows.id);
      if (removed.error) throw removed.error;
    }
    if (removeApk && !apk && oldAndroid) {
      obsoleteStoragePaths.push(oldAndroid.storage_path);
      const removed = await supabase.from('app_files').delete().eq('id', oldAndroid.id);
      if (removed.error) throw removed.error;
    }

    progress.update(62, 'إعادة حساب الحجم');
    const filesResult = await supabase.from('app_files').select('*').eq('app_id', id);
    if (filesResult.error) throw filesResult.error;
    const files = filesResult.data || [];
    const total = files.reduce((sum, file) => sum + Number(file.size_bytes || 0), 0);
    const platform = files.length === 2 ? 'Windows + Android' : files[0]?.platform === 'android' ? 'Android' : files[0]?.platform === 'windows' ? 'Windows' : 'Windows';
    const meta = await supabase.from('apps').update({ total_size_bytes: total, platform, updated_at: new Date().toISOString() }).eq('id', id);
    if (meta.error) throw meta.error;

    let warning = null;
    progress.update(76, 'تحديث الصورة الاختيارية');
    if (icon) {
      let iconResult = null;
      try {
        iconResult = await uploadIcon(icon, id, (local, label) => progress.update(76 + Math.round(local * 0.12), label));
        newUploadedPaths.push({ bucket: 'app-icons', path: iconResult.path });
        const oldIconRef = legacyIconRef(app);
        const iconUpdate = await supabase.from('apps').update({ icon_url: iconResult.url, icon_storage_path: iconResult.path, updated_at: new Date().toISOString() }).eq('id', id);
        if (iconUpdate.error) throw iconUpdate.error;
        if (oldIconRef && oldIconRef.path !== iconResult.path) obsoleteStoragePaths.push({ bucket: oldIconRef.bucket, path: oldIconRef.path });
      } catch (error) {
        if (iconResult?.path) await supabase.storage.from('app-icons').remove([iconResult.path]);
        console.warn('optional icon update failed', error);
        warning = 'تم تحديث البرنامج، لكن الصورة الاختيارية لم تُرفع.';
      }
    } else if (removeIcon && (app.icon_url || app.icon_storage_path)) {
      const oldIconRef = legacyIconRef(app);
      if (oldIconRef) obsoleteStoragePaths.push({ bucket: oldIconRef.bucket, path: oldIconRef.path });
      const iconUpdate = await supabase.from('apps').update({ icon_url: null, icon_storage_path: null, updated_at: new Date().toISOString() }).eq('id', id);
      if (iconUpdate.error) throw iconUpdate.error;
    }

    progress.update(92, 'تحديث القائمة');
    modal.classList.remove('open');
    form.reset();
    await renderDashboard();
    if (obsoleteStoragePaths.length) {
      const filePaths = [...new Set(obsoleteStoragePaths.filter((item) => typeof item === 'string'))];
      if (filePaths.length) {
        const cleanup = await supabase.storage.from('app-files').remove(filePaths);
        if (cleanup.error) warning = warning || 'تم تحديث التطبيق، لكن الملف القديم لم يتم حذفه.';
      }
      for (const bucket of ['app-files', 'app-icons']) {
        const paths = [...new Set(obsoleteStoragePaths.filter((item) => item?.bucket === bucket).map((item) => item.path))];
        if (!paths.length) continue;
        const cleanup = await supabase.storage.from(bucket).remove(paths);
        if (cleanup.error) warning = warning || (bucket === 'app-icons' ? 'تم تحديث التطبيق، لكن الصورة القديمة لم يتم حذفها.' : 'تم تحديث التطبيق، لكن الملف القديم لم يتم حذفه.');
      }
    }
    progress.done('تم تحديث التطبيق بنجاح');
    toast(warning || 'تم تحديث التطبيق والملفات بنجاح.');
  } catch (error) {
    console.error('updateApp', error);
    try {
      const createdOnly = newUploadedPaths.filter((item) => typeof item === 'string' && !(oldFileSnapshot || []).some((row) => row.storage_path === item));
      const createdIcons = newUploadedPaths.filter((item) => item?.bucket === 'app-icons').map((item) => item.path);
      if (createdOnly.length) await supabase.storage.from('app-files').remove(createdOnly);
      if (createdIcons.length) await supabase.storage.from('app-icons').remove(createdIcons);
      await supabase.from('app_files').delete().eq('app_id', id);
      for (const oldFile of oldFileSnapshot) {
        await supabase.from('app_files').insert(oldFile);
      }
      await supabase.from('apps').update({ ...oldAppSnapshot, updated_at: new Date().toISOString() }).eq('id', id);
    } catch (rollbackError) {
      console.warn('updateApp rollback failed', rollbackError);
    }
    progress.fail(friendlyError(error, 'فشل تحديث التطبيق وتمت محاولة استعادة البيانات السابقة.'));
    toast(friendlyError(error, 'فشل تحديث التطبيق وتمت محاولة استعادة البيانات السابقة.'), 'error');
  } finally {
    event.target.dataset.busy = '0';
    if (button) { button.disabled = false; button.textContent = original; }
  }
}

function showOperationProgress(title = 'جارٍ التنفيذ', initial = 0) {
  let overlay = document.getElementById('codexOperationProgress');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'codexOperationProgress';
    overlay.className = 'codex-operation-progress';
    overlay.innerHTML = `
      <div class="cop-card">
        <div class="cop-orbit"><span></span></div>
        <div class="cop-title"></div>
        <div class="cop-stage"></div>
        <div class="cop-bar"><i></i></div>
        <strong class="cop-percent">0%</strong>
        <div class="cop-check">✓</div>
        <button type="button" class="cop-close" hidden>إغلاق</button>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('.cop-close').onclick = () => overlay.classList.remove('open');
  }

  const titleNode = overlay.querySelector('.cop-title');
  const stageNode = overlay.querySelector('.cop-stage');
  const bar = overlay.querySelector('.cop-bar i');
  const percent = overlay.querySelector('.cop-percent');
  const close = overlay.querySelector('.cop-close');
  const check = overlay.querySelector('.cop-check');

  titleNode.textContent = title;
  close.hidden = true;
  check.classList.remove('show');
  overlay.classList.remove('error-state');
  overlay.classList.add('open');

  const update = (value, stage = 'جارٍ التنفيذ…') => {
    const safeValue = Math.max(0, Math.min(100, Number(value) || 0));
    bar.style.width = `${safeValue}%`;
    percent.textContent = `${Math.round(safeValue)}%`;
    stageNode.textContent = stage;
  };
  const done = (message = 'اكتمل') => {
    update(100, message);
    check.classList.add('show');
    close.hidden = false;
    setTimeout(() => overlay.classList.remove('open'), 900);
  };
  const fail = (message = 'حدث خطأ') => {
    overlay.classList.add('error-state');
    stageNode.textContent = message;
    percent.textContent = '!';
    close.hidden = false;
  };

  update(initial, 'بدء العملية…');
  return { update, done, fail };
}

function setupUploadPreviews() {
  const form = document.getElementById('addAppForm');
  if (!form) return;
  const exe = form.querySelector('#newAppExe');
  const apk = form.querySelector('#newAppApk');
  const icon = form.querySelector('#newAppIconFile');

  const setLabel = (key, file) => {
    const label = form.querySelector(`[data-file-label="${key}"]`);
    if (label) label.textContent = file ? file.name : (key === 'icon' ? 'اختياري — PNG / JPG / WEBP' : 'لم يتم اختيار ملف');
    const size = form.querySelector(`[data-file-size="${key}"]`);
    if (size) size.textContent = file ? formatFileSize(file.size) : '';
  };

  const updateSummary = () => {
    const summary = selectedFilesSummary(form);
  const changelog = document.getElementById('newAppChangelog')?.value.trim() || '';
    setText('newAppSize', summary.files.length ? formatFileSize(summary.totalBytes) : 'سيتم حسابه تلقائيًا');
    setText('newAppPlatform', summary.platform);
  };

  const validateAndShow = (input, kind, key) => {
    const file = input?.files?.[0] || null;
    if (!file) {
      setLabel(key, null);
      updateSummary();
      return;
    }
    try {
      validateUpload(file, kind);
      setLabel(key, file);
      if (key === 'icon') {
        const preview = form.querySelector('[data-main-icon-preview]');
        if (preview) {
          if (preview.dataset.objectUrl) URL.revokeObjectURL(preview.dataset.objectUrl);
          const previewUrl = URL.createObjectURL(file);
          preview.dataset.objectUrl = previewUrl;
          preview.innerHTML = `<img src="${previewUrl}" alt="معاينة">`;
          preview.classList.add('has-image');
        }
      }
    } catch (error) {
      input.value = '';
      setLabel(key, null);
      toast(friendlyError(error), 'error');
    }
    updateSummary();
  };

  exe?.addEventListener('change', () => validateAndShow(exe, 'windows', 'exe'));
  apk?.addEventListener('change', () => validateAndShow(apk, 'android', 'apk'));
  icon?.addEventListener('change', () => validateAndShow(icon, 'icon', 'icon'));

  ['exe', 'apk', 'icon'].forEach((key) => setLabel(key, null));
  updateSummary();
}

function setupEditUploadPreviews() {
  const form = document.getElementById('appEditForm');
  if (!form) return;
  const fields = [
    ['exeFile', 'windows', 'EXE'],
    ['apkFile', 'android', 'APK'],
    ['iconFile', 'icon', 'الصورة'],
  ];
  fields.forEach(([name, kind, label]) => {
    const input = form.querySelector(`[name="${name}"]`);
    if (!input) return;
    input.addEventListener('change', () => {
      const file = input.files?.[0] || null;
      const status = input.closest('.file-picker')?.querySelector('em');
      if (!file) {
        if (status) status.textContent = kind === 'icon' ? 'PNG / JPG / WEBP' : 'لم يتم اختيار ملف جديد';
        return;
      }
      try {
        validateUpload(file, kind);
        if (status) status.textContent = `${file.name} · ${formatFileSize(file.size)}`;
        if (kind === 'icon') {
          const preview = form.querySelector('[data-icon-preview]');
          if (preview) {
            preview.classList.add('has-image');
            preview.classList.remove('auto-initials');
            if (preview.dataset.objectUrl) URL.revokeObjectURL(preview.dataset.objectUrl);
          const previewUrl = URL.createObjectURL(file);
          preview.dataset.objectUrl = previewUrl;
          preview.innerHTML = `<img src="${previewUrl}" alt="معاينة">`;
          }
        }
      } catch (error) {
        input.value = '';
        if (status) status.textContent = kind === 'icon' ? 'PNG / JPG / WEBP' : 'لم يتم اختيار ملف جديد';
        toast(friendlyError(error), 'error');
      }
    });
  });
}

function resetUploadFields() {
  const form = document.getElementById('addAppForm');
  if (!form) return;
  ['exe', 'apk', 'icon'].forEach((key) => {
    const label = form.querySelector(`[data-file-label="${key}"]`);
    if (label) label.textContent = key === 'icon' ? 'اختياري — PNG / JPG / WEBP' : 'لم يتم اختيار ملف';
    const size = form.querySelector(`[data-file-size="${key}"]`);
    if (size) size.textContent = '';
  });
  const preview = form.querySelector('[data-main-icon-preview]');
  if (preview) { preview.innerHTML = '<span>CODEX</span>'; preview.classList.remove('has-image'); }
  setText('newAppSize', 'سيتم حسابه تلقائيًا');
  setText('newAppPlatform', 'سيتم تحديده تلقائيًا');
}

function setupDashboardDelegation() {
  document.addEventListener('click', async (event) => {
    const editButton = event.target.closest('[data-edit-app]');
    if (editButton) return openAppEditor(editButton.dataset.editApp);
    const deleteButton = event.target.closest('[data-delete-app]');
    if (deleteButton) return deleteApp(deleteButton.dataset.deleteApp);
    const deleteUserButton = event.target.closest('[data-delete-user]');
    if (deleteUserButton) return deleteUser(deleteUserButton.dataset.deleteUser);
    const resetButton = event.target.closest('[data-reset-user]');
    if (resetButton) return resetUserPassword(resetButton.dataset.resetUser);
    const roleButton = event.target.closest('[data-toggle-role]');
    if (roleButton) return setUserRole(roleButton.dataset.toggleRole, roleButton.dataset.role);
  });
}

async function setupDashboard() {
  const form = document.getElementById('addAppForm');
  if (!form) return;
  if (!(await requireAdmin())) return;
  setText('adminName', currentProfile?.name || currentUser?.email?.split('@')[0] || 'Admin');
  setText('adminEmail', currentUser?.email || currentProfile?.email || '');

  form.onsubmit = (event) => {
    event.preventDefault();
    createAppRecord(form);
  };
  document.getElementById('addAdminForm')?.addEventListener('submit', addAdmin);
  document.querySelectorAll('[data-close-modal]').forEach((button) => {
    button.onclick = () => document.getElementById('appEditModal')?.classList.remove('open');
  });
  document.getElementById('appEditForm')?.addEventListener('submit', updateApp);
  document.getElementById('refreshDashboardBtn')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    try {
      await renderDashboard();
      toast('تم تحديث لوحة التحكم.');
    } finally {
      button.removeAttribute('aria-busy');
      button.disabled = false;
    }
  });
  await renderDashboard();
}

async function setUserRole(id, currentRole) {
  if (!currentUser || id === currentUser.id) return toast('لا يمكن تغيير صلاحية حسابك من هنا.', 'info');
  const role = currentRole === 'admin' ? 'user' : 'admin';
  if (!confirm(`تغيير صلاحية هذا الحساب إلى ${role === 'admin' ? 'Admin' : 'User'}؟`)) return;
  const progress = showOperationProgress('تغيير صلاحية الحساب', 20);
  try {
    progress.update(45, 'تحديث الصلاحية');
    const { data, error } = await supabase.functions.invoke('admin-set-role', { body: { userId: id, role } });
    if (error || data?.error) throw new Error(data?.error || error?.message || 'فشل تغيير الصلاحية.');
    progress.update(85, 'تحديث القائمة');
    await renderUsers();
    progress.done('تم تحديث صلاحية الحساب');
    toast('تم تحديث صلاحية الحساب.');
  } catch (error) {
    progress.fail(friendlyError(error, 'فشل تغيير صلاحية الحساب.'));
    toast(friendlyError(error, 'فشل تغيير صلاحية الحساب.'), 'error');
  }
}

async function deleteUser(id) {
  if (id === currentUser?.id) return toast('لا يمكن حذف حسابك الحالي.', 'error');
  if (!confirm('هل تريد حذف هذا الحساب؟')) return;
  const progress = showOperationProgress('حذف الحساب', 20);
  try {
    progress.update(45, 'حذف حساب Auth');
    const { data, error } = await supabase.functions.invoke('admin-delete-user', { body: { userId: id } });
    if (error || data?.error) throw new Error(data?.error || error?.message || 'فشل حذف المستخدم.');
    progress.update(85, 'تحديث القائمة');
    await renderDashboard();
    progress.done('تم حذف الحساب');
    toast('تم حذف الحساب.');
  } catch (error) {
    progress.fail(friendlyError(error, 'فشل حذف الحساب.'));
    toast(friendlyError(error, 'فشل حذف الحساب.'), 'error');
  }
}

async function resetUserPassword(id) {
  const password = prompt('اكتب كلمة المرور الجديدة (6 أحرف على الأقل):');
  if (!password) return;
  if (password.length < 6) return toast('كلمة المرور قصيرة.', 'error');
  const { data, error } = await supabase.functions.invoke('admin-reset-password', { body: { userId: id, password } });
  if (error || data?.error) return toast(friendlyError(data?.error || error, 'فشل تغيير كلمة المرور.'), 'error');
  toast('تم تغيير كلمة المرور.');
}

function initRealtimeRefresh() {
  supabase.auth.onAuthStateChange((event, session) => {
    setTimeout(async () => {
      const nextUser = session?.user || null;
      const changed = nextUser?.id !== currentUser?.id;
      currentUser = nextUser;
      if (currentUser) {
        await loadProfile();
        if (event === 'USER_UPDATED' && currentProfile && currentUser.email) {
          const profileUpdate = await supabase
            .from('profiles')
            .update({ email: currentUser.email, updated_at: new Date().toISOString() })
            .eq('id', currentUser.id);
          if (!profileUpdate.error) currentProfile.email = currentUser.email;
        }
      } else {
        currentProfile = null;
      }
      setupNavbar();
      if (changed && document.getElementById('appsGrid')) {
        await loadApps(false);
        displayApps(apps);
        displayReleases();
      }
      if (document.getElementById('favoriteBtn')) {
        const id = new URLSearchParams(location.search).get('id');
        if (id) setFavoriteState(document.getElementById('favoriteBtn'), id);
      }
    }, 0);
  });
}


async function boot() {
  setupNavigationEffects();
  setupUploadPreviews();
  setupEditUploadPreviews();

  const configReady = await requireConfig();
  if (!configReady) return;

  // Bind page-specific forms BEFORE session/network work so the login/register
  // buttons are never blocked by a slow Supabase session request.
  await setupAuth();
  initRealtimeRefresh();

  try {
    await loadSession();
    setupNavbar();

    const account = document.getElementById('accountNameForm');
    if (account) await setupAccount();

    const dashboard = document.getElementById('addAppForm');
    if (dashboard) await setupDashboard();

    if (document.getElementById('appsGrid') || document.getElementById('releasesList') || document.getElementById('detailsName')) {
      await loadApps();
      displayApps(apps);
      displayReleases();
      await loadAppDetails();
    }
  } catch (error) {
    console.error('CODEX boot error', error);
    if (document.getElementById('authMessage')) showAuthMessage(friendlyError(error, 'تعذر تشغيل الاتصال بـ Supabase.'), 'error');
    else toast(friendlyError(error, 'تعذر تحميل البيانات.'), 'error');
  } finally {
    bootFinished = true;
    const loader = document.getElementById('codexPageLoader');
    if (loader) {
      loader.querySelector('.page-loader-stage').textContent = 'تم تجهيز الصفحة';
      loader.querySelector('.page-loader-track i').style.width = '100%';
    }
    hidePageLoader(180);
  }

  document.getElementById('searchInput')?.addEventListener('input', filterHomeApps);
  document.getElementById('searchBtn')?.addEventListener('click', filterHomeApps);
  document.querySelectorAll('.category').forEach((button) => {
    button.addEventListener('click', () => {
      document.querySelectorAll('.category').forEach((item) => item.classList.remove('active'));
      button.classList.add('active');
      filterHomeApps();
    });
  });
  setupDashboardDelegation();
}

boot();

import { createClient } from '@supabase/supabase-js';

/* =========================================================
   CODEX STORE - MAIN SCRIPT
   ========================================================= */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing Supabase environment variables.');
}

export const supabase = createClient(
  SUPABASE_URL || '',
  SUPABASE_KEY || ''
);

/* =========================================================
   GLOBAL STATE
   ========================================================= */

let currentUser = null;
let currentProfile = null;
let currentApp = null;
let editingAppId = null;

const ADMIN_EMAIL = 'karimmohammedkadry@gmail.com';

const CATEGORY_MAP = {
  business: 'Business',
  education: 'Education',
  health: 'Health',
  productivity: 'Productivity',
  games: 'Games',
  tools: 'Tools'
};

const CATEGORY_AR = {
  business: 'أعمال',
  education: 'تعليم',
  health: 'صحة',
  productivity: 'إنتاجية',
  games: 'ألعاب',
  tools: 'أدوات'
};

/* =========================================================
   HELPERS
   ========================================================= */

function $(id) {
  return document.getElementById(id);
}

function escapeHtml(value) {
  if (value === null || value === undefined) return '';

  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatBytes(bytes) {
  const size = Number(bytes || 0);

  if (!size) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(
    Math.floor(Math.log(size) / Math.log(1024)),
    units.length - 1
  );

  return `${(size / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 2)} ${units[index]}`;
}

function formatDate(value) {
  if (!value) return '—';

  try {
    return new Intl.DateTimeFormat('en-GB', {
      year: 'numeric',
      month: 'short',
      day: '2-digit'
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function getCategoryName(category) {
  if (!category) return 'Other';

  return (
    CATEGORY_MAP[category] ||
    CATEGORY_AR[category] ||
    category
  );
}

function normalizeCategory(app) {
  return (
    app?.category ||
    app?.category_name ||
    app?.categories?.slug ||
    app?.categories?.name ||
    ''
  );
}

function getAppIcon(app) {
  if (app?.icon_url) {
    return `
      <img
        src="${escapeHtml(app.icon_url)}"
        alt="${escapeHtml(app.name || 'App')}"
        class="app-icon-image"
        loading="lazy"
      >
    `;
  }

  const text =
    app?.icon_text ||
    (app?.name || 'C').trim().charAt(0).toUpperCase() ||
    'C';

  return `
    <div class="app-icon-placeholder">
      ${escapeHtml(text)}
    </div>
  `;
}

function showElement(element) {
  if (!element) return;
  element.hidden = false;
  element.style.display = '';
}

function hideElement(element) {
  if (!element) return;
  element.hidden = true;
  element.style.display = 'none';
}

/* =========================================================
   TOAST
   ========================================================= */

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

  clearTimeout(window.__toastTimer);

  window.__toastTimer = setTimeout(() => {
    box.classList.remove('show');
  }, 2800);
}

window.toast = toast;

/* =========================================================
   AUTH ERROR TRANSLATION
   ========================================================= */

function translateAuthError(message) {
  const text = String(message || '').toLowerCase();

  if (text.includes('invalid login credentials')) {
    return 'البريد الإلكتروني أو كلمة المرور غير صحيحة.';
  }

  if (text.includes('email not confirmed')) {
    return 'يجب تأكيد البريد الإلكتروني أولاً.';
  }

  if (text.includes('user already registered')) {
    return 'هذا البريد الإلكتروني مسجل بالفعل.';
  }

  if (text.includes('password should be at least')) {
    return 'كلمة المرور قصيرة جداً.';
  }

  if (text.includes('unable to validate email')) {
    return 'البريد الإلكتروني غير صحيح.';
  }

  if (text.includes('rate limit')) {
    return 'تم تجاوز عدد المحاولات. حاول مرة أخرى لاحقاً.';
  }

  return message || 'حدث خطأ غير متوقع.';
}

/* =========================================================
   PROFILE
   ========================================================= */

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
    console.error('Profile load error:', error);
    currentProfile = null;
    return null;
  }

  currentProfile = data || null;

  return currentProfile;
}

async function ensureProfile() {
  if (!currentUser) return null;

  const existing = await loadProfile();

  if (existing) return existing;

  const metadata = currentUser.user_metadata || {};

  const payload = {
    id: currentUser.id,
    full_name: metadata.name || metadata.full_name || '',
    name: metadata.name || metadata.full_name || '',
    email: currentUser.email || '',
    role: 'user'
  };

  const { data, error } = await supabase
    .from('profiles')
    .upsert(payload, {
      onConflict: 'id'
    })
    .select('*')
    .single();

  if (error) {
    console.error('Profile creation error:', error);
    return null;
  }

  currentProfile = data;

  return data;
}

function isAdmin() {
  if (!currentUser) return false;

  if (
    String(currentUser.email || '').toLowerCase() ===
    ADMIN_EMAIL.toLowerCase()
  ) {
    return true;
  }

  return currentProfile?.role === 'admin';
}

/* =========================================================
   NAVIGATION
   ========================================================= */

function setupNavigation() {
  const currentPage =
    location.pathname.split('/').pop() || 'index.html';

  document.querySelectorAll('[data-page]').forEach((link) => {
    const page = link.getAttribute('data-page');

    if (
      page === currentPage ||
      (currentPage === '' && page === 'index.html')
    ) {
      link.classList.add('active');
    }
  });

  document.querySelectorAll('[data-logout]').forEach((button) => {
    button.addEventListener('click', async (event) => {
      event.preventDefault();

      await supabase.auth.signOut();

      location.href = 'index.html';
    });
  });
}

/* =========================================================
   NAVBAR USER
   ========================================================= */

function renderUserUI() {
  const loginLinks = document.querySelectorAll(
    '[data-auth="login"], .login-link'
  );

  const accountLinks = document.querySelectorAll(
    '[data-auth="account"], .account-link'
  );

  const adminLinks = document.querySelectorAll(
    '[data-auth="admin"], .admin-link'
  );

  const logoutLinks = document.querySelectorAll(
    '[data-auth="logout"], .logout-link'
  );

  if (currentUser) {
    loginLinks.forEach((el) => hideElement(el));
    accountLinks.forEach((el) => showElement(el));
    logoutLinks.forEach((el) => showElement(el));

    adminLinks.forEach((el) => {
      if (isAdmin()) {
        showElement(el);
      } else {
        hideElement(el);
      }
    });
  } else {
    loginLinks.forEach((el) => showElement(el));
    accountLinks.forEach((el) => hideElement(el));
    adminLinks.forEach((el) => hideElement(el));
    logoutLinks.forEach((el) => hideElement(el));
  }

  const userName =
    currentProfile?.name ||
    currentProfile?.full_name ||
    currentUser?.user_metadata?.name ||
    currentUser?.email ||
    '';

  document.querySelectorAll('[data-user-name]').forEach((el) => {
    el.textContent = userName;
  });

  document.querySelectorAll('[data-user-email]').forEach((el) => {
    el.textContent = currentUser?.email || '';
  });
}

/* =========================================================
   APPS
   ========================================================= */

async function loadApps(options = {}) {
  const {
    search = '',
    category = '',
    publishedOnly = true
  } = options;

  let query = supabase
    .from('apps')
    .select(`
      *,
      categories (
        id,
        name,
        slug
      )
    `)
    .order('created_at', {
      ascending: false
    });

  if (publishedOnly && !isAdmin()) {
    query = query.eq('is_published', true);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Apps load error:', error);
    toast('تعذر تحميل التطبيقات.', 'error');
    return [];
  }

  let apps = data || [];

  const normalizedSearch = String(search || '')
    .trim()
    .toLowerCase();

  if (normalizedSearch) {
    apps = apps.filter((app) => {
      const values = [
        app.name,
        app.slug,
        app.description,
        app.developer_name,
        app.category,
        app.category_name,
        app.categories?.name,
        app.categories?.slug
      ];

      return values.some((value) =>
        String(value || '')
          .toLowerCase()
          .includes(normalizedSearch)
      );
    });
  }

  if (category) {
    apps = apps.filter((app) => {
      return normalizeCategory(app) === category;
    });
  }

  return apps;
}

function renderApps(apps, container) {
  if (!container) return;

  if (!apps.length) {
    container.innerHTML = `
      <div class="empty-state">
        <h3>No apps found</h3>
        <p>There are no applications matching your search.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = apps
    .map((app) => {
      const category = normalizeCategory(app);

      return `
        <article
          class="app-card"
          data-app-id="${escapeHtml(app.id)}"
        >
          <a
            class="app-card-link"
            href="app.html?id=${encodeURIComponent(app.id)}"
          >
            <div class="app-card-icon">
              ${getAppIcon(app)}
            </div>

            <div class="app-card-content">
              <h3>${escapeHtml(app.name || 'Unnamed App')}</h3>

              <div class="app-card-category">
                ${escapeHtml(getCategoryName(category))}
              </div>

              <p>
                ${escapeHtml(
                  app.description || 'No description available.'
                )}
              </p>

              <div class="app-card-meta">
                <span>
                  ${escapeHtml(app.version || '1.0.0')}
                </span>

                <span>
                  ${Number(app.downloads_count || 0).toLocaleString()}
                  downloads
                </span>
              </div>
            </div>
          </a>
        </article>
      `;
    })
    .join('');
}

/* =========================================================
   HOME / STORE
   ========================================================= */

async function setupStorePage() {
  const container =
    $('appsGrid') ||
    $('appsContainer') ||
    document.querySelector('[data-apps-grid]');

  if (!container) return;

  const searchInput =
    $('searchInput') ||
    $('appSearch') ||
    document.querySelector('[data-app-search]');

  const categorySelect =
    $('categoryFilter') ||
    $('appCategoryFilter') ||
    document.querySelector('[data-category-filter]');

  async function refresh() {
    const apps = await loadApps({
      search: searchInput?.value || '',
      category: categorySelect?.value || '',
      publishedOnly: true
    });

    renderApps(apps, container);
  }

  searchInput?.addEventListener('input', refresh);
  categorySelect?.addEventListener('change', refresh);

  await refresh();
}

/* =========================================================
   APP DETAILS
   ========================================================= */

async function loadAppById(id) {
  if (!id) return null;

  const { data, error } = await supabase
    .from('apps')
    .select(`
      *,
      categories (
        id,
        name,
        slug
      ),
      app_files (
        id,
        app_id,
        platform,
        file_name,
        storage_path,
        mime_type,
        file_size,
        size_bytes,
        version,
        is_current,
        created_at
      )
    `)
    .eq('id', id)
    .maybeSingle();

  if (error) {
    console.error('App details error:', error);
    return null;
  }

  return data;
}

function getFileSize(file) {
  return file?.size_bytes || file?.file_size || 0;
}

function renderAppDetails(app) {
  const title = $('appTitle');
  const description = $('appDescription');
  const version = $('appVersion');
  const category = $('appCategory');
  const developer = $('appDeveloper');
  const downloads = $('appDownloads');
  const icon = $('appIcon');
  const windowsButton = $('windowsDownload');
  const androidButton = $('androidDownload');

  if (title) {
    title.textContent = app.name || 'Unnamed App';
  }

  if (description) {
    description.textContent =
      app.description || 'No description available.';
  }

  if (version) {
    version.textContent = app.version || '1.0.0';
  }

  if (category) {
    category.textContent = getCategoryName(
      normalizeCategory(app)
    );
  }

  if (developer) {
    developer.textContent =
      app.developer_name || 'CODEX Developer';
  }

  if (downloads) {
    downloads.textContent = Number(
      app.downloads_count || 0
    ).toLocaleString();
  }

  if (icon) {
    icon.innerHTML = getAppIcon(app);
  }

  const files = Array.isArray(app.app_files)
    ? app.app_files
    : [];

  const windowsFile =
    files.find(
      (file) =>
        file.platform === 'windows' &&
        file.is_current
    ) ||
    files.find(
      (file) => file.platform === 'windows'
    );

  const androidFile =
    files.find(
      (file) =>
        file.platform === 'android' &&
        file.is_current
    ) ||
    files.find(
      (file) => file.platform === 'android'
    );

  if (windowsButton) {
    configureDownloadButton(
      windowsButton,
      windowsFile,
      app.download_url
    );
  }

  if (androidButton) {
    configureDownloadButton(
      androidButton,
      androidFile,
      app.download_url
    );
  }

  document.querySelectorAll('[data-file-size]').forEach(
    (el) => {
      const platform = el.dataset.fileSize;

      const file =
        platform === 'windows'
          ? windowsFile
          : androidFile;

      el.textContent = file
        ? formatBytes(getFileSize(file))
        : 'Not available';
    }
  );
}

function configureDownloadButton(
  button,
  file,
  fallbackUrl
) {
  if (!button) return;

  if (file?.storage_path) {
    button.disabled = false;
    button.removeAttribute('aria-disabled');

    button.onclick = async (event) => {
      event.preventDefault();

      const { data, error } = await supabase.storage
        .from('app-files')
        .createSignedUrl(file.storage_path, 3600);

      if (error || !data?.signedUrl) {
        console.error('Download URL error:', error);
        toast('تعذر إنشاء رابط التحميل.', 'error');
        return;
      }

      window.open(
        data.signedUrl,
        '_blank',
        'noopener,noreferrer'
      );
    };

    return;
  }

  if (fallbackUrl) {
    button.disabled = false;

    button.onclick = (event) => {
      event.preventDefault();

      window.open(
        fallbackUrl,
        '_blank',
        'noopener,noreferrer'
      );
    };

    return;
  }

  button.disabled = true;
  button.setAttribute('aria-disabled', 'true');
  button.onclick = null;
}

async function setupAppDetailsPage() {
  const id = new URLSearchParams(location.search).get('id');

  if (!id) return;

  const app = await loadAppById(id);

  if (!app) {
    toast('التطبيق غير موجود.', 'error');
    return;
  }

  currentApp = app;

  renderAppDetails(app);
}

/* =========================================================
   LOGIN
   ========================================================= */

function bindPasswordToggles() {
  document.querySelectorAll('[data-password-toggle]').forEach(
    (button) => {
      button.addEventListener('click', () => {
        const targetId =
          button.getAttribute('data-password-toggle');

        const input = $(targetId);

        if (!input) return;

        input.type =
          input.type === 'password'
            ? 'text'
            : 'password';
      });
    }
  );
}

function showAuthMessage(message, type = 'error') {
  const box =
    $('authMessage') ||
    document.querySelector('[data-auth-message]');

  if (!box) {
    toast(message, type);
    return;
  }

  box.textContent = message;
  box.className = `auth-message ${type}`;
  showElement(box);
}

async function setupAuth() {
  const loginForm =
    $('loginForm') ||
    document.querySelector('[data-login-form]');

  const registerForm =
    $('registerForm') ||
    document.querySelector('[data-register-form]');

  if (!loginForm && !registerForm) return;

  bindPasswordToggles();

  loginForm?.addEventListener('submit', async (event) => {
    event.preventDefault();

    const email =
      $('loginEmail')?.value.trim().toLowerCase();

    const password =
      $('loginPassword')?.value || '';

    if (!email || !password) {
      showAuthMessage(
        'اكتب البريد الإلكتروني وكلمة المرور.',
        'error'
      );
      return;
    }

    const submitButton =
      loginForm.querySelector(
        'button[type="submit"]'
      );

    if (submitButton) {
      submitButton.disabled = true;
    }

    const { error } =
      await supabase.auth.signInWithPassword({
        email,
        password
      });

    if (submitButton) {
      submitButton.disabled = false;
    }

    if (error) {
      console.error('Login error:', error);

      showAuthMessage(
        translateAuthError(error.message),
        'error'
      );

      return;
    }

    showAuthMessage(
      'تم تسجيل الدخول بنجاح.',
      'success'
    );

    setTimeout(() => {
      location.href = 'index.html';
    }, 400);
  });

  registerForm?.addEventListener('submit', async (event) => {
    event.preventDefault();

    const name =
      $('registerName')?.value.trim() ||
      $('signupName')?.value.trim() ||
      '';

    const email =
      $('registerEmail')?.value.trim().toLowerCase() ||
      $('signupEmail')?.value.trim().toLowerCase() ||
      '';

    const password =
      $('registerPassword')?.value ||
      $('signupPassword')?.value ||
      '';

    const confirmPassword =
      $('registerConfirmPassword')?.value ||
      $('signupConfirmPassword')?.value ||
      '';

    if (!email || !password) {
      showAuthMessage(
        'أدخل البريد الإلكتروني وكلمة المرور.',
        'error'
      );
      return;
    }

    if (password.length < 6) {
      showAuthMessage(
        'كلمة المرور يجب أن تكون 6 أحرف على الأقل.',
        'error'
      );
      return;
    }

    if (
      confirmPassword &&
      password !== confirmPassword
    ) {
      showAuthMessage(
        'كلمتا المرور غير متطابقتين.',
        'error'
      );
      return;
    }

    const submitButton =
      registerForm.querySelector(
        'button[type="submit"]'
      );

    if (submitButton) {
      submitButton.disabled = true;
    }

    const { data, error } =
      await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            name
          }
        }
      });

    if (submitButton) {
      submitButton.disabled = false;
    }

    if (error) {
      console.error('Register error:', error);

      showAuthMessage(
        translateAuthError(error.message),
        'error'
      );

      return;
    }

    if (data?.session) {
      await ensureProfile();

      showAuthMessage(
        'تم إنشاء الحساب بنجاح.',
        'success'
      );

      setTimeout(() => {
        location.href = 'index.html';
      }, 500);
    } else {
      showAuthMessage(
        'تم إنشاء الحساب. راجع بريدك الإلكتروني لتأكيد الحساب.',
        'success'
      );
    }
  });
}

/* =========================================================
   ACCOUNT
   ========================================================= */

async function setupAccountPage() {
  const form =
    $('accountForm') ||
    document.querySelector('[data-account-form]');

  if (!form || !currentUser) return;

  const nameInput =
    $('accountName') ||
    $('profileName') ||
    form.querySelector('[name="name"]');

  const emailInput =
    $('accountEmail') ||
    $('profileEmail') ||
    form.querySelector('[name="email"]');

  if (nameInput) {
    nameInput.value =
      currentProfile?.name ||
      currentProfile?.full_name ||
      currentUser.user_metadata?.name ||
      '';
  }

  if (emailInput) {
    emailInput.value =
      currentUser.email ||
      currentProfile?.email ||
      '';
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const name =
      nameInput?.value.trim() || '';

    const { error: authError } =
      await supabase.auth.updateUser({
        data: {
          name
        }
      });

    if (authError) {
      console.error('User update error:', authError);

      toast(
        translateAuthError(authError.message),
        'error'
      );

      return;
    }

    const profilePayload = {
      name,
      full_name: name,
      email: currentUser.email || ''
    };

    const { error: profileError } =
      await supabase
        .from('profiles')
        .update(profilePayload)
        .eq('id', currentUser.id);

    if (profileError) {
      console.error(
        'Profile update error:',
        profileError
      );

      toast(
        'تم تحديث الحساب ولكن تعذر تحديث الملف الشخصي.',
        'error'
      );

      await loadProfile();
      renderUserUI();

      return;
    }

    await loadProfile();
    renderUserUI();

    toast('تم حفظ البيانات بنجاح.');
  });
}

/* =========================================================
   STORAGE
   ========================================================= */

async function uploadStorageFile(
  file,
  bucket,
  folder = ''
) {
  if (!file) return null;

  const safeName = file.name
    .replace(/[^a-zA-Z0-9._-]/g, '_');

  const path = folder
    ? `${folder}/${Date.now()}_${safeName}`
    : `${Date.now()}_${safeName}`;

  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, file, {
      upsert: false,
      contentType: file.type || undefined
    });

  if (error) {
    console.error('Storage upload error:', error);
    throw error;
  }

  const { data } = supabase.storage
    .from(bucket)
    .getPublicUrl(path);

  return {
    path,
    publicUrl: data?.publicUrl || null
  };
}

/* =========================================================
   ADMIN DASHBOARD
   ========================================================= */

async function loadAdminApps() {
  const { data, error } = await supabase
    .from('apps')
    .select(`
      *,
      categories (
        id,
        name,
        slug
      )
    `)
    .order('created_at', {
      ascending: false
    });

  if (error) {
    console.error('Admin apps error:', error);
    return [];
  }

  return data || [];
}

function renderAdminApps(apps) {
  const container =
    $('adminApps') ||
    $('adminAppsList') ||
    document.querySelector('[data-admin-apps]');

  if (!container) return;

  if (!apps.length) {
    container.innerHTML = `
      <div class="empty-state">
        No applications yet.
      </div>
    `;

    return;
  }

  container.innerHTML = apps
    .map((app) => {
      return `
        <div
          class="admin-app-row"
          data-id="${escapeHtml(app.id)}"
        >
          <div class="admin-app-main">
            <div class="admin-app-icon">
              ${getAppIcon(app)}
            </div>

            <div>
              <strong>
                ${escapeHtml(app.name || 'Unnamed App')}
              </strong>

              <div>
                ${escapeHtml(app.version || '1.0.0')}
              </div>
            </div>
          </div>

          <div class="admin-app-status">
            ${
              app.is_published
                ? 'Published'
                : 'Draft'
            }
          </div>

          <div class="admin-app-actions">
            <button
              type="button"
              data-edit-app="${escapeHtml(app.id)}"
            >
              Edit
            </button>

            <button
              type="button"
              data-delete-app="${escapeHtml(app.id)}"
            >
              Delete
            </button>
          </div>
        </div>
      `;
    })
    .join('');

  container
    .querySelectorAll('[data-edit-app]')
    .forEach((button) => {
      button.addEventListener('click', () => {
        const id =
          button.getAttribute('data-edit-app');

        openAppEditor(id);
      });
    });

  container
    .querySelectorAll('[data-delete-app]')
    .forEach((button) => {
      button.addEventListener('click', () => {
        const id =
          button.getAttribute('data-delete-app');

        deleteApp(id);
      });
    });
}

/* =========================================================
   ADMIN AUTH CHECK
   ========================================================= */

async function requireAdmin() {
  if (!currentUser) {
    location.href = 'login.html';
    return false;
  }

  await ensureProfile();

  if (!isAdmin()) {
    toast(
      'ليس لديك صلاحية دخول لوحة الإدارة.',
      'error'
    );

    setTimeout(() => {
      location.href = 'index.html';
    }, 500);

    return false;
  }

  return true;
}

/* =========================================================
   APP EDITOR
   ========================================================= */

async function openAppEditor(appId = null) {
  const modal =
    $('appEditorModal') ||
    document.querySelector('[data-app-editor]');

  if (!modal) {
    if (appId) {
      location.href =
        `admin.html?edit=${encodeURIComponent(appId)}`;
    }

    return;
  }

  editingAppId = appId;

  let app = null;

  if (appId) {
    app = await loadAppById(appId);

    if (!app) {
      toast('تعذر تحميل التطبيق.', 'error');
      return;
    }
  }

  setEditorValue(
    ['appName', 'editorAppName'],
    app?.name || ''
  );

  setEditorValue(
    ['appSlug', 'editorAppSlug'],
    app?.slug || ''
  );

  setEditorValue(
    ['appDescription', 'editorAppDescription'],
    app?.description || ''
  );

  setEditorValue(
    ['appVersion', 'editorAppVersion'],
    app?.version || '1.0.0'
  );

  setEditorValue(
    ['appDeveloper', 'editorAppDeveloper'],
    app?.developer_name || ''
  );

  setEditorValue(
    ['appCategory', 'editorAppCategory'],
    normalizeCategory(app)
  );

  setEditorValue(
    ['appDownloadUrl', 'editorAppDownloadUrl'],
    app?.download_url || ''
  );

  setEditorChecked(
    ['appPublished', 'editorAppPublished'],
    app?.is_published ?? true
  );

  showElement(modal);
}

function setEditorValue(ids, value) {
  for (const id of ids) {
    const input = $(id);

    if (input) {
      input.value = value;
      return;
    }
  }
}

function setEditorChecked(ids, value) {
  for (const id of ids) {
    const input = $(id);

    if (input) {
      input.checked = Boolean(value);
      return;
    }
  }
}

function getEditorValue(ids) {
  for (const id of ids) {
    const input = $(id);

    if (input) {
      return input.value;
    }
  }

  return '';
}

function getEditorChecked(ids) {
  for (const id of ids) {
    const input = $(id);

    if (input) {
      return input.checked;
    }
  }

  return false;
}

function closeAppEditor() {
  const modal =
    $('appEditorModal') ||
    document.querySelector('[data-app-editor]');

  hideElement(modal);

  editingAppId = null;
}

async function saveAppEditor() {
  if (!isAdmin()) {
    toast('ليس لديك صلاحية.', 'error');
    return;
  }

  const name =
    getEditorValue([
      'appName',
      'editorAppName'
    ]).trim();

  const slug =
    getEditorValue([
      'appSlug',
      'editorAppSlug'
    ]).trim();

  const description =
    getEditorValue([
      'appDescription',
      'editorAppDescription'
    ]).trim();

  const version =
    getEditorValue([
      'appVersion',
      'editorAppVersion'
    ]).trim() || '1.0.0';

  const developer =
    getEditorValue([
      'appDeveloper',
      'editorAppDeveloper'
    ]).trim();

  const category =
    getEditorValue([
      'appCategory',
      'editorAppCategory'
    ]).trim();

  const downloadUrl =
    getEditorValue([
      'appDownloadUrl',
      'editorAppDownloadUrl'
    ]).trim();

  const isPublished =
    getEditorChecked([
      'appPublished',
      'editorAppPublished'
    ]);

  if (!name) {
    toast('اكتب اسم التطبيق.', 'error');
    return;
  }

  let generatedSlug = slug;

  if (!generatedSlug) {
    generatedSlug = name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  const payload = {
    name,
    slug: generatedSlug,
    description,
    version,
    developer_name: developer,
    category,
    category_name: category,
    download_url: downloadUrl || null,
    is_published: isPublished
  };

  let result;

  if (editingAppId) {
    result = await supabase
      .from('apps')
      .update(payload)
      .eq('id', editingAppId)
      .select()
      .single();
  } else {
    result = await supabase
      .from('apps')
      .insert({
        ...payload,
        created_by: currentUser.id,
        downloads_count: 0
      })
      .select()
      .single();
  }

  if (result.error) {
    console.error('Save app error:', result.error);

    toast(
      `تعذر حفظ التطبيق: ${result.error.message}`,
      'error'
    );

    return;
  }

  const app = result.data;

  await handleAppFilesUpload(app.id);

  closeAppEditor();

  toast(
    editingAppId
      ? 'تم تحديث التطبيق.'
      : 'تم إنشاء التطبيق.'
  );

  const apps = await loadAdminApps();

  renderAdminApps(apps);
}

async function handleAppFilesUpload(appId) {
  if (!appId) return;

  const windowsInput =
    $('windowsFile') ||
    $('windowsAppFile') ||
    document.querySelector(
      'input[type="file"][data-platform="windows"]'
    );

  const androidInput =
    $('androidFile') ||
    $('androidAppFile') ||
    document.querySelector(
      'input[type="file"][data-platform="android"]'
    );

  const files = [
    {
      input: windowsInput,
      platform: 'windows'
    },
    {
      input: androidInput,
      platform: 'android'
    }
  ];

  for (const item of files) {
    const file = item.input?.files?.[0];

    if (!file) continue;

    try {
      const uploaded = await uploadStorageFile(
        file,
        'app-files',
        `${appId}/${item.platform}`
      );

      if (!uploaded) continue;

      const row = {
        app_id: appId,
        platform: item.platform,
        file_name: file.name,
        storage_path: uploaded.path,
        mime_type: file.type || null,
        file_size: file.size,
        size_bytes: file.size,
        version:
          getEditorValue([
            'appVersion',
            'editorAppVersion'
          ]) || '1.0.0',
        is_current: true,
        created_by: currentUser.id
      };

      const { error } = await supabase
        .from('app_files')
        .upsert(row, {
          onConflict: 'app_id,platform'
        });

      if (error) {
        console.error(
          'App file database error:',
          error
        );

        toast(
          `تم رفع الملف لكن تعذر حفظه: ${error.message}`,
          'error'
        );
      }
    } catch (error) {
      console.error('File upload error:', error);

      toast(
        `تعذر رفع ملف ${item.platform}.`,
        'error'
      );
    }
  }
}

/* =========================================================
   DELETE APP
   ========================================================= */

async function deleteApp(id) {
  if (!id) return;

  if (!isAdmin()) {
    toast('ليس لديك صلاحية.', 'error');
    return;
  }

  const confirmed = window.confirm(
    'هل أنت متأكد من حذف هذا التطبيق؟'
  );

  if (!confirmed) return;

  const { error: filesError } =
    await supabase
      .from('app_files')
      .delete()
      .eq('app_id', id);

  if (filesError) {
    console.error(
      'Delete app files error:',
      filesError
    );
  }

  const { error } =
    await supabase
      .from('apps')
      .delete()
      .eq('id', id);

  if (error) {
    console.error('Delete app error:', error);

    toast(
      `تعذر حذف التطبيق: ${error.message}`,
      'error'
    );

    return;
  }

  toast('تم حذف التطبيق.');

  const apps = await loadAdminApps();

  renderAdminApps(apps);
}

/* =========================================================
   ADMIN PAGE
   ========================================================= */

async function setupAdminPage() {
  const isAdminPage =
    Boolean(
      $('adminDashboard') ||
      document.querySelector('[data-admin-page]')
    );

  if (!isAdminPage) return;

  const allowed = await requireAdmin();

  if (!allowed) return;

  const apps = await loadAdminApps();

  renderAdminApps(apps);

  const addButtons = document.querySelectorAll(
    '[data-add-app], #addAppButton'
  );

  addButtons.forEach((button) => {
    button.addEventListener('click', () => {
      openAppEditor();
    });
  });

  const saveButtons = document.querySelectorAll(
    '[data-save-app], #saveAppButton'
  );

  saveButtons.forEach((button) => {
    button.addEventListener('click', saveAppEditor);
  });

  const closeButtons = document.querySelectorAll(
    '[data-close-app-editor], #closeAppEditor'
  );

  closeButtons.forEach((button) => {
    button.addEventListener(
      'click',
      closeAppEditor
    );
  });

  const editId =
    new URLSearchParams(location.search).get('edit');

  if (editId) {
    await openAppEditor(editId);
  }
}

/* =========================================================
   SEARCH
   ========================================================= */

function setupGlobalSearch() {
  const inputs = document.querySelectorAll(
    '[data-global-search]'
  );

  inputs.forEach((input) => {
    input.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;

      const value = input.value.trim();

      if (!value) {
        location.href = 'index.html';
        return;
      }

      location.href =
        `index.html?search=${encodeURIComponent(value)}`;
    });
  });
}

async function setupSearchFromUrl() {
  const input =
    $('searchInput') ||
    $('appSearch') ||
    document.querySelector('[data-app-search]');

  if (!input) return;

  const value =
    new URLSearchParams(location.search).get('search');

  if (!value) return;

  input.value = value;
}

/* =========================================================
   CATEGORY FILTER
   ========================================================= */

function setupCategoryOptions() {
  const selects = document.querySelectorAll(
    '[data-category-filter], #categoryFilter, #appCategory'
  );

  selects.forEach((select) => {
    if (select.options.length > 1) return;

    Object.entries(CATEGORY_MAP).forEach(
      ([value, label]) => {
        const option =
          document.createElement('option');

        option.value = value;
        option.textContent = label;

        select.appendChild(option);
      }
    );
  });
}

/* =========================================================
   MODALS
   ========================================================= */

function setupModalCloseButtons() {
  document
    .querySelectorAll(
      '[data-modal-close], .modal-close'
    )
    .forEach((button) => {
      button.addEventListener('click', () => {
        const modal =
          button.closest('.modal') ||
          button.closest('[role="dialog"]');

        hideElement(modal);
      });
    });

  document
    .querySelectorAll('.modal')
    .forEach((modal) => {
      modal.addEventListener('click', (event) => {
        if (event.target !== modal) return;

        if (
          modal.dataset.closeOnBackdrop !== 'false'
        ) {
          hideElement(modal);
        }
      });
    });
}

/* =========================================================
   LOGOUT
   ========================================================= */

function setupLogout() {
  document
    .querySelectorAll(
      '[data-logout], #logoutButton'
    )
    .forEach((button) => {
      button.addEventListener('click', async (event) => {
        event.preventDefault();

        const { error } =
          await supabase.auth.signOut();

        if (error) {
          console.error('Logout error:', error);

          toast(
            'تعذر تسجيل الخروج.',
            'error'
          );

          return;
        }

        location.href = 'index.html';
      });
    });
}

/* =========================================================
   AUTH STATE
   ========================================================= */

async function initializeAuth() {
  const {
    data: {
      session
    }
  } = await supabase.auth.getSession();

  currentUser = session?.user || null;

  if (currentUser) {
    await ensureProfile();
  }

  renderUserUI();

  supabase.auth.onAuthStateChange(
    async (_event, sessionData) => {
      currentUser =
        sessionData?.user || null;

      if (currentUser) {
        await ensureProfile();
      } else {
        currentProfile = null;
      }

      renderUserUI();
    }
  );
}

/* =========================================================
   LOGIN PAGE REDIRECT
   ========================================================= */

function redirectAuthenticatedUserFromLogin() {
  const isLoginPage =
    location.pathname.endsWith('login.html') ||
    document.querySelector(
      '#loginForm, [data-login-form]'
    );

  if (!isLoginPage || !currentUser) return;

  const params =
    new URLSearchParams(location.search);

  if (params.get('redirect')) {
    location.href = params.get('redirect');
    return;
  }

  location.href = 'index.html';
}

/* =========================================================
   APP COUNTERS
   ========================================================= */

async function setupCounters() {
  const counters =
    document.querySelectorAll(
      '[data-app-count]'
    );

  if (!counters.length) return;

  const apps = await loadApps({
    publishedOnly: true
  });

  counters.forEach((counter) => {
    counter.textContent =
      apps.length.toLocaleString();
  });
}

/* =========================================================
   INITIALIZATION
   ========================================================= */

async function initialize() {
  try {
    await initializeAuth();

    setupNavigation();
    setupGlobalSearch();
    setupLogout();
    setupModalCloseButtons();
    setupCategoryOptions();

    await setupSearchFromUrl();

    await setupAuth();

    await setupStorePage();

    await setupAppDetailsPage();

    await setupAccountPage();

    await setupAdminPage();

    await setupCounters();

    redirectAuthenticatedUserFromLogin();
  } catch (error) {
    console.error(
      'CODEX initialization error:',
      error
    );
  }
}

if (
  document.readyState === 'loading'
) {
  document.addEventListener(
    'DOMContentLoaded',
    initialize
  );
} else {
  initialize();
}

/* =========================================================
   GLOBAL EXPORTS
   ========================================================= */

window.CODEX = {
  supabase,
  loadApps,
  loadAppById,
  loadProfile,
  isAdmin,
  toast,
  openAppEditor,
  closeAppEditor,
  saveAppEditor,
  deleteApp
};

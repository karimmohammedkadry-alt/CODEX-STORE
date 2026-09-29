```javascript
import { createClient } from '@supabase/supabase-js';

/* =========================================================
   SUPABASE CONFIG
========================================================= */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';

/*
  نستخدم قيمًا احتياطية حتى لا ينهار الموقع بالكامل إذا كانت
  Environment Variables غير موجودة أثناء تشغيل Vite.
*/
export const supabase = createClient(
  SUPABASE_URL || 'https://placeholder.supabase.co',
  SUPABASE_KEY || 'placeholder-publishable-key'
);

const ADMIN_EMAIL = 'karimmohammedkadry@gmail.com';

const categories = {
  business: 'الأعمال',
  education: 'التعليم',
  health: 'الصحة',
  productivity: 'الإنتاجية',
  games: 'الألعاب',
  tools: 'الأدوات'
};

let apps = [];
let currentUser = null;
let currentProfile = null;

/* =========================================================
   HELPERS
========================================================= */

function escapeHTML(value = '') {
  return String(value).replace(/[&<>'"]/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[char]));
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

  clearTimeout(window.__toastTimer);

  window.__toastTimer = setTimeout(() => {
    box.classList.remove('show');
  }, 2800);
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

  if (element) {
    element.textContent = value ?? '';
  }
}

function getProfileName(profile = currentProfile) {
  if (!profile) {
    return currentUser?.user_metadata?.name ||
      currentUser?.user_metadata?.full_name ||
      currentUser?.email?.split('@')[0] ||
      '';
  }

  return (
    profile.name ||
    profile.full_name ||
    currentUser?.user_metadata?.name ||
    currentUser?.user_metadata?.full_name ||
    currentUser?.email?.split('@')[0] ||
    ''
  );
}

function getProfileEmail(profile = currentProfile) {
  return (
    profile?.email ||
    currentUser?.email ||
    ''
  );
}

function getProfileRole(profile = currentProfile) {
  return profile?.role === 'admin' ? 'admin' : 'user';
}

function appIconMarkup(app, cls = 'app-icon') {
  if (app.icon_url) {
    return `
      <div class="${cls} has-image">
        <img
          src="${escapeHTML(app.icon_url)}"
          alt="${escapeHTML(app.name || 'App')}"
          loading="lazy"
        >
      </div>
    `;
  }

  return `
    <div class="${cls} ${escapeHTML(app.color || 'blue')}">
      ${escapeHTML(app.icon_text || 'C')}
    </div>
  `;
}

function fileBadgeMarkup(app) {
  const files = app.app_files || [];

  return `
    <div class="file-badges">
      ${files.map(file => `
        <span>
          ${file.platform === 'windows' ? 'EXE' : 'APK'}
          ·
          ${escapeHTML(formatFileSize(file.size_bytes))}
        </span>
      `).join('')}
    </div>
  `;
}

function getFile(app, platform) {
  return (app.app_files || []).find(file => file.platform === platform);
}

function appSize(app) {
  return formatFileSize(
    (app.app_files || []).reduce(
      (total, file) => total + Number(file.size_bytes || 0),
      0
    )
  );
}

function platformName(app) {
  const platforms = (app.app_files || []).map(file => file.platform);

  if (
    platforms.includes('windows') &&
    platforms.includes('android')
  ) {
    return 'Windows + Android';
  }

  if (platforms.includes('android')) {
    return 'Android';
  }

  if (platforms.includes('windows')) {
    return 'Windows';
  }

  return '—';
}

function publicUrl(path) {
  if (!path) return '';

  return supabase.storage
    .from('app-files')
    .getPublicUrl(path)
    .data
    .publicUrl;
}

/* =========================================================
   CONFIG
========================================================= */

async function requireConfig() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error(
      'Supabase configuration is missing.',
      {
        VITE_SUPABASE_URL: Boolean(SUPABASE_URL),
        VITE_SUPABASE_PUBLISHABLE_KEY: Boolean(SUPABASE_KEY)
      }
    );

    toast(
      'بيانات Supabase غير موجودة. تأكد من VITE_SUPABASE_URL و VITE_SUPABASE_PUBLISHABLE_KEY.',
      'error'
    );

    return false;
  }

  return true;
}

/* =========================================================
   SESSION
========================================================= */

async function loadSession() {
  try {
    const {
      data,
      error
    } = await supabase.auth.getSession();

    if (error) {
      console.error('SESSION ERROR:', error);
      currentUser = null;
      currentProfile = null;
      return null;
    }

    currentUser = data?.session?.user || null;

    if (currentUser) {
      await loadProfile();
    }

    return currentUser;

  } catch (error) {
    console.error('SESSION EXCEPTION:', error);
    currentUser = null;
    currentProfile = null;
    return null;
  }
}

function setupAuthStateListener() {
  supabase.auth.onAuthStateChange(async (event, session) => {
    currentUser = session?.user || null;

    if (currentUser) {
      await loadProfile();
    } else {
      currentProfile = null;
    }

    setupNavbar();
  });
}

/* =========================================================
   PROFILE
========================================================= */

async function loadProfile() {
  if (!currentUser) {
    currentProfile = null;
    return null;
  }

  try {
    const {
      data,
      error
    } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', currentUser.id)
      .maybeSingle();

    if (error) {
      console.error('PROFILE ERROR:', error);

      /*
        حتى لو الـprofile غير موجود، لا نمنع المستخدم
        من الدخول إلى الحساب.
      */
      currentProfile = {
        id: currentUser.id,
        name:
          currentUser.user_metadata?.name ||
          currentUser.user_metadata?.full_name ||
          '',
        full_name:
          currentUser.user_metadata?.name ||
          currentUser.user_metadata?.full_name ||
          '',
        email: currentUser.email || '',
        role: 'user'
      };

      return currentProfile;
    }

    if (!data) {
      currentProfile = {
        id: currentUser.id,
        name:
          currentUser.user_metadata?.name ||
          currentUser.user_metadata?.full_name ||
          '',
        full_name:
          currentUser.user_metadata?.name ||
          currentUser.user_metadata?.full_name ||
          '',
        email: currentUser.email || '',
        role: 'user'
      };

      return currentProfile;
    }

    /*
      نوحد التعامل مع name و full_name داخل التطبيق
      بدون الاعتماد على عمود واحد فقط.
    */
    currentProfile = {
      ...data,
      name: data.name || data.full_name || '',
      full_name: data.full_name || data.name || '',
      email: data.email || currentUser.email || '',
      role: data.role || 'user'
    };

    return currentProfile;

  } catch (error) {
    console.error('PROFILE EXCEPTION:', error);

    currentProfile = {
      id: currentUser.id,
      name: currentUser.user_metadata?.name || '',
      full_name: currentUser.user_metadata?.name || '',
      email: currentUser.email || '',
      role: 'user'
    };

    return currentProfile;
  }
}

async function isAdmin() {
  if (!currentUser) return false;

  /*
    نعتمد على role من profiles.
    ونستخدم البريد فقط كـ fallback للحساب الرئيسي.
  */
  if (currentProfile?.role === 'admin') {
    return true;
  }

  if (
    currentUser.email &&
    currentUser.email.toLowerCase() === ADMIN_EMAIL.toLowerCase()
  ) {
    return true;
  }

  return false;
}

/* =========================================================
   NAVBAR
========================================================= */

function setupNavbar() {
  const loginBtn = document.getElementById('loginBtn');

  if (loginBtn) {
    loginBtn.textContent = currentUser
      ? (getProfileName() || 'حسابي')
      : 'تسجيل الدخول';

    loginBtn.onclick = () => {
      location.href = currentUser
        ? 'account.html'
        : 'login.html';
    };
  }

  document.querySelectorAll('[data-logout]').forEach(button => {
    button.onclick = logout;
  });

  const admin =
    currentUser &&
    (
      currentProfile?.role === 'admin' ||
      currentUser.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase()
    );

  if (admin) {
    document.querySelectorAll('.nav-actions').forEach(nav => {
      if (!nav.querySelector('[data-dashboard-link]')) {
        nav.insertAdjacentHTML(
          'afterbegin',
          `
            <a
              class="secondary-btn"
              data-dashboard-link
              href="dashboard.html"
            >
              لوحة التحكم
            </a>
          `
        );
      }
    });
  }
}

async function logout() {
  try {
    await supabase.auth.signOut();
  } catch (error) {
    console.error('LOGOUT ERROR:', error);
  }

  currentUser = null;
  currentProfile = null;

  location.href = 'index.html';
}

function showLoading() {
  const element = document.querySelector('.loading-screen');

  if (!element) return;

  setTimeout(() => {
    element.classList.add('hide');
  }, 650);
}

/* =========================================================
   APPS
========================================================= */

async function loadApps() {
  try {
    const {
      data,
      error
    } = await supabase
      .from('apps')
      .select('*, app_files(*)')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('APPS ERROR:', error);
      toast('تعذر تحميل التطبيقات من Supabase.', 'error');
      apps = [];
      return [];
    }

    apps = data || [];

    return apps;

  } catch (error) {
    console.error('APPS EXCEPTION:', error);
    apps = [];
    return [];
  }
}

function displayApps(list) {
  const grid = document.getElementById('appsGrid');

  if (!grid) return;

  grid.innerHTML = list.length
    ? list.map(app => `
        <article class="app-card">
          <a
            class="app-card-link"
            href="app.html?id=${encodeURIComponent(app.id)}"
          >
            ${appIconMarkup(app)}

            <div class="app-card-content">
              <span>
                ${escapeHTML(app.category_name || categories[app.category] || '')}
              </span>

              <h3>
                ${escapeHTML(app.name)}
              </h3>

              <p>
                ${escapeHTML(app.description)}
              </p>

              <div class="app-meta">
                <span>
                  v${escapeHTML(app.version || '1.0.0')}
                </span>

                <span>
                  ${escapeHTML(appSize(app))}
                </span>
              </div>

              ${fileBadgeMarkup(app)}
            </div>
          </a>
        </article>
      `).join('')
    : '<div class="empty-state">لا توجد تطبيقات مطابقة.</div>';
}

function displayReleases() {
  const box = document.getElementById('releasesList');

  if (!box) return;

  box.innerHTML = apps
    .slice(0, 4)
    .map(app => `
      <article class="release-card">
        <a href="app.html?id=${encodeURIComponent(app.id)}">
          ${appIconMarkup(app, 'release-icon')}

          <div>
            <span>
              v${escapeHTML(app.version || '1.0.0')}
            </span>

            <h3>
              ${escapeHTML(app.name)}
            </h3>

            <p>
              ${escapeHTML(app.description)}
            </p>
          </div>
        </a>
      </article>
    `)
    .join('');
}

function filterHomeApps() {
  const query = (
    document.getElementById('searchInput')?.value || ''
  )
    .trim()
    .toLowerCase();

  const active =
    document.querySelector('.category.active')?.dataset.category ||
    'all';

  const filtered = apps.filter(app => {
    const categoryMatch =
      active === 'all' ||
      app.category === active;

    const textMatch = [
      app.name,
      app.description,
      app.category_name,
      categories[app.category]
    ].some(value =>
      String(value || '')
        .toLowerCase()
        .includes(query)
    );

    return categoryMatch && textMatch;
  });

  displayApps(filtered);
}

/* =========================================================
   APP DETAILS
========================================================= */

async function loadAppDetails() {
  const element = document.getElementById('detailsName');

  if (!element) return;

  const id = new URLSearchParams(location.search).get('id');

  const app = apps.find(item => String(item.id) === String(id));

  if (!app) {
    element.textContent = 'التطبيق غير موجود';
    return;
  }

  setText('detailsName', app.name);
  setText('detailsDescription', app.description);
  setText(
    'detailsCategory',
    app.category_name || categories[app.category] || ''
  );
  setText('detailsRating', app.rating || '—');
  setText('detailsVersion', app.version || '—');
  setText('detailsSize', appSize(app));
  setText('detailsPlatform', platformName(app));

  const icon = document.getElementById('detailsIcon');

  if (icon) {
    icon.innerHTML = app.icon_url
      ? `<img src="${escapeHTML(app.icon_url)}" alt="">`
      : escapeHTML(app.icon_text || 'C');
  }

  const options = document.getElementById('downloadOptions');

  if (options) {
    options.innerHTML = (app.app_files || [])
      .map(file => `
        <a
          class="download-option"
          href="${escapeHTML(publicUrl(file.storage_path))}"
          download
          target="_blank"
          rel="noopener"
        >
          تحميل
          ${file.platform === 'windows'
            ? 'Windows / EXE'
            : 'Android / APK'}
          ·
          ${escapeHTML(formatFileSize(file.size_bytes))}
        </a>
      `)
      .join('');

    const main =
      getFile(app, 'windows') ||
      getFile(app, 'android');

    const downloadButton =
      document.getElementById('downloadBtn');

    if (main && downloadButton) {
      downloadButton.onclick = () => {
        window.open(
          publicUrl(main.storage_path),
          '_blank',
          'noopener'
        );
      };
    } else if (app.download_url && downloadButton) {
      downloadButton.onclick = () => {
        window.open(
          app.download_url,
          '_blank',
          'noopener'
        );
      };
    } else if (downloadButton) {
      downloadButton.setAttribute('disabled', 'true');
    }
  }

  const similar =
    document.getElementById('similarApps');

  if (similar) {
    similar.innerHTML = apps
      .filter(item =>
        item.id !== app.id &&
        item.category === app.category
      )
      .slice(0, 3)
      .map(item => `
        <article class="similar-app-card">
          ${appIconMarkup(item)}

          <div class="similar-info">
            <h3>
              ${escapeHTML(item.name)}
            </h3>

            <p>
              ${escapeHTML(
                item.category_name ||
                categories[item.category] ||
                ''
              )}
            </p>
          </div>

          <a
            class="mini-btn"
            href="app.html?id=${encodeURIComponent(item.id)}"
          >
            عرض
          </a>
        </article>
      `)
      .join('');
  }
}

/* =========================================================
   AUTH UI
========================================================= */

function bindPasswordToggles() {
  document
    .querySelectorAll('[data-toggle-password]')
    .forEach(button => {
      button.onclick = () => {
        const input = document.getElementById(
          button.dataset.togglePassword
        );

        if (!input) return;

        input.type =
          input.type === 'password'
            ? 'text'
            : 'password';

        button.textContent =
          input.type === 'password'
            ? '👁'
            : '🙈';
      };
    });
}

function showAuthMessage(message, type = 'error') {
  const element =
    document.getElementById('authMessage');

  if (!element) {
    toast(message, type);
    return;
  }

  element.textContent = message;
  element.className = `auth-message ${type}`;
}

function translateAuthError(error) {
  const message =
    String(error?.message || '').toLowerCase();

  if (
    message.includes('invalid login credentials')
  ) {
    return 'البريد الإلكتروني أو كلمة المرور غير صحيحة.';
  }

  if (
    message.includes('email not confirmed')
  ) {
    return 'البريد الإلكتروني غير مؤكد. افتح رسالة Supabase في بريدك الإلكتروني وأكد الحساب.';
  }

  if (
    message.includes('user already registered')
  ) {
    return 'هذا البريد الإلكتروني مسجل بالفعل.';
  }

  if (
    message.includes('password should be at least')
  ) {
    return 'كلمة المرور قصيرة جدًا.';
  }

  if (
    message.includes('failed to fetch') ||
    message.includes('network')
  ) {
    return 'تعذر الاتصال بـ Supabase. تأكد من بيانات Vercel والاتصال بالإنترنت.';
  }

  if (
    message.includes('email rate limit')
  ) {
    return 'تم تجاوز حد إرسال رسائل البريد مؤقتًا. حاول مرة أخرى لاحقًا.';
  }

  return error?.message ||
    'حدث خطأ أثناء تنفيذ العملية.';
}

/* =========================================================
   LOGIN / REGISTER
========================================================= */

async function setupAuth() {
  const loginForm =
    document.getElementById('loginForm');

  const registerForm =
    document.getElementById('registerForm');

  if (!loginForm && !registerForm) {
    return;
  }

  bindPasswordToggles();

  /* ---------------- LOGIN ---------------- */

  loginForm?.addEventListener(
    'submit',
    async event => {
      event.preventDefault();

      if (!(await requireConfig())) {
        return;
      }

      const emailInput =
        document.getElementById('loginEmail');

      const passwordInput =
        document.getElementById('loginPassword');

      const submitButton =
        loginForm.querySelector(
          'button[type="submit"]'
        );

      const email =
        emailInput?.value.trim().toLowerCase() || '';

      const password =
        passwordInput?.value || '';

      if (!email) {
        showAuthMessage(
          'اكتب البريد الإلكتروني.',
          'error'
        );
        return;
      }

      if (!password) {
        showAuthMessage(
          'اكتب كلمة المرور.',
          'error'
        );
        return;
      }

      if (submitButton) {
        submitButton.disabled = true;
        submitButton.dataset.originalText =
          submitButton.textContent;
        submitButton.textContent =
          'جاري تسجيل الدخول...';
      }

      showAuthMessage(
        'جاري تسجيل الدخول...',
        'success'
      );

      try {
        const {
          data,
          error
        } = await supabase.auth.signInWithPassword({
          email,
          password
        });

        if (error) {
          console.error(
            'LOGIN ERROR:',
            error
          );

          showAuthMessage(
            translateAuthError(error),
            'error'
          );

          return;
        }

        if (!data?.user) {
          showAuthMessage(
            'تم تسجيل الدخول لكن لم يتم استلام بيانات المستخدم.',
            'error'
          );
          return;
        }

        currentUser = data.user;

        await loadProfile();

        setupNavbar();

        showAuthMessage(
          'تم تسجيل الدخول بنجاح.',
          'success'
        );

        /*
          تأخير بسيط حتى يتم حفظ session قبل الانتقال.
        */
        setTimeout(() => {
          location.href = 'index.html';
        }, 250);

      } catch (error) {
        console.error(
          'LOGIN EXCEPTION:',
          error
        );

        showAuthMessage(
          translateAuthError(error),
          'error'
        );

      } finally {
        if (submitButton) {
          submitButton.disabled = false;
          submitButton.textContent =
            submitButton.dataset.originalText ||
            'تسجيل الدخول';
        }
      }
    }
  );

  /* ---------------- REGISTER ---------------- */

  registerForm?.addEventListener(
    'submit',
    async event => {
      event.preventDefault();

      if (!(await requireConfig())) {
        return;
      }

      const name =
        document.getElementById(
          'registerName'
        )?.value.trim() || '';

      const email =
        document.getElementById(
          'registerEmail'
        )?.value.trim().toLowerCase() || '';

      const password =
        document.getElementById(
          'registerPassword'
        )?.value || '';

      const confirm =
        document.getElementById(
          'registerConfirm'
        )?.value || '';

      if (!name) {
        showAuthMessage(
          'اكتب اسمك.',
          'error'
        );
        return;
      }

      if (!email) {
        showAuthMessage(
          'اكتب البريد الإلكتروني.',
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

      if (password !== confirm) {
        showAuthMessage(
          'كلمتا المرور غير متطابقتين.',
          'error'
        );
        return;
      }

      try {
        const {
          data,
          error
        } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              name,
              full_name: name
            }
          }
        });

        if (error) {
          console.error(
            'REGISTER ERROR:',
            error
          );

          showAuthMessage(
            translateAuthError(error),
            'error'
          );

          return;
        }

        if (data?.session) {
          currentUser = data.user;

          await loadProfile();

          location.href = 'index.html';
          return;
        }

        showAuthMessage(
          'تم إنشاء الحساب. راجع بريدك الإلكتروني لتأكيد الحساب ثم سجّل الدخول.',
          'success'
        );

      } catch (error) {
        console.error(
          'REGISTER EXCEPTION:',
          error
        );

        showAuthMessage(
          translateAuthError(error),
          'error'
        );
      }
    }
  );

  /* ---------------- SWITCH LOGIN / REGISTER ---------------- */

  const switchAuth =
    document.getElementById('switchAuth');

  switchAuth?.addEventListener(
    'click',
    event => {
      event.preventDefault();

      loginForm?.classList.toggle('hidden');
      registerForm?.classList.toggle('hidden');

      const register =
        !registerForm?.classList.contains('hidden');

      setText(
        'authTitle',
        register
          ? 'إنشاء حساب'
          : 'تسجيل الدخول'
      );

      setText(
        'authDescription',
        register
          ? 'أنشئ حسابًا جديدًا في CODEX App Store.'
          : 'ادخل إلى حسابك للوصول إلى المتجر.'
      );

      setText(
        'switchText',
        register
          ? 'لديك حساب بالفعل؟ تسجيل الدخول'
          : 'ليس لديك حساب؟ إنشاء حساب'
      );
    }
  );
}

/* =========================================================
   ACCOUNT
========================================================= */

async function setupAccount() {
  const nameForm =
    document.getElementById('accountNameForm');

  if (!nameForm) return;

  if (!currentUser) {
    location.href = 'login.html';
    return;
  }

  await loadProfile();

  bindPasswordToggles();

  const name =
    getProfileName();

  const email =
    getProfileEmail();

  setText(
    'accountName',
    name
  );

  setText(
    'accountEmail',
    email
  );

  setText(
    'accountRole',
    getProfileRole() === 'admin'
      ? 'Admin'
      : 'User'
  );

  setText(
    'accountCreated',
    currentProfile?.created_at
      ? new Date(
          currentProfile.created_at
        ).toLocaleDateString('ar-EG')
      : '—'
  );

  const nameInput =
    document.getElementById(
      'accountNameInput'
    );

  if (nameInput) {
    nameInput.value = name;
  }

  const emailInput =
    document.getElementById(
      'accountEmailInput'
    );

  if (emailInput) {
    emailInput.value = email;
  }

  /* ---------------- UPDATE NAME ---------------- */

  nameForm.onsubmit = async event => {
    event.preventDefault();

    const newName =
      nameInput?.value.trim() || '';

    if (!newName) {
      toast(
        'اكتب الاسم الجديد.',
        'error'
      );
      return;
    }

    try {
      /*
        نحدث العمودين حتى يظل النظام متوافقًا
        سواء كان الكود القديم يستخدم name
        أو الـschema الأصلي يستخدم full_name.
      */
      const updateData = {
        name: newName,
        full_name: newName,
        updated_at: new Date().toISOString()
      };

      const {
        error
      } = await supabase
        .from('profiles')
        .update(updateData)
        .eq('id', currentUser.id);

      if (error) {
        console.error(
          'UPDATE PROFILE ERROR:',
          error
        );

        /*
          لو name غير موجود، نحاول full_name فقط.
        */
        const fallback =
          await supabase
            .from('profiles')
            .update({
              full_name: newName,
              updated_at: new Date().toISOString()
            })
            .eq('id', currentUser.id);

        if (fallback.error) {
          throw error;
        }
      }

      await loadProfile();

      setupNavbar();

      setText(
        'accountName',
        getProfileName()
      );

      toast(
        'تم تحديث الاسم بنجاح.'
      );

    } catch (error) {
      console.error(
        'PROFILE UPDATE EXCEPTION:',
        error
      );

      toast(
        translateAuthError(error),
        'error'
      );
    }
  };

  /* ---------------- UPDATE EMAIL ---------------- */

  document
    .getElementById('accountEmailForm')
    ?.addEventListener(
      'submit',
      async event => {
        event.preventDefault();

        const newEmail =
          emailInput?.value.trim().toLowerCase() ||
          '';

        if (!newEmail) {
          toast(
            'اكتب البريد الإلكتروني.',
            'error'
          );
          return;
        }

        const {
          error
        } = await supabase.auth.updateUser({
          email: newEmail
        });

        if (error) {
          toast(
            translateAuthError(error),
            'error'
          );
          return;
        }

        /*
          غالبًا Supabase يطلب تأكيد البريد الجديد.
        */
        await supabase
          .from('profiles')
          .update({
            email: newEmail,
            updated_at: new Date().toISOString()
          })
          .eq('id', currentUser.id);

        await loadProfile();

        toast(
          'تم طلب تحديث البريد. قد تحتاج لتأكيده من البريد الإلكتروني.'
        );
      }
    );

  /* ---------------- UPDATE PASSWORD ---------------- */

  document
    .getElementById('accountPasswordForm')
    ?.addEventListener(
      'submit',
      async event => {
        event.preventDefault();

        const password =
          document.getElementById(
            'newPassword'
          )?.value || '';

        const confirm =
          document.getElementById(
            'confirmPassword'
          )?.value || '';

        if (password.length < 6) {
          toast(
            'كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل.',
            'error'
          );
          return;
        }

        if (password !== confirm) {
          toast(
            'كلمتا المرور غير متطابقتين.',
            'error'
          );
          return;
        }

        const {
          error
        } = await supabase.auth.updateUser({
          password
        });

        if (error) {
          toast(
            translateAuthError(error),
            'error'
          );
          return;
        }

        event.target.reset();

        toast(
          'تم تغيير كلمة المرور بنجاح.'
        );
      }
    );
}

/* =========================================================
   ADMIN
========================================================= */

async function requireAdmin() {
  if (!currentUser) {
    location.href = 'login.html';
    return false;
  }

  await loadProfile();

  const admin = await isAdmin();

  if (!admin) {
    location.href = 'login.html';
    return false;
  }

  return true;
}

/* =========================================================
   STORAGE
========================================================= */

async function uploadStorageFile(file, path) {
  const {
    error
  } = await supabase.storage
    .from('app-files')
    .upload(
      path,
      file,
      {
        upsert: true,
        contentType:
          file.type ||
          'application/octet-stream'
      }
    );

  if (error) {
    throw error;
  }

  return path;
}

async function uploadIcon(file, appId) {
  if (!file) return null;

  const extension =
    (
      file.name.split('.').pop() ||
      'png'
    ).toLowerCase();

  const path =
    `icons/${appId}/${Date.now()}.${extension}`;

  await uploadStorageFile(
    file,
    path
  );

  return publicUrl(path);
}

async function saveAppFile(
  appId,
  platform,
  file,
  existing
) {
  if (!file) {
    return existing;
  }

  const extension =
    (
      file.name.split('.').pop() ||
      platform
    ).toLowerCase();

  const safeName =
    file.name.replace(
      /[^a-zA-Z0-9._-]/g,
      '_'
    );

  const path =
    `apps/${appId}/${platform}/${Date.now()}-${safeName}`;

  await uploadStorageFile(
    file,
    path
  );

  if (existing?.storage_path) {
    await supabase.storage
      .from('app-files')
      .remove([
        existing.storage_path
      ]);
  }

  const row = {
    app_id: appId,
    platform,
    file_name: file.name,
    storage_path: path,
    mime_type:
      file.type ||
      'application/octet-stream',
    size_bytes: file.size
  };

  /*
    نحاول upsert أولاً.
    يتطلب وجود unique constraint على
    app_id + platform.
  */
  let result =
    await supabase
      .from('app_files')
      .upsert(
        row,
        {
          onConflict:
            'app_id,platform'
        }
      )
      .select()
      .single();

  /*
    fallback لو الـunique constraint غير موجود.
  */
  if (result.error) {
    console.warn(
      'UPSERT failed, trying update/insert:',
      result.error
    );

    const existingFile =
      await supabase
        .from('app_files')
        .select('*')
        .eq('app_id', appId)
        .eq('platform', platform)
        .maybeSingle();

    if (existingFile.data) {
      result =
        await supabase
          .from('app_files')
          .update({
            file_name: row.file_name,
            storage_path: row.storage_path,
            mime_type: row.mime_type,
            size_bytes: row.size_bytes,
            version: row.version
          })
          .eq('id', existingFile.data.id)
          .select()
          .single();
    } else {
      result =
        await supabase
          .from('app_files')
          .insert(row)
          .select()
          .single();
    }
  }

  if (result.error) {
    throw result.error;
  }

  return result.data;
}

/* =========================================================
   CREATE APP
========================================================= */

async function createAppRecord(form) {
  if (!(await requireAdmin())) return;

  const name =
    document.getElementById(
      'newAppName'
    )?.value.trim() || '';

  const description =
    document.getElementById(
      'newAppDescription'
    )?.value.trim() || '';

  const category =
    document.getElementById(
      'newAppCategory'
    )?.value || '';

  const version =
    document.getElementById(
      'newAppVersion'
    )?.value.trim() || '';

  const iconText =
    document.getElementById(
      'newAppIcon'
    )?.value.trim() || 'C';

  const exe =
    document.getElementById(
      'newAppExe'
    )?.files?.[0];

  const apk =
    document.getElementById(
      'newAppApk'
    )?.files?.[0];

  const icon =
    document.getElementById(
      'newAppIconFile'
    )?.files?.[0];

  if (!name) {
    toast(
      'اكتب اسم التطبيق.',
      'error'
    );
    return;
  }

  if (!version) {
    toast(
      'اكتب إصدار التطبيق.',
      'error'
    );
    return;
  }

  if (!exe && !apk) {
    toast(
      'ارفع EXE أو APK على الأقل.',
      'error'
    );
    return;
  }

  const appPayload = {
    name,
    description,
    category,
    category_name:
      categories[category] || category,
    version,
    icon_text: iconText,
    created_by: currentUser.id
  };

  const {
    data,
    error
  } = await supabase
    .from('apps')
    .insert(appPayload)
    .select()
    .single();

  if (error) {
    console.error(
      'CREATE APP ERROR:',
      error
    );

    toast(
      error.message,
      'error'
    );

    return;
  }

  try {
    if (icon) {
      const iconUrl =
        await uploadIcon(
          icon,
          data.id
        );

      await supabase
        .from('apps')
        .update({
          icon_url: iconUrl
        })
        .eq('id', data.id);
    }

    if (exe) {
      await saveAppFile(
        data.id,
        'windows',
        exe,
        null
      );
    }

    if (apk) {
      await saveAppFile(
        data.id,
        'android',
        apk,
        null
      );
    }

    const {
      data: files
    } = await supabase
      .from('app_files')
      .select('*')
      .eq('app_id', data.id);

    const totalSize =
      (files || []).reduce(
        (total, file) =>
          total +
          Number(file.size_bytes || 0),
        0
      );

    let platform = 'Windows';

    if (
      (files || []).length === 2
    ) {
      platform =
        'Windows + Android';
    } else if (
      files?.[0]?.platform ===
      'android'
    ) {
      platform = 'Android';
    }

    await supabase
      .from('apps')
      .update({
        total_size_bytes:
          totalSize,
        platform
      })
      .eq('id', data.id);

    await refreshDashboard();

    form.reset();

    setText(
      'newAppSize',
      'سيتم حسابه تلقائيًا'
    );

    setText(
      'newAppPlatform',
      'سيتم تحديده تلقائيًا'
    );

    toast(
      'تم رفع التطبيق بنجاح.'
    );

  } catch (error) {
    console.error(
      'APP UPLOAD ERROR:',
      error
    );

    await supabase
      .from('apps')
      .delete()
      .eq('id', data.id);

    toast(
      error.message ||
      'فشل رفع الملفات.',
      'error'
    );
  }
}

/* =========================================================
   DASHBOARD
========================================================= */

async function renderDashboard() {
  await loadApps();

  setText(
    'totalApps',
    apps.length
  );

  const {
    count: usersCount
  } = await supabase
    .from('profiles')
    .select(
      '*',
      {
        count: 'exact',
        head: true
      }
    );

  const {
    count: adminsCount
  } = await supabase
    .from('profiles')
    .select(
      '*',
      {
        count: 'exact',
        head: true
      }
    )
    .eq(
      'role',
      'admin'
    );

  setText(
    'totalUsers',
    usersCount || 0
  );

  setText(
    'totalAdmins',
    adminsCount || 0
  );

  const box =
    document.getElementById(
      'adminAppsList'
    );

  if (box) {
    box.innerHTML = apps
      .map(app => `
        <div class="admin-app-item">

          ${appIconMarkup(
            app,
            'admin-app-icon'
          )}

          <div class="admin-app-info">

            <strong>
              ${escapeHTML(app.name)}
            </strong>

            <span>
              ${escapeHTML(
                app.category_name ||
                categories[app.category] ||
                ''
              )}

              · v${escapeHTML(
                app.version || ''
              )}

              · ${escapeHTML(
                appSize(app)
              )}

              · ${escapeHTML(
                platformName(app)
              )}
            </span>

            ${fileBadgeMarkup(app)}

          </div>

          <div class="admin-actions">

            <a
              class="mini-btn"
              href="app.html?id=${encodeURIComponent(app.id)}"
              target="_blank"
              rel="noopener"
            >
              فتح الصفحة
            </a>

            <button
              class="mini-btn"
              data-edit-app="${escapeHTML(app.id)}"
              type="button"
            >
              تعديل
            </button>

            <button
              class="delete-app-btn"
              data-delete-app="${escapeHTML(app.id)}"
              type="button"
            >
              حذف
            </button>

          </div>

        </div>
      `)
      .join('');
  }

  await renderUsers();
}

/* =========================================================
   USERS
========================================================= */

async function renderUsers() {
  const box =
    document.getElementById(
      'usersList'
    );

  if (!box) return;

  const {
    data,
    error
  } = await supabase
    .from('profiles')
    .select('*')
    .order(
      'created_at',
      {
        ascending: false
      }
    );

  if (error) {
    console.error(
      'USERS ERROR:',
      error
    );

    toast(
      error.message,
      'error'
    );

    return;
  }

  box.innerHTML =
    (data || [])
      .map(user => {
        const name =
          user.name ||
          user.full_name ||
          'User';

        return `
          <div class="user-item">

            <div class="user-avatar">
              ${escapeHTML(
                name.charAt(0)
              )}
            </div>

            <div class="user-info">

              <strong>
                ${escapeHTML(name)}
              </strong>

              <span>
                ${escapeHTML(
                  user.email || ''
                )}
              </span>

              <small>
                إنشاء:
                ${
                  user.created_at
                    ? new Date(
                        user.created_at
                      ).toLocaleDateString(
                        'ar-EG'
                      )
                    : '—'
                }
              </small>

            </div>

            <span class="user-role">
              ${
                user.role === 'admin'
                  ? 'ADMIN'
                  : 'USER'
              }
            </span>

            <div class="user-actions">

              <button
                class="mini-btn"
                data-reset-user="${escapeHTML(user.id)}"
                type="button"
              >
                تغيير كلمة المرور
              </button>

              ${
                user.id !== currentUser?.id
                  ? `
                    <button
                      class="delete-user-btn"
                      data-delete-user="${escapeHTML(user.id)}"
                      type="button"
                    >
                      حذف
                    </button>
                  `
                  : ''
              }

            </div>

          </div>
        `;
      })
      .join('');
}

async function refreshDashboard() {
  await renderDashboard();
}

/* =========================================================
   ADMIN CREATE
========================================================= */

async function addAdmin(event) {
  event.preventDefault();

  if (!(await requireAdmin())) return;

  const name =
    document.getElementById(
      'adminNameInput'
    )?.value.trim() || '';

  const email =
    document.getElementById(
      'adminEmailInput'
    )?.value.trim().toLowerCase() || '';

  const password =
    document.getElementById(
      'adminPasswordInput'
    )?.value || '';

  const confirm =
    document.getElementById(
      'adminPasswordConfirm'
    )?.value || '';

  if (!name) {
    toast(
      'اكتب اسم الـAdmin.',
      'error'
    );
    return;
  }

  if (!email) {
    toast(
      'اكتب بريد الـAdmin.',
      'error'
    );
    return;
  }

  if (
    password.length < 6 ||
    password !== confirm
  ) {
    toast(
      'تحقق من كلمة المرور.',
      'error'
    );
    return;
  }

  try {
    const {
      data,
      error
    } = await supabase.functions.invoke(
      'create-admin',
      {
        body: {
          name,
          email,
          password
        }
      }
    );

    if (
      error ||
      data?.error
    ) {
      toast(
        data?.error ||
        error?.message ||
        'فشل إنشاء Admin.',
        'error'
      );
      return;
    }

    event.target.reset();

    await renderDashboard();

    toast(
      'تم إنشاء Admin جديد.'
    );

  } catch (error) {
    console.error(
      'CREATE ADMIN ERROR:',
      error
    );

    toast(
      error.message ||
      'فشل إنشاء Admin.',
      'error'
    );
  }
}

/* =========================================================
   DELETE USER
========================================================= */

async function deleteUser(id) {
  if (!(await requireAdmin())) return;

  if (
    !confirm(
      'هل تريد حذف هذا الحساب؟'
    )
  ) {
    return;
  }

  const {
    data,
    error
  } = await supabase.functions.invoke(
    'admin-delete-user',
    {
      body: {
        userId: id
      }
    }
  );

  if (
    error ||
    data?.error
  ) {
    toast(
      data?.error ||
      error?.message ||
      'فشل حذف المستخدم.',
      'error'
    );
    return;
  }

  await renderDashboard();

  toast(
    'تم حذف الحساب.'
  );
}

/* =========================================================
   RESET USER PASSWORD
========================================================= */

async function resetUserPassword(id) {
  if (!(await requireAdmin())) return;

  const password =
    prompt(
      'اكتب كلمة المرور الجديدة (6 أحرف على الأقل):'
    );

  if (!password) return;

  if (password.length < 6) {
    toast(
      'كلمة المرور قصيرة.',
      'error'
    );
    return;
  }

  const {
    data,
    error
  } = await supabase.functions.invoke(
    'admin-reset-password',
    {
      body: {
        userId: id,
        password
      }
    }
  );

  if (
    error ||
    data?.error
  ) {
    toast(
      data?.error ||
      error?.message ||
      'فشل تغيير كلمة المرور.',
      'error'
    );
    return;
  }

  toast(
    'تم تغيير كلمة المرور بنجاح.'
  );
}

/* =========================================================
   DELETE STORAGE
========================================================= */

async function deleteStorageFiles(app) {
  const paths =
    (app.app_files || [])
      .map(file => file.storage_path)
      .filter(Boolean);

  /*
    الأيقونات الحالية مخزنة داخل app-files/icons
  */
  if (app.icon_url) {
    const marker =
      '/app-files/';

    const index =
      app.icon_url.indexOf(marker);

    if (index >= 0) {
      paths.push(
        app.icon_url.slice(
          index + marker.length
        )
      );
    }
  }

  if (paths.length) {
    await supabase.storage
      .from('app-files')
      .remove(paths);
  }
}

/* =========================================================
   APP EDITOR
========================================================= */

function openAppEditor(id) {
  const app =
    apps.find(
      item =>
        String(item.id) ===
        String(id)
    );

  const modal =
    document.getElementById(
      'appEditModal'
    );

  if (!app || !modal) return;

  modal.dataset.appId =
    app.id;

  const values = {
    name: app.name || '',
    description: app.description || '',
    version: app.version || '',
    category: app.category || '',
    iconText: app.icon_text || 'C',
    downloadUrl: app.download_url || ''
  };

  for (
    const [name, value]
    of Object.entries(values)
  ) {
    const element =
      modal.querySelector(
        `[name="${name}"]`
      );

    if (element) {
      element.value = value;
    }
  }

  const preview =
    modal.querySelector(
      '[data-icon-preview]'
    );

  if (preview) {
    preview.innerHTML =
      app.icon_url
        ? `
          <img
            src="${escapeHTML(app.icon_url)}"
            alt=""
          >
        `
        : `
          <span>
            ${escapeHTML(
              app.icon_text || 'C'
            )}
          </span>
        `;
  }

  modal.classList.add(
    'open'
  );
}

/* =========================================================
   UPDATE APP
========================================================= */

async function updateApp(event) {
  event.preventDefault();

  if (!(await requireAdmin())) return;

  const modal =
    document.getElementById(
      'appEditModal'
    );

  if (!modal) return;

  const id =
    modal.dataset.appId;

  const app =
    apps.find(
      item =>
        String(item.id) ===
        String(id)
    );

  if (!app) return;

  const formData =
    new FormData(
      event.target
    );

  const category =
    String(
      formData.get('category') || ''
    );

  const patch = {
    name:
      String(
        formData.get('name') || ''
      ).trim(),

    description:
      String(
        formData.get('description') || ''
      ).trim(),

    version:
      String(
        formData.get('version') || ''
      ).trim(),

    category,

    category_name:
      categories[category] ||
      category,

    icon_text:
      String(
        formData.get('iconText') || ''
      ).trim() || 'C',

    download_url:
      String(
        formData.get('downloadUrl') || ''
      ).trim() || null,

    updated_at:
      new Date().toISOString()
  };

  if (!patch.name) {
    toast(
      'اسم التطبيق مطلوب.',
      'error'
    );
    return;
  }

  if (!patch.version) {
    toast(
      'الإصدار مطلوب.',
      'error'
    );
    return;
  }

  try {
    const icon =
      event.target.querySelector(
        '[name="iconFile"]'
      )?.files?.[0];

    if (icon) {
      patch.icon_url =
        await uploadIcon(
          icon,
          id
        );
    }

    const {
      error
    } = await supabase
      .from('apps')
      .update(patch)
      .eq('id', id);

    if (error) {
      throw error;
    }

    for (
      const [platform, field]
      of [
        ['windows', 'exeFile'],
        ['android', 'apkFile']
      ]
    ) {
      const file =
        event.target.querySelector(
          `[name="${field}"]`
        )?.files?.[0];

      if (file) {
        await saveAppFile(
          id,
          platform,
          file,
          getFile(
            app,
            platform
          )
        );
      }
    }

    const {
      data: files
    } = await supabase
      .from('app_files')
      .select('*')
      .eq('app_id', id);

    const totalSize =
      (files || []).reduce(
        (total, file) =>
          total +
          Number(
            file.size_bytes || 0
          ),
        0
      );

    let platform =
      'Windows';

    if (
      (files || []).length === 2
    ) {
      platform =
        'Windows + Android';
    } else if (
      files?.[0]?.platform ===
      'android'
    ) {
      platform =
        'Android';
    }

    await supabase
      .from('apps')
      .update({
        total_size_bytes:
          totalSize,
        platform
      })
      .eq('id', id);

    modal.classList.remove(
      'open'
    );

    event.target.reset();

    await renderDashboard();

    toast(
      'تم حفظ تحديث التطبيق والملفات.'
    );

  } catch (error) {
    console.error(
      'UPDATE APP ERROR:',
      error
    );

    toast(
      error.message ||
      'فشل تحديث التطبيق.',
      'error'
    );
  }
}

/* =========================================================
   DASHBOARD SETUP
========================================================= */

async function setupDashboard() {
  const addAppForm =
    document.getElementById(
      'addAppForm'
    );

  if (!addAppForm) return;

  if (!(await requireAdmin())) {
    return;
  }

  addAppForm.onsubmit =
    event => {
      event.preventDefault();

      createAppRecord(
        event.target
      );
    };

  document
    .getElementById(
      'addAdminForm'
    )
    ?.addEventListener(
      'submit',
      addAdmin
    );

  document
    .querySelectorAll(
      '[data-close-modal]'
    )
    .forEach(button => {
      button.onclick = () => {
        document
          .getElementById(
            'appEditModal'
          )
          ?.classList.remove(
            'open'
          );
      };
    });

  document
    .getElementById(
      'appEditForm'
    )
    ?.addEventListener(
      'submit',
      updateApp
    );

  await renderDashboard();
}

/* =========================================================
   DASHBOARD EVENTS
========================================================= */

function setupDashboardDelegation() {
  document.addEventListener(
    'click',
    async event => {

      /* EDIT APP */
      const edit =
        event.target.closest(
          '[data-edit-app]'
        );

      if (edit) {
        openAppEditor(
          edit.dataset.editApp
        );
        return;
      }

      /* DELETE APP */
      const deleteButton =
        event.target.closest(
          '[data-delete-app]'
        );

      if (deleteButton) {
        if (!(await requireAdmin())) {
          return;
        }

        const app =
          apps.find(
            item =>
              String(item.id) ===
              String(
                deleteButton.dataset.deleteApp
              )
          );

        if (!app) return;

        if (
          !confirm(
            `حذف "${app.name}" وملفاته؟`
          )
        ) {
          return;
        }

        try {
          await deleteStorageFiles(
            app
          );

          const {
            error
          } = await supabase
            .from('apps')
            .delete()
            .eq(
              'id',
              app.id
            );

          if (error) {
            throw error;
          }

          await renderDashboard();

          toast(
            'تم حذف التطبيق.'
          );

        } catch (error) {
          console.error(
            'DELETE APP ERROR:',
            error
          );

          toast(
            error.message ||
            'فشل حذف التطبيق.',
            'error'
          );
        }

        return;
      }

      /* DELETE USER */
      const deleteUserButton =
        event.target.closest(
          '[data-delete-user]'
        );

      if (deleteUserButton) {
        await deleteUser(
          deleteUserButton.dataset.deleteUser
        );
        return;
      }

      /* RESET PASSWORD */
      const resetButton =
        event.target.closest(
          '[data-reset-user]'
        );

      if (resetButton) {
        await resetUserPassword(
          resetButton.dataset.resetUser
        );
      }
    }
  );
}

/* =========================================================
   UPLOAD PREVIEWS
========================================================= */

function setupUploadPreviews() {
  const exe =
    document.getElementById(
      'newAppExe'
    );

  const apk =
    document.getElementById(
      'newAppApk'
    );

  const size =
    document.getElementById(
      'newAppSize'
    );

  const platform =
    document.getElementById(
      'newAppPlatform'
    );

  const update =
    () => {
      const files = [
        exe?.files?.[0],
        apk?.files?.[0]
      ].filter(Boolean);

      const totalSize =
        files.reduce(
          (total, file) =>
            total + file.size,
          0
        );

      if (size) {
        setText(
          'newAppSize',
          formatFileSize(
            totalSize
          )
        );
      }

      if (platform) {
        if (files.length === 2) {
          setText(
            'newAppPlatform',
            'Windows + Android'
          );
        } else if (
          files[0]?.name
            ?.toLowerCase()
            .endsWith('.apk')
        ) {
          setText(
            'newAppPlatform',
            'Android'
          );
        } else if (files.length) {
          setText(
            'newAppPlatform',
            'Windows'
          );
        } else {
          setText(
            'newAppPlatform',
            'سيتم تحديده تلقائيًا'
          );
        }
      }
    };

  exe?.addEventListener(
    'change',
    update
  );

  apk?.addEventListener(
    'change',
    update
  );

  document
    .getElementById(
      'newAppIconFile'
    )
    ?.addEventListener(
      'change',
      event => {
        const label =
          document.querySelector(
            '[data-file-label="icon"]'
          );

        if (label) {
          label.textContent =
            event.target.files?.[0]
              ?.name ||
            'PNG / JPG / WEBP';
        }
      }
    );
}

/* =========================================================
   GLOBAL INIT
========================================================= */

(async () => {
  try {

    const configured =
      await requireConfig();

    if (!configured) {
      setupAuth();
      setupNavbar();
      showLoading();
      return;
    }

    /*
      1. تحميل Session أولًا
    */
    await loadSession();

    /*
      2. الاستماع لأي Login / Logout
    */
    setupAuthStateListener();

    /*
      3. Navbar
    */
    setupNavbar();

    /*
      4. Login / Register
    */
    await setupAuth();

    /*
      5. Account
    */
    await setupAccount();

    /*
      6. Dashboard
    */
    await setupDashboard();

    /*
      7. Dashboard delegation
    */
    setupDashboardDelegation();

    /*
      8. Upload previews
    */
    setupUploadPreviews();

    /*
      9. Apps
    */
    await loadApps();

    displayApps(apps);

    displayReleases();

    /*
      10. App details
    */
    await loadAppDetails();

    /*
      11. Search
    */
    document
      .getElementById(
        'searchInput'
      )
      ?.addEventListener(
        'input',
        filterHomeApps
      );

    document
      .getElementById(
        'searchBtn'
      )
      ?.addEventListener(
        'click',
        filterHomeApps
      );

    /*
      12. Categories
    */
    document
      .querySelectorAll(
        '.category'
      )
      .forEach(button => {
        button.addEventListener(
          'click',
          () => {

            document
              .querySelectorAll(
                '.category'
              )
              .forEach(item =>
                item.classList.remove(
                  'active'
                )
              );

            button.classList.add(
              'active'
            );

            filterHomeApps();
          }
        );
      });

    showLoading();

  } catch (error) {

    console.error(
      'CODEX INITIALIZATION ERROR:',
      error
    );

    toast(
      'حدث خطأ أثناء تشغيل CODEX Store.',
      'error'
    );

    showLoading();
  }
})();
```

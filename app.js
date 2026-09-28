/**
 * Fit.IA - Aplicação Frontend
 * Autenticação, navegação, calendário de constância e sincronização de dados.
 */

// Estado global da aplicação
const state = {
  user: null,
  trained: JSON.parse(localStorage.getItem('fitia-trained') || '[]'),
  month: 8, // Setembro (0-indexed)
  year: 2026
};

const monthNames = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

const routes = {
  inicio: 'Visão geral',
  treinos: 'Meus treinos',
  calendario: 'Calendário',
  configuracoes: 'Configurações'
};

const pad = n => String(n).padStart(2, '0');
const key = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;

// Utilitário de Notificações Toast
function toast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 3000);
}

// Navegação entre Telas
function go(route) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active-view'));
  const targetView = document.querySelector(`#view-${route}`);
  if (targetView) targetView.classList.add('active-view');

  document.querySelectorAll('.nav-link[data-route]').forEach(l => {
    l.classList.toggle('active', l.dataset.route === route);
  });

  const pageNameEl = document.getElementById('pageName');
  if (pageNameEl) pageNameEl.textContent = routes[route] || 'Visão geral';

  document.querySelector('.sidebar')?.classList.remove('open');
}

// Renderização do Calendário de Treinos
function renderCalendar(targetId, isFull = false) {
  const el = document.getElementById(targetId);
  if (!el) return;
  el.innerHTML = '';

  const firstDay = new Date(state.year, state.month, 1);
  const startDay = (firstDay.getDay() + 6) % 7; // Segunda-feira = 0
  const totalDays = new Date(state.year, state.month + 1, 0).getDate();
  const prevMonthDays = new Date(state.year, state.month, 0).getDate();

  // Dias do mês anterior
  for (let i = 0; i < startDay; i++) {
    const s = document.createElement('span');
    s.className = 'empty';
    s.textContent = prevMonthDays - startDay + i + 1;
    s.style.opacity = '0.25';
    el.appendChild(s);
  }

  // Dias do mês atual
  for (let d = 1; d <= totalDays; d++) {
    const s = document.createElement('span');
    s.textContent = d;
    const dateKey = key(state.year, state.month, d);

    if (state.trained.includes(dateKey)) {
      s.classList.add('done');
    }
    if (dateKey === '2026-09-28') {
      s.classList.add('today');
    }

    if (isFull) {
      s.addEventListener('click', async () => {
        const isTrained = state.trained.includes(dateKey);
        const willBeTrained = !isTrained;

        if (willBeTrained) {
          state.trained = [...new Set([...state.trained, dateKey])];
        } else {
          state.trained = state.trained.filter(x => x !== dateKey);
        }

        localStorage.setItem('fitia-trained', JSON.stringify(state.trained));
        renderCalendar('fullCalendar', true);
        renderCalendar('miniCalendar');
        updateCalendarSummary();

        toast(willBeTrained ? 'Treino marcado! Sua constância agradece. ✦' : 'Treino desmarcado.');

        // Sincroniza com backend se estiver logado
        if (state.user) {
          try {
            await fetch('/api/checkins', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ date: dateKey, trained: willBeTrained })
            });
          } catch (e) {
            console.warn('Erro ao salvar check-in no servidor:', e);
          }
        }
      });
    }

    el.appendChild(s);
  }
}

function updateCalendarSummary() {
  const currentMonthPrefix = `${state.year}-${pad(state.month + 1)}`;
  const count = state.trained.filter(x => x.startsWith(currentMonthPrefix)).length;

  const countEl = document.getElementById('monthCount');
  if (countEl) countEl.textContent = count;

  const progressEl = document.getElementById('monthProgress');
  if (progressEl) {
    const pct = Math.min(100, (count / 24) * 100);
    progressEl.style.width = `${pct}%`;
  }

  const titleEl = document.getElementById('calendarTitle');
  if (titleEl) {
    titleEl.textContent = `${monthNames[state.month]} ${state.year}`;
  }
}

// ==========================================================================
// MÓDULO DE AUTENTICAÇÃO E MODAL
// ==========================================================================

const modal = document.getElementById('loginModal');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');

function openAuthModal(defaultTab = 'login') {
  if (!modal) return;
  modal.classList.add('open');
  switchTab(defaultTab);
  clearAuthErrors();
}

function closeAuthModal() {
  if (!modal) return;
  modal.classList.remove('open');
  clearAuthErrors();
}

// Alternador de Abas (Entrar / Criar Conta)
function switchTab(tab) {
  const isLogin = tab === 'login';

  document.getElementById('tabLogin')?.classList.toggle('active', isLogin);
  document.getElementById('tabLogin')?.setAttribute('aria-selected', String(isLogin));

  document.getElementById('tabRegister')?.classList.toggle('active', !isLogin);
  document.getElementById('tabRegister')?.setAttribute('aria-selected', String(!isLogin));

  document.getElementById('panelLogin')?.classList.toggle('active', isLogin);
  document.getElementById('panelRegister')?.classList.toggle('active', !isLogin);

  clearAuthErrors();

  if (isLogin) {
    document.getElementById('loginEmail')?.focus();
  } else {
    document.getElementById('registerName')?.focus();
  }
}

function clearAuthErrors() {
  document.querySelectorAll('.field-error').forEach(el => (el.textContent = ''));
  document.querySelectorAll('.form-field').forEach(el => el.classList.remove('has-error'));
  const ls = document.getElementById('loginStatus');
  if (ls) {
    ls.textContent = '';
    ls.className = 'form-status';
  }
  const rs = document.getElementById('registerStatus');
  if (rs) {
    rs.textContent = '';
    rs.className = 'form-status';
  }
}

function validateEmail(val) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(String(val).trim());
}

// Atualização de elementos de UI do usuário autenticado
function updateAuthUI(user) {
  state.user = user;
  const loginButtonLabel = document.getElementById('loginButtonLabel');
  const loginButtonIcon = document.getElementById('loginButtonIcon');
  const sidebarName = document.getElementById('sidebarName');
  const sidebarAvatar = document.getElementById('sidebarAvatar');
  const sidebarRole = document.getElementById('sidebarRole');

  if (user) {
    const firstName = user.name.trim().split(' ')[0] || 'Usuário';
    const initials = user.name
      .trim()
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map(part => part[0].toUpperCase())
      .join('') || 'US';

    if (loginButtonLabel) loginButtonLabel.textContent = firstName;
    if (loginButtonIcon) loginButtonIcon.textContent = '✓';
    if (sidebarName) sidebarName.textContent = user.name;
    if (sidebarAvatar) sidebarAvatar.textContent = initials;
    if (sidebarRole) sidebarRole.textContent = user.email;
  } else {
    if (loginButtonLabel) loginButtonLabel.textContent = 'Entrar';
    if (loginButtonIcon) loginButtonIcon.textContent = '↗';
    if (sidebarName) sidebarName.textContent = 'Visitante';
    if (sidebarAvatar) sidebarAvatar.textContent = '??';
    if (sidebarRole) sidebarRole.textContent = 'Plano gratuito';
  }
}

// Carregar sessão existente
async function checkAuthSession() {
  try {
    const res = await fetch('/api/auth/me');
    if (res.ok) {
      const data = await res.json();
      if (data.user) {
        updateAuthUI(data.user);
        closeAuthModal();

        // Carregar check-ins do usuário no backend
        const checkinsRes = await fetch('/api/checkins');
        if (checkinsRes.ok) {
          const checkins = await checkinsRes.json();
          if (Array.isArray(checkins)) {
            state.trained = checkins;
            localStorage.setItem('fitia-trained', JSON.stringify(state.trained));
            renderCalendar('miniCalendar');
            renderCalendar('fullCalendar', true);
            updateCalendarSummary();
          }
        }
        return;
      }
    }
  } catch (err) {
    console.info('Modo offline / API não respondeu:', err);
  }
}

// Envio do formulário de login
async function handleLoginSubmit(e) {
  e.preventDefault();
  clearAuthErrors();

  const emailInput = document.getElementById('loginEmail');
  const passwordInput = document.getElementById('loginPassword');
  const emailError = document.getElementById('emailError');
  const passwordError = document.getElementById('passwordError');
  const statusEl = document.getElementById('loginStatus');
  const submitBtn = document.getElementById('loginSubmit');

  const email = (emailInput?.value || '').trim();
  const password = passwordInput?.value || '';

  let hasError = false;

  if (!email) {
    emailError.textContent = 'Informe seu e-mail.';
    emailInput?.closest('.form-field')?.classList.add('has-error');
    hasError = true;
  } else if (!validateEmail(email)) {
    emailError.textContent = 'Formato de e-mail inválido.';
    emailInput?.closest('.form-field')?.classList.add('has-error');
    hasError = true;
  }

  if (!password) {
    passwordError.textContent = 'Informe sua senha.';
    passwordInput?.closest('.form-field')?.classList.add('has-error');
    hasError = true;
  }

  if (hasError) return;

  // Chamada à API
  submitBtn.disabled = true;
  submitBtn.classList.add('is-loading');

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await res.json();

    if (!res.ok) {
      statusEl.textContent = data.error || 'Credenciais inválidas. Tente novamente.';
      statusEl.className = 'form-status error';
      return;
    }

    // Sucesso!
    updateAuthUI(data.user);
    closeAuthModal();
    toast(`Bem-vindo de volta, ${data.user.name.split(' ')[0]}! ✦`);

    // Sincroniza dados do backend
    const checkinsRes = await fetch('/api/checkins');
    if (checkinsRes.ok) {
      const checkins = await checkinsRes.json();
      if (Array.isArray(checkins)) {
        state.trained = checkins;
        localStorage.setItem('fitia-trained', JSON.stringify(state.trained));
        renderCalendar('miniCalendar');
        renderCalendar('fullCalendar', true);
        updateCalendarSummary();
      }
    }
  } catch (error) {
    statusEl.textContent = 'Erro de conexão com o servidor. Verifique se o servidor está ativo.';
    statusEl.className = 'form-status error';
  } finally {
    submitBtn.disabled = false;
    submitBtn.classList.remove('is-loading');
  }
}

// Envio do formulário de cadastro
async function handleRegisterSubmit(e) {
  e.preventDefault();
  clearAuthErrors();

  const nameInput = document.getElementById('registerName');
  const emailInput = document.getElementById('registerEmail');
  const passwordInput = document.getElementById('registerPassword');

  const nameError = document.getElementById('registerNameError');
  const emailError = document.getElementById('registerEmailError');
  const passwordError = document.getElementById('registerPasswordError');
  const statusEl = document.getElementById('registerStatus');
  const submitBtn = document.getElementById('registerSubmit');

  const name = (nameInput?.value || '').trim();
  const email = (emailInput?.value || '').trim();
  const password = passwordInput?.value || '';

  let hasError = false;

  if (!name) {
    nameError.textContent = 'Informe seu nome.';
    nameInput?.closest('.form-field')?.classList.add('has-error');
    hasError = true;
  }

  if (!email) {
    emailError.textContent = 'Informe seu e-mail.';
    emailInput?.closest('.form-field')?.classList.add('has-error');
    hasError = true;
  } else if (!validateEmail(email)) {
    emailError.textContent = 'Digite um e-mail válido.';
    emailInput?.closest('.form-field')?.classList.add('has-error');
    hasError = true;
  }

  if (!password) {
    passwordError.textContent = 'Crie uma senha.';
    passwordInput?.closest('.form-field')?.classList.add('has-error');
    hasError = true;
  } else if (password.length < 6) {
    passwordError.textContent = 'A senha deve conter no mínimo 6 caracteres.';
    passwordInput?.closest('.form-field')?.classList.add('has-error');
    hasError = true;
  }

  if (hasError) return;

  submitBtn.disabled = true;
  submitBtn.classList.add('is-loading');

  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password })
    });

    const data = await res.json();

    if (!res.ok) {
      statusEl.textContent = data.error || 'Não foi possível concluir o cadastro.';
      statusEl.className = 'form-status error';
      return;
    }

    // Sucesso!
    updateAuthUI(data.user);
    closeAuthModal();
    toast(`Conta criada com sucesso! Bem-vindo(a), ${data.user.name.split(' ')[0]}! ✦`);

    // Inicia checkins vazios para novo usuário
    state.trained = [];
    localStorage.setItem('fitia-trained', JSON.stringify([]));
    renderCalendar('miniCalendar');
    renderCalendar('fullCalendar', true);
    updateCalendarSummary();
  } catch (error) {
    statusEl.textContent = 'Erro ao conectar ao servidor.';
    statusEl.className = 'form-status error';
  } finally {
    submitBtn.disabled = false;
    submitBtn.classList.remove('is-loading');
  }
}

// Logout do usuário
async function handleLogout() {
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
  } catch (err) {
    console.warn('Erro ao sair no backend:', err);
  }
  updateAuthUI(null);
  toast('Você saiu da sua conta.');
}

// Alternar visibilidade de senhas
function setupPasswordToggles() {
  const toggleLogin = document.getElementById('togglePassword');
  const inputLogin = document.getElementById('loginPassword');
  const eyeLogin = document.getElementById('passwordEye');

  toggleLogin?.addEventListener('click', () => {
    if (!inputLogin) return;
    const isText = inputLogin.type === 'text';
    inputLogin.type = isText ? 'password' : 'text';
    if (eyeLogin) eyeLogin.textContent = isText ? '👁️' : '🙈';
  });

  const toggleReg = document.getElementById('toggleRegisterPassword');
  const inputReg = document.getElementById('registerPassword');
  const eyeReg = document.getElementById('registerPasswordEye');

  toggleReg?.addEventListener('click', () => {
    if (!inputReg) return;
    const isText = inputReg.type === 'text';
    inputReg.type = isText ? 'password' : 'text';
    if (eyeReg) eyeReg.textContent = isText ? '👁️' : '🙈';
  });
}

// Preencher e disparar conta de demonstração
function setupDemoLogin() {
  const btnDemo = document.getElementById('btnDemoLogin');
  btnDemo?.addEventListener('click', () => {
    const emailInput = document.getElementById('loginEmail');
    const passInput = document.getElementById('loginPassword');
    if (emailInput) emailInput.value = 'joao@fitia.com';
    if (passInput) passInput.value = '123456';
    loginForm?.requestSubmit();
  });
}

// Inicialização dos eventos do aplicativo
function initApp() {
  // Navegação
  document.querySelectorAll('[data-route]').forEach(a => {
    a.addEventListener('click', e => {
      e.preventDefault();
      go(a.dataset.route);
    });
  });

  document.querySelectorAll('[data-scroll="treinos"]').forEach(b => {
    b.addEventListener('click', () => go('treinos'));
  });

  // Mudar meses no calendário
  document.querySelectorAll('.month-arrow').forEach(b => {
    if (b.id === 'prevMonth') {
      b.onclick = () => {
        state.month--;
        if (state.month < 0) {
          state.month = 11;
          state.year--;
        }
        renderCalendar('fullCalendar', true);
        renderCalendar('miniCalendar');
        updateCalendarSummary();
      };
    }
    if (b.id === 'nextMonth') {
      b.onclick = () => {
        state.month++;
        if (state.month > 11) {
          state.month = 0;
          state.year++;
        }
        renderCalendar('fullCalendar', true);
        renderCalendar('miniCalendar');
        updateCalendarSummary();
      };
    }
  });

  // Menu móvel
  document.getElementById('mobileMenu')?.addEventListener('click', () => {
    document.querySelector('.sidebar')?.classList.toggle('open');
  });

  // Filtros de treino e toggles de configuração
  document.querySelectorAll('.filter').forEach(b => {
    b.onclick = () => {
      document.querySelectorAll('.filter').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
    };
  });

  document.querySelectorAll('.toggle').forEach(b => {
    b.onclick = () => b.classList.toggle('on');
  });

  // Controle do Modal de Autenticação
  document.getElementById('loginButton')?.addEventListener('click', () => {
    if (state.user) {
      if (confirm(`Deseja sair da conta (${state.user.name})?`)) {
        handleLogout();
      }
    } else {
      openAuthModal('login');
    }
  });

  document.getElementById('profileButton')?.addEventListener('click', () => {
    if (state.user) {
      if (confirm(`Conectado como ${state.user.name} (${state.user.email}). Deseja desconectar?`)) {
        handleLogout();
      }
    } else {
      openAuthModal('login');
    }
  });

  document.getElementById('closeModal')?.addEventListener('click', closeAuthModal);

  modal?.addEventListener('click', e => {
    if (e.target === modal) closeAuthModal();
  });

  window.addEventListener('keydown', e => {
    if (e.key === 'Escape' && modal?.classList.contains('open')) {
      closeAuthModal();
    }
  });

  // Alternadores de aba
  document.getElementById('tabLogin')?.addEventListener('click', () => switchTab('login'));
  document.getElementById('tabRegister')?.addEventListener('click', () => switchTab('register'));
  document.getElementById('switchRegister')?.addEventListener('click', () => switchTab('register'));
  document.getElementById('switchLogin')?.addEventListener('click', () => switchTab('login'));

  // Esqueci minha senha
  document.getElementById('forgotPassword')?.addEventListener('click', e => {
    e.preventDefault();
    toast('Instruções para redefinir a senha serão enviadas para o seu e-mail.');
  });

  // Login Social
  document.getElementById('btnGoogleLogin')?.addEventListener('click', () => {
    toast('Login com Google em desenvolvimento. Use o formulário ou a conta demo.');
  });

  // Submissão de Formulários
  loginForm?.addEventListener('submit', handleLoginSubmit);
  registerForm?.addEventListener('submit', handleRegisterSubmit);

  setupPasswordToggles();
  setupDemoLogin();

  // Render inicial dos calendários
  renderCalendar('miniCalendar');
  renderCalendar('fullCalendar', true);
  updateCalendarSummary();

  // Verificar se há sessão ativa no servidor
  checkAuthSession();
}

// Inicializar quando o DOM estiver pronto
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}

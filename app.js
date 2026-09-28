/**
 * Fit.IA - Aplicação Frontend Inteligente
 * Autenticação, navegação por rotas, biblioteca dinâmica de treinos,
 * cronômetro de sessão, calendário de constância e sincronização com backend.
 */

// ==========================================================================
// ESTADO GLOBAL DA APLICAÇÃO
// ==========================================================================
const state = {
  user: null,
  trained: JSON.parse(localStorage.getItem('fitia-trained') || '[]'),
  month: 8, // Setembro (0-indexed)
  year: 2026,
  todayStr: '2026-09-28', // Data base da simulação
  workouts: [],
  currentWorkoutSession: null,
  timerSeconds: 0,
  timerInterval: null,
  timerRunning: false,
  settings: {
    reminders: JSON.parse(localStorage.getItem('fitia-reminders') ?? 'true'),
    weeklyReport: JSON.parse(localStorage.getItem('fitia-weekly-report') ?? 'true'),
    monthlyGoal: Number(localStorage.getItem('fitia-monthly-goal') || 24),
    unit: localStorage.getItem('fitia-unit') || 'kg'
  }
};

const monthNames = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

const routes = {
  inicio: 'Visão geral',
  treinos: 'Meus treinos',
  calendario: 'Calendário de constância',
  'personal-ia': 'Personal IA & Consultoria',
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
  t._timer = setTimeout(() => t.classList.remove('show'), 3200);
}

// ==========================================================================
// ROTEAMENTO E NAVEGAÇÃO
// ==========================================================================
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
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ==========================================================================
// CÁLCULO DE SEQUÊNCIA (STREAK)
// ==========================================================================
function calculateStreak() {
  if (!state.trained.length) return 0;
  const sorted = [...state.trained].sort().reverse();
  let streak = 0;
  let cursor = new Date(2026, 8, 28); // 28/09/2026

  for (let i = 0; i < 60; i++) {
    const k = `${cursor.getFullYear()}-${pad(cursor.getMonth() + 1)}-${pad(cursor.getDate())}`;
    if (state.trained.includes(k)) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    } else {
      if (i === 0) {
        // Se não treinou hoje, checa a partir de ontem
        cursor.setDate(cursor.getDate() - 1);
        continue;
      }
      break;
    }
  }
  return streak;
}

// ==========================================================================
// RENDERIZAÇÃO DO CALENDÁRIO
// ==========================================================================
function renderCalendars() {
  renderCalendarGrid('miniCalendar', false);
  renderCalendarGrid('fullCalendar', true);
  updateCalendarSummaries();
}

function renderCalendarGrid(targetId, isFull = false) {
  const el = document.getElementById(targetId);
  if (!el) return;
  el.innerHTML = '';

  const firstDay = new Date(state.year, state.month, 1);
  const startDay = (firstDay.getDay() + 6) % 7; // Segunda-feira = 0
  const totalDays = new Date(state.year, state.month + 1, 0).getDate();
  const prevMonthDays = new Date(state.year, state.month, 0).getDate();

  // Dias do mês anterior (padding visual)
  for (let i = 0; i < startDay; i++) {
    const s = document.createElement('span');
    s.className = 'empty';
    s.textContent = prevMonthDays - startDay + i + 1;
    s.style.opacity = '0.28';
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
    if (dateKey === state.todayStr) {
      s.classList.add('today');
    }

    s.addEventListener('click', () => toggleCheckinDate(dateKey));
    el.appendChild(s);
  }
}

async function toggleCheckinDate(dateKey) {
  const isTrained = state.trained.includes(dateKey);
  const willBeTrained = !isTrained;

  if (willBeTrained) {
    state.trained = [...new Set([...state.trained, dateKey])];
  } else {
    state.trained = state.trained.filter(x => x !== dateKey);
  }

  localStorage.setItem('fitia-trained', JSON.stringify(state.trained));
  renderCalendars();

  const formattedDate = dateKey.split('-').reverse().join('/');
  toast(willBeTrained ? `Treino registrado para ${formattedDate}! ✦` : `Treino desmarcado (${formattedDate}).`);

  // Sincroniza com o servidor se logado
  if (state.user) {
    try {
      await fetch('/api/checkins', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: dateKey, trained: willBeTrained })
      });
    } catch (e) {
      console.warn('Falha na sincronização de check-in:', e);
    }
  }
}

function updateCalendarSummaries() {
  const currentPrefix = `${state.year}-${pad(state.month + 1)}`;
  const count = state.trained.filter(x => x.startsWith(currentPrefix)).length;
  const goal = state.settings.monthlyGoal || 24;
  const pct = Math.min(100, Math.round((count / goal) * 100));
  const streak = calculateStreak();

  // Título dos calendários
  const titleText = `${monthNames[state.month]} ${state.year}`;
  const calTitle = document.getElementById('calendarTitle');
  if (calTitle) calTitle.textContent = titleText;
  const miniTitle = document.getElementById('miniCalendarTitle');
  if (miniTitle) miniTitle.textContent = titleText;

  // Overview metrics
  const monthCountEl = document.getElementById('monthlyWorkoutCount');
  if (monthCountEl) monthCountEl.innerHTML = `${count} <small>/ ${goal} treinos</small>`;
  const overviewProgress = document.getElementById('overviewMonthProgress');
  if (overviewProgress) overviewProgress.style.width = `${pct}%`;
  const monthPctDisplay = document.getElementById('monthPctDisplay');
  if (monthPctDisplay) monthPctDisplay.textContent = `${pct}%`;

  // Streak cards
  const streakCount = document.getElementById('streakCount');
  if (streakCount) streakCount.innerHTML = `${streak} <small>dias seguidos</small>`;
  const summaryStreak = document.getElementById('summaryStreakNumber');
  if (summaryStreak) summaryStreak.textContent = `${streak} dias seguidos`;

  // Full calendar summary
  const summaryCount = document.getElementById('monthCount');
  if (summaryCount) summaryCount.textContent = count;
  const summaryProgress = document.getElementById('monthProgress');
  if (summaryProgress) summaryProgress.style.width = `${pct}%`;
  const summaryGoalNumber = document.getElementById('summaryGoalNumber');
  if (summaryGoalNumber) summaryGoalNumber.textContent = `${goal} treinos`;

  // Botão de check-in de hoje
  const isTodayTrained = state.trained.includes(state.todayStr);
  const todayToggleText = document.getElementById('todayToggleText');
  if (todayToggleText) {
    todayToggleText.textContent = isTodayTrained ? 'Treino de hoje concluído ✓' : 'Registrar treino de hoje';
  }
}

// ==========================================================================
// CARREGAMENTO E RENDERIZAÇÃO DOS TREINOS
// ==========================================================================
async function loadWorkouts() {
  try {
    const res = await fetch('/api/workouts');
    if (res.ok) {
      state.workouts = await res.json();
      renderFeaturedWorkouts();
      renderAllWorkouts(state.workouts);
    }
  } catch (err) {
    console.warn('API de treinos indisponível, usando fallback local.');
  }
}

function getVisualClass(category) {
  const cat = (category || '').toLowerCase();
  if (cat.includes('força')) return 'visual-strength';
  if (cat.includes('cardio')) return 'visual-cardio';
  if (cat.includes('mobilidade')) return 'visual-mobility';
  return 'visual-home';
}

function renderFeaturedWorkouts() {
  const container = document.getElementById('featuredWorkoutsGrid');
  if (!container || !state.workouts.length) return;

  const featured = state.workouts.slice(0, 3);
  container.innerHTML = featured.map(w => `
    <article class="workout-card">
      <div class="workout-visual ${getVisualClass(w.category)}">
        <span class="visual-badge">${w.category.toUpperCase()}</span>
        <span class="visual-tag-right">${w.duration} MIN</span>
      </div>
      <div class="workout-body">
        <div>
          <p class="card-kicker">${w.level.toUpperCase()} · ~${w.calories || 300} KCAL</p>
          <h3>${w.title}</h3>
        </div>
        <button class="round-arrow btn-start-workout" data-id="${w.id}" aria-label="Iniciar treino ${w.title}">→</button>
      </div>
    </article>
  `).join('');

  container.querySelectorAll('.btn-start-workout').forEach(btn => {
    btn.addEventListener('click', () => {
      const workout = state.workouts.find(w => w.id === btn.dataset.id);
      if (workout) openWorkoutModal(workout);
    });
  });
}

function renderAllWorkouts(list) {
  const container = document.getElementById('allWorkoutsList');
  if (!container) return;

  if (!list.length) {
    container.innerHTML = `
      <div class="panel" style="text-align: center; padding: 48px 20px;">
        <span style="font-size: 32px; display: block; margin-bottom: 12px;">🔍</span>
        <strong style="font-size: 16px;">Nenhum treino encontrado</strong>
        <p style="color: var(--muted); font-size: 13px; margin-top: 6px;">Tente buscar com outro termo ou selecione a categoria "Todos".</p>
      </div>
    `;
    return;
  }

  container.innerHTML = list.map(w => `
    <article class="wide-workout">
      <div class="workout-visual ${getVisualClass(w.category)}">
        <span class="visual-badge">${w.category.toUpperCase()}</span>
      </div>
      <div class="wide-workout-content">
        <div>
          <div class="workout-meta-pills">
            <span class="meta-pill">⏱️ ${w.duration} min</span>
            <span class="meta-pill">🔥 ~${w.calories || 300} kcal</span>
            <span class="meta-pill">📊 ${w.level}</span>
          </div>
          <h2>${w.title}</h2>
          <p>${w.description || 'Treino completo com foco em evolução e consistência.'}</p>
        </div>
        <div>
          <button class="primary-button small btn-start-wide" data-id="${w.id}">
            <span>▶</span> Iniciar treino agora
          </button>
        </div>
      </div>
    </article>
  `).join('');

  container.querySelectorAll('.btn-start-wide').forEach(btn => {
    btn.addEventListener('click', () => {
      const workout = state.workouts.find(w => w.id === btn.dataset.id);
      if (workout) openWorkoutModal(workout);
    });
  });
}

function setupWorkoutFilters() {
  const searchInput = document.getElementById('workoutSearchInput');
  const filterBtns = document.querySelectorAll('.filter-row .filter');

  let activeCategory = 'Todos';

  function applyFilters() {
    const term = (searchInput?.value || '').toLowerCase().trim();
    const filtered = state.workouts.filter(w => {
      const matchesCategory = activeCategory === 'Todos' || w.category.toLowerCase() === activeCategory.toLowerCase();
      const matchesSearch = !term || w.title.toLowerCase().includes(term) || (w.description || '').toLowerCase().includes(term);
      return matchesCategory && matchesSearch;
    });
    renderAllWorkouts(filtered);
  }

  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeCategory = btn.dataset.filter || 'Todos';
      applyFilters();
    });
  });

  searchInput?.addEventListener('input', applyFilters);
}

// ==========================================================================
// MODAL DE SESSÃO DE TREINO (CRONÔMETRO + CHECKLIST)
// ==========================================================================
const workoutModal = document.getElementById('workoutModal');

function openWorkoutModal(workout) {
  state.currentWorkoutSession = workout;
  state.timerSeconds = 0;
  stopWorkoutTimer();

  document.getElementById('workoutModalTitle').textContent = workout.title;
  document.getElementById('workoutModalCategory').textContent = workout.category.toUpperCase();
  document.getElementById('workoutModalDesc').textContent = workout.description || '';
  updateTimerDisplay();

  const listContainer = document.getElementById('workoutExercisesList');
  if (listContainer) {
    const exercises = workout.exercises && workout.exercises.length ? workout.exercises : [
      'Aquecimento articular dinâmico (3 min)',
      'Série principal de ativação (3 séries)',
      'Circuito de força e queima calórica',
      'Desaquecimento e respiração controlada'
    ];

    listContainer.innerHTML = exercises.map((ex, idx) => `
      <label class="exercise-item" for="ex-${idx}">
        <input type="checkbox" class="exercise-checkbox" id="ex-${idx}" />
        <span>${ex}</span>
      </label>
    `).join('');

    listContainer.querySelectorAll('.exercise-item').forEach(label => {
      const chk = label.querySelector('input');
      chk.addEventListener('change', () => {
        label.classList.toggle('checked', chk.checked);
      });
    });
  }

  workoutModal?.classList.add('open');
}

function closeWorkoutModal() {
  stopWorkoutTimer();
  workoutModal?.classList.remove('open');
}

function updateTimerDisplay() {
  const mins = pad(Math.floor(state.timerSeconds / 60));
  const secs = pad(state.timerSeconds % 60);
  const display = document.getElementById('workoutTimerDisplay');
  if (display) display.textContent = `${mins}:${secs}`;
}

function startWorkoutTimer() {
  state.timerRunning = true;
  const btn = document.getElementById('btnToggleTimer');
  if (btn) btn.textContent = '⏸ Pausar cronômetro';
  state.timerInterval = setInterval(() => {
    state.timerSeconds++;
    updateTimerDisplay();
  }, 1000);
}

function stopWorkoutTimer() {
  state.timerRunning = false;
  const btn = document.getElementById('btnToggleTimer');
  if (btn) btn.textContent = '▶ Iniciar cronômetro';
  clearInterval(state.timerInterval);
}

function setupWorkoutRunner() {
  document.getElementById('closeWorkoutModal')?.addEventListener('click', closeWorkoutModal);

  document.getElementById('btnToggleTimer')?.addEventListener('click', () => {
    if (state.timerRunning) {
      stopWorkoutTimer();
    } else {
      startWorkoutTimer();
    }
  });

  document.getElementById('btnResetTimer')?.addEventListener('click', () => {
    stopWorkoutTimer();
    state.timerSeconds = 0;
    updateTimerDisplay();
  });

  document.getElementById('btnFinishWorkout')?.addEventListener('click', async () => {
    closeWorkoutModal();

    // Marca o check-in de hoje
    if (!state.trained.includes(state.todayStr)) {
      await toggleCheckinDate(state.todayStr);
    }
    toast(`Parabéns! Sessão "${state.currentWorkoutSession?.title}" concluída com sucesso! 🏆`);
  });

  document.getElementById('btnQuickWorkout')?.addEventListener('click', () => {
    if (state.workouts.length) {
      openWorkoutModal(state.workouts[0]);
    } else {
      go('treinos');
    }
  });
}

// ==========================================================================
// MODAL FIT.IA PRO
// ==========================================================================
const proModal = document.getElementById('proModal');

function setupProModal() {
  document.getElementById('btnOpenPro')?.addEventListener('click', () => {
    proModal?.classList.add('open');
  });

  document.getElementById('closeProModal')?.addEventListener('click', () => {
    proModal?.classList.remove('open');
  });

  proModal?.addEventListener('click', e => {
    if (e.target === proModal) proModal.classList.remove('open');
  });

  document.getElementById('btnTryPro')?.addEventListener('click', () => {
    proModal?.classList.remove('open');
    const roleEl = document.getElementById('sidebarRole');
    if (roleEl) roleEl.textContent = 'Plano Pro ✦ (Ativo)';
    toast('🎉 Parabéns! Seus 7 dias grátis de Fit.IA Pro foram ativados com sucesso!');
  });
}

// ==========================================================================
// POPOVER DE NOTIFICAÇÕES
// ==========================================================================
function setupNotifications() {
  const btn = document.getElementById('btnNotifications');
  const popover = document.getElementById('notificationsPopover');
  const dot = document.getElementById('notifDot');

  btn?.addEventListener('click', e => {
    e.stopPropagation();
    popover?.classList.toggle('show');
    if (dot) dot.style.display = 'none';
  });

  document.addEventListener('click', e => {
    if (!popover?.contains(e.target) && e.target !== btn) {
      popover?.classList.remove('show');
    }
  });
}

// ==========================================================================
// CONFIGURAÇÕES DA CONTA
// ==========================================================================
function setupSettings() {
  const toggleRem = document.getElementById('toggleReminders');
  const toggleRep = document.getElementById('toggleWeeklyReport');
  const selectGoal = document.getElementById('settingMonthlyGoal');
  const selectUnit = document.getElementById('settingUnit');
  const btnSave = document.getElementById('btnSaveSettings');

  if (toggleRem) toggleRem.classList.toggle('on', state.settings.reminders);
  if (toggleRep) toggleRep.classList.toggle('on', state.settings.weeklyReport);
  if (selectGoal) selectGoal.value = String(state.settings.monthlyGoal);
  if (selectUnit) selectUnit.value = state.settings.unit;

  toggleRem?.addEventListener('click', () => toggleRem.classList.toggle('on'));
  toggleRep?.addEventListener('click', () => toggleRep.classList.toggle('on'));

  btnSave?.addEventListener('click', () => {
    state.settings.reminders = toggleRem ? toggleRem.classList.contains('on') : true;
    state.settings.weeklyReport = toggleRep ? toggleRep.classList.contains('on') : true;
    state.settings.monthlyGoal = selectGoal ? Number(selectGoal.value) : 24;
    state.settings.unit = selectUnit ? selectUnit.value : 'kg';

    localStorage.setItem('fitia-reminders', JSON.stringify(state.settings.reminders));
    localStorage.setItem('fitia-weekly-report', JSON.stringify(state.settings.weeklyReport));
    localStorage.setItem('fitia-monthly-goal', String(state.settings.monthlyGoal));
    localStorage.setItem('fitia-unit', state.settings.unit);

    updateCalendarSummaries();
    toast('Preferências salvas com sucesso! ✦');
  });
}

// ==========================================================================
// MÓDULO PERSONAL IA (CHAT & RECOMENDAÇÕES)
// ==========================================================================
const chatHistory = [];

function setupPersonalIaChat() {
  const chatForm = document.getElementById('chatForm');
  const chatInput = document.getElementById('chatInput');
  const chatMessages = document.getElementById('chatMessages');
  const btnClear = document.getElementById('btnClearChatHistory');
  const suggestions = document.querySelectorAll('.suggestion-chip');

  // Adiciona evento aos chips de sugestões
  suggestions.forEach(chip => {
    chip.addEventListener('click', () => {
      if (!chatInput) return;
      chatInput.value = chip.textContent.trim();
      chatForm?.requestSubmit();
    });
  });

  // Limpa histórico
  btnClear?.addEventListener('click', () => {
    if (!chatMessages) return;
    chatMessages.innerHTML = `
      <div class="chat-msg coach">
        <span class="msg-avatar">🤖</span>
        <div class="msg-bubble">
          Conversa reiniciada. Como posso ajudar com sua preparação física ou alimentação hoje?
        </div>
      </div>
    `;
    chatHistory.length = 0;
    toast('Histórico da conversa limpo.');
  });

  // Envio de mensagem
  chatForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = (chatInput?.value || '').trim();
    if (!text) return;

    // Adiciona mensagem do usuário
    appendChatMessage('user', text);
    chatInput.value = '';

    // Adiciona indicador de digitação
    const typingId = appendTypingIndicator();

    try {
      const res = await fetch('/api/ia/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history: chatHistory })
      });

      removeTypingIndicator(typingId);

      if (res.status === 401) {
        appendChatMessage('coach', 'Por favor, realize seu login no Fit.IA para que eu possa sincronizar com suas métricas corporais!');
        openAuthModal('login');
        return;
      }

      const data = await res.json();
      if (!res.ok) {
        appendChatMessage('coach', data.error || 'Desculpe, tive uma instabilidade temporária ao processar sua resposta.');
        return;
      }

      appendChatMessage('coach', data.response);
      chatHistory.push({ role: 'user', content: text });
      chatHistory.push({ role: 'assistant', content: data.response });
    } catch (err) {
      removeTypingIndicator(typingId);
      appendChatMessage('coach', 'Erro de conexão com o servidor. Verifique se o backend do Fit.IA está em execução.');
    }
  });
}

function appendChatMessage(sender, text) {
  const container = document.getElementById('chatMessages');
  if (!container) return;

  const msgDiv = document.createElement('div');
  msgDiv.className = `chat-msg ${sender}`;

  const avatar = document.createElement('span');
  avatar.className = 'msg-avatar';
  avatar.textContent = sender === 'coach' ? '🤖' : (state.user?.name ? state.user.name[0].toUpperCase() : '👤');

  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';

  // Formatação simples de Markdown (negrito e quebras de linha)
  const formatted = text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br />');

  bubble.innerHTML = formatted;

  msgDiv.appendChild(avatar);
  msgDiv.appendChild(bubble);
  container.appendChild(msgDiv);
  container.scrollTop = container.scrollHeight;
}

function appendTypingIndicator() {
  const container = document.getElementById('chatMessages');
  if (!container) return null;

  const id = 'typing-' + Date.now();
  const div = document.createElement('div');
  div.className = 'chat-msg coach is-typing';
  div.id = id;
  div.innerHTML = `
    <span class="msg-avatar">🤖</span>
    <div class="msg-bubble typing-dots">
      <span></span><span></span><span></span>
    </div>
  `;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
  return id;
}

function removeTypingIndicator(id) {
  if (!id) return;
  const el = document.getElementById(id);
  if (el) el.remove();
}

// ==========================================================================
// GERADORES DE TREINO E DIETA POR INTELIGÊNCIA ARTIFICIAL
// ==========================================================================
function setupIaGenerators() {
  const btnWorkout = document.getElementById('btnIaGenerateWorkout');
  const btnDiet = document.getElementById('btnIaGenerateDiet');

  const planModal = document.getElementById('planModal');
  const dietModal = document.getElementById('dietModal');
  const closePlan = document.getElementById('closePlanModal');
  const closeDiet = document.getElementById('closeDietModal');

  closePlan?.addEventListener('click', () => planModal?.classList.remove('open'));
  closeDiet?.addEventListener('click', () => dietModal?.classList.remove('open'));

  planModal?.addEventListener('click', e => {
    if (e.target === planModal) planModal.classList.remove('open');
  });

  dietModal?.addEventListener('click', e => {
    if (e.target === dietModal) dietModal.classList.remove('open');
  });

  // Botão: Gerar Treino Personalizado
  btnWorkout?.addEventListener('click', async () => {
    if (!state.user) {
      toast('Faça login para gerar e salvar seu treino com IA!');
      openAuthModal('login');
      return;
    }

    btnWorkout.classList.add('loading');
    toast('Consultando Personal IA para estruturar sua periodização...');

    try {
      const res = await fetch('/api/ia/gerar-treino', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!res.ok) {
        const err = await res.json();
        toast(err.error || 'Erro ao gerar treino.');
        return;
      }

      const plan = await res.json();
      renderIaWorkoutPlan(plan);
      planModal?.classList.add('open');
    } catch (err) {
      toast('Erro de rede ao conectar à IA de Treinos.');
    } finally {
      btnWorkout.classList.remove('loading');
    }
  });

  // Botão: Gerar Dieta & Macros
  btnDiet?.addEventListener('click', async () => {
    if (!state.user) {
      toast('Faça login para calcular sua dieta personalizada!');
      openAuthModal('login');
      return;
    }

    btnDiet.classList.add('loading');
    toast('Calculando TMB, TDEE e proporção de macronutrientes...');

    try {
      const res = await fetch('/api/ia/gerar-dieta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!res.ok) {
        const err = await res.json();
        toast(err.error || 'Erro ao calcular dieta.');
        return;
      }

      const diet = await res.json();
      renderIaDietPlan(diet);
      dietModal?.classList.add('open');
    } catch (err) {
      toast('Erro de rede ao conectar à IA Nutricional.');
    } finally {
      btnDiet.classList.remove('loading');
    }
  });

  document.getElementById('btnSavePlanToStorage')?.addEventListener('click', () => {
    planModal?.classList.remove('open');
    toast('Plano de treino salvo na sua conta com sucesso! ✦');
    go('treinos');
  });

  document.getElementById('btnSaveDietToStorage')?.addEventListener('click', () => {
    dietModal?.classList.remove('open');
    toast('Plano nutricional adotado! Acompanhe seus macros diários.');
  });
}

function renderIaWorkoutPlan(plan) {
  const titleEl = document.getElementById('planModalTitle');
  const subEl = document.getElementById('planModalSub');
  const bodyEl = document.getElementById('planModalContent');

  if (titleEl) titleEl.textContent = plan.titulo || 'Treino Personalizado Fit.IA';
  if (subEl) subEl.textContent = `Frequência recomendada: ${plan.frequenciaSemanal || '4-5x na semana'} · Nível: ${plan.nivel || 'Intermediário'}`;

  if (!bodyEl) return;

  let html = `
    <div class="ia-plan-split-overview">
      <strong>Divisão da Rotina:</strong>
      <ul>${(plan.divisao || []).map(d => `<li>${d}</li>`).join('')}</ul>
    </div>
  `;

  if (Array.isArray(plan.rotina)) {
    plan.rotina.forEach(sessao => {
      html += `
        <div class="ia-routine-card">
          <div class="ia-routine-head">
            <h3>${sessao.dia}</h3>
            <span>Foco: ${sessao.foco}</span>
          </div>
          <table class="ia-exercises-table">
            <thead>
              <tr>
                <th>Exercício</th>
                <th>Séries</th>
                <th>Repetições</th>
                <th>Descanso</th>
                <th>Observações</th>
              </tr>
            </thead>
            <tbody>
              ${(sessao.exercicios || []).map(ex => `
                <tr>
                  <td><strong>${ex.nome}</strong></td>
                  <td>${ex.series}</td>
                  <td>${ex.repeticoes}</td>
                  <td>${ex.descanso}</td>
                  <td><small>${ex.obs || 'Forma controlada'}</small></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    });
  }

  bodyEl.innerHTML = html;
}

function renderIaDietPlan(diet) {
  const titleEl = document.getElementById('dietModalTitle');
  const subEl = document.getElementById('dietModalSub');
  const bodyEl = document.getElementById('dietModalContent');

  if (titleEl) titleEl.textContent = diet.titulo || 'Plano Nutricional Inteligente';
  if (subEl) subEl.textContent = `Hidratação recomendada: ${diet.hidratacao || '3L/dia'}`;

  if (!bodyEl) return;

  const meta = diet.dadosMetabolicos || {};
  const macros = diet.macronutrientes || {};

  let html = `
    <div class="diet-metrics-grid">
      <div class="diet-metric-card">
        <span class="diet-label">Taxa Metabólica Basal (TMB)</span>
        <strong>${meta.tmb || '—'}</strong>
      </div>
      <div class="diet-metric-card">
        <span class="diet-label">Gasto Calórico Total (TDEE)</span>
        <strong>${meta.gastoTotalDiario || '—'}</strong>
      </div>
      <div class="diet-metric-card highlight">
        <span class="diet-label">Meta Calórica Diária</span>
        <strong>${meta.metaCaloricaDiaria || '—'}</strong>
      </div>
    </div>

    <div class="diet-macros-row">
      <div class="macro-badge protein">
        <span>Proteínas</span>
        <strong>${macros.proteinas || '—'}</strong>
      </div>
      <div class="macro-badge carb">
        <span>Carboidratos</span>
        <strong>${macros.carboidratos || '—'}</strong>
      </div>
      <div class="macro-badge fat">
        <span>Gorduras Boas</span>
        <strong>${macros.gorduras || '—'}</strong>
      </div>
    </div>

    <h3 style="margin: 24px 0 12px; font-size: 1.1rem; color: var(--text-heading);">Cronograma de Refeições Sugerido:</h3>
    <div class="diet-meals-list">
  `;

  if (Array.isArray(diet.refeicoes)) {
    diet.refeicoes.forEach(m => {
      html += `
        <div class="diet-meal-item">
          <div class="diet-meal-head">
            <strong>${m.refeicao}</strong>
            <span>${m.horario} · ${m.caloriasAprox || ''}</span>
          </div>
          <ul>
            ${(m.itens || []).map(i => `<li>${i}</li>`).join('')}
          </ul>
        </div>
      `;
    });
  }

  html += `</div>`;
  bodyEl.innerHTML = html;
}

// ==========================================================================
// FORMULÁRIO DE PERFIL BIOMÉTRICO (CONFIGURAÇÕES)
// ==========================================================================
function setupProfileForm() {
  const profileForm = document.getElementById('profileForm');
  const btnSave = document.getElementById('btnSaveProfile');

  profileForm?.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!state.user) {
      toast('Faça login para salvar seus dados corporais!');
      openAuthModal('login');
      return;
    }

    const payload = {
      idade: Number(document.getElementById('profAge')?.value || 25),
      peso: Number(document.getElementById('profWeight')?.value || 70),
      altura: Number(document.getElementById('profHeight')?.value || 1.75),
      sexo: document.getElementById('profGender')?.value || 'Masculino',
      nivelAtividade: document.getElementById('profActivity')?.value || 'Moderado',
      objetivo: document.getElementById('profGoal')?.value || 'Hipertrofia e Ganho de Massa',
      restricoesAlimentares: document.getElementById('profRestrictions')?.value || 'Nenhuma'
    };

    if (btnSave) {
      btnSave.disabled = true;
      btnSave.textContent = 'Salvando biometria...';
    }

    try {
      const res = await fetch('/api/user/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) {
        toast(data.error || 'Erro ao atualizar perfil.');
        return;
      }

      toast('Perfil biométrico atualizado com sucesso! ✦');
    } catch (err) {
      toast('Erro de conexão ao salvar perfil.');
    } finally {
      if (btnSave) {
        btnSave.disabled = false;
        btnSave.innerHTML = '<span>💾</span> Salvar Perfil Biométrico';
      }
    }
  });
}

async function loadUserProfile() {
  if (!state.user) return;
  try {
    const res = await fetch('/api/user/profile');
    if (!res.ok) return;

    const prof = await res.json();
    if (!prof) return;

    const age = document.getElementById('profAge');
    const weight = document.getElementById('profWeight');
    const height = document.getElementById('profHeight');
    const gender = document.getElementById('profGender');
    const activity = document.getElementById('profActivity');
    const goal = document.getElementById('profGoal');
    const restrictions = document.getElementById('profRestrictions');

    if (age && prof.idade) age.value = prof.idade;
    if (weight && prof.peso) weight.value = prof.peso;
    if (height && prof.altura) height.value = prof.altura;
    if (gender && prof.sexo) gender.value = prof.sexo;
    if (activity && prof.nivelAtividade) activity.value = prof.nivelAtividade;
    if (goal && prof.objetivo) goal.value = prof.objetivo;
    if (restrictions && prof.restricoesAlimentares) restrictions.value = prof.restricoesAlimentares;
  } catch (err) {
    console.info('Perfil não pôde ser carregado:', err);
  }
}

// ==========================================================================
// MÓDULO DE AUTENTICAÇÃO (LOGIN / REGISTRO)
// ==========================================================================
const loginModal = document.getElementById('loginModal');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');

function openAuthModal(defaultTab = 'login') {
  if (!loginModal) return;
  loginModal.classList.add('open');
  switchTab(defaultTab);
  clearAuthErrors();
}

function closeAuthModal() {
  if (!loginModal) return;
  loginModal.classList.remove('open');
  clearAuthErrors();
}

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

function updateAuthUI(user) {
  state.user = user;
  const loginButtonLabel = document.getElementById('loginButtonLabel');
  const loginButtonIcon = document.getElementById('loginButtonIcon');
  const sidebarName = document.getElementById('sidebarName');
  const sidebarAvatar = document.getElementById('sidebarAvatar');
  const sidebarRole = document.getElementById('sidebarRole');
  const welcomeUserName = document.getElementById('welcomeUserName');

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
    if (welcomeUserName) welcomeUserName.textContent = firstName;
  } else {
    if (loginButtonLabel) loginButtonLabel.textContent = 'Entrar';
    if (loginButtonIcon) loginButtonIcon.textContent = '↗';
    if (sidebarName) sidebarName.textContent = 'Visitante';
    if (sidebarAvatar) sidebarAvatar.textContent = '??';
    if (sidebarRole) sidebarRole.textContent = 'Plano gratuito';
    if (welcomeUserName) welcomeUserName.textContent = 'Atleta';
  }
}

async function checkAuthSession() {
  try {
    const res = await fetch('/api/auth/me');
    if (res.ok) {
      const data = await res.json();
      if (data.user) {
        updateAuthUI(data.user);
        closeAuthModal();

        const checkinsRes = await fetch('/api/checkins');
        if (checkinsRes.ok) {
          const checkins = await checkinsRes.json();
          if (Array.isArray(checkins)) {
            state.trained = checkins;
            localStorage.setItem('fitia-trained', JSON.stringify(state.trained));
            renderCalendars();
          }
        }
        loadUserProfile();
      }
    }
  } catch (err) {
    console.info('Modo offline / API não respondeu:', err);
  }
}

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

    updateAuthUI(data.user);
    closeAuthModal();
    toast(`Bem-vindo de volta, ${data.user.name.split(' ')[0]}! ✦`);

    const checkinsRes = await fetch('/api/checkins');
    if (checkinsRes.ok) {
      const checkins = await checkinsRes.json();
      if (Array.isArray(checkins)) {
        state.trained = checkins;
        localStorage.setItem('fitia-trained', JSON.stringify(state.trained));
        renderCalendars();
      }
    }
    loadUserProfile();
  } catch (error) {
    statusEl.textContent = 'Erro ao conectar ao servidor.';
    statusEl.className = 'form-status error';
  } finally {
    submitBtn.disabled = false;
    submitBtn.classList.remove('is-loading');
  }
}

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

    updateAuthUI(data.user);
    closeAuthModal();
    toast(`Conta criada com sucesso! Bem-vindo(a), ${data.user.name.split(' ')[0]}! ✦`);

    state.trained = [];
    localStorage.setItem('fitia-trained', JSON.stringify([]));
    renderCalendars();
  } catch (error) {
    statusEl.textContent = 'Erro ao conectar ao servidor.';
    statusEl.className = 'form-status error';
  } finally {
    submitBtn.disabled = false;
    submitBtn.classList.remove('is-loading');
  }
}

async function handleLogout() {
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
  } catch (err) {
    console.warn('Erro ao sair no backend:', err);
  }
  updateAuthUI(null);
  toast('Você saiu da sua conta.');
}

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

// ==========================================================================
// INICIALIZAÇÃO GERAL DA APLICAÇÃO
// ==========================================================================
function initApp() {
  // Navegação por rotas
  document.querySelectorAll('[data-route]').forEach(a => {
    a.addEventListener('click', e => {
      e.preventDefault();
      const route = a.dataset.route || a.getAttribute('href')?.replace('#', '');
      if (route) go(route);
    });
  });

  // Navegação de mês no calendário
  const prevMonthAction = () => {
    state.month--;
    if (state.month < 0) {
      state.month = 11;
      state.year--;
    }
    renderCalendars();
  };

  const nextMonthAction = () => {
    state.month++;
    if (state.month > 11) {
      state.month = 0;
      state.year++;
    }
    renderCalendars();
  };

  document.getElementById('prevMonth')?.addEventListener('click', prevMonthAction);
  document.getElementById('nextMonth')?.addEventListener('click', nextMonthAction);
  document.getElementById('miniPrevMonth')?.addEventListener('click', prevMonthAction);
  document.getElementById('miniNextMonth')?.addEventListener('click', nextMonthAction);

  // Botões de registrar treino de hoje
  document.getElementById('btnToggleTodayCheckin')?.addEventListener('click', () => toggleCheckinDate(state.todayStr));
  document.getElementById('btnMarkTodayLarge')?.addEventListener('click', () => toggleCheckinDate(state.todayStr));

  // Menu Mobile Drawer
  document.getElementById('mobileMenu')?.addEventListener('click', () => {
    document.getElementById('sidebar')?.classList.add('open');
  });

  document.getElementById('mobileCloseSidebar')?.addEventListener('click', () => {
    document.getElementById('sidebar')?.classList.remove('open');
  });

  // Modal Auth
  document.getElementById('loginButton')?.addEventListener('click', () => {
    if (state.user) {
      if (confirm(`Conectado como ${state.user.name}. Deseja sair?`)) {
        handleLogout();
      }
    } else {
      openAuthModal('login');
    }
  });

  document.getElementById('sidebarLogout')?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (confirm('Deseja realmente sair da sua conta?')) {
      handleLogout();
    }
  });

  document.getElementById('profileButton')?.addEventListener('click', () => {
    if (state.user) {
      if (confirm(`Conectado como ${state.user.name} (${state.user.email}). Deseja sair?`)) {
        handleLogout();
      }
    } else {
      openAuthModal('login');
    }
  });

  document.getElementById('closeModal')?.addEventListener('click', closeAuthModal);

  loginModal?.addEventListener('click', e => {
    if (e.target === loginModal) closeAuthModal();
  });

  window.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (loginModal?.classList.contains('open')) closeAuthModal();
      if (workoutModal?.classList.contains('open')) closeWorkoutModal();
      if (proModal?.classList.contains('open')) proModal.classList.remove('open');
    }
  });

  document.getElementById('tabLogin')?.addEventListener('click', () => switchTab('login'));
  document.getElementById('tabRegister')?.addEventListener('click', () => switchTab('register'));
  document.getElementById('switchRegister')?.addEventListener('click', () => switchTab('register'));
  document.getElementById('switchLogin')?.addEventListener('click', () => switchTab('login'));

  document.getElementById('forgotPassword')?.addEventListener('click', e => {
    e.preventDefault();
    toast('Instruções de redefinição serão enviadas para o seu e-mail.');
  });

  document.getElementById('btnGoogleLogin')?.addEventListener('click', () => {
    toast('Login com Google em desenvolvimento. Use a conta demo!');
  });

  loginForm?.addEventListener('submit', handleLoginSubmit);
  registerForm?.addEventListener('submit', handleRegisterSubmit);

  setupPasswordToggles();
  setupDemoLogin();
  setupWorkoutFilters();
  setupWorkoutRunner();
  setupProModal();
  setupNotifications();
  setupSettings();
  setupPersonalIaChat();
  setupIaGenerators();
  setupProfileForm();

  // Render inicial
  renderCalendars();
  loadWorkouts();
  checkAuthSession();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}

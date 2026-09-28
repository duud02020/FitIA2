/**
 * Fit.IA - Back-end Sênior (Node.js & Express)
 * Autenticação JWT com Bcrypt, Gerenciamento de Perfil Biométrico,
 * Personal IA Chatbot e Gerador de Treinos e Dietas.
 */

const express = require('express');
const cors = require('cors');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

// Inicialização dos clientes de IA (opcional caso chaves estejam no .env)
let GoogleGenerativeAI = null;
let OpenAI = null;
try { GoogleGenerativeAI = require('@google/generative-ai').GoogleGenerativeAI; } catch (e) {}
try { OpenAI = require('openai').OpenAI; } catch (e) {}

const app = express();
const ROOT = __dirname;
const DATA = path.join(ROOT, 'data');
const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET || 'fitia_jwt_secret_key_super_segura_2026_fitness_app';

fs.mkdirSync(DATA, { recursive: true });
const usersFile = path.join(DATA, 'users.json');
const profilesFile = path.join(DATA, 'profiles.json');
const checkinsFile = path.join(DATA, 'checkins.json');
const plansFile = path.join(DATA, 'plans.json');
const chatlogsFile = path.join(DATA, 'chatlogs.json');

// Utilitários de Persistência JSON
function readJson(file, fallback = {}) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function saveJson(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

// Inicialização de arquivos padrão
if (!fs.existsSync(usersFile) || readJson(usersFile, []).length === 0) {
  const defaultSalt = bcrypt.genSaltSync(10);
  saveJson(usersFile, [
    {
      id: 'ab3bdca7-be53-470b-bc07-3597613c3074',
      nome: 'João Silva',
      name: 'João Silva',
      email: 'joao@fitia.com',
      senhaHash: bcrypt.hashSync('123456', defaultSalt),
      dataCriacao: new Date().toISOString()
    }
  ]);
}
if (!fs.existsSync(profilesFile)) {
  saveJson(profilesFile, {
    'ab3bdca7-be53-470b-bc07-3597613c3074': {
      idade: 28,
      peso: 76.5,
      altura: 1.78,
      sexo: 'Masculino',
      nivelAtividade: 'Moderado (3 a 5 treinos/semana)',
      objetivo: 'Hipertrofia e Constância',
      restricoesAlimentares: 'Nenhuma restrição',
      atualizadoEm: new Date().toISOString()
    }
  });
}
if (!fs.existsSync(checkinsFile)) saveJson(checkinsFile, {});
if (!fs.existsSync(plansFile)) saveJson(plansFile, {});
if (!fs.existsSync(chatlogsFile)) saveJson(chatlogsFile, {});

// ==============================================================================
// MIDDLEWARES DE INFRAESTRUTURA & SEGURANÇA
// ==============================================================================

// 1. CORS permissivo para dev local, portas customizadas e file:///
app.use(cors({
  origin: (origin, callback) => callback(null, true),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cookie']
}));

app.use(express.json({ limit: '5mb' }));

// 2. Parser manual de cookies rápido e seguro
function parseCookies(req) {
  return Object.fromEntries(
    (req.headers.cookie || '')
      .split(';')
      .filter(Boolean)
      .map(part => {
        const i = part.indexOf('=');
        return [part.slice(0, i).trim(), decodeURIComponent(part.slice(i + 1))];
      })
  );
}

// 3. Middleware de Autenticação JWT
function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization;
  const cookieToken = parseCookies(req).fitia_session;
  const token = (authHeader && authHeader.startsWith('Bearer '))
    ? authHeader.slice(7).trim()
    : cookieToken;

  if (!token) {
    return res.status(401).json({
      error: 'Acesso restrito. Faça login para continuar.',
      code: 'AUTH_REQUIRED'
    });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    return res.status(403).json({
      error: 'Sessão inválida ou expirada. Realize novo login.',
      code: 'INVALID_TOKEN'
    });
  }
}

// ==============================================================================
// CATÁLOGO DE TREINOS
// ==============================================================================
const workouts = [
  { id: 'full-body', title: 'Full body express', category: 'Força', duration: 45, level: 'Iniciante', calories: 350, description: 'Sessão completa para ativar os principais grupos musculares com peso corporal e halteres.', exercises: ['Agachamento livre (3x12)', 'Flexão de braço (3x10)', 'Remada curvada (3x12)', 'Prancha isométrica (3x40s)'] },
  { id: 'intervalada', title: 'Corrida intervalada', category: 'Cardio', duration: 30, level: 'Intermediário', calories: 320, description: 'Alterne tiros de alta intensidade com trote leve para queimar gordura e turbinar o fôlego.', exercises: ['Aquecimento trote leve (5 min)', 'Tiros de 45s a 85% FCM (8 séries)', 'Recuperação ativa (60s entre tiros)', 'Desaquecimento e respiração (5 min)'] },
  { id: 'flow', title: 'Flow matinal para começar', category: 'Mobilidade', duration: 20, level: 'Todos os níveis', calories: 120, description: 'Sequência dinâmica de respiração e flexibilidade para destravar as articulações e despertar o corpo.', exercises: ['Gato e camelo (10 repetições)', 'Cão olhando para baixo (1 min)', 'Postura da cobra suave (8 respirações)', 'Torção de coluna deitado (30s cada lado)'] },
  { id: 'core-blast', title: 'Core & Abdômen blindado', category: 'Em casa', duration: 25, level: 'Iniciante', calories: 190, description: 'Fortalecimento do abdômen e lombar sem nenhum equipamento necessário.', exercises: ['Abdominal infra (3x15)', 'Prancha lateral (3x30s cada lado)', 'Bicycle crunch (3x20)', 'Superman lombar (3x12)'] },
  { id: 'hiit-burn', title: 'HIIT queima extrema', category: 'Cardio', duration: 25, level: 'Avançado', calories: 380, description: 'Circuito metabólico com intervalos curtos de descanso para acelerar o metabolismo.', exercises: ['Burpees (40s ativo / 20s descanso)', 'Mountain climbers (40s / 20s)', 'Jumping jacks com agachamento (40s / 20s)', 'High knees corrida estacionária (40s / 20s)'] },
  { id: 'pernas-gluteos', title: 'Pernas & Glúteos em foco', category: 'Força', duration: 40, level: 'Intermediário', calories: 310, description: 'Foco total no membro inferior: quadríceps, posteriores e estabilidade de joelhos.', exercises: ['Afundo estático (3x12 cada perna)', 'Elevação pélvica no chão (3x15)', 'Agachamento búlgaro (3x10 cada)', 'Panturrilha em pé (4x20)'] }
];

// ==============================================================================
// 1. MÓDULO DE AUTENTICAÇÃO E SEGURANÇA
// ==============================================================================

// POST /api/auth/register
app.post('/api/auth/register', async (req, res, next) => {
  try {
    const { name, nome, email, password, senha } = req.body;
    const finalName = (name || nome || '').trim();
    const finalEmail = (email || '').trim().toLowerCase();
    const finalPassword = password || senha;

    if (!finalName || !finalEmail || !finalPassword || finalPassword.length < 6) {
      return res.status(400).json({ error: 'Informe nome, e-mail e uma senha de no mínimo 6 caracteres.' });
    }

    const users = readJson(usersFile, []);
    if (users.some(u => u.email === finalEmail)) {
      return res.status(409).json({ error: 'Este e-mail já está cadastrado no Fit.IA.' });
    }

    const salt = await bcrypt.genSalt(10);
    const senhaHash = await bcrypt.hash(finalPassword, salt);
    const newUser = {
      id: crypto.randomUUID(),
      nome: finalName,
      name: finalName,
      email: finalEmail,
      senhaHash,
      dataCriacao: new Date().toISOString()
    };

    users.push(newUser);
    saveJson(usersFile, users);

    // Cria perfil biométrico padrão para o novo usuário
    const profiles = readJson(profilesFile, {});
    profiles[newUser.id] = {
      idade: 25,
      peso: 70,
      altura: 1.75,
      sexo: 'Não informado',
      nivelAtividade: 'Iniciante',
      objetivo: 'Saúde e Constância',
      restricoesAlimentares: 'Nenhuma',
      atualizadoEm: new Date().toISOString()
    };
    saveJson(profilesFile, profiles);

    const token = jwt.sign(
      { id: newUser.id, name: newUser.nome, email: newUser.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.cookie('fitia_session', token, {
      httpOnly: true,
      path: '/',
      sameSite: 'Lax',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    return res.status(201).json({
      message: 'Usuário cadastrado com sucesso!',
      user: { id: newUser.id, name: newUser.nome, email: newUser.email },
      token
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/login
app.post('/api/auth/login', async (req, res, next) => {
  try {
    const { email, password, senha } = req.body;
    const finalEmail = String(email || '').trim().toLowerCase();
    const finalPassword = String(password || senha || '');

    const users = readJson(usersFile, []);
    const user = users.find(u => u.email === finalEmail);

    if (!user) {
      return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
    }

    // Validação compatível com bcrypt
    let isValid = false;
    if (user.senhaHash) {
      isValid = await bcrypt.compare(finalPassword, user.senhaHash);
    } else if (user.password && user.salt) {
      // Compatibilidade retroativa scrypt
      const computed = crypto.scryptSync(finalPassword, user.salt, 64).toString('hex');
      isValid = computed === user.password;
    }

    if (!isValid) {
      return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
    }

    const token = jwt.sign(
      { id: user.id, name: user.nome || user.name, email: user.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.cookie('fitia_session', token, {
      httpOnly: true,
      path: '/',
      sameSite: 'Lax',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    return res.status(200).json({
      message: 'Login realizado com sucesso.',
      user: { id: user.id, name: user.nome || user.name, email: user.email },
      token
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/forgot-password
app.post('/api/auth/forgot-password', (req, res) => {
  const { email } = req.body;
  return res.json({
    message: 'Se o e-mail informado estiver cadastrado, enviamos um link de recuperação.',
    email: email ? String(email).trim() : null
  });
});

// GET /api/auth/me
app.get('/api/auth/me', authenticateToken, (req, res) => {
  const users = readJson(usersFile, []);
  const user = users.find(u => u.id === req.user.id);
  if (!user) {
    return res.status(404).json({ error: 'Usuário não encontrado.' });
  }
  return res.json({
    user: { id: user.id, name: user.nome || user.name, email: user.email }
  });
});

// POST /api/auth/logout
app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('fitia_session', { path: '/' });
  return res.json({ ok: true, message: 'Sessão encerrada com sucesso.' });
});

// ==============================================================================
// 2. GERENCIAMENTO DE PERFIL DO USUÁRIO
// ==============================================================================

// GET /api/user/profile
app.get('/api/user/profile', authenticateToken, (req, res) => {
  const profiles = readJson(profilesFile, {});
  const userProfile = profiles[req.user.id] || {
    idade: 28,
    peso: 76.5,
    altura: 1.78,
    sexo: 'Masculino',
    nivelAtividade: 'Moderado',
    objetivo: 'Hipertrofia e Constância',
    restricoesAlimentares: 'Nenhuma'
  };
  return res.json(userProfile);
});

// PUT /api/user/profile
app.put('/api/user/profile', authenticateToken, (req, res) => {
  const { idade, peso, altura, sexo, nivelAtividade, objetivo, restricoesAlimentares } = req.body;
  const profiles = readJson(profilesFile, {});

  const current = profiles[req.user.id] || {};
  const updated = {
    ...current,
    idade: idade !== undefined ? Number(idade) : current.idade || 25,
    peso: peso !== undefined ? Number(peso) : current.peso || 70,
    altura: altura !== undefined ? Number(altura) : current.altura || 1.75,
    sexo: sexo || current.sexo || 'Não informado',
    nivelAtividade: nivelAtividade || current.nivelAtividade || 'Moderado',
    objetivo: objetivo || current.objetivo || 'Hipertrofia e Constância',
    restricoesAlimentares: restricoesAlimentares !== undefined ? restricoesAlimentares : (current.restricoesAlimentares || 'Nenhuma'),
    atualizadoEm: new Date().toISOString()
  };

  profiles[req.user.id] = updated;
  saveJson(profilesFile, profiles);

  return res.json({
    message: 'Perfil biométrico atualizado com sucesso!',
    profile: updated
  });
});

// ==============================================================================
// 3. MÓDULO PERSONAL IA (CHAT EM TEMPO REAL)
// ==============================================================================

const SYSTEM_PROMPT_COACH = `Você é o "Fit.IA Coach", Personal Trainer Especialista e Nutricionista Esportivo.
Diretrizes fundamentais:
- Responda em Português do Brasil com tom encorajador, técnico e objetivo.
- Oriente sobre postura biomecânica correta, progressão de carga segura e consistência.
- Se o usuário pedir substituição de exercício, dê a melhor alternativa e o porquê anatômico.
- Use listas com marcadores claros e dê respostas práticas.`;

app.post('/api/ia/chat', authenticateToken, async (req, res, next) => {
  try {
    const { message, history } = req.body;
    if (!message || !String(message).trim()) {
      return res.status(400).json({ error: 'A mensagem do usuário é obrigatória.' });
    }

    const profiles = readJson(profilesFile, {});
    const userProfile = profiles[req.user.id] || {};

    const profileContext = `
[CONTEXTO DO ALUNO FIT.IA]
- Nome: ${req.user.name || 'Aluno'}
- Idade: ${userProfile.idade || 25} anos
- Peso: ${userProfile.peso ? userProfile.peso + 'kg' : 'Não informado'}
- Altura: ${userProfile.altura ? userProfile.altura + 'm' : 'Não informada'}
- Nível: ${userProfile.nivelAtividade || 'Intermediário'}
- Objetivo Principal: ${userProfile.objetivo || 'Hipertrofia e Constância'}
- Restrições/Dores: ${userProfile.restricoesAlimentares || 'Nenhuma'}
`;

    // 1. Tenta integração com Google Gemini se configurado
    if (process.env.GEMINI_API_KEY && GoogleGenerativeAI) {
      try {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({
          model: process.env.AI_MODEL || 'gemini-1.5-flash',
          systemInstruction: SYSTEM_PROMPT_COACH + '\n' + profileContext
        });

        const formattedHistory = Array.isArray(history)
          ? history.map(item => ({
              role: item.role === 'assistant' ? 'model' : 'user',
              parts: [{ text: item.content || item.text || '' }]
            }))
          : [];

        const chat = model.startChat({ history: formattedHistory });
        const result = await chat.sendMessage(String(message));
        const aiResponse = result.response.text();

        // Salva nos logs de chat
        saveChatLog(req.user.id, message, aiResponse);
        return res.json({ response: aiResponse, provider: 'google-gemini' });
      } catch (geminiErr) {
        console.warn('[Gemini API Warning]:', geminiErr.message);
      }
    }

    // 2. Tenta integração com OpenAI se configurado
    if (process.env.OPENAI_API_KEY && OpenAI) {
      try {
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        const messages = [
          { role: 'system', content: SYSTEM_PROMPT_COACH + '\n' + profileContext },
          ...(Array.isArray(history) ? history.map(h => ({ role: h.role, content: h.content })) : []),
          { role: 'user', content: String(message) }
        ];

        const completion = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages,
          temperature: 0.7
        });

        const aiResponse = completion.choices[0].message.content;
        saveChatLog(req.user.id, message, aiResponse);
        return res.json({ response: aiResponse, provider: 'openai' });
      } catch (openAiErr) {
        console.warn('[OpenAI API Warning]:', openAiErr.message);
      }
    }

    // 3. Mecanismo de Inteligência Esportiva Local (Fallback Autônomo)
    const localResponse = generateLocalPersonalCoachResponse(message, userProfile);
    saveChatLog(req.user.id, message, localResponse);

    return res.json({
      response: localResponse,
      provider: 'fitia-sports-engine'
    });
  } catch (err) {
    next(err);
  }
});

function saveChatLog(userId, userMessage, aiResponse) {
  const logs = readJson(chatlogsFile, {});
  const userLogs = logs[userId] || [];
  userLogs.push(
    { role: 'user', content: userMessage, timestamp: new Date().toISOString() },
    { role: 'assistant', content: aiResponse, timestamp: new Date().toISOString() }
  );
  logs[userId] = userLogs.slice(-40); // Mantém últimas 40 mensagens
  saveJson(chatlogsFile, logs);
}

function generateLocalPersonalCoachResponse(msg, profile) {
  const text = msg.toLowerCase();
  const obj = profile.objetivo || 'Hipertrofia e Constância';

  if (text.includes('agachamento') || text.includes('perna')) {
    return `Olá! Analisando seu perfil focado em **${obj}**:
Para aperfeiçoar seu agachamento:
1. **Posição dos pés**: Mantenha na largura dos ombros com pontas levemente apontadas para fora (15° a 30°).
2. **Biomecânica**: Inicie o movimento flexionando o quadril para trás antes dos joelhos, mantendo o abdômen contraído (*bracing*).
3. **Profundidade**: Busque passar da linha paralela de 90° se sua mobilidade de tornozelo permitir.
4. **Respiração**: Inspire no topo, desça retendo o ar e expire com força na subida.

Quer que eu monte uma série de ativação de glúteos e mobilidade de tornozelo antes do seu próximo treino de pernas?`;
  }

  if (text.includes('supino') || text.includes('peito')) {
    return `Excelente dúvida para o seu desenvolvimento de peitoral!
Dicas cruciais para o supino:
- **Retração Escapular**: Mantenha as escápulas "travadas" para trás e para baixo durante toda a série.
- **Arco Lombar Natural**: Apoie os glúteos e a parte superior das costas com firmeza no banco.
- **Pegada**: Não quebre os punhos para trás; a barra deve ficar sobre o osso do antebraço.
- **Alternativa para ombros sensíveis**: O **Supino com Halteres** em pegada semi-pronada (45°) alivia a articulação do ombro com excelente ativação de peitoral.`;
  }

  if (text.includes('dieta') || text.includes('comer') || text.includes('proteina') || text.includes('pre treino') || text.includes('pos treino')) {
    const peso = profile.peso || 75;
    const protGramas = Math.round(peso * 2.0);
    return `Para o seu objetivo de **${obj}** com peso de **${peso}kg**:
- **Meta Proteica**: Busque atingir aproximadamente **${protGramas}g de proteína por dia** (divididos em 4 refeições de ~${Math.round(protGramas / 4)}g).
- **Pré-Treino (60-90 min antes)**: Carboidratos complexos + proteína de rápida digestão (ex: banana com aveia e iogurte/whey).
- **Hidratação**: Calcule 35ml a 40ml de água por quilo corporal (~${(peso * 0.038).toFixed(1)}L por dia).

Você pode clicar em **"Gerar Dieta Completa"** no menu para calcularmos todas as suas refeições!`;
  }

  return `Excelente ponto! Como seu Personal Fit.IA, meu conselho para o seu perfil (${profile.peso || 75}kg, focado em **${obj}**):
1. **Constância é a chave**: Mais vale 4 treinos bem feitos e consistentes por semana do que picos de intensidade sem continuidade.
2. **Descanso**: Mantenha de 60 a 90 segundos entre séries de força moderada para regenerar as reservas de ATP-CP.
3. **Escuta ativa do corpo**: Priorize sempre a forma limpa antes de progredir carga.

Como posso te ajudar especificamente no treino de hoje? (Pergunte sobre exercícios, cargas, aquecimento ou nutrição!)`;
}

// ==============================================================================
// 4. MÓDULO GERADOR DE TREINOS E DIETAS
// ==============================================================================

// POST /api/ia/gerar-treino
app.post('/api/ia/gerar-treino', authenticateToken, async (req, res, next) => {
  try {
    const profiles = readJson(profilesFile, {});
    const profile = profiles[req.user.id] || req.body;

    const workoutPlan = {
      id: crypto.randomUUID(),
      titulo: `Plano Fit.IA Personalizado — ${profile.objetivo || 'Hipertrofia & Força'}`,
      frequenciaSemanal: '4 a 5 sessões semanais',
      nivel: profile.nivelAtividade || 'Intermediário',
      divisao: [
        'Treino A - Peitoral, Ombros e Tríceps (Push)',
        'Treino B - Dorsais, Deltoide Posterior e Bíceps (Pull)',
        'Treino C - Quadríceps, Posteriores e Panturrilha (Legs)',
        'Treino D - Abdômen, Core & Mobilidade'
      ],
      rotina: [
        {
          dia: 'Treino A (Push)',
          foco: 'Peito, Deltoide e Tríceps',
          exercicios: [
            { nome: 'Supino Reto com Halteres', series: 4, repeticoes: '8-10', descanso: '90s', obs: 'Controle de 3s na descida excêntrica' },
            { nome: 'Supino Inclinado com Halteres (30°)', series: 3, repeticoes: '10-12', descanso: '60s', obs: 'Foco no feixe clavicular do peitoral' },
            { nome: 'Desenvolvimento Militar com Halteres', series: 3, repeticoes: '10', descanso: '60s', obs: 'Manter abdômen firme e coluna estável' },
            { nome: 'Elevação Lateral na Polia ou Halter', series: 4, repeticoes: '12-15', descanso: '45s', obs: 'Movimento controlado sem impulso' },
            { nome: 'Tríceps Corda na Polia', series: 3, repeticoes: '12-15', descanso: '45s', obs: 'Pico de contração de 1s embaixo' }
          ]
        },
        {
          dia: 'Treino B (Pull)',
          foco: 'Costas e Bíceps',
          exercicios: [
            { nome: 'Puxada Frontal Aberta', series: 4, repeticoes: '10-12', descanso: '75s', obs: 'Puxar com os cotovelos apontando para o chão' },
            { nome: 'Remada Curvada com Barra ou Halter', series: 4, repeticoes: '8-10', descanso: '90s', obs: 'Coluna neutra, cotovelos junto ao corpo' },
            { nome: 'Crucifixo Invertido com Halteres', series: 3, repeticoes: '15', descanso: '45s', obs: 'Foco na porção posterior do ombro' },
            { nome: 'Rosca Direta com Barra W', series: 3, repeticoes: '10-12', descanso: '60s', obs: 'Não balançar o tronco' },
            { nome: 'Rosca Martelo com Halteres', series: 3, repeticoes: '12', descanso: '45s', obs: 'Excelente para braquial e antebraço' }
          ]
        },
        {
          dia: 'Treino C (Legs)',
          foco: 'Pernas Completas',
          exercicios: [
            { nome: 'Agachamento Livre com Barra', series: 4, repeticoes: '8-10', descanso: '90s', obs: 'Mobilidade de quadril ativa' },
            { nome: 'Leg Press 45°', series: 4, repeticoes: '10-12', descanso: '75s', obs: 'Não travar joelhos na extensão máxima' },
            { nome: 'Mesa Flexora ou Stiff', series: 3, repeticoes: '10-12', descanso: '60s', obs: 'Foco no posterior de coxa' },
            { nome: 'Elevação Pélvica', series: 3, repeticoes: '12-15', descanso: '60s', obs: 'Aperto forte no glúteo no topo' },
            { nome: 'Panturrilha em Pé na Máquina', series: 4, repeticoes: '15-20', descanso: '45s', obs: 'Amplitude máxima com pausa embaixo' }
          ]
        }
      ],
      dataCriacao: new Date().toISOString()
    };

    // Persiste o plano gerado
    const plans = readJson(plansFile, {});
    const userPlans = plans[req.user.id] || [];
    userPlans.unshift({ tipo: 'treino', plano: workoutPlan, dataCriacao: new Date().toISOString() });
    plans[req.user.id] = userPlans.slice(0, 10);
    saveJson(plansFile, plans);

    return res.json(workoutPlan);
  } catch (err) {
    next(err);
  }
});

// POST /api/ia/gerar-dieta
app.post('/api/ia/gerar-dieta', authenticateToken, async (req, res, next) => {
  try {
    const profiles = readJson(profilesFile, {});
    const profile = profiles[req.user.id] || req.body;

    const peso = Number(profile.peso) || 75;
    const altura = Number(profile.altura) || 1.78;
    const idade = Number(profile.idade) || 28;
    const objetivo = profile.objetivo || 'Hipertrofia e Constância';

    // Cálculo Harris-Benedict revisado (Mifflin-St Jeor)
    const tmb = Math.round(10 * peso + 6.25 * (altura * 100) - 5 * idade + 5);
    const fatorAtividade = 1.45; // Moderado
    const tdee = Math.round(tmb * fatorAtividade);

    let caloriasMeta = tdee;
    if (objetivo.toLowerCase().includes('emagrecimento') || objetivo.toLowerCase().includes('queima')) {
      caloriasMeta = Math.round(tdee - 450); // Déficit moderado
    } else {
      caloriasMeta = Math.round(tdee + 350); // Superávit limpo
    }

    const protGramas = Math.round(peso * 2.0);
    const gordGramas = Math.round(peso * 0.9);
    const caloriasRestantes = caloriasMeta - (protGramas * 4 + gordGramas * 9);
    const carbGramas = Math.max(100, Math.round(caloriasRestantes / 4));

    const dietPlan = {
      id: crypto.randomUUID(),
      titulo: `Plano Nutricional Inteligente — ${objetivo}`,
      dadosMetabolicos: {
        tmb: tmb + ' kcal',
        gastoTotalDiario: tdee + ' kcal',
        metaCaloricaDiaria: caloriasMeta + ' kcal'
      },
      macronutrientes: {
        proteinas: `${protGramas}g (${Math.round((protGramas * 4 / caloriasMeta) * 100)}%)`,
        carboidratos: `${carbGramas}g (${Math.round((carbGramas * 4 / caloriasMeta) * 100)}%)`,
        gorduras: `${gordGramas}g (${Math.round((gordGramas * 9 / caloriasMeta) * 100)}%)`
      },
      hidratacao: `${(peso * 0.04).toFixed(1)} Litros de água/dia`,
      refeicoes: [
        {
          refeicao: 'Café da Manhã (Desjejum)',
          horario: '07:30',
          caloriasAprox: Math.round(caloriasMeta * 0.22) + ' kcal',
          itens: [
            '3 ovos inteiros mexidos com um fio de azeite',
            '2 fatias de pão 100% integral',
            '1 banana média com 20g de aveia em flocos',
            'Café preto puro ou chá sem açúcar'
          ]
        },
        {
          refeicao: 'Almoço (Refeição Principal)',
          horario: '12:30',
          caloriasAprox: Math.round(caloriasMeta * 0.35) + ' kcal',
          itens: [
            '160g de peito de frango grelhado ou filé de tilápia',
            '180g de arroz integral ou batata doce cozida',
            '1 concha rasa de feijão (100g)',
            'Prato farto de salada verde (alface, rúcula, tomate, pepino)',
            '1 colher de sopa de azeite de oliva extravirgem'
          ]
        },
        {
          refeicao: 'Lanche da Tarde (Pré-Treino)',
          horario: '16:00',
          caloriasAprox: Math.round(caloriasMeta * 0.18) + ' kcal',
          itens: [
            '1 pote de iogurte natural desnatado (160g)',
            '30g de Whey Protein concentrado ou isolado',
            '1 maçã picada ou 100g de morangos'
          ]
        },
        {
          refeicao: 'Jantar (Pós-Treino & Recuperação)',
          horario: '20:00',
          caloriasAprox: Math.round(caloriasMeta * 0.25) + ' kcal',
          itens: [
            '150g de carne magra moída (patinho) ou filé de frango',
            '160g de mandioca ou batata inglesa assada',
            'Legumes grelhados (brócolis, cenoura, abobrinha à vontade)'
          ]
        }
      ],
      dataCriacao: new Date().toISOString()
    };

    const plans = readJson(plansFile, {});
    const userPlans = plans[req.user.id] || [];
    userPlans.unshift({ tipo: 'dieta', plano: dietPlan, dataCriacao: new Date().toISOString() });
    plans[req.user.id] = userPlans.slice(0, 10);
    saveJson(plansFile, plans);

    return res.json(dietPlan);
  } catch (err) {
    next(err);
  }
});

// ==============================================================================
// 5. CHECK-INS E ROTAS AUXILIARES
// ==============================================================================

app.get('/api/workouts', (req, res) => res.json(workouts));

app.get('/api/checkins', authenticateToken, (req, res) => {
  const all = readJson(checkinsFile, {});
  return res.json(all[req.user.id] || []);
});

app.put('/api/checkins', authenticateToken, (req, res) => {
  const { date, trained } = req.body;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'Data no formato YYYY-MM-DD é obrigatória.' });
  }

  const all = readJson(checkinsFile, {});
  const setDates = new Set(all[req.user.id] || []);
  if (trained) {
    setDates.add(date);
  } else {
    setDates.delete(date);
  }

  all[req.user.id] = [...setDates].sort();
  saveJson(checkinsFile, all);
  return res.json(all[req.user.id]);
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    service: 'Fit.IA Server',
    environment: process.env.NODE_ENV || 'development',
    time: new Date().toISOString()
  });
});

// Servir frontend estático
app.use(express.static(ROOT));

// Tratamento de Erros Global
app.use((err, req, res, next) => {
  console.error('[Fit.IA Server Error]:', err);
  const status = err.statusCode || 500;
  return res.status(status).json({
    error: err.message || 'Erro interno no servidor.',
    code: err.code || 'INTERNAL_SERVER_ERROR'
  });
});

app.listen(PORT, () => {
  console.log(`\n==================================================`);
  console.log(`🚀 Fit.IA Back-end rodando em http://localhost:${PORT}`);
  console.log(`⚙️  API RESTful & Personal IA ativos com sucesso`);
  console.log(`==================================================\n`);
});

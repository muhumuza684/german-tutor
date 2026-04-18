/* ═══════════════════════════════════════════════════════
   German Tutor – Frontend Application
   ═══════════════════════════════════════════════════════ */

const LANG = 'german';

// ─── State ───────────────────────────────────────────────────────────────────
let state = {
  view: 'learn',
  currentLesson: null,
  currentStory: null,
  currentSong: null,
  data: { lessons: [], phrases: [], stories: [], songs: [] },
  phraseFilter: 'All',
  chatHistory: []
};

// ─── DOM refs ─────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const loginScreen  = $('login-screen');
const loginEmail   = $('login-email');
const loginBtn     = $('login-btn');
const loginError   = $('login-error');
const appEl        = $('app');
const userEmailEl  = $('user-email');
const userAvatarEl = $('user-avatar');

// ─── PROGRESS TRACKING ────────────────────────────────────────────────────────
function getProgress() {
  try {
    return JSON.parse(localStorage.getItem('lesson-progress') || '{}');
  } catch { return {}; }
}

function saveProgress(lessonIdx) {
  const progress = getProgress();
  progress[lessonIdx] = true;
  localStorage.setItem('lesson-progress', JSON.stringify(progress));
}

function isComplete(lessonIdx) {
  return !!getProgress()[lessonIdx];
}

function markComplete(lessonIdx) {
  saveProgress(lessonIdx);
  renderLearn();
}

window.markComplete = markComplete;

// ─── Init ─────────────────────────────────────────────────────────────────────
async function init() {
  const res = await fetch('/api/session').then(r => r.json());
  if (res.loggedIn) showApp(res.email);
}

// ─── Auth ─────────────────────────────────────────────────────────────────────
loginBtn.addEventListener('click', async () => {
  const email = loginEmail.value.trim();
  if (!email) { loginError.textContent = 'Please enter your email.'; return; }
  const res = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email })
  }).then(r => r.json());
  if (res.error) { loginError.textContent = res.error; return; }
  showApp(res.email);
});

loginEmail.addEventListener('keydown', e => { if (e.key === 'Enter') loginBtn.click(); });

$('logout-btn').addEventListener('click', async () => {
  await fetch('/api/logout', { method: 'POST' });
  location.reload();
});

function showApp(email) {
  loginScreen.style.display = 'none';
  appEl.classList.add('visible');
  userEmailEl.textContent = email;
  userAvatarEl.textContent = email[0].toUpperCase();
  loadAllData();
  navigate('learn');
}

// ─── Data Loading ─────────────────────────────────────────────────────────────
async function loadAllData() {
  const types = ['lessons', 'phrases', 'stories', 'songs'];
  await Promise.all(types.map(async t => {
    const res = await fetch(`/api/language/${LANG}/${t}`).then(r => r.json());
    if (res.data) state.data[t] = res.data;
  }));
  renderCurrentView();
}

// ─── Navigation ───────────────────────────────────────────────────────────────
function navigate(view) {
  state.view = view;
  state.currentLesson = null;
  state.currentStory = null;
  state.currentSong = null;

  const PAGE_META = {
    learn:      { title: 'Lessons',    sub: 'Structured German vocabulary and phrases' },
    chat:       { title: 'Translator', sub: 'Type German → get English, or English → get German' },
    phrases:    { title: 'Phrase Book',sub: 'Essential German phrases for everyday situations' },
    stories:    { title: 'Stories',    sub: 'Read real-world stories in simple German' },
    songs:      { title: 'Songs',      sub: 'Learn through simple, repetitive German lyrics' },
    flashcards: { title: 'Flashcards', sub: 'Flip cards to practise German → English' }
  };

  const meta = PAGE_META[view] || {};
  $('page-title').textContent = meta.title || '';
  $('page-sub').textContent   = meta.sub || '';

  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.view === view);
  });

  renderCurrentView();
}

document.querySelectorAll('.nav-item').forEach(el => {
  el.addEventListener('click', () => navigate(el.dataset.view));
});

// ─── Render Router ────────────────────────────────────────────────────────────
function renderCurrentView() {
  document.querySelectorAll('.view').forEach(v => {
    v.classList.remove('active');
    v.style.display = 'none';
  });
  const viewEl = $(`${state.view}-view`);
  if (viewEl) {
    viewEl.classList.add('active');
    viewEl.style.display = 'flex';
  }
  const renders = {
    learn: renderLearn, chat: renderChat,
    phrases: renderPhrases, stories: renderStories, songs: renderSongs,
    flashcards: renderFlashcards
  };
  if (renders[state.view]) renders[state.view]();
}

// ─── LEARN ────────────────────────────────────────────────────────────────────
function renderLearn() {
  const container = $('learn-content');

  if (state.currentLesson !== null) {
    const lesson = state.data.lessons[state.currentLesson];
    const done = isComplete(state.currentLesson);
    container.innerHTML = `
      <button class="back-btn" onclick="goBack()">← Back to Lessons</button>
      <h3 style="font-family:var(--font-head);font-size:1.5rem;margin-bottom:6px;">${lesson.title}</h3>
      <p style="color:var(--muted);margin-bottom:16px;font-size:0.9rem;">${lesson.sentences.length} sentences</p>
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:28px;">
        <button class="quiz-btn" onclick="startQuiz(${state.currentLesson})">🧠 Take Quiz</button>
        <button class="mark-complete-btn ${done ? 'done' : ''}" style="width:auto;padding:10px 24px;"
          onclick="${done ? '' : `markComplete(${state.currentLesson})`}">
          ${done ? '✅ Completed' : '☐ Mark as Complete'}
        </button>
      </div>
      <div class="sentence-list">
        ${lesson.sentences.map((s, i) => `
          <div class="sentence-item fade-in" style="animation-delay:${i * 0.04}s">
            <span class="sentence-num">${i + 1}</span>
            <div>
              <div class="sentence-german">
                ${s.german}
                <button class="speak-btn" onclick="speakGerman('${s.german.replace(/'/g, "\\'")}', this)">🔊</button>
              </div>
              <div class="sentence-english">${s.english}</div>
            </div>
          </div>
        `).join('')}
      </div>`;
    return;
  }

  // Lesson grid with progress summary
  const prog = getProgress();
  const completedCount = Object.keys(prog).length;
  const totalLessons = state.data.lessons.length;
  const overallPct = totalLessons ? Math.round((completedCount / totalLessons) * 100) : 0;

  container.innerHTML = `
    <div class="progress-summary">
      <div>
        <div class="progress-summary-count">${completedCount} / ${totalLessons}</div>
        <div class="progress-summary-label">lessons complete</div>
      </div>
      <div class="progress-overall-bar">
        <div class="progress-overall-fill" style="width:${overallPct}%"></div>
      </div>
      <div style="font-size:0.95rem;font-weight:700;color:var(--gold)">${overallPct}%</div>
    </div>
    <div class="lesson-grid">
      ${state.data.lessons.map((l, i) => {
        const completed = !!prog[i];
        return `
        <div class="lesson-card ${completed ? 'completed' : ''} fade-in" style="animation-delay:${i * 0.05}s" onclick="openLesson(${i})">
          ${completed ? '<span class="done-badge">✅ Done</span>' : ''}
          <div class="lesson-num">Lesson ${l.id}</div>
          <div class="lesson-title">${l.title}</div>
          <div class="lesson-count">${l.sentences.length} sentences</div>
          <span class="lesson-badge">${l.level}</span>
          <div class="lesson-progress-bar">
            <div class="lesson-progress-fill" style="width:${completed ? 100 : 0}%"></div>
          </div>
        </div>`;
      }).join('')}
    </div>`;
}

function openLesson(idx) { state.currentLesson = idx; renderLearn(); }

function goBack() {
  state.currentLesson = null;
  state.currentStory = null;
  state.currentSong = null;
  renderCurrentView();
}

// ─── PHRASES ──────────────────────────────────────────────────────────────────
function renderPhrases() {
  const container = $('phrases-content');
  const phrases = state.data.phrases;
  const categories = ['All', ...new Set(phrases.map(p => p.category))];
  const filtered = state.phraseFilter === 'All'
    ? phrases : phrases.filter(p => p.category === state.phraseFilter);

  container.innerHTML = `
    <div class="phrase-filter">
      ${categories.map(c => `
        <button class="filter-btn ${state.phraseFilter === c ? 'active' : ''}"
                onclick="setPhraseCat('${c}')">${c}</button>
      `).join('')}
    </div>
    <div class="phrase-table">
      ${filtered.map((p, i) => `
        <div class="phrase-row fade-in" style="animation-delay:${i * 0.03}s">
          <div>
            <div class="phrase-cat">${p.category}</div>
            <div class="phrase-german">
              ${p.german}
              <button class="speak-btn" onclick="speakGerman('${p.german.replace(/'/g, "\\'")}', this)">🔊</button>
            </div>
          </div>
          <div class="phrase-english">${p.english}</div>
        </div>
      `).join('')}
    </div>`;
}

function setPhraseCat(cat) { state.phraseFilter = cat; renderPhrases(); }

// ─── STORIES ──────────────────────────────────────────────────────────────────
function renderStories() {
  const container = $('stories-content');
  const stories = state.data.stories;
  if (state.currentStory !== null) {
    const s = stories[state.currentStory];
    container.innerHTML = `
      <button class="back-btn" onclick="goBack()">← Back to Stories</button>
      <div class="story-content">
        <div class="story-reader-title">${s.title}</div>
        <div class="story-meta">
          <span>📚 ${s.topic}</span><span>🎯 ${s.level}</span>
          <span>📖 ${s.content.length} sentences</span>
        </div>
        ${s.content.map((line, i) => `
          <div class="story-sentence fade-in" style="animation-delay:${i * 0.04}s">
            <div class="de">
              ${line.german}
              <button class="speak-btn" onclick="speakGerman('${line.german.replace(/'/g, "\\'")}', this)">🔊</button>
            </div>
            <div class="en">${line.english}</div>
          </div>
        `).join('')}
      </div>`;
    return;
  }
  container.innerHTML = `
    <div class="story-grid">
      ${stories.map((s, i) => `
        <div class="story-card fade-in" style="animation-delay:${i * 0.04}s" onclick="openStory(${i})">
          <div class="story-topic">${s.topic}</div>
          <div class="story-title">${s.title}</div>
          <div class="story-preview">${s.content[0].german}</div>
          <div class="story-length">⟳ ${s.content.length} sentences</div>
        </div>
      `).join('')}
    </div>`;
}

function openStory(idx) { state.currentStory = idx; renderStories(); }

// ─── SONGS ────────────────────────────────────────────────────────────────────
const SONG_ICONS = ['🎵', '🎶', '🎸', '🥁', '🎹'];

function renderSongs() {
  const container = $('songs-content');
  const songs = state.data.songs;
  if (state.currentSong !== null) {
    const s = songs[state.currentSong];
    container.innerHTML = `
      <button class="back-btn" onclick="goBack()">← Back to Songs</button>
      <h3 style="font-family:var(--font-head);font-size:1.6rem;margin-bottom:6px;">${s.title}</h3>
      <p style="color:var(--muted);margin-bottom:28px;font-size:0.88rem;">🎵 ${s.topic} &nbsp;|&nbsp; ${s.lyrics.length} lines</p>
      <div class="lyric-block">
        ${s.lyrics.map((line, i) => `
          <div class="lyric-line fade-in" style="animation-delay:${i * 0.05}s">
            <div class="lyric-de">
              ${line.german}
              <button class="speak-btn" onclick="speakGerman('${line.german.replace(/'/g, "\\'")}', this)">🔊</button>
            </div>
            <div class="lyric-en">${line.english}</div>
          </div>
        `).join('')}
      </div>`;
    return;
  }
  container.innerHTML = `
    <div class="song-grid">
      ${songs.map((s, i) => `
        <div class="song-card fade-in" style="animation-delay:${i * 0.05}s" onclick="openSong(${i})">
          <div class="song-icon">${SONG_ICONS[i % SONG_ICONS.length]}</div>
          <div class="song-topic-tag">${s.topic}</div>
          <div class="song-title">${s.title}</div>
          <div class="song-lines-count">${s.lyrics.length} lines</div>
        </div>
      `).join('')}
    </div>`;
}

function openSong(idx) { state.currentSong = idx; renderSongs(); }

// ─── CHAT (Translator) ────────────────────────────────────────────────────────
function renderChat() {
  if (state.chatHistory.length === 0) {
    state.chatHistory.push({
      role: 'bot',
      type: 'welcome',
      text: 'Hallo! 👋 I am your German translator.\n\n• Type German → I give you English\n• Type English → I give you German\n\nTry: "Ich lerne Deutsch" or "How are you?"'
    });
  }
  rebuildChatUI();
}

function rebuildChatUI() {
  const messagesEl = $('chat-messages');
  messagesEl.innerHTML = state.chatHistory.map(renderMsg).join('');
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function renderMsg(msg) {
  if (msg.role === 'user') {
    return `
      <div class="chat-msg user">
        <div class="msg-avatar">👤</div>
        <div class="msg-body">${escHtml(msg.text)}</div>
      </div>`;
  }
  if (msg.type === 'welcome') {
    return `
      <div class="chat-msg bot">
        <div class="msg-avatar">DE</div>
        <div class="msg-body">${msg.text.replace(/\n/g, '<br>').replace(/• /g, '&bull; ')}</div>
      </div>`;
  }
  const speakText = (msg.speak || msg.translation || '').replace(/'/g, "\\'");
  return `
    <div class="chat-msg bot">
      <div class="msg-avatar">DE</div>
      <div class="msg-body">
        <div class="msg-label">${escHtml(msg.direction || '')}</div>
        <p class="msg-corrected">
          ${escHtml(msg.translation || '')}
          <button class="speak-btn" onclick="speakGerman('${speakText}', this)">🔊</button>
        </p>
      </div>
    </div>`;
}

$('chat-send').addEventListener('click', sendChat);
$('chat-input').addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); }
});

async function sendChat() {
  const input = $('chat-input');
  const text = input.value.trim();
  if (!text) return;

  state.chatHistory.push({ role: 'user', text });
  input.value = '';
  rebuildChatUI();

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text })
    }).then(r => r.json());

    if (res.error) {
      state.chatHistory.push({ role: 'bot', type: 'welcome', text: res.error });
    } else {
      state.chatHistory.push({ role: 'bot', ...res });
    }
    rebuildChatUI();
  } catch (err) {
    state.chatHistory.push({ role: 'bot', type: 'welcome', text: 'Something went wrong. Please try again.' });
    rebuildChatUI();
  }
}

// ─── TEXT TO SPEECH ───────────────────────────────────────────────────────────
function speakGerman(text, btn) {
  window.speechSynthesis.cancel();
  document.querySelectorAll('.speak-btn').forEach(b => b.classList.remove('speaking'));
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'de-DE';
  utterance.rate = 0.9;
  utterance.pitch = 1;
  if (btn) {
    btn.classList.add('speaking');
    utterance.onend = () => btn.classList.remove('speaking');
    utterance.onerror = () => btn.classList.remove('speaking');
  }
  window.speechSynthesis.speak(utterance);
}

// ─── QUIZ MODE ────────────────────────────────────────────────────────────────
let quiz = {
  questions: [],
  current: 0,
  score: 0,
  lessonIdx: null
};

function shuffle(arr) {
  return [...arr].sort(() => Math.random() - 0.5);
}

function startQuiz(lessonIdx) {
  const lesson = state.data.lessons[lessonIdx];
  const sentences = shuffle(lesson.sentences).slice(0, 10);

  quiz.lessonIdx = lessonIdx;
  quiz.current = 0;
  quiz.score = 0;
  quiz.questions = sentences.map(s => {
    const wrong = shuffle(
      lesson.sentences.filter(x => x.english !== s.english)
    ).slice(0, 3).map(x => x.english);
    const options = shuffle([s.english, ...wrong]);
    return { german: s.german, answer: s.english, options };
  });

  renderQuiz();
}

function renderQuiz() {
  const container = $('learn-content');

  if (quiz.current >= quiz.questions.length) {
    const pct = Math.round((quiz.score / quiz.questions.length) * 100);
    const msg = pct === 100 ? '🏆 Perfect score!'
               : pct >= 70  ? '🎉 Great job!'
               : pct >= 40  ? '💪 Keep practising!'
               :               '📚 Review the lesson and try again!';
    container.innerHTML = `
      <div class="quiz-wrap">
        <div class="quiz-score">
          <div class="quiz-score-num">${quiz.score}/${quiz.questions.length}</div>
          <div class="quiz-score-label">${pct}% correct</div>
          <div class="quiz-score-msg">${msg}</div>
          <div class="quiz-actions">
            <button class="quiz-retry" onclick="startQuiz(${quiz.lessonIdx})">🔁 Retry Quiz</button>
            <button class="quiz-back" onclick="openLesson(${quiz.lessonIdx})">📖 Back to Lesson</button>
            <button class="quiz-back" onclick="goBack()">← All Lessons</button>
          </div>
        </div>
      </div>`;
    return;
  }

  const q = quiz.questions[quiz.current];
  const progress = Math.round((quiz.current / quiz.questions.length) * 100);

  container.innerHTML = `
    <div class="quiz-wrap">
      <button class="back-btn" onclick="openLesson(${quiz.lessonIdx})">← Back to Lesson</button>
      <div style="margin-top:20px;">
        <div class="quiz-progress">Question ${quiz.current + 1} of ${quiz.questions.length} &nbsp;·&nbsp; Score: ${quiz.score}</div>
        <div class="quiz-bar-bg"><div class="quiz-bar-fill" style="width:${progress}%"></div></div>
        <div class="quiz-question">${q.german}</div>
        <div class="quiz-hint">Choose the correct English translation:</div>
        <button class="speak-btn" style="margin-bottom:20px;" onclick="speakGerman('${q.german.replace(/'/g, "\\'")}', this)">🔊 Hear it</button>
        <div class="quiz-options">
          ${q.options.map(opt => `
            <button class="quiz-option" onclick="answerQuiz(this, '${opt.replace(/'/g, "\\'")}', '${q.answer.replace(/'/g, "\\'")}')">
              ${escHtml(opt)}
            </button>
          `).join('')}
        </div>
      </div>
    </div>`;
}

function answerQuiz(btn, selected, correct) {
  const allBtns = document.querySelectorAll('.quiz-option');
  allBtns.forEach(b => b.disabled = true);

  if (selected === correct) {
    btn.classList.add('correct');
    quiz.score++;
  } else {
    btn.classList.add('wrong');
    allBtns.forEach(b => {
      if (b.textContent.trim() === correct) b.classList.add('correct');
    });
  }

  setTimeout(() => {
    quiz.current++;
    renderQuiz();
  }, 1200);
}

// ─── FLASHCARDS ───────────────────────────────────────────────────────────────
let fc = {
  deck: [],
  current: 0,
  total: 0,
  flipped: false,
  source: 'all'
};

function fcBuildDeck(source) {
  let sentences = [];
  if (source === 'all' || !source) {
    state.data.lessons.forEach(l => {
      l.sentences.forEach(s => sentences.push(s));
    });
  } else {
    const idx = parseInt(source);
    if (!isNaN(idx) && state.data.lessons[idx]) {
      sentences = [...state.data.lessons[idx].sentences];
    }
  }
  return sentences.sort(() => Math.random() - 0.5);
}

function fcSetSource(source) {
  fc.source = source;
  fc.deck = fcBuildDeck(source);
  fc.current = 0;
  fc.total = fc.deck.length;
  fc.flipped = false;
  renderFlashcards();
}

function fcRestart() {
  fc.deck = fcBuildDeck(fc.source);
  fc.current = 0;
  fc.total = fc.deck.length;
  fc.flipped = false;
  renderFlashcards();
}

function fcFlip() {
  fc.flipped = !fc.flipped;
  const card = document.getElementById('fc-card-el');
  if (card) card.classList.toggle('flipped', fc.flipped);
}

function fcAnswer(knew) {
  if (!fc.flipped) { fcFlip(); return; }
  if (knew) {
    fc.deck.splice(fc.current, 1);
    if (fc.current >= fc.deck.length) fc.current = 0;
  } else {
    const card = fc.deck.splice(fc.current, 1)[0];
    fc.deck.push(card);
    if (fc.current >= fc.deck.length) fc.current = 0;
  }
  fc.flipped = false;
  renderFlashcards();
}

function renderFlashcards() {
  const container = $('flashcards-content');

  if (fc.total === 0) {
    fc.source = 'all';
    fc.deck = fcBuildDeck('all');
    fc.total = fc.deck.length;
    fc.current = 0;
    fc.flipped = false;
  }

  const sourceBar = `
    <div class="fc-source-bar">
      <button class="fc-source-btn ${fc.source === 'all' ? 'active' : ''}"
        onclick="fcSetSource('all')">All Lessons</button>
      ${state.data.lessons.map((l, i) => `
        <button class="fc-source-btn ${fc.source === String(i) ? 'active' : ''}"
          onclick="fcSetSource('${i}')">Lesson ${l.id}</button>
      `).join('')}
    </div>`;

  if (fc.deck.length === 0) {
    container.innerHTML = `
      ${sourceBar}
      <div class="fc-done">
        <div class="fc-done-emoji">🏆</div>
        <div class="fc-done-title">Deck Complete!</div>
        <div class="fc-done-sub">You went through all ${fc.total} cards. Excellent work!</div>
        <button class="fc-restart-btn" onclick="fcRestart()">🔁 Restart Deck</button>
      </div>`;
    return;
  }

  const remaining = fc.deck.length;
  const done = fc.total - remaining;
  const pct = Math.round((done / fc.total) * 100);
  const card = fc.deck[fc.current];

  container.innerHTML = `
    ${sourceBar}
    <div class="fc-wrap">
      <div class="fc-counter">${remaining} cards remaining · ${done} done</div>
      <div class="fc-progress-bar">
        <div class="fc-progress-fill" style="width:${pct}%"></div>
      </div>
      <div class="fc-scene" onclick="fcFlip()">
        <div class="fc-card ${fc.flipped ? 'flipped' : ''}" id="fc-card-el">
          <div class="fc-front">
            <div class="fc-lang-tag">🇩🇪 German</div>
            <div class="fc-text">${card.german}</div>
            <div class="fc-tap-hint">Tap to reveal English</div>
          </div>
          <div class="fc-back">
            <div class="fc-lang-tag">🇬🇧 English</div>
            <div class="fc-text">${card.english}</div>
            <button class="speak-btn" style="margin-top:12px;"
              onclick="event.stopPropagation();speakGerman('${card.german.replace(/'/g, "\\'")}', this)">🔊</button>
          </div>
        </div>
      </div>
      <div class="fc-actions">
        <button class="fc-btn-again" onclick="fcAnswer(false)">🔁 Again</button>
        <button class="fc-btn-got"   onclick="fcAnswer(true)">✅ Got it</button>
      </div>
      <div class="fc-actions-hint">
        ${fc.flipped ? 'Did you know it?' : 'Tap the card first to reveal the answer'}
      </div>
    </div>`;
}

// ─── Utils ────────────────────────────────────────────────────────────────────
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─── Global exposure ──────────────────────────────────────────────────────────
window.openLesson   = openLesson;
window.openStory    = openStory;
window.openSong     = openSong;
window.goBack       = goBack;
window.setPhraseCat = setPhraseCat;
window.speakGerman  = speakGerman;
window.navigate     = navigate;
window.startQuiz    = startQuiz;
window.answerQuiz   = answerQuiz;
window.fcFlip       = fcFlip;
window.fcAnswer     = fcAnswer;
window.fcRestart    = fcRestart;
window.fcSetSource  = fcSetSource;

// ─── Boot ─────────────────────────────────────────────────────────────────────
init();
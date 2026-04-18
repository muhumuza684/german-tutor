/**
 * chatEngine.js
 * Rule-based German language tutor engine.
 * Analyses user input, provides corrections, translation, and explanation.
 */

// ─── Common German corrections ─────────────────────────────────────────────
const CORRECTIONS = [
  // Articles
  { wrong: /\bein hund\b/i, right: 'ein Hund', note: 'Nouns are always capitalised in German.' },
  { wrong: /\bdie hund\b/i, right: 'der Hund', note: '"Hund" (dog) is masculine → der Hund.' },
  { wrong: /\bder katze\b/i, right: 'die Katze', note: '"Katze" (cat) is feminine → die Katze.' },
  { wrong: /\bein katze\b/i, right: 'eine Katze', note: '"Katze" is feminine → use "eine" not "ein".' },
  { wrong: /\bdas katze\b/i, right: 'die Katze', note: '"Katze" is feminine → die Katze, not das Katze.' },
  // Verb conjugation
  { wrong: /\bich bin haben\b/i, right: 'ich habe', note: 'Use "haben" not "sein" here. "Ich habe" = I have.' },
  { wrong: /\bich bin gehen\b/i, right: 'ich gehe', note: 'Conjugate the verb: ich gehe (I go).' },
  { wrong: /\ber haben\b/i, right: 'er hat', note: '"er/sie/es hat" is the correct conjugation for "haben".' },
  { wrong: /\bsie haben\b(?! )/i, right: 'sie hat', note: 'For "she" use "sie hat". For "they" use "sie haben".' },
  // Sein vs Haben (movement verbs)
  { wrong: /\bich habe gestern gegangen nach hause\b/i, right: 'Ich bin gestern nach Hause gegangen.', note: 'Use "sein" with movement verbs like "gehen". Time before place in word order.' },
  { wrong: /\bich habe gegangen\b/i, right: 'Ich bin gegangen.', note: '"Gehen" uses "sein" as auxiliary, not "haben".' },
  { wrong: /\bich habe gelaufen\b/i, right: 'Ich bin gelaufen.', note: '"Laufen" uses "sein" as auxiliary, not "haben".' },
  { wrong: /\bich habe gefahren\b/i, right: 'Ich bin gefahren.', note: '"Fahren" uses "sein" as auxiliary, not "haben".' },
  { wrong: /\bich habe gekommen\b/i, right: 'Ich bin gekommen.', note: '"Kommen" uses "sein" as auxiliary, not "haben".' },
  { wrong: /\bich habe gegangen nach\b/i, right: 'Ich bin gegangen nach', note: 'Movement verbs use "sein", not "haben".' },
  // Word order
  { wrong: /\bich gehe zu hause\b/i, right: 'Ich gehe nach Hause.', note: 'Use "nach Hause" (going home), not "zu Hause" (at home).' },
  { wrong: /\bich bin zu hause gehen\b/i, right: 'Ich gehe nach Hause.', note: '"Nach Hause gehen" = to go home.' },
  // Common mistakes
  { wrong: /\bich bin \d+ jahre\b/i, right: 'Ich bin ... Jahre alt.', note: 'Always add "alt" at the end: Ich bin 20 Jahre alt.' },
  { wrong: /\bich habe \d+ jahre\b/i, right: 'Ich bin ... Jahre alt.', note: 'Use "sein" for age: Ich bin 20 Jahre alt, not "ich habe".' },
  { wrong: /\bich bin hunger\b/i, right: 'Ich habe Hunger.', note: 'Use "haben" for hunger: Ich habe Hunger.' },
  { wrong: /\bich bin durst\b/i, right: 'Ich habe Durst.', note: 'Use "haben" for thirst: Ich habe Durst.' },
  { wrong: /\bich bin kalt\b/i, right: 'Mir ist kalt.', note: '"Mir ist kalt" = I am cold (literally: to me it is cold).' },
  { wrong: /\bich bin heiß\b/i, right: 'Mir ist heiß.', note: '"Mir ist heiß" = I am hot. "Ich bin heiß" means something else entirely!' },
];
// ─── Simple vocabulary translations ────────────────────────────────────────
const VOCAB = {
  'ich': 'I', 'bin': 'am', 'bin ich': 'I am',
  'du': 'you', 'er': 'he', 'sie': 'she/they', 'wir': 'we', 'es': 'it',
  'habe': 'have', 'hat': 'has', 'haben': 'have',
  'gehe': 'go', 'geht': 'goes', 'gehen': 'go',
  'bin': 'am', 'ist': 'is', 'sind': 'are',
  'nicht': 'not', 'kein': 'no/not a',
  'heute': 'today', 'morgen': 'tomorrow', 'gestern': 'yesterday',
  'gut': 'good/well', 'schlecht': 'bad',
  'ja': 'yes', 'nein': 'no',
  'danke': 'thank you', 'bitte': 'please/you\'re welcome',
  'hallo': 'hello', 'tschüss': 'bye',
  'essen': 'eat/food', 'trinken': 'drink', 'schlafen': 'sleep',
  'groß': 'big/tall', 'klein': 'small',
  'schön': 'beautiful', 'heiß': 'hot', 'kalt': 'cold',
  'haus': 'house', 'hund': 'dog', 'katze': 'cat',
  'buch': 'book', 'wasser': 'water', 'brot': 'bread'
};

// ─── Canned responses for common phrases ───────────────────────────────────
const PHRASE_MAP = [
  {
    match: /^(hallo|hi|hey)[\s!.]*$/i,
    corrected: 'Hallo!',
    translation: 'Hello!',
    explanation: 'Great greeting! "Hallo" is the most common informal greeting in German.'
  },
  {
    match: /ich (bin|heiße?) \w+/i,
    corrected: null, // will auto-capitalise
    translation: 'I am / My name is …',
    explanation: 'Good! To introduce yourself say: "Ich bin [Name]" or "Ich heiße [Name]".'
  },
  {
    match: /wie geht/i,
    corrected: 'Wie geht es dir?',
    translation: 'How are you?',
    explanation: '"Wie geht es dir?" is informal. Use "Wie geht es Ihnen?" to be formal.'
  },
  {
    match: /ich lerne deutsch/i,
    corrected: 'Ich lerne Deutsch.',
    translation: 'I am learning German.',
    explanation: 'Excellent! Languages are always capitalised in German: Deutsch, Englisch, Französisch.'
  },
  {
    match: /ich (mag|liebe|liebe) deutschland/i,
    corrected: 'Ich liebe Deutschland.',
    translation: 'I love Germany.',
    explanation: '"Ich liebe" = I love. Country names are capitalised in German.'
  },
  {
    match: /ich bin müde/i,
    corrected: 'Ich bin müde.',
    translation: 'I am tired.',
    explanation: 'Perfect! "Ich bin" = I am. "müde" = tired. Watch the umlaut: ü.'
  },
  {
    match: /ich habe hunger/i,
    corrected: 'Ich habe Hunger.',
    translation: 'I am hungry.',
    explanation: 'In German you "have" hunger rather than "are" hungry: ich habe Hunger.'
  },
  {
    match: /danke/i,
    corrected: 'Danke schön!',
    translation: 'Thank you very much!',
    explanation: '"Danke" = thanks. "Danke schön" = thank you very much. "Vielen Dank" is even more formal.'
  },
  {
    match: /bitte/i,
    corrected: 'Bitte.',
    translation: 'Please / You\'re welcome.',
    explanation: '"Bitte" means both "please" and "you\'re welcome" depending on context.'
  }
];

// ─── Main function ──────────────────────────────────────────────────────────

/**
 * Processes user input and returns a tutor response.
 * @param {string} input - Raw user text
 * @returns {{ corrected: string, translation: string, explanation: string }}
 */
function processInput(input) {
  if (!input || input.trim() === '') {
    return {
      corrected: '',
      translation: '',
      explanation: 'Please type a German word or sentence and I will help you!'
    };
  }

  const trimmed = input.trim();

  // 1. Check phrase map first (highest priority)
  for (const entry of PHRASE_MAP) {
    if (entry.match.test(trimmed)) {
      const corrected = entry.corrected || autoCapitalise(trimmed);
      return {
        corrected,
        translation: entry.translation,
        explanation: entry.explanation
      };
    }
  }

  // 2. Apply rule-based corrections
  let corrected = trimmed;
  let notes = [];

  for (const rule of CORRECTIONS) {
    if (rule.wrong.test(corrected)) {
      if (rule.right) {
        corrected = corrected.replace(rule.wrong, rule.right);
      } else {
        // Auto-capitalise sentences
        corrected = autoCapitalise(corrected);
      }
      notes.push(rule.note);
    }
  }

  // 3. Always ensure capitalisation
  corrected = autoCapitalise(corrected);

  // 4. Ensure sentence ends with punctuation
  if (corrected && !/[.!?]$/.test(corrected)) {
    corrected += '.';
  }

  // 5. Build a simple word-by-word translation
  const translation = buildTranslation(trimmed);

  // 6. Build explanation
  let explanation = notes.length > 0
    ? notes[0]  // Show the most relevant correction note
    : buildGenericExplanation(corrected);

  return { corrected, translation, explanation };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function autoCapitalise(str) {
  if (!str) return str;
  // Capitalise first letter
  let result = str.charAt(0).toUpperCase() + str.slice(1);
  // Capitalise after . ! ?
  result = result.replace(/([.!?]\s+)([a-z])/g, (m, p1, p2) => p1 + p2.toUpperCase());
  return result;
}
function buildTranslation(text) {
  // Check known full sentence translations first
  const SENTENCE_TRANSLATIONS = {
    'die titanic war ein großes schiff': 'The Titanic was a large ship.',
    'ich bin müde': 'I am tired.',
    'ich habe hunger': 'I am hungry.',
    'ich lerne deutsch': 'I am learning German.',
    'wie geht es dir': 'How are you?',
    'ich gehe zur schule': 'I am going to school.',
    'das ist ein hund': 'That is a dog.',
    'ich bin gut': 'I am well.',
    'guten morgen': 'Good morning.',
    'guten abend': 'Good evening.',
    'auf wiedersehen': 'Goodbye.',
    'ich komme aus england': 'I come from England.',
    'ich wohne in berlin': 'I live in Berlin.',
    'das macht spaß': 'That is fun.',
    'ich verstehe nicht': 'I do not understand.',
    'kannst du mir helfen': 'Can you help me?',
    'wo ist der bahnhof': 'Where is the train station?',
    'ich habe durst': 'I am thirsty.',
    'es tut mir leid': 'I am sorry.',
    'kein problem': 'No problem.',
  };

  const lower = text.toLowerCase().replace(/[.,!?]/g, '').trim();
  if (SENTENCE_TRANSLATIONS[lower]) {
    return SENTENCE_TRANSLATIONS[lower];
  }

  // Fall back to word-by-word
  const words = lower.split(/\s+/);
  const translated = words.map(w => VOCAB[w] || w);
  const joined = translated.join(' ');
  if (joined === words.join(' ')) {
    return 'This sentence looks correct! Check a dictionary for a full translation.';
  }
  return joined.charAt(0).toUpperCase() + joined.slice(1) + '.';
}
function buildGenericExplanation(corrected) {
  const tips = [
    'Good attempt! Remember: all German nouns are capitalised.',
    'Nice try! German verb conjugation changes with each pronoun: ich bin, du bist, er/sie/es ist.',
    'Keep going! The definite articles in German are: der (masc.), die (fem.), das (neut.).',
    'Great effort! Word order in German: the verb is always second in a main clause.',
    'Well done! German has four cases: Nominative, Accusative, Dative, Genitive.'
  ];
  // Pick one consistently based on string length (pseudo-random but stable)
  const idx = corrected.length % tips.length;
  return tips[idx];
}

module.exports = { processInput };

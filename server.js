require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const https = require('https');

const { getLanguageData, getAvailableLanguages } = require('./services/languageLoader');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Supabase (optional — app works fine without it) ──────────────────────────
let supabase = null;
try {
  const { createClient } = require('@supabase/supabase-js');
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY) {
    supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);
    console.log('✅  Supabase connected — users & history will be saved');
  } else {
    console.log('ℹ️   Supabase not configured — running in session-only mode');
  }
} catch (e) {
  console.log('ℹ️   Supabase not installed — run: npm install @supabase/supabase-js');
}

// ─── Supabase helpers (all silent — never crash the app) ─────────────────────
async function dbSaveUser(email) {
  if (!supabase) return;
  try {
    const { data } = await supabase.from('users').select('id').eq('email', email).single();
    if (!data) await supabase.from('users').insert({ email, created_at: new Date().toISOString() });
  } catch (e) {}
}

async function dbSaveTranslation(email, original, translation, direction) {
  if (!supabase) return;
  try {
    await supabase.from('translations').insert({
      user_email: email, original_text: original,
      translated_text: translation, direction,
      created_at: new Date().toISOString()
    });
  } catch (e) {}
}

async function dbGetHistory(email) {
  if (!supabase) return [];
  try {
    const { data } = await supabase.from('translations')
      .select('original_text, translated_text, direction, created_at')
      .eq('user_email', email).order('created_at', { ascending: false }).limit(30);
    return data || [];
  } catch (e) { return []; }
}

async function dbSaveProgress(email, progressData) {
  if (!supabase) return;
  try {
    const { data } = await supabase.from('progress').select('id').eq('user_email', email).single();
    if (data) {
      await supabase.from('progress').update({ data: progressData, updated_at: new Date().toISOString() }).eq('user_email', email);
    } else {
      await supabase.from('progress').insert({ user_email: email, data: progressData, updated_at: new Date().toISOString() });
    }
  } catch (e) {}
}

async function dbGetProgress(email) {
  if (!supabase) return null;
  try {
    const { data } = await supabase.from('progress').select('data').eq('user_email', email).single();
    return data?.data || null;
  } catch (e) { return null; }
}

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

app.use(session({
  secret: process.env.SESSION_SECRET || 'german-tutor-secret-2024',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24 }
}));

// ─── Auth middleware ──────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  return res.status(401).json({ error: 'Not logged in' });
}

// ─── Auth routes ──────────────────────────────────────────────────────────────
app.post('/api/login', async (req, res) => {
  const { email } = req.body;
  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }
  const clean = email.trim().toLowerCase();
  req.session.user = { email: clean };
  await dbSaveUser(clean); // save to Supabase if connected
  return res.json({ success: true, email: clean });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

app.get('/api/session', (req, res) => {
  if (req.session && req.session.user) {
    return res.json({ loggedIn: true, email: req.session.user.email });
  }
  return res.json({ loggedIn: false });
});

// ─── Progress routes (new) ────────────────────────────────────────────────────
app.get('/api/progress', requireAuth, async (req, res) => {
  const progress = await dbGetProgress(req.session.user.email);
  res.json({ progress });
});

app.post('/api/progress', requireAuth, async (req, res) => {
  await dbSaveProgress(req.session.user.email, req.body);
  res.json({ success: true });
});

// ─── History route (new) ──────────────────────────────────────────────────────
app.get('/api/history', requireAuth, async (req, res) => {
  const history = await dbGetHistory(req.session.user.email);
  res.json({ history });
});

// ─── Language routes ──────────────────────────────────────────────────────────
app.get('/api/languages', requireAuth, (req, res) => {
  res.json({ languages: getAvailableLanguages() });
});

app.get('/api/language/:lang/:type', requireAuth, (req, res) => {
  const { lang, type } = req.params;
  const validTypes = ['lessons', 'phrases', 'stories', 'songs'];
  if (!validTypes.includes(type)) {
    return res.status(400).json({ error: `Invalid type. Use one of: ${validTypes.join(', ')}` });
  }
  const data = getLanguageData(lang, type);
  if (!data) {
    return res.status(404).json({ error: `No data found for ${lang}/${type}` });
  }
  res.json({ language: lang, type, data });
});

// ─── Phrase dictionary (exact matches) ───────────────────────────────────────
const OFFLINE = {
  'hallo':'Hello!','hi':'Hallo!','hello':'Hallo!','hey':'Hey!',
  'guten morgen':'Good morning!','good morning':'Guten Morgen!',
  'guten tag':'Good day!','good day':'Guten Tag!',
  'guten abend':'Good evening!','good evening':'Guten Abend!',
  'gute nacht':'Good night!','good night':'Gute Nacht!',
  'tschüss':'Bye!','bye':'Tschüss!','goodbye':'Auf Wiedersehen!',
  'auf wiedersehen':'Goodbye!','bis bald':'See you soon!',
  'bis später':'See you later!','see you later':'Bis später!',
  'bis morgen':'See you tomorrow!','see you tomorrow':'Bis morgen!',
  'willkommen':'Welcome!','welcome':'Willkommen!',
  'wie geht es dir':'How are you?','how are you':'Wie geht es dir?',
  'wie geht es ihnen':'How are you? (formal)',
  'wie gehts':'How are you?','wie geht es':'How are you?',
  'mir geht es gut':'I am fine.','i am fine':'Mir geht es gut.',
  'i am well':'Mir geht es gut.','i am good':'Mir geht es gut.',
  'es geht mir gut':'I am doing well.',
  'nicht so gut':'Not so well.','not so well':'Nicht so gut.',
  'sehr gut':'Very good!','very good':'Sehr gut!',
  'wunderbar':'Wonderful!','wonderful':'Wunderbar!',
  'prima':'Great!','great':'Prima!','super':'Super!',
  'danke':'Thank you.','thank you':'Danke schön.',
  'danke schön':'Thank you very much!','thanks':'Danke.',
  'vielen dank':'Many thanks!','many thanks':'Vielen Dank!',
  'bitte':'Please / You are welcome.','please':'Bitte.',
  'bitte schön':'Here you go / You are welcome.',
  'gern geschehen':'My pleasure.','my pleasure':'Gern geschehen.',
  'kein problem':'No problem.','no problem':'Kein Problem.',
  'entschuldigung':'Excuse me!','excuse me':'Entschuldigung!',
  'es tut mir leid':'I am sorry.','i am sorry':'Es tut mir leid.',
  'sorry':'Es tut mir leid.','natürlich':'Of course!','of course':'Natürlich!',
  'genau':'Exactly!','exactly':'Genau!','klar':'Sure!','sure':'Klar!',
  'ja':'Yes.','nein':'No.','yes':'Ja.','no':'Nein.',
  'vielleicht':'Maybe.','maybe':'Vielleicht.',
  'ich weiß nicht':'I do not know.','i do not know':'Ich weiß nicht.',
  'ich verstehe':'I understand.','i understand':'Ich verstehe.',
  'ich verstehe nicht':'I do not understand.',
  'i do not understand':'Ich verstehe nicht.',
  'ich dont understand':'Ich verstehe nicht.',
  'ich heiße':'My name is...','my name is':'Ich heiße...',
  'wie heißt du':'What is your name?','what is your name':'Wie heißt du?',
  'freut mich':'Nice to meet you!','nice to meet you':'Freut mich!',
  'woher kommst du':'Where are you from?','where are you from':'Woher kommst du?',
  'ich komme aus deutschland':'I come from Germany.',
  'i come from germany':'Ich komme aus Deutschland.',
  'i come from england':'Ich komme aus England.',
  'wo wohnst du':'Where do you live?','where do you live':'Wo wohnst du?',
  'ich lerne deutsch':'I am learning German.',
  'i am learning german':'Ich lerne Deutsch.',
  'sprichst du englisch':'Do you speak English?',
  'do you speak english':'Sprichst du Englisch?',
  'do you speak german':'Sprichst du Deutsch?',
  'ich spreche ein bisschen deutsch':'I speak a little German.',
  'i speak a little german':'Ich spreche ein bisschen Deutsch.',
  'kannst du das wiederholen':'Can you repeat that?',
  'can you repeat that':'Kannst du das wiederholen?',
  'bitte langsamer':'Slower please.','please speak slower':'Bitte langsamer sprechen.',
  'was bedeutet das':'What does that mean?','what does that mean':'Was bedeutet das?',
  'kannst du mir helfen':'Can you help me?','can you help me':'Kannst du mir helfen?',
  'ich brauche hilfe':'I need help.','i need help':'Ich brauche Hilfe.',
  'ich bin glücklich':'I am happy.','i am happy':'Ich bin glücklich.',
  'ich bin traurig':'I am sad.','i am sad':'Ich bin traurig.',
  'ich bin müde':'I am tired.','i am tired':'Ich bin müde.',
  'ich bin krank':'I am sick.','i am sick':'Ich bin krank.',
  'ich bin aufgeregt':'I am excited.','i am excited':'Ich bin aufgeregt.',
  'ich bin nervös':'I am nervous.','i am nervous':'Ich bin nervös.',
  'ich bin wütend':'I am angry.','i am angry':'Ich bin wütend.',
  'ich bin verliebt':'I am in love.','i am in love':'Ich bin verliebt.',
  'ich habe hunger':'I am hungry.','i am hungry':'Ich habe Hunger.',
  'ich bin hungrig':'I am hungry.',
  'ich habe durst':'I am thirsty.','i am thirsty':'Ich habe Durst.',
  'ich bin satt':'I am full.','i am full':'Ich bin satt.',
  'ich liebe dich':'I love you.','i love you':'Ich liebe dich.',
  'ich mag dich':'I like you.','i like you':'Ich mag dich.',
  'ich vermisse dich':'I miss you.','i miss you':'Ich vermisse dich.',
  'du bist schön':'You are beautiful.','you are beautiful':'Du bist schön.',
  'ich denke an dich':'I am thinking of you.','i am thinking of you':'Ich denke an dich.',
  'wie spät ist es':'What time is it?','what time is it':'Wie spät ist es?',
  'heute':'Today.','today':'Heute.','morgen':'Tomorrow.','tomorrow':'Morgen.',
  'gestern':'Yesterday.','yesterday':'Gestern.',
  'wie ist das wetter':'What is the weather like?',
  'what is the weather like':'Wie ist das Wetter?',
  'es ist sonnig':'It is sunny.','it is sunny':'Es ist sonnig.',
  'es regnet':'It is raining.','it is raining':'Es regnet.',
  'es schneit':'It is snowing.','it is snowing':'Es schneit.',
  'es ist kalt':'It is cold.','it is cold':'Es ist kalt.',
  'es ist warm':'It is warm.','it is warm':'Es ist warm.',
  'es ist heiß':'It is hot.','it is hot':'Es ist heiß.',
  'es ist windig':'It is windy.','it is windy':'Es ist windig.',
  'wie viel kostet das':'How much does that cost?',
  'how much does it cost':'Wie viel kostet das?',
  'how much does that cost':'Wie viel kostet das?',
  'das ist zu teuer':'That is too expensive.','that is too expensive':'Das ist zu teuer.',
  'ich nehme es':'I will take it.','i will take it':'Ich nehme es.',
  'die rechnung bitte':'The bill please.','the bill please':'Die Rechnung, bitte.',
  'kann ich mit karte zahlen':'Can I pay by card?',
  'can i pay by card':'Kann ich mit Karte zahlen?',
  'ich schaue nur':'I am just looking.','i am just looking':'Ich schaue nur.',
  'wo ist der bahnhof':'Where is the train station?',
  'where is the train station':'Wo ist der Bahnhof?',
  'wo ist die toilette':'Where is the bathroom?',
  'where is the bathroom':'Wo ist die Toilette?',
  'where is the toilet':'Wo ist die Toilette?',
  'ich bin verloren':'I am lost.','i am lost':'Ich bin verloren.',
  'geradeaus':'Straight ahead.','straight ahead':'Geradeaus.',
  'links':'Left.','rechts':'Right.','left':'Links.','right':'Rechts.',
  'call an ambulance':'Ruf einen Krankenwagen!',
  'ruf einen krankenwagen':'Call an ambulance!',
  'i need a doctor':'Ich brauche einen Arzt.',
  'ich brauche einen arzt':'I need a doctor.',
  'i have a headache':'Ich habe Kopfschmerzen.',
  'ich habe kopfschmerzen':'I have a headache.',
  'i have a fever':'Ich habe Fieber.','ich habe fieber':'I have a fever.',
  'guten appetit':'Enjoy your meal!','enjoy your meal':'Guten Appetit!',
  'prost':'Cheers!','cheers':'Prost!',
  'frohe weihnachten':'Merry Christmas!','merry christmas':'Frohe Weihnachten!',
  'frohes neues jahr':'Happy New Year!','happy new year':'Frohes Neues Jahr!',
  'herzlichen glückwunsch':'Congratulations!','congratulations':'Herzlichen Glückwunsch!',
  'alles gute zum geburtstag':'Happy birthday!','happy birthday':'Alles Gute zum Geburtstag!',
  'viel glück':'Good luck!','good luck':'Viel Glück!',
  'viel spaß':'Have fun!','have fun':'Viel Spaß!',
  'gute besserung':'Get well soon!','get well soon':'Gute Besserung!',
  'pass auf dich auf':'Take care!','take care':'Pass auf dich auf!',
  'schönen tag noch':'Have a nice day!','have a nice day':'Schönen Tag noch!',
  'das ist gut':'That is good.','that is good':'Das ist gut.',
  'das ist schlecht':'That is bad.','that is bad':'Das ist schlecht.',
  'das ist schön':'That is beautiful.','that is beautiful':'Das ist schön.',
  'das ist interessant':'That is interesting.','that is interesting':'Das ist interessant.',
  'das stimmt':'That is correct.','that is correct':'Das stimmt.',
  'alles klar':'All good!','all good':'Alles klar!','all clear':'Alles klar!',
  'ich muss gehen':'I have to go.','i have to go':'Ich muss gehen.',
  'ich bin fertig':'I am done.','i am done':'Ich bin fertig.',
  'ich bin bereit':'I am ready.','i am ready':'Ich bin bereit.',
  'ich habe keine ahnung':'I have no idea.','i have no idea':'Ich habe keine Ahnung.',
  'ich komme':'I am coming.','i am coming':'Ich komme.',
  'ich bin hier':'I am here.','i am here':'Ich bin hier.',
  'ich arbeite':'I am working.','i am working':'Ich arbeite.',
  'ich schlafe':'I am sleeping.','i am sleeping':'Ich schlafe.',
  'ich esse':'I am eating.','i am eating':'Ich esse.',
  'ich trinke':'I am drinking.','i am drinking':'Ich trinke.',
  'ich lese':'I am reading.','i am reading':'Ich lese.',
  'ich koche':'I am cooking.','i am cooking':'Ich koche.',
  'ich gehe nach hause':'I am going home.','i am going home':'Ich gehe nach Hause.',
  'ich bin zu hause':'I am at home.','i am at home':'Ich bin zu Hause.',
  'i want some food':'Ich möchte etwas Essen.',
  'i want food':'Ich möchte Essen.',
  'i want water':'Ich möchte Wasser.',
  'i want coffee':'Ich möchte Kaffee.',
  'i want tea':'Ich möchte Tee.',
  'i am learning':'Ich lerne.',
  'i am studying':'Ich lerne.',
  'i am going':'Ich gehe.',
  'i am listening':'Ich höre zu.',
  'i am waiting':'Ich warte.',
  'i am thinking':'Ich denke.',
  'i am trying':'Ich versuche es.',
  'i am looking':'Ich schaue.',
  'i am feeling good':'Mir geht es gut.',
  'i am feeling bad':'Mir geht es schlecht.',
  'i dont feel well':'Mir geht es nicht gut.',
  'i do not feel well':'Mir geht es nicht gut.',
  'want some food':'Ich möchte etwas Essen.',
  'want food':'Möchte Essen.',
  'want water':'Möchte Wasser.',
  'want coffee':'Möchte Kaffee.',
  'need food':'Brauche Essen.',
  'need water':'Brauche Wasser.',
  'need help':'Brauche Hilfe.',
};

// ─── Word-by-word dictionaries ────────────────────────────────────────────────
const EN_TO_DE = {
  'i':'ich','you':'du','he':'er','she':'sie','we':'wir','they':'sie','it':'es',
  'my':'mein','your':'dein','his':'sein','her':'ihr','our':'unser','their':'ihr',
  'am':'bin','is':'ist','are':'sind','was':'war','were':'waren',
  'have':'habe','has':'hat','had':'hatte','will':'werde','would':'würde',
  'can':'kann','could':'könnte','should':'sollte','must':'muss',
  'want':'möchte','need':'brauche','like':'mag','love':'liebe','hate':'hasse',
  'go':'gehe','come':'komme','see':'sehe','know':'weiß','think':'denke',
  'eat':'esse','drink':'trinke','sleep':'schlafe','work':'arbeite',
  'learn':'lerne','help':'helfe','get':'bekomme','give':'gebe','take':'nehme',
  'make':'mache','say':'sage','tell':'erzähle','ask':'frage','buy':'kaufe',
  'find':'finde','feel':'fühle','look':'schaue','try':'versuche',
  'call':'rufe','use':'benutze','live':'wohne','play':'spiele',
  'read':'lese','write':'schreibe','listen':'höre','wait':'warte',
  'speak':'spreche','understand':'verstehe','forget':'vergesse',
  'remember':'erinnere','stay':'bleibe','run':'renne','walk':'gehe',
  'do':'mache','does':'macht','did':'machte',
  'a':'ein','an':'ein','the':'der','this':'dies','that':'das',
  'some':'etwas','any':'irgendein','no':'kein','not':'nicht',
  'and':'und','or':'oder','but':'aber','because':'weil','so':'also',
  'if':'wenn','when':'wenn','where':'wo','what':'was','who':'wer',
  'how':'wie','why':'warum','which':'welche',
  'in':'in','on':'auf','at':'bei','to':'zu','for':'für','with':'mit',
  'without':'ohne','from':'von','of':'von','about':'über','after':'nach',
  'before':'vor','between':'zwischen','under':'unter','over':'über',
  'here':'hier','there':'dort','now':'jetzt','then':'dann','soon':'bald',
  'today':'heute','tomorrow':'morgen','yesterday':'gestern',
  'always':'immer','never':'nie','often':'oft','sometimes':'manchmal',
  'very':'sehr','too':'zu','quite':'ziemlich','really':'wirklich',
  'also':'auch','still':'noch','already':'schon','again':'wieder',
  'just':'nur','only':'nur','maybe':'vielleicht','please':'bitte',
  'yes':'ja','ok':'ok','okay':'okay','well':'gut',
  'good':'gut','bad':'schlecht','great':'toll','nice':'schön','fine':'gut',
  'big':'groß','small':'klein','new':'neu','old':'alt','long':'lang',
  'short':'kurz','many':'viele','much':'viel','little':'wenig','few':'wenige',
  'all':'alle','every':'jeder','both':'beide','other':'andere','same':'gleich',
  'right':'richtig','wrong':'falsch','fast':'schnell','slow':'langsam',
  'easy':'einfach','hard':'schwer','important':'wichtig','beautiful':'schön',
  'funny':'lustig','interesting':'interessant','boring':'langweilig',
  'happy':'glücklich','sad':'traurig','tired':'müde','hungry':'hungrig',
  'thirsty':'durstig','sick':'krank','ready':'bereit','busy':'beschäftigt',
  'free':'frei','lost':'verloren','hot':'heiß','cold':'kalt','warm':'warm',
  'food':'Essen','water':'Wasser','coffee':'Kaffee','tea':'Tee',
  'beer':'Bier','wine':'Wein','bread':'Brot','meat':'Fleisch',
  'fish':'Fisch','cake':'Kuchen','soup':'Suppe','milk':'Milch',
  'fruit':'Obst','vegetables':'Gemüse','rice':'Reis','egg':'Ei',
  'eggs':'Eier','cheese':'Käse','butter':'Butter','sugar':'Zucker',
  'pizza':'Pizza','pasta':'Pasta','salad':'Salat','chicken':'Hähnchen',
  'house':'Haus','home':'Zuhause','room':'Zimmer','door':'Tür',
  'window':'Fenster','table':'Tisch','chair':'Stuhl','bed':'Bett',
  'kitchen':'Küche','bathroom':'Bad','garden':'Garten',
  'city':'Stadt','street':'Straße','school':'Schule','office':'Büro',
  'shop':'Laden','market':'Markt','park':'Park','station':'Bahnhof',
  'airport':'Flughafen','hotel':'Hotel','hospital':'Krankenhaus',
  'pharmacy':'Apotheke','bank':'Bank','church':'Kirche','museum':'Museum',
  'car':'Auto','bus':'Bus','train':'Zug','plane':'Flugzeug',
  'taxi':'Taxi','bike':'Fahrrad','boat':'Boot',
  'man':'Mann','woman':'Frau','boy':'Junge','girl':'Mädchen',
  'child':'Kind','children':'Kinder','baby':'Baby','people':'Leute',
  'friend':'Freund','family':'Familie','mother':'Mutter','father':'Vater',
  'sister':'Schwester','brother':'Bruder','son':'Sohn','daughter':'Tochter',
  'grandmother':'Oma','grandfather':'Opa',
  'day':'Tag','night':'Nacht','morning':'Morgen','evening':'Abend',
  'week':'Woche','month':'Monat','year':'Jahr','time':'Zeit',
  'hour':'Stunde','minute':'Minute',
  'money':'Geld','price':'Preis','ticket':'Fahrkarte','key':'Schlüssel',
  'phone':'Telefon','computer':'Computer','internet':'Internet',
  'book':'Buch','music':'Musik','film':'Film','sport':'Sport',
  'game':'Spiel','language':'Sprache','german':'Deutsch','english':'Englisch',
  'name':'Name','number':'Nummer','question':'Frage','answer':'Antwort',
  'problem':'Problem','idea':'Idee','dream':'Traum',
  'sun':'Sonne','moon':'Mond','star':'Stern','sky':'Himmel',
  'rain':'Regen','snow':'Schnee','wind':'Wind','cloud':'Wolke',
  'tree':'Baum','flower':'Blume','river':'Fluss','mountain':'Berg',
  'sea':'Meer','lake':'See','forest':'Wald','world':'Welt',
  'dog':'Hund','cat':'Katze','bird':'Vogel','horse':'Pferd',
  'something':'etwas','nothing':'nichts','everything':'alles',
  'someone':'jemand','nobody':'niemand','together':'zusammen',
  'love':'Liebe','life':'Leben','peace':'Frieden','hope':'Hoffnung',
  'monday':'Montag','tuesday':'Dienstag','wednesday':'Mittwoch',
  'thursday':'Donnerstag','friday':'Freitag','saturday':'Samstag','sunday':'Sonntag',
};

const DE_TO_EN = {
  'ich':'I','du':'you','er':'he','sie':'she/they','wir':'we','es':'it',
  'mein':'my','meine':'my','dein':'your','deine':'your','sein':'his',
  'ihre':'her','unser':'our','ihr':'her/their',
  'bin':'am','ist':'is','sind':'are','war':'was','waren':'were',
  'habe':'have','hat':'has','hatte':'had','werde':'will','würde':'would',
  'kann':'can','könnte':'could','sollte':'should','muss':'must',
  'möchte':'want','brauche':'need','mag':'like','liebe':'love','hasse':'hate',
  'gehe':'go','gehen':'go','komme':'come','sehe':'see','weiß':'know',
  'denke':'think','esse':'eat','trinke':'drink','schlafe':'sleep',
  'arbeite':'work','lerne':'learn','helfe':'help','bekomme':'get',
  'gebe':'give','nehme':'take','mache':'make','sage':'say',
  'frage':'ask','kaufe':'buy','finde':'find','fühle':'feel',
  'schaue':'look','versuche':'try','benutze':'use','wohne':'live',
  'spiele':'play','lese':'read','schreibe':'write','höre':'listen',
  'warte':'wait','spreche':'speak','verstehe':'understand','vergesse':'forget',
  'bleibe':'stay','renne':'run','sitze':'sit','stehe':'stand',
  'macht':'makes','haben':'have',
  'ein':'a','eine':'a','der':'the','die':'the','das':'the',
  'dies':'this','diese':'these','etwas':'something',
  'nicht':'not','kein':'no','keine':'no',
  'und':'and','oder':'or','aber':'but','weil':'because','also':'so',
  'wenn':'when/if','wo':'where','was':'what','wer':'who',
  'wie':'how','warum':'why','welche':'which',
  'in':'in','auf':'on','bei':'at','zu':'to','für':'for','mit':'with',
  'ohne':'without','von':'from/of','über':'about','nach':'after/to',
  'vor':'before','zwischen':'between','unter':'under',
  'hier':'here','dort':'there','jetzt':'now','dann':'then','bald':'soon',
  'heute':'today','morgen':'tomorrow','gestern':'yesterday',
  'immer':'always','nie':'never','oft':'often','manchmal':'sometimes',
  'sehr':'very','ziemlich':'quite','wirklich':'really',
  'auch':'also','noch':'still','schon':'already','wieder':'again',
  'nur':'only','vielleicht':'maybe','bitte':'please',
  'ja':'yes','nein':'no','gut':'good','schlecht':'bad','toll':'great',
  'schön':'nice/beautiful','groß':'big','klein':'small','neu':'new',
  'alt':'old','lang':'long','kurz':'short','viele':'many','viel':'much',
  'wenig':'little','alle':'all','jeder':'every','andere':'other',
  'richtig':'right','falsch':'wrong','schnell':'fast','langsam':'slow',
  'einfach':'easy','schwer':'hard','wichtig':'important','lustig':'funny',
  'interessant':'interesting','langweilig':'boring','schwierig':'difficult',
  'glücklich':'happy','traurig':'sad','müde':'tired','hungrig':'hungry',
  'durstig':'thirsty','krank':'sick','bereit':'ready','frei':'free',
  'verloren':'lost','heiß':'hot','kalt':'cold','warm':'warm',
  'essen':'food/eat','wasser':'water','kaffee':'coffee','tee':'tea',
  'bier':'beer','wein':'wine','brot':'bread','fleisch':'meat',
  'fisch':'fish','kuchen':'cake','suppe':'soup','milch':'milk',
  'obst':'fruit','gemüse':'vegetables','reis':'rice','ei':'egg',
  'eier':'eggs','käse':'cheese','butter':'butter','zucker':'sugar',
  'pizza':'pizza','pasta':'pasta','salat':'salad','hähnchen':'chicken',
  'haus':'house','zuhause':'home','zimmer':'room','tür':'door',
  'fenster':'window','tisch':'table','stuhl':'chair','bett':'bed',
  'küche':'kitchen','bad':'bathroom','garten':'garden',
  'stadt':'city','straße':'street','schule':'school','büro':'office',
  'laden':'shop','markt':'market','park':'park','bahnhof':'station',
  'flughafen':'airport','hotel':'hotel','krankenhaus':'hospital',
  'apotheke':'pharmacy','bank':'bank','kirche':'church','museum':'museum',
  'auto':'car','bus':'bus','zug':'train','flugzeug':'plane',
  'taxi':'taxi','fahrrad':'bike','boot':'boat',
  'mann':'man/husband','frau':'woman/wife','junge':'boy','mädchen':'girl',
  'kind':'child','kinder':'children','baby':'baby','leute':'people',
  'freund':'friend','familie':'family','mutter':'mother','vater':'father',
  'schwester':'sister','bruder':'brother','sohn':'son','tochter':'daughter',
  'oma':'grandmother','opa':'grandfather',
  'tag':'day','nacht':'night','abend':'evening','woche':'week',
  'monat':'month','jahr':'year','zeit':'time','stunde':'hour','minute':'minute',
  'geld':'money','preis':'price','schlüssel':'key',
  'telefon':'phone','computer':'computer','buch':'book',
  'musik':'music','film':'film','sport':'sport','spiel':'game',
  'sprache':'language','deutsch':'German','englisch':'English',
  'name':'name','nummer':'number','frage':'question','antwort':'answer',
  'problem':'problem','idee':'idea','traum':'dream',
  'sonne':'sun','mond':'moon','stern':'star','himmel':'sky',
  'regen':'rain','schnee':'snow','wind':'wind','wolke':'cloud',
  'baum':'tree','blume':'flower','fluss':'river','berg':'mountain',
  'meer':'sea','see':'lake','wald':'forest','welt':'world',
  'hund':'dog','katze':'cat','vogel':'bird','pferd':'horse',
  'etwas':'something','nichts':'nothing','alles':'everything',
  'jemand':'someone','niemand':'nobody','zusammen':'together',
  'hallo':'hello','danke':'thanks','liebe':'love','leben':'life',
  'hilfe':'help','hoffnung':'hope','frieden':'peace','zukunft':'future',
  'hunger':'hunger','durst':'thirst','angst':'fear','freude':'joy',
  'montag':'Monday','dienstag':'Tuesday','mittwoch':'Wednesday',
  'donnerstag':'Thursday','freitag':'Friday','samstag':'Saturday','sonntag':'Sunday',
};

// ─── Detect German ────────────────────────────────────────────────────────────
function detectGerman(text) {
  if (/[äöüÄÖÜß]/.test(text)) return true;
  const germanWords = [
    'ich','du','er','sie','wir','ist','bin','habe','kann','nicht',
    'und','der','die','das','ein','eine','mit','von','zu','in',
    'nach','mir','dir','auf','für','als','auch','hat','sind','war',
    'aber','noch','wenn','dann','ja','nein','bitte','danke','wie',
    'was','wo','wer','warum','kannst','musst','willst','geht','komm',
    'guten','gute','schön','bist','heißt','sprechen','sprichst','tschüss',
    'hallo','macht','sehr','viel','mehr','alle','mein','meine','dein',
    'möchte','möchten','hätte','wäre','könnte','sollte','heute','morgen',
    'gestern','jetzt','hier','dort','immer','nie','gut','schlecht',
    'groß','klein','neu','alt','viele','wenig','beim'
  ];
  const words = text.toLowerCase().replace(/[.,!?'"]/g, '').split(/\s+/);
  return words.filter(w => germanWords.includes(w)).length >= 1;
}

// ─── Word-by-word translator ──────────────────────────────────────────────────
function wordByWord(text, isGerman) {
  const map = isGerman ? DE_TO_EN : EN_TO_DE;
  const cleaned = text.toLowerCase().replace(/[.,!?'"]/g, '').trim();
  const words = cleaned.split(/\s+/);
  let translated = [];
  let hits = 0;
  for (const w of words) {
    if (map[w]) { translated.push(map[w]); hits++; }
    else translated.push(w);
  }
  if (hits === 0) return null;
  const result = translated.join(' ');
  return result.charAt(0).toUpperCase() + result.slice(1) + '.';
}

// ─── Offline translate (phrase dict + word-by-word) ───────────────────────────
function offlineTranslate(text, isGerman) {
  const key = text.toLowerCase().replace(/[.,!?'"]/g, '').trim();
  if (OFFLINE[key]) return OFFLINE[key];
  const words = key.split(' ');
  for (let len = words.length; len >= 2; len--) {
    const partial = words.slice(0, len).join(' ');
    if (OFFLINE[partial]) return OFFLINE[partial];
  }
  return wordByWord(text, isGerman);
}

// ─── Groq AI (primary AI — ultra fast) ───────────────────────────────────────
function translateWithGroq(text, isGerman) {
  return new Promise((resolve, reject) => {
    if (!process.env.GROQ_API_KEY) return reject(new Error('No Groq key'));
    const direction = isGerman ? 'German to English' : 'English to German';
    const body = JSON.stringify({
      model: 'llama-3.1-8b-instant',
      max_tokens: 300,
      messages: [
        {
          role: 'system',
          content: `You are a precise translator. Translate ${direction}. Reply with ONLY the translation — no explanations, no quotes, no notes, nothing else.`
        },
        { role: 'user', content: text }
      ]
    });
    const options = {
      hostname: 'api.groq.com',
      path: '/openai/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Length': Buffer.byteLength(body)
      }
    };
    const req = https.request(options, (response) => {
      let data = '';
      response.on('data', chunk => data += chunk);
      response.on('end', () => {
        try {
          const json = JSON.parse(data);
          const translation = json.choices?.[0]?.message?.content?.trim();
          if (translation) resolve(translation);
          else reject(new Error('No translation from Groq'));
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.setTimeout(8000, () => { req.destroy(); reject(new Error('Groq timeout')); });
    req.write(body);
    req.end();
  });
}

// ─── LibreTranslate (fallback 1) ──────────────────────────────────────────────
function fetchLibreTranslate(text, sourceLang, targetLang) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({ q: text, source: sourceLang, target: targetLang, format: 'text' });
    const options = {
      hostname: 'libretranslate.com',
      path: '/translate',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) }
    };
    const req = https.request(options, (response) => {
      let data = '';
      response.on('data', chunk => data += chunk);
      response.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.translatedText) resolve(json.translatedText);
          else reject(new Error('No translation'));
        } catch(e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.setTimeout(5000, () => { req.destroy(); reject(new Error('LibreTranslate timeout')); });
    req.write(postData);
    req.end();
  });
}

// ─── MyMemory (fallback 2) ────────────────────────────────────────────────────
function fetchMyMemory(text, langpair) {
  return new Promise((resolve, reject) => {
    const encoded = encodeURIComponent(text);
    const url = `https://api.mymemory.translated.net/get?q=${encoded}&langpair=${langpair}`;
    https.get(url, (response) => {
      let data = '';
      response.on('data', chunk => data += chunk);
      response.on('end', () => {
        try {
          const json = JSON.parse(data);
          const translated = json.responseData?.translatedText;
          resolve((translated && translated !== text) ? translated : null);
        } catch(e) { reject(e); }
      });
    }).on('error', reject);
  });
}

// ─── Chat route ───────────────────────────────────────────────────────────────
app.post('/api/chat', requireAuth, async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'No message provided.' });

  const isGerman   = detectGerman(message);
  const sourceLang = isGerman ? 'de' : 'en';
  const targetLang = isGerman ? 'en' : 'de';
  const langpair   = isGerman ? 'de|en' : 'en|de';
  const direction  = isGerman ? 'DE → EN' : 'EN → DE';

  // 1. Offline dictionary + word-by-word (instant, no network)
  const offline = offlineTranslate(message, isGerman);
  if (offline) {
    await dbSaveTranslation(req.session.user.email, message, offline, direction);
    return res.json({ original: message, translation: offline, direction, speak: isGerman ? message : offline });
  }

  // 2. Groq AI — fast, accurate, handles complex sentences
  try {
    const translation = await translateWithGroq(message, isGerman);
    await dbSaveTranslation(req.session.user.email, message, translation, direction);
    return res.json({ original: message, translation, direction, speak: isGerman ? message : translation });
  } catch (e) {
    console.warn('Groq failed:', e.message);
  }

  // 3. LibreTranslate fallback
  try {
    const translation = await fetchLibreTranslate(message, sourceLang, targetLang);
    await dbSaveTranslation(req.session.user.email, message, translation, direction);
    return res.json({ original: message, translation, direction, speak: isGerman ? message : translation });
  } catch (e) {
    console.warn('LibreTranslate failed:', e.message);
  }

  // 4. MyMemory fallback
  try {
    const translation = await fetchMyMemory(message, langpair);
    if (translation) {
      await dbSaveTranslation(req.session.user.email, message, translation, direction);
      return res.json({ original: message, translation, direction, speak: isGerman ? message : translation });
    }
  } catch (e) {
    console.warn('MyMemory failed:', e.message);
  }

  // 5. Last resort — word-by-word only
  const lastTry = wordByWord(message, isGerman);
  if (lastTry) {
    return res.json({ original: message, translation: lastTry, direction, speak: isGerman ? message : lastTry });
  }

  return res.json({
    original: message,
    translation: 'Could not translate. Please try a simpler sentence.',
    direction,
    speak: ''
  });
});

// ─── Visitor counter ──────────────────────────────────────────────────────────
let visitorCount = 0;

app.get('/api/stats', (req, res) => {
  visitorCount++;
  res.json({ visitors: visitorCount });
});

// ─── Admin — see your users ───────────────────────────────────────────────────
// Open in browser: http://localhost:3000/api/admin
// Once deployed:   https://yourapp.railway.app/api/admin
app.get('/api/admin', async (req, res) => {
  if (!supabase) {
    return res.json({
      message: 'Supabase not connected yet',
      visitorCount,
      tip: 'Add SUPABASE_URL and SUPABASE_SECRET_KEY to your .env to see real user data'
    });
  }
  try {
    const { data: users } = await supabase
      .from('users').select('email, created_at')
      .order('created_at', { ascending: false }).limit(50);
    const { data: recentActivity } = await supabase
      .from('translations').select('user_email, original_text, direction, created_at')
      .order('created_at', { ascending: false }).limit(20);
    const { count: totalTranslations } = await supabase
      .from('translations').select('*', { count: 'exact', head: true });
    res.json({
      summary: { totalUsers: users?.length || 0, totalTranslations: totalTranslations || 0, visitorCount },
      recentUsers: users || [],
      recentActivity: recentActivity || []
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Routes ───────────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'landing.html'));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n✅  German Tutor running at http://localhost:${PORT}`);
  console.log(`   Landing page : http://localhost:${PORT}/`);
  console.log(`   App          : http://localhost:${PORT}/index.html`);
  console.log(`   Your users   : http://localhost:${PORT}/api/admin\n`);
});
# 🇩🇪 Deutsch Tutor – German Language Learning App

A modern, AI-powered German language learning web application.
Runs locally using Node.js. No database, no AI API required.

---

## 📁 Folder Structure

```
german-tutor/
├── server.js                  ← Express server & all routes
├── package.json               ← Node dependencies
│
├── services/
│   ├── chatEngine.js          ← Rule-based German correction engine
│   └── languageLoader.js      ← Loads JSON data files
│
├── data/
│   └── german/
│       ├── lessons.json       ← 6 lessons (60 sentences)
│       ├── phrases.json       ← 35 common phrases in 7 categories
│       ├── stories.json       ← 15 real-world stories
│       └── songs.json         ← 5 beginner German songs
│
└── public/
    ├── index.html             ← Single-page application shell
    ├── styles.css             ← Full dark-theme stylesheet
    └── app.js                 ← Frontend JS (vanilla, no frameworks)
```

---

## ▶️ How to Run (Windows CMD)

### Step 1 – Install Node.js
Download from https://nodejs.org and install.

### Step 2 – Open CMD in the project folder
```
cd path\to\german-tutor
```

### Step 3 – Install dependencies (one time only)
```
npm install
```

### Step 4 – Start the app
```
node server.js
```

### Step 5 – Open in browser
```
http://localhost:3000
```

---

## 🔑 Login

Enter any email address (e.g. `you@example.com`) to log in.
No password required. Session lasts 24 hours.

---

## 🛠️ API Reference

| Method | Endpoint                          | Description                  |
|--------|-----------------------------------|------------------------------|
| POST   | `/api/login`                      | Login with email             |
| POST   | `/api/logout`                     | Log out                      |
| GET    | `/api/session`                    | Check login status           |
| GET    | `/api/language/german/lessons`    | Get all lessons              |
| GET    | `/api/language/german/phrases`    | Get all phrases              |
| GET    | `/api/language/german/stories`    | Get all stories              |
| GET    | `/api/language/german/songs`      | Get all songs                |
| POST   | `/api/chat`                       | Send message to tutor        |

### Chat Request Body
```json
{ "message": "ich lerne deutsch" }
```

### Chat Response
```json
{
  "corrected": "Ich lerne Deutsch.",
  "translation": "I am learning German.",
  "explanation": "Languages are always capitalised in German."
}
```

---

## ➕ Adding More Languages

1. Create a new folder: `data/french/`
2. Add: `lessons.json`, `phrases.json`, `stories.json`, `songs.json`
3. Follow the same JSON format as `data/german/`
4. Change `const LANG = 'german'` in `public/app.js` to `'french'`

---

## ✏️ Editing Content

All content is in plain JSON files. Open with Notepad and edit directly.

- Add a lesson → open `data/german/lessons.json`, copy a lesson block and edit
- Add a story → open `data/german/stories.json`, add a new story object
- Add a phrase → open `data/german/phrases.json`, add a new phrase line

---

## 🔮 Future Enhancements (not included in MVP)

- [ ] Progress tracking per lesson
- [ ] Spaced repetition quiz mode
- [ ] Text-to-speech via Web Speech API
- [ ] User-defined vocabulary lists
- [ ] More languages (French, Spanish, Italian)
- [ ] Real AI API integration (OpenAI/Anthropic)

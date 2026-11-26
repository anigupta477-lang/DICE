# 🎲 DICE — Dynamic Intelligence & Context Engine

> A voice-first AI research assistant living inside your Chrome browser as a side panel.

DICE combines a **Chrome MV3 extension**, a **local FastAPI research backend**, and **ElevenLabs voice steering** to let you research, highlight, and organize information entirely hands-free.

---

## ✨ Features

| Feature | Description |
|---|---|
| 🎙️ **Voice Control** | Talk to DICE via ElevenLabs WebRTC — ask questions, trigger actions, get spoken answers |
| 🔍 **Research Engine** | Multi-agent backend (Scout → Gatekeeper → Synthesis) fetches, filters, and summarizes sources |
| 🗂️ **Tab Architect** | Automatically classifies and groups your open tabs into 6 categories |
| 🌿 **Morph Highlighting** | Highlights selected webpage text in sage-green on voice command |
| 🔒 **Focus Mode** | Mutes distracting tabs so you can concentrate |
| 📋 **Saved Clips** | Persist research snippets across sessions |

---

## 🏗️ Architecture

```
┌─────────────────────────────────┐
│     Chrome Side Panel (React)   │
│  ElevenLabs ──► useVoiceSteering│
│     5 client tools              │
└──────────────┬──────────────────┘
               │ HTTP (127.0.0.1:8000)
┌──────────────▼──────────────────┐
│       FastAPI Backend           │
│  Orchestrator                   │
│  ├── Scout Swarm  (fetch+parse) │
│  ├── Gatekeeper   (filter)      │
│  └── Synthesis    (Ollama LLM)  │
└─────────────────────────────────┘
```

---

## 📁 Project Structure

```
DICE/
├── extension/                  # Chrome MV3 Extension (React + TypeScript + Vite)
│   ├── manifest.json
│   ├── sidepanel.html
│   ├── mic-permission.html     # Microphone permission helper tab
│   ├── vite.config.ts
│   ├── src/
│   │   ├── App.tsx
│   │   ├── background.ts       # Selection tracker, context menu, mic permission messaging
│   │   ├── mic-permission.tsx
│   │   ├── hooks/
│   │   │   └── useVoiceSteering.ts   # ElevenLabs client tools (5 tools)
│   │   ├── services/
│   │   │   ├── tabArchitect.ts       # Tab grouping (6 categories)
│   │   │   ├── morph.ts              # Page reading, focus mode, highlighting
│   │   │   ├── backendClient.ts      # FastAPI HTTP client
│   │   │   └── storage.ts
│   │   └── components/               # UI components
│
└── backend/                    # FastAPI Python Backend
    ├── main.py                 # FastAPI app + CORS + validation error handler
    ├── orchestrator.py         # Agent coordination
    ├── schemas.py              # Pydantic request/response models
    ├── requirements.txt
    ├── test_backend.py         # 10 pytest tests
    ├── agents/
    │   ├── scout_swarm.py      # Web fetching (Wikimedia REST API, semaphore-limited)
    │   ├── gatekeeper.py       # Source quality filtering
    │   └── synthesis.py        # Ollama LLM summarization
    └── services/
        └── ollama.py           # Ollama HTTP client
```

---

## 🚀 Getting Started

### Prerequisites

- **Chrome** 114+ (for Side Panel support)
- **Node.js** 18+ and npm
- **Python** 3.11+
- **Ollama** running locally with a model (e.g. `llama3.2`)
- An **ElevenLabs** account with a Conversational AI agent

---

### 1. Backend Setup

```bash
cd backend

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env:
#   OLLAMA_BASE_URL=http://localhost:11434
#   OLLAMA_MODEL=llama3.2
#   DICE_CONTACT_INFO=your-email@example.com

# Start the server
uvicorn main:app --host 127.0.0.1 --port 8000
```

> **Note:** Make sure Ollama is running (`ollama serve`) and you have pulled your model (`ollama pull llama3.2`).

---

### 2. Extension Setup

```bash
cd extension

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env:
#   VITE_ELEVENLABS_AGENT_ID=your_agent_id_here

# Build the extension
npm run build
```

---

### 3. Load in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select the `extension/dist/` folder
5. Pin the DICE extension to your toolbar
6. Click the DICE icon → **Open Side Panel**

---

### 4. Microphone Permission

The first time you click **Connect**:

1. DICE opens a `mic-permission` tab
2. Click **Enable Microphone** to grant access
3. Return to the side panel and click **Connect** again

---

## 🤖 ElevenLabs Agent Setup

Configure your ElevenLabs Conversational AI agent with these **Client Tools**:

| Tool Name | Description |
|---|---|
| `get_current_page` | Reads the active tab's title, URL, and page content |
| `organize_tabs` | Groups open tabs into categorized tab groups |
| `set_focus_mode` | Enables or disables Focus Mode (mutes background tabs) |
| `start_research` | Triggers the DICE research pipeline with a query |
| `highlight_selected_text` | Highlights the user's most recently selected text |

**Suggested agent instructions:**

```
You are DICE, a voice-first browser research assistant.
Call get_current_page when asked about the current webpage.
Call organize_tabs when asked to organize or group tabs.
Call set_focus_mode when asked to focus or un-focus.
Call start_research with the user's full research query.
Call highlight_selected_text when the user says "highlight that" or "mark that".
Keep responses short, natural, and conversational.
Never invent research findings.
```

---

## 🧪 Running Tests

```bash
cd backend
python -m pytest test_backend.py -v
```

10 tests covering:
- Request schema validation
- Scout Swarm URL handling and Wikipedia endpoint
- Gatekeeper filtering logic
- Synthesis skipping when no sources
- Orchestrator end-to-end flow

---

## 🛠️ Development

### Backend (hot reload)
```bash
cd backend
uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

### Extension (watch mode)
```bash
cd extension
npm run dev
```

Then reload the unpacked extension in `chrome://extensions` after changes.

---

## ⚙️ Environment Variables

### `backend/.env`

| Variable | Default | Description |
|---|---|---|
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama API base URL |
| `OLLAMA_MODEL` | `llama3.2` | Model to use for synthesis |
| `DICE_CONTACT_INFO` | *(required)* | Your email or project URL for ethical User-Agent headers |

### `extension/.env`

| Variable | Description |
|---|---|
| `VITE_ELEVENLABS_AGENT_ID` | Your ElevenLabs Conversational AI agent ID |

---

## 📌 Notes

- The backend only binds to `127.0.0.1` — it is **not** exposed externally.
- The extension uses `optional_host_permissions` for webpage reading — permission is requested per origin.
- Wikipedia content is fetched via the [Wikimedia REST API](https://www.mediawiki.org/wiki/Wikimedia_REST_API) with respectful rate limiting.
- No data is sent to external servers except ElevenLabs (voice) and Ollama (local LLM).

---

## 📄 License

MIT

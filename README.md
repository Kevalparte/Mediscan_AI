# 💊 MediScan AI

**Smart Medicine Recognition & Patient Guidance Platform**

An AI-powered healthcare assistant that scans medication images, identifies drugs via OCR, checks drug-drug interactions, schedules dosage reminders, and provides a conversational AI pharmacist — all with multilingual voice support for Hindi and Marathi.

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| **🔍 Medicine Scanner & OCR** | Upload tablet/bottle/prescription images → AI identifies medicines, extracts text via OCR, and provides purpose, dosage, side effects, and precautions |
| **⚠️ Drug Interaction Checker** | Enter 2+ medicines → AI analyzes drug-drug interactions with severity levels (safe / caution / dangerous) |
| **⏰ Dosage Reminders** | Schedule medication reminders with custom timing, frequency, and days. Synced to Firebase with local fallback |
| **💬 AI Pharmacist Chat** | Multi-turn conversational chatbot for medication questions, powered by Gemini and Groq |
| **🔊 Voice Accessibility** | Text-to-speech readback in **English**, **Hindi (हिंदी)**, and **Marathi (मराठी)** |
| **🌐 Real-time Translation** | Translate medical reports between English ↔ Hindi ↔ Marathi |
| **🌙 Dark Mode** | Full dark theme support |
| **🔐 Firebase Auth** | Secure email/password and Google sign-in authentication |

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 19, TypeScript, Tailwind CSS 4, Lucide Icons |
| **Backend** | Express.js (Node.js), TypeScript |
| **AI Models** | Google Gemini (primary), Groq LLaMA (fallback) |
| **Database** | Firebase Firestore (with localStorage offline fallback) |
| **Auth** | Firebase Authentication (Email + Google) |
| **OCR** | OCR.space API |
| **Drug Data** | OpenFDA API |
| **Build Tool** | Vite, esbuild |

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** 18+ and **npm**
- A [Firebase project](https://console.firebase.google.com/) with Authentication and Firestore enabled
- A [Gemini API key](https://aistudio.google.com/apikey)

### Installation

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/mediscan-ai.git
cd mediscan-ai

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
# Edit .env.local with your API keys (see Environment Variables section)

# Set up Firebase config
cp firebase-applet-config.example.json firebase-applet-config.json
# Edit firebase-applet-config.json with your Firebase project credentials

# Start development server
npm run dev
```

The app will be available at `http://localhost:3000`.

### Production Build

```bash
npm run build
npm start
```

---

## 🔑 Environment Variables

Copy `.env.example` to `.env.local` and fill in the values:

| Variable | Required | Description |
|----------|----------|-------------|
| `GEMINI_API_KEY` | ✅ | Google Gemini AI API key |
| `GROQ_API_KEY` | Recommended | Groq AI fallback API key |
| `OCR_SPACE_API_KEY` | Recommended | OCR.space API key for text extraction |
| `OPENFDA_API_KEY` | Optional | OpenFDA API key (works without, lower rate limits) |
| `FIREBASE_PROJECT_ID` | ✅ | Your Firebase project ID |
| `FIREBASE_API_KEY` | ✅ | Your Firebase web API key |
| `FIREBASE_AUTH_DOMAIN` | ✅ | Firebase Auth domain |
| `VITE_FIREBASE_*` | ✅ | Same Firebase values with `VITE_` prefix for client |

> **Note:** You can alternatively provide Firebase config via `firebase-applet-config.json` (see the example file).

---

## 📁 Project Structure

```
mediscan-ai/
├── src/
│   ├── components/
│   │   ├── Auth.tsx            # Login/Register with Firebase
│   │   ├── Dashboard.tsx       # Main app layout, sidebar, history
│   │   ├── ScanModule.tsx      # Medicine image scan & OCR
│   │   ├── InteractionModule.tsx  # Drug interaction checker
│   │   ├── ReminderModule.tsx  # Dosage reminder scheduler
│   │   └── ChatModule.tsx      # AI pharmacist chatbot
│   ├── lib/
│   │   └── firebase.ts         # Firebase client initialization
│   ├── types.ts                # TypeScript interfaces
│   ├── main.tsx                # App entry point
│   └── index.css               # Global styles (Tailwind)
├── server.ts                   # Express API server
├── firebase-applet-config.example.json
├── firestore.rules             # Firestore security rules
├── .env.example                # Environment variables template
├── vite.config.ts              # Vite configuration
├── tsconfig.json               # TypeScript configuration
└── package.json
```

---

## 🔒 Security

- All API keys are loaded exclusively from environment variables
- Firebase Authentication handles user identity
- Firestore security rules enforce user-level data isolation
- No credentials are stored in source code
- Patient data is scoped to individual user accounts

---

## 🌏 Supported Languages

| Language | Text Translation | Voice Readback |
|----------|:---------------:|:--------------:|
| English  | ✅ | ✅ |
| Hindi (हिंदी) | ✅ | ✅ |
| Marathi (मराठी) | ✅ | ✅ (falls back to Hindi TTS if native Marathi voice unavailable) |

---

## ⚖️ License

This project is licensed under the [MIT License](LICENSE).

---

## ⚠️ Disclaimer

MediScan AI is an educational and assistive tool. It is **not** a substitute for professional medical advice, diagnosis, or treatment. Always consult a qualified healthcare provider for medication decisions.
"# Mediscan_AI" 

<div align="center">

# 🧠 HOCKS AI

### **Next-Generation AI Platform — Powered by Google Gemini**

[![Live Demo](https://img.shields.io/badge/🌐_Live_Demo-hocks.app-00C9A7?style=for-the-badge)](https://hocks.app)
[![Firebase](https://img.shields.io/badge/Firebase-Hosted-FFCA28?style=for-the-badge&logo=firebase&logoColor=black)](https://firebase.google.com)
[![Gemini](https://img.shields.io/badge/Google_Gemini-AI_Engine-4285F4?style=for-the-badge&logo=google&logoColor=white)](https://ai.google.dev)
[![License](https://img.shields.io/badge/License-MIT-A855F7?style=for-the-badge)](LICENSE)

---

*A sleek, production-ready AI platform featuring real-time streaming chat, image analysis, video intelligence, and instant website generation — all powered by cutting-edge Gemini models.*

</div>

---

## 🎬 Preview

<div align="center">
<table>
<tr>
<td align="center"><b>💬 AI Chat</b><br/><sub>Real-time streaming conversations</sub></td>
<td align="center"><b>🖼️ Image Analysis</b><br/><sub>Vision-powered image understanding</sub></td>
</tr>
<tr>
<td align="center"><b>🎥 Video Analysis</b><br/><sub>Intelligent video comprehension</sub></td>
<td align="center"><b>🌐 Website Generator</b><br/><sub>Instant site creation from prompts</sub></td>
</tr>
</table>
</div>

---

## ✨ Features

| Feature | Description | Model |
|---------|-------------|-------|
| 💬 **AI Chat** | Real-time streaming conversations with context memory | `gemini-2.0-flash` |
| 🖼️ **Image Analysis** | Upload any image for detailed AI-powered analysis | `gemini-2.0-flash` |
| 🎥 **Video Analysis** | Describe videos and get intelligent AI insights | `gemini-2.0-flash` |
| 🌐 **Website Generator** | Generate stunning, complete websites from text prompts | `gemini-2.5-flash` |
| 🧠 **Memory System** | Save context memories for personalized AI responses | Firestore |
| 🔐 **Authentication** | Secure email/password and Google sign-in | Firebase Auth |
| 👑 **Admin Dashboard** | Analytics, feature toggles, and credit monitoring | Custom |

---

## 🏗️ Architecture

```
+-----------------------------------------------------+
|                  Client (Browser)                    |
|          React SPA  -  Glassmorphism Dark UI         |
+-----------------------------------------------------+
                          |
                          v
+-----------------------------------------------------+
|                  Firebase Hosting                    |
|            hocks.app / hocks-ai.web.app              |
+-----------------------------------------------------+
                          |
                          v
+-----------------------------------------------------+
|             Firebase Cloud Functions                 |
|                                                     |
|  +--------------+ +-------------+ +---------------+ |
|  | streamChat   | | analyzeImg  | | generateCode  | |
|  | (SSE)        | | (Vision)    | | (Website Gen) | |
|  +--------------+ +-------------+ +---------------+ |
|         |               |               |           |
|         v               v               v           |
|  +-----------------------------------------------+  |
|  |        Google Gemini API (AI Engine)           |  |
|  +-----------------------------------------------+  |
+-----------------------------------------------------+
                          |
                          v
+-----------------------------------------------------+
|  Firestore  |  Auth  |  Storage  |  Secret Manager  |
+-----------------------------------------------------+
```

---

## 🚀 Tech Stack

<div align="center">

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 18 · Vite · CSS3 (Glassmorphism) |
| **Backend** | Firebase Cloud Functions (Node.js 20) |
| **AI Engine** | Google Gemini 2.0 Flash · Gemini 2.5 Flash |
| **Auth** | Firebase Authentication (Email + Google) |
| **Database** | Cloud Firestore |
| **Storage** | Firebase Storage |
| **Hosting** | Firebase Hosting + Custom Domain |
| **Security** | Firebase Security Rules · Secret Manager |

</div>

---

## ⚡ Quick Start

### Prerequisites

- [Node.js 20+](https://nodejs.org/)
- [Firebase CLI](https://firebase.google.com/docs/cli) (`npm install -g firebase-tools`)
- A [Google AI Studio](https://aistudio.google.com/) API key

### Setup

```bash
# Clone the repository
git clone https://github.com/x-tahosin/hocks-ai.git
cd hocks-ai

# Install dependencies
cd functions && npm install && cd ..

# Login to Firebase
firebase login
firebase use hocks-ai

# Set your Gemini API key as a secret
firebase functions:secrets:set GEMINI_API_KEY

# Deploy everything
firebase deploy
```

### Environment Variables

Copy `.env.example` to `.env` and fill in your Firebase config:

```env
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

---

## 📁 Project Structure

```
hocks-ai/
├── dist/                    # Production build (deployed to Firebase Hosting)
│   ├── index.html
│   └── assets/
├── functions/               # Firebase Cloud Functions
│   ├── index.js             # All API endpoints (Gemini integration)
│   ├── setup-admin.js       # Admin initialization script
│   └── package.json
├── firebase.json            # Firebase configuration
├── firestore.rules          # Firestore security rules
├── .env.example             # Environment variable template
└── index.html               # Root HTML entry point
```

---

## 🔒 Security

- **API keys** stored securely via Firebase Secret Manager
- **Firestore rules** enforce per-user data isolation
- **Authentication** required for all AI features
- **Admin access** controlled via custom claims + email verification
- **No client-side API keys** — all AI calls go through Cloud Functions

---

## 🌐 Live Deployment

| URL | Description |
|-----|-------------|
| [**hocks.app**](https://hocks.app) | Custom domain (primary) |
| [**hocks-ai.web.app**](https://hocks-ai.web.app) | Firebase default URL |

---

## 👨‍💻 Author

<div align="center">

**Built with ❤️ by [x-tahosin](https://github.com/x-tahosin)**

[![GitHub](https://img.shields.io/badge/GitHub-x--tahosin-181717?style=for-the-badge&logo=github)](https://github.com/x-tahosin)

</div>

---

## 📄 License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

<div align="center">

---

<sub>⭐ Star this repo if you find it useful!</sub>

</div>

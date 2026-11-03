# ULTRON AI

### An intelligent assistant interface built with AI, 3D graphics, and computer vision.

**ULTRON AI** is an ongoing AI assistant project by **Eswar Kutala**. It brings together a modern web interface, an interactive 3D orb, hand-tracking experiments, and a separate backend for assistant services.

The project is being developed iteratively, with an emphasis on practical engineering, modular architecture, and a distinctive assistant experience.

---

## Project Overview

ULTRON AI is designed around three main areas:

- **Interactive experience:** a browser-based interface with a Three.js-powered 3D orb.
- **Computer vision:** hand tracking using MediaPipe Tasks Vision.
- **Assistant services:** a separate Node.js and Express backend for API functionality.

The project is under active development. Features and implementation details may change as the architecture evolves.

## Technology Stack

| Area | Technology |
|---|---|
| Frontend framework | Next.js |
| UI library | React |
| Language | TypeScript |
| 3D graphics | Three.js |
| Hand tracking | MediaPipe Tasks Vision |
| Backend runtime | Node.js |
| Backend framework | Express.js |
| Backend hosting | Render |
| Frontend hosting | GitHub Pages (project deployment target) |

## Repository Structure

```text
Ultron-AI-By-Eswar-/
├── .github/
│   └── workflows/       # GitHub Actions workflows
├── Backend/             # Express backend and API services
├── app/                 # Next.js application routes and global styles
├── components/          # Reusable UI components
├── docs/                # Project documentation and supporting assets
├── lib/                 # 3D scene and computer-vision utilities
├── .env.local           # Local environment configuration (do not commit)
├── .gitignore
├── LICENSE
├── next.config.ts
├── package.json
├── package-lock.json
├── render.yaml          # Render deployment configuration
├── tsconfig.json
└── README.md
```

## Key Components

### Interactive 3D Orb
The orb experience is built with **Three.js** and connected to the React interface through the `JarvisOrb` component.

### Hand Tracking
**MediaPipe Tasks Vision** is used for webcam-based hand tracking and gesture interaction experiments.

### Backend API
The `Backend/` directory contains the separate Express server. The backend is responsible for server-side assistant functionality and API routes.

### Deployment Configuration
The repository includes a `render.yaml` file for Render deployment and GitHub Actions workflow configuration under `.github/workflows/`.

## Getting Started

### Requirements

- Node.js (LTS recommended)
- npm
- Git
- A modern browser

### 1. Clone the repository

```bash
git clone https://github.com/EswarAITechnology/Ultron-AI-By-Eswar-.git
cd Ultron-AI-By-Eswar-
```

### 2. Install frontend dependencies

Run this command from the repository root:

```bash
npm install
```

### 3. Configure environment variables

Create the local environment file required by your configuration:

```text
.env.local
```

Add the frontend environment variables required by the application. Configure backend secrets separately in the backend environment and in the Render dashboard.

**Security:** Never commit `.env.local`, backend `.env` files, API keys, tokens, or other secrets to Git. Keep private credentials on the server; do not expose them through client-side `NEXT_PUBLIC_` variables.

### 4. Start the frontend locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### 5. Build for production

```bash
npm run build
```

To run the Next.js production server locally:

```bash
npm start
```

> The frontend and backend are separate services. Start and configure the backend using the scripts and environment variables defined in `Backend/`. Do not assume the frontend's `npm start` command starts the backend.

## Backend

The backend source is located in:

```text
Backend/
```

The Render deployment configuration is maintained in `render.yaml`.

The backend exposes a status endpoint at:

```text
/api/status
```

Use the deployed backend's base URL when configuring the frontend's API connection. Set the allowed frontend origin to the exact deployed frontend origin in the backend's CORS configuration.

For local development, configure the backend's environment variables in its own environment file. Never place server-only API keys in frontend code.

## Deployment

The intended deployment setup separates the frontend and backend:

| Service | Deployment target |
|---|---|
| Frontend | GitHub Pages |
| Backend API | Render |

Deployment settings must match the actual build output, Next.js configuration, backend start command, environment variables, and CORS origin. A successful GitHub push does not by itself confirm that either service has deployed successfully.

## Development Status

**Status: Active Development**

ULTRON AI is a work in progress. The repository may contain experimental features, evolving APIs, and deployment changes. Some capabilities may require additional configuration before they are available.

## Developer

**Eswar Kutala**  
Developer of ULTRON AI  
Founder of Zlaude AI (AI startup initiative)

- GitHub: [@EswarAITechnology](https://github.com/EswarAITechnology)
- Repository: [Ultron-AI-By-Eswar-](https://github.com/EswarAITechnology/Ultron-AI-By-Eswar-)

---

## Project Philosophy

> Build with curiosity. Engineer with purpose. Use technology to create new possibilities.

**ULTRON AI — Exploring a more interactive way to experience AI.**

---

© 2026 Eswar Kutala.
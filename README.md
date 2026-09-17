# NovaType

A modern typing speed test with animated visuals and deep customization.

## Features

| Feature | Details |
|---|---|
| **Modes** | Time · Words · Endless · Custom text |
| **Themes** | 14 built-in (Deep Blue, Midnight, Ocean, Cyber, Ice, Nord, Aurora, Nebula, Abyss, Matrix, Ember, Rose, Mono, Paper) + Custom |
| **Difficulty** | Easy · Normal · Hard (symbols/numbers) · Expert (no caret, no backspace) |
| **Performance** | Full / Lite profile · 5 individual effect switches · Plain look (B&W) |
| **Window** | Frameless · Minimize/Maximize/Close · Fullscreen (F11) · Remembers size/position |
| **Input** | Space forgiveness · Stop on error · Custom text sources with rotation · Fun facts |
| **Accessibility** | Reduce motion · System font option · Adjustable font size/spacing |

## Setup

Requires Node 18+ and npm.

```bash
npm install
npm run dev
```

### Desktop app

```bash
npm run desktop    # build + run in Electron
npm run dist:win   # package release/NovaType-win32-x64/NovaType.exe
```

## Tech Stack

React 18 · TypeScript · Vite · Tailwind CSS · Framer Motion · Zustand · Electron

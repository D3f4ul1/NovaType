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

## GUI

<table>
  <tr>
    <td><img src="https://github.com/user-attachments/assets/e45e3aba-d9a5-47fa-a8c9-1697817ec0d1" width="300" alt="ember"></td>
    <td><img src="https://github.com/user-attachments/assets/266be4c8-635a-4a43-b21e-c107cd252876" width="300" alt="paper"></td>
    <td><img src="https://github.com/user-attachments/assets/cebd1782-7756-433a-b0fe-6095605de3d2" width="300" alt="mono"></td>
  </tr>
  <tr>
    <td><img src="https://github.com/user-attachments/assets/42eff25d-65f2-430c-8574-37a3c071cff0" width="300" alt="deep-blue"></td>
    <td><img src="https://github.com/user-attachments/assets/0251bb55-2d8d-4da1-91a6-3a6f7125a005" width="300" alt="settings-typography"></td>
    <td><img src="https://github.com/user-attachments/assets/cc248061-ac4c-45f9-8da2-5de8a67ebb70" width="300" alt="settings-themes"></td>
  </tr>
  <tr>
    <td><img src="https://github.com/user-attachments/assets/fc27d8a2-ad37-4f3d-b9c4-2fc46b4f1465" width="300" alt="settings-performance"></td>
    <td></td>
    <td></td>
  </tr>
</table>
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

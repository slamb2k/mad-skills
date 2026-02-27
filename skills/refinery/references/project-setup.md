# Refinery Project Setup

Steps 2-4 of initial project creation.

## Package Manager Detection

Detect available package manager (fallback chain):
1. `bun` -> use bun commands
2. `pnpm` -> use pnpm commands
3. `yarn` -> use yarn commands
4. `npm` -> use npm commands (always available)

## Step 2: Initialize Project

```bash
# Using detected package manager (example: bun)
bun create vite . --template react-ts
bun install
bun add -d tailwindcss postcss autoprefixer
bunx tailwindcss init -p
bun add react-router-dom
bun add lucide-react
```

## Step 3: Configure Tailwind

Update `tailwind.config.js`:
```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: { extend: {} },
  plugins: [],
}
```

Update `src/index.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

## Step 4: Set Up Routing

Copy `assets/DesignNav.tsx` to `src/components/DesignNav.tsx`.

Create `src/App.tsx` with routes for each design:
```tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Design1 from './designs/Design1'
// ... import each design

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/1" replace />} />
        <Route path="/1" element={<Design1 />} />
        {/* ... route per design */}
      </Routes>
    </BrowserRouter>
  )
}
```

## DesignNav Usage

Each design file imports and renders the shared nav:
```tsx
import DesignNav from '../components/DesignNav'

const designs = [
  { id: 1, name: 'Glassmorphism' },
  { id: 2, name: 'Dark Premium' },
  // ... all designs
]

export default function Design1() {
  return (
    <div>
      {/* Design content */}
      <DesignNav designs={designs} variant="glass" />
    </div>
  )
}
```

Variant selection:
- `variant="light"` for light-themed designs
- `variant="dark"` for dark-themed designs
- `variant="glass"` for glassmorphism or translucent designs

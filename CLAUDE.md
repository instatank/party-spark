# PartySpark - Developer Context & Guidelines

## 🤖 Role & Core Directives
You are the lead developer and architect of **PartySpark**, a premium, AI-powered party game application. 
- **Your primary directive:** Maintain the "Wow" factor. Every UI component must feel premium, using glassmorphism, dynamic gradients, smooth micro-animations, and high-contrast text. Simple or basic MVPs are unacceptable.
- **Your secondary directive:** Ensure offline reliability. Most games must work without an internet connection using local fallback datastores, with AI generation acting as an optional "spice" rather than a hard dependency.

## 🏗️ Architecture & Tech Stack
- **Framework:** React + TypeScript via Vite.
- **Styling:** Tailwind CSS v4.
- **UI Design (IMPORTANT):** The standard app theme is a "dark/glassmorphism" aesthetic. We explored daytime variations ("Azure Sky", "Warm Cream") in previous agent chats, but maintaining the high-contrast dark theme with vibrant accents remains the primary directive for new components.
- **Routing:** Simple state-based routing via `App.tsx` (no React Router). The `GameType` enum drives the active screen.
- **Data Strategy:** Offline-first. Questions/Cards are stored in static JSON files (`src/data/*.json`).
- **AI Integration (The Claude Transition):** Originally built around Google Gemini endpoints, the platform architecture has recently shifted towards Anthropic's Claude APIs for AI prompt generation (specifically for RoastMe and custom Most Likely To categories). Keep this context in mind if working with backend generation proxies. Prompts are handled client-side but abstracted through localized service classes.

## 🚫 Explicit Constraints & "Do Not Touch" Rules
Before changing existing code, adhere to these explicit constraints. Some of these represent intentional design decisions we made to prioritize speed, offline capability, or UX over traditional engineering architectures.

1. **The Adult Content PIN Gate (`0438`)**
   - **Do NOT refactor to a backend/DB.** The security gate (`PinGateModal` in `src/components/ui/PinGate.tsx`) intentionally relies purely on front-end `sessionStorage` (`partyspark_adult_unlocked`). If the user closes the tab, they must re-enter the PIN. This is specifically designed to keep the app stateless and frictionless while preventing accidental access by younger family members during shared tablet use.
   - **Do NOT change the PIN.** It must remain `0438`.
   - **Do NOT remove the 5-attempt lockout.** It prevents brute-forcing and locks the session via `sessionStorage`.

2. **Tailwind v4 Animation Constraints**
   - **Anti-Pattern:** Placing custom CSS classes (like `.animate-shake`) inside the `@theme` block in `src/index.css`.
   - **Reason:** Tailwind v4 throws a build error if `@theme` contains anything other than custom properties or `@keyframes`. Keyframes go in `@theme`, utility classes go outside it.

3. **Routing Mechanism**
   - **Do NOT introduce `react-router-dom` or Next.js.** The single-page `switch` statement in `App.tsx` is an intentional architectural limit to keep the build incredibly small and transitions instantaneous. Keep utilizing `setActiveGame(GameType.HOME)` as the navigation back-stack.

4. **Game Navigation UI**
   - **Strict Rule:** Every single game screen *must* render the `ScreenHeader` component with working `onBack` and `onHome` props. Do not orphan users deep within a game flow.

## 🎮 Game Roster & Current State

### 1. The Forecast (Formerly "Compatibility Test")
- **State:** Live.
- **Mechanic:** Player A predicts Player B's answer to a scenario.
- **Data:** 135 total questions stored statically in `compatibility_test.json`.
- **Modes:** Couples, Friends, Bunny (Adults Only).
- **Quirks:** The entire game is adult-gated at the `App.tsx` level.

### 2. Most Likely To
- **State:** Live.
- **Mechanic:** Voting on friends based on prompts.
- **Data:** Static JSON + API generation.
- **Quirks:** Supports a "✨ Create Your Vibe" mode that hits an AI API to generate custom cards based on user description. The "Scandalous" and "X-Rated" categories are PIN-gated at the component level.

### 3. RoastMe & Fact or Fiction
- **State:** Live / Playable.
- **Quirks:** RoastMe actively uses image uploads and AI API calls for dynamic roasting generation.

### 4. Coming Soon (Next Priorities)
- **Truth or Drink:** Pending UI build and question curation. Already wired into the `App.tsx` adult PIN gate.
- **Would I Lie To You / Never Have I Ever:** Stubs exist, awaiting full mechanic implementation.
- **Traitors / Mafia:** Existing stubs need severe refinement of the board-game logic and role assignments.

## 🚀 Build & Deployment Pipeline
We do not rely on standard Vercel GitHub integrations due to the fast iteration cycle and localized deployment preferences.

1. **Build locally:** `npm run build`
2. **Deploy script:** We use a local sync script to push to production. 
   - Workflow: Run `npm run build`, followed by an `rsync` command moving the dist to `/Users/ankitanand/.gemini/antigravity/scratch/party-spark/`, and then run `./deploy.sh` inside that scratch directory.
   - Example deployment command chain used in the terminal:
     `npm run build && rsync -av --exclude 'node_modules' --exclude '.git' ./ ../../scratch/party-spark/ && cd ../../scratch/party-spark && ./deploy.sh`

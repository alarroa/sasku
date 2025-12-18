# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Sasku is a traditional Estonian 4-player card game implemented as a React web application. The game features two teams (players 0&2 vs 1&3), bidding mechanics, trump selection, and strategic card play with pictures (K/Q/J) always acting as trumps.

## Commands

### Development
```bash
npm install          # Install dependencies
npm run dev          # Start development server
npm run build        # Build for production
npm run preview      # Preview production build locally
```

### Linting & Quality
```bash
npm run lint         # Run ESLint on the codebase
```

### Deployment
```bash
npm run deploy       # Build and deploy to GitHub Pages
```

## Architecture

### Core Game Logic (`src/game/`)

**State Management (`gameState.js`)**
- Central game state machine with phases: `DEAL_CHOICE`, `PACK_CHOICE`, `BIDDING`, `PLAYING`, `ROUND_END`, `GAME_END`
- All game logic is pure functions that return new state objects
- Key functions: `playCard()`, `makeBid()`, `chooseTrump()`, `chooseDealOption()`
- Game state persists to localStorage via `GameBoard.jsx`
- Team system: players 0&2 (team 0) vs players 1&3 (team 1), accessed via `getTeam(playerIndex)`

**Card System (`cards.js`)**
- Suits ranked by strength: Clubs > Spades > Hearts > Diamonds
- Pictures (K/Q/J) are always trumps regardless of suit
- Regular cards: A(11pts), 10(10pts), 9/8/7/6(0pts)
- `calculateBiddingValue()`: returns max possible bid based on pictures + longest suit (max 9)
- `compareTrumpCards()`, `compareCards()`: handles complex trump and suit-following logic

**AI Logic (`ai.js`)**
- `makeAIBid()`: bids if `maxPossibleBid >= 7`, or if no one has bid yet and `>= 5`
- `chooseAITrump()`: selects strongest suit based on hand distribution
- `chooseAICard()`: implements rule-following logic with card tracking and strategic play
- Card counting: tracks played cards to make informed decisions
- Hand evaluation: considers aces, tens, pictures, and suit distribution

### React Components (`src/components/`)

**GameBoard.jsx**
- Main game coordinator component
- Manages all game state using hooks and localStorage persistence
- Handles AI turn automation with `useEffect` and delays (600ms normal, 2.5s after trick completion)
- Player 0 is always human; players 1-3 are AI
- Auto-pass logic for players who have already passed during bidding

**Hand.jsx**
- Renders a player's hand of cards
- Handles card selection and playability validation
- Shows card counts for AI players instead of actual cards

**Card.jsx**
- Individual card component with suit/rank display
- Visual states: playable, selected, disabled

### Internationalization (`src/i18n/`)

**et.js**
- Estonian language strings for all UI text
- Organized by category: meta, suits, players, dealChoice, bidding, playing, scoring, gameEnd
- All user-facing text should reference `et` object

### Styling
- Component-scoped CSS files (e.g., `GameBoard.css`, `Hand.css`, `Card.css`)
- Mobile-responsive with breakpoints for smaller screens
- Card dimensions and layout defined in CSS custom properties

## Game Rules Implementation

### Bidding System
- Minimum bid: 5 (after "Omale" option introduced)
- Bid calculation: pictures count + longest suit length (capped at 9)
- "Ruutu" quick-bid option: auto-bid and select diamonds as trump (worth 4 points instead of 2)
- "Üleküla ruutu": if all players pass, diamonds becomes trump automatically

### Trump Selection
- Player can only select suits that match their bid calculation
- Exception: Diamonds can ALWAYS be selected regardless of bid
- Pictures (K/Q/J) are always trumps in addition to the chosen trump suit

### Card Playing Rules
1. **Trump lead**: Must follow with trump (picture or trump suit), must overtrump if possible
2. **Non-trump lead**: Must follow suit if able, otherwise must play trump/picture if able
3. **Trick winner**: Pictures > regular cards, with King > Queen > Jack, suit strength breaks ties for same rank

### Scoring System (gameState.js:325-383)
- **Üleküla ruutu** (all passed): 2 points to team with more trick points
- **Karvane** (all 9 tricks): 6 points
- **Trump won** (≥61 points): 2 points (4 if diamonds trump)
- **Jänn bonus**: +2 points if opponent scores <30 points
- **Trump defeated**: Opposing team gets 2-4 points + 2 bonus + possible Jänn (+2)
- **Win condition**: First team to reach 16 points

## Key Implementation Details

### State Persistence
- Game state saves to localStorage on every change (GameBoard.jsx:42-49)
- Loads from localStorage on mount
- New game button clears localStorage and forces remount

### AI Timing
- AI moves have intentional delays for better UX
- 600ms standard delay between moves
- 2.5s delay after completing a trick to show results

### Deal Options
Three deal options affect game start:
- **Tõstan** (normal): Standard shuffle and deal
- **Pime Ruutu** (blind diamonds): Deal and set diamonds as trump immediately with +2 bonus
- **Valida** (choose pack): Show 4 packs with top/bottom cards visible for selection

### Tunable Parameters
These are the main parameters that can be adjusted:
- **AI bidding threshold**: `ai.js:18` (currently `maxPossibleBid >= 7`)
- **AI initial bid threshold**: `ai.js:23` (currently `maxPossibleBid >= 5`)
- **Win condition**: `gameState.js` (currently 16 points)
- **Scoring values**: `gameState.js:325-383`
- **AI delays**: `GameBoard.jsx:73` (600ms and 2500ms)

## File Location Reference
- Game rules validation: `gameState.js:125-158`
- Trick winner logic: `gameState.js:202-250`
- Bidding rules: `gameState.js:57-64`
- Card comparison: `cards.js:95-145`
- AI strategy: `ai.js`

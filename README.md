# Ninja Coach

A chess coach for your chess.com games. Give it your chess.com username and it does the rest:

- **It keeps your last 20 games**, checks for new ones each time you open the app, and lets older ones drop off.
- **It reviews each one with Stockfish 18** on your phone, in the background, newest first.
- **Each move gets a classification:** Brilliant, Great, Best, Excellent, Good, Book, Inaccuracy, Mistake, Miss or Blunder (chess.com's expected-points thresholds). Each player also gets an accuracy score (the lichess formula) and a game rating estimate.
- **It debriefs your latest game** like a coach would: how it ended, your best moment and where the game turned. Then each key moment becomes a hands-on workshop:
  - **Watch:** step through what happened, the better move and a couple of other tries, one tap per move, with a caption for each ("their knight forks the king and rook").
  - **Your turn:** you play the better line yourself and the coach plays the replies.
  - **Tinker:** try any move; the engine answers and tells you what it does.
- **Moments:** every brilliant move, great move, blunder, mistake and missed win across all your games, in one list. Tap one to go straight to that position with **Show me**.
- **Mate drill:** every forced mate you missed (up to mate in 5), or got to the long way round, becomes a puzzle. You get a few a day. Try it first, with hints if you want them; the engine plays their best defence. Then the coach walks you through how you could have seen it: count the king's squares, try every check, follow each forcing move and its reply, and see why the final position is mate. Miss one and it comes back tomorrow until you get it.
- **Stats** for your last 20 games, the kind chess.com keeps behind its paywall:
  - **results:** score, win rate and W/D/L by colour, time control, opponent strength (higher, similar, lower rated), time of day, day of the week and game length; your best win and toughest loss; streaks;
  - **how games end:** wins, losses and draws by checkmate, resignation, time, repetition and so on;
  - **rating:** your chess.com rating for each time control, with change, peak and low;
  - **accuracy and game rating:** average against your opponents, best and worst game, in wins, draws and losses, centipawn loss, and the trend game by game;
  - **move quality:** brilliant to blunder per game, next to your opponents';
  - **by phase and by piece:** accuracy in the opening, middlegame and endgame, where your points go, and how well you play each piece;
  - **time:** seconds per move (and per phase), time left at the end, games lost on time, mistakes made in time trouble, your longest think;
  - **tactics:** brilliant and great moves, missed wins, missed mates, blunders, mistakes and inaccuracies a game, winning positions won and lost positions saved;
  - **openings** as White and as Black with results and accuracy, **castling** (how often, which side, how early, score with and without) and **style** (checks and captures a game, early queen moves, promotions);
  - **the mistakes that keep coming back.**
- **One habit to work on:** the one that costs you the most over your last twelve games, whether it is coming up less often, and a link to practise it on positions from your own games.

Everything runs and stays on your device. The only thing it talks to is chess.com's public API, to fetch your games. An optional AI coach answers follow-up questions in plain English if you add your own Anthropic API key in Settings.

## Install

**Android:** download `ninjacoach.apk` from the [latest release](https://github.com/ThackLab/NinjaCoach/releases/latest) and open it. You may need to allow installs from your browser first.

## Build it yourself

```sh
npm ci
node scripts/prepare.mjs   # copies the Stockfish engine into public/ and builds the piece CSS
npm run dev                # http://localhost:5173
npm test
npm run build              # static site in dist/
android/build-apk.sh       # dist/ wrapped as an Android app (needs the Android SDK)
```

A release is built automatically when the version in `package.json` changes on `main`.

## Credits

- [Stockfish 18](https://stockfishchess.org) (GPLv3), compiled to WebAssembly by [stockfish.js](https://github.com/nmrugg/stockfish.js)
- [chessground](https://github.com/lichess-org/chessground) (GPLv3) and [chess.js](https://github.com/jhlywa/chess.js) (BSD-2)
- lichess [opening names](https://github.com/lichess-org/chess-openings) (CC0)
- App icon from Microsoft's [Fluent Emoji](https://github.com/microsoft/fluentui-emoji) (MIT)

Ninja Coach is free software under the GPLv3 (see `LICENSE`). It is not affiliated with chess.com.

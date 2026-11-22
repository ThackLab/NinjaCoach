# Ninja Coach

A chess coach for your chess.com games. Give it your chess.com username and it does the rest:

- **It keeps your last 20 games** (or 50, 100, 200 or all of them: choose on the Stats screen), checks for new ones each time you open the app, and lets older ones drop off.
- **It reviews each one with Stockfish 18** on your phone, in the background, newest first: a **quick review** that checks every move fast, then checks the key moments again more deeply (brilliant, great, mistakes, misses, blunders and the position after each), so those come out as they would in a slow review. A **deep analysis** of a whole game runs only when you ask for it (a game's Summary tab). A row of 20 squares on the coach screen fills in with W, D or L as each game is done. Every position is saved as it's checked, so an interrupted review picks up where it stopped. In the Android app it **keeps going with the phone locked** (a notification shows it working; allow it to run in the background when it asks, and on a Samsung set Battery to Unrestricted for the app).
- **Each move gets a classification:** Brilliant, Great, Best, Excellent, Good, Book, Inaccuracy, Mistake, Miss or Blunder (chess.com's expected-points thresholds). Each player also gets an accuracy score (the lichess formula) and a game rating estimate.
- **It debriefs your latest game** like a coach would: how it ended, your best moment and where the game turned. Then each key moment becomes a hands-on workshop:
  - **Watch:** step through what happened, the better move and a couple of other tries, one tap per move, with a caption for each ("their knight forks the king and rook").
  - **Your turn:** you play the better line yourself and the coach plays the replies.
  - **Tinker:** try any move; the engine answers and tells you what it does.
- **Play with Sensei:** a game against a coach who plays just above your level (starting from your chess.com rating, up when you win, down when you lose) and talks you through it: what he thinks of every move you make and why, what each of his moves does, a warning when a piece of yours is loose, a hint when you ask, and after a mistake he waits so you can take it back. When it's over, the game gets the full review. Games against Sensei are kept out of your chess.com stats.
- **Analysed games are kept for good.** Every game the coach has reviewed stays reviewed, whatever happens to the 20/50/100 window, each with a **fingerprint**: the SHA-256 of where it was played, the players, the result and every move. The **master sheet** (Games → Master sheet) lists them all, and the Android app keeps it up to date as a spreadsheet in `Downloads/Ninja Coach/ninja-coach-master-sheet.csv`; anywhere else, save a copy from that screen.
- **Opening explorer:** your openings move by move from your own games, as White or Black: every position you reach, the moves played there (yours and theirs), how often, and your score after each, with book moves marked and opening names. At the top, the moves that cost you ("1.d4 d5 2.Bf4 c5: you score 0% when they play it") and what Stockfish plays instead in your reviewed games. Tap one to go straight to that position.
- **Moments:** every brilliant move, great move, blunder, mistake and missed win across all your games, in one list. Tap one to go straight to that position with **Show me**.
- **Mate drill:** every forced mate you missed (up to mate in 5), or got to the long way round, becomes a puzzle. You get a few a day. Try it first, with hints if you want them; the engine plays their best defence. Then the coach walks you through how you could have seen it: count the king's squares, try every check, follow each forcing move and its reply, and see why the final position is mate. Miss one and it comes back tomorrow until you get it.
- **Stats** for your last 20 games (or 50, 100, 200 or all time), the kind chess.com keeps behind its paywall:
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

**iPhone (or any computer):** open **https://thacklab.github.io/NinjaCoach/** in Safari, tap **Share**, then **Add to Home Screen**. It's the same app: it runs full screen from its own icon and works offline once loaded.

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

# Commit Runner

An infinite runner game inspired by GitHub's contribution graph, built with Phaser 3.

## Game Description

Navigate through an endless world of GitHub contribution squares! Jump over green obstacles while the world scrolls past you. Get hit and you'll be pushed back - fall off the left edge and it's game over!

## Features

- **GitHub-inspired visuals**: Uses the exact color palette from GitHub's contribution graph
- **Grid-based layout**: 7 rows tall, matching the days of the week
- **Procedural generation**: Columns are randomly generated with heights from 0-7 blocks
- **Simple controls**: Press SPACEBAR to jump
- **Collision mechanics**: Green tiles push you back when you collide
- **Score tracking**: Earn points for surviving longer

## How to Play

1. Open `index.html` in a web browser
2. Press **SPACEBAR** to jump over green obstacles
3. Avoid getting pushed off the left edge of the screen
4. Survive as long as possible to maximize your score!
5. Press **SPACEBAR** after game over to restart

## Color Palette

- **Background tiles** (non-collidable): `#ebedf0` (light gray)
- **Obstacle tiles** (solid): 
  - `#9be9a8` (lightest green)
  - `#40c463` (light green)
  - `#30a14e` (medium green)
  - `#216e39` (dark green)
- **Player**: `#161b22` (dark gray)

## Technical Details

- Built with **Phaser 3.70.0**
- Uses arcade physics for gravity and collision detection
- Tile size: 13px × 13px with 2px gaps (matching GitHub's contribution graph)
- World scrolls at 120 pixels/second
- Single jump only (no double jump)

## File Structure

```
├── index.html    # Main HTML file
├── game.js       # Game logic and Phaser scene
└── README.md     # This file
```

## Development

The game is entirely client-side and requires no build process. Simply open `index.html` in a modern web browser to play.

## License

MIT

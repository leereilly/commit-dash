// Build an infinite runner game using Phaser 3 called "Commit Runner".
// The playfield is inspired by the GitHub contribution graph.
//
// GAME REQUIREMENTS
// - The world is made up of columns (7 rows tall) of square tiles matching
//   GitHub’s contribution graph layout and spacing.
// - Each column’s height ranges from 0–7 blocks high.
// - No more than TWO consecutive columns may be empty (height = 0).
// - Light gray tiles (#ebedf0) are background (non-collidable).
// - Green tiles (#9be9a8, #40c463, #30a14e, #216e39) are solid obstacles.
// - Player is a dark gray (#161b22) square sprite positioned near the left side.
// - Camera stays fixed. The world scrolls to the left to simulate running.
// - The player jumps using SPACEBAR (single jump only, no double jump).
// - When the player collides with a green tile, they are pushed slightly left
//   but can still jump to recover.
// - If the player is pushed off the left boundary, trigger GAME OVER.
// - Press SPACEBAR after game over to restart.
//
// ADDITIONAL DETAILS
// - Use a grid-based system to render tiles spaced similarly to GitHub’s
//   contribution graph (about 13px square + 2px gap).
// - Randomly generate new columns off the right edge as old ones move left.
// - Score increases over time or with distance survived.
// - Display “Game Over” and “Press SPACE to restart” when the player loses.
// - Keep visuals minimal (colored rectangles only, no spritesheets).
// - Use arcade physics for gravity and collision detection.
// - Structure: a Phaser.Scene with create(), update(), and helper functions for
//   generating the grid and resetting the game.
//
// Use modern Phaser 3 syntax (ES6 classes) and inline comments to explain logic.

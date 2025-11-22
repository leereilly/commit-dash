/**
 * COMMIT RUNNER - An infinite runner inspired by GitHub's contribution graph
 * Built with Phaser 3
 */

// Cookie utility functions
function setCookie(name, value, days) {
    const date = new Date();
    date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
    const expires = "expires=" + date.toUTCString();
    document.cookie = name + "=" + value + ";" + expires + ";path=/";
}

function getCookie(name) {
    const nameEQ = name + "=";
    const ca = document.cookie.split(';');
    for (let i = 0; i < ca.length; i++) {
        let c = ca[i];
        while (c.charAt(0) === ' ') c = c.substring(1, c.length);
        if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
    }
    return null;
}

// GitHub contribution graph color palette
const COLORS = {
    BACKGROUND: 0xebedf0,    // Light gray (non-collidable)
    GREEN_1: 0x9be9a8,       // Lightest green
    GREEN_2: 0x40c463,       // Light green
    GREEN_3: 0x30a14e,       // Medium green
    GREEN_4: 0x216e39,       // Dark green
    PLAYER: 0x161b22,        // Dark gray (player)
    TEXT: '#ffffff'
};

// Grid configuration matching GitHub contribution graph
const GRID = {
    TILE_SIZE: 13,           // Size of each square tile
    GAP: 2,                  // Gap between tiles
    ROWS: 7,                 // Number of rows (days of the week)
    TILE_FULL_SIZE: 15       // TILE_SIZE + GAP
};

// Game configuration
const GAME_CONFIG = {
    SCROLL_SPEED: 120,       // How fast the world scrolls left (pixels/second)
    JUMP_VELOCITY: -400,     // Player jump strength
    GRAVITY: 1000,           // Gravity strength
    PLAYER_START_X: 150,     // Player's X position on screen
    PLAYER_PUSH_FORCE: 80,   // How far player gets pushed back on collision
    GAME_OVER_BOUNDARY: -GRID.TILE_SIZE,   // X position that triggers game over (completely off screen)
    JUMP_CHARGE_MAX: 100,    // Maximum jump charge
    JUMP_CHARGE_COST: 50,    // Charge cost per jump
    JUMP_CHARGE_RATE: 25,    // Charge recovery per second when grounded
    CHARGE_JUMP_THRESHOLD: 0.25, // Minimum time (seconds) to hold space for charge jump
    CHARGE_JUMP_MAX_TIME: 1.5, // Maximum charge time in seconds
    CHARGE_JUMP_MIN_VELOCITY: -400, // Minimum jump velocity
    CHARGE_JUMP_MAX_VELOCITY: -700, // Maximum jump velocity when fully charged
    CHARGE_JUMP_HORIZONTAL_VELOCITY: 150, // Horizontal velocity boost when fully charged
    CHARGE_JUMP_SQUASH_HEIGHT: 0.1 // Squash to 10% of original height
};

class CommitRunnerScene extends Phaser.Scene {
    constructor() {
        super({ key: 'CommitRunnerScene' });
    }

    create() {
        // Initialize game state
        this.isGameOver = false;
        this.score = 0;
        this.highScore = 0; // Initialize high score
        this.worldX = 0; // Track world position for column generation
        this.jumpCharge = GAME_CONFIG.JUMP_CHARGE_MAX; // Start with full charge
        this.jumpsUsed = 0; // Track consecutive jumps
        this.colorWaveTime = 0; // Track time for color wave animation
        
        // Charge jump state
        this.isChargingJump = false;
        this.chargeJumpTime = 0;
        this.jumpHoldStartTime = null; // Track when space was first pressed
        this.lastGroundedTime = 0; // Track when player last touched ground
        
        // Jump buffering - track when jump was last pressed
        this.jumpBufferTime = 0;
        this.jumpBufferWindow = 100; // milliseconds to buffer jump input
        
        // Load high score from cookie
        this.loadHighScore();
        
        // Container groups
        this.tilesGroup = this.add.group();
        this.obstaclesGroup = this.physics.add.staticGroup();
        this.greenObstacles = []; // Track green obstacles separately for manual collision
        
        // Create the player sprite
        this.createPlayer();
        
        // Generate initial columns to fill the screen
        this.generateInitialColumns();
        
        // Set up input
        this.cursors = this.input.keyboard.createCursorKeys();
        this.spaceKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
        
        // Score display
        this.scoreText = this.add.text(16, 16, 'Score: 0', {
            fontSize: '20px',
            fill: '#000000',
            fontFamily: 'monospace',
            backgroundColor: 'rgba(255, 255, 255, 0.8)',
            padding: { x: 8, y: 4 }
        });
        this.scoreText.setDepth(100);
        
        // High score display (top-right corner)
        this.highScoreText = this.add.text(
            this.cameras.main.width - 16,
            16,
            `High Score: ${this.highScore}`,
            {
                fontSize: '20px',
                fill: '#000000',
                fontFamily: 'monospace',
                backgroundColor: 'rgba(255, 255, 255, 0.8)',
                padding: { x: 8, y: 4 }
            }
        );
        this.highScoreText.setOrigin(1, 0); // Anchor to top-right
        this.highScoreText.setDepth(100);
        
        // Jump charge display (left side, below score)
        const chargeBarWidth = 100;
        const chargeBarHeight = 20;
        const chargeBarX = 16;
        const chargeBarY = 50;
        
        // Background bar
        this.chargeBarBg = this.add.graphics();
        this.chargeBarBg.fillStyle(0x666666, 1);
        this.chargeBarBg.fillRect(chargeBarX, chargeBarY, chargeBarWidth, chargeBarHeight);
        this.chargeBarBg.setDepth(100);
        
        // Charge bar fill
        this.chargeBar = this.add.graphics();
        this.chargeBar.setDepth(101);
        
        // Charge text
        this.chargeText = this.add.text(chargeBarX, chargeBarY + chargeBarHeight + 4, 'Jump Charge: 100%', {
            fontSize: '14px',
            fill: '#000000',
            fontFamily: 'monospace',
            backgroundColor: 'rgba(255, 255, 255, 0.8)',
            padding: { x: 4, y: 2 }
        });
        this.chargeText.setDepth(100);
        
        // Store charge bar dimensions for updates
        this.chargeBarX = chargeBarX;
        this.chargeBarY = chargeBarY;
        this.chargeBarWidth = chargeBarWidth;
        this.chargeBarHeight = chargeBarHeight;
        
        // Game over text (hidden initially)
        this.gameOverText = this.add.text(
            this.cameras.main.centerX,
            this.cameras.main.centerY - 40,
            'GAME OVER',
            {
                fontSize: '48px',
                fill: '#000000',
                fontFamily: 'monospace',
                fontStyle: 'bold',
                backgroundColor: 'rgba(255, 255, 255, 0.9)',
                padding: { x: 20, y: 10 }
            }
        );
        this.gameOverText.setOrigin(0.5);
        this.gameOverText.setVisible(false);
        this.gameOverText.setDepth(100);
        
        this.restartText = this.add.text(
            this.cameras.main.centerX,
            this.cameras.main.centerY + 40,
            'Press SPACE to restart',
            {
                fontSize: '20px',
                fill: '#000000',
                fontFamily: 'monospace',
                backgroundColor: 'rgba(255, 255, 255, 0.9)',
                padding: { x: 12, y: 6 }
            }
        );
        this.restartText.setOrigin(0.5);
        this.restartText.setVisible(false);
        this.restartText.setDepth(100);
        
        // NO overlap/collider - we handle ALL collision manually in checkGrounded()
        
        // Track consecutive empty columns
        this.consecutiveEmptyColumns = 0;
        
        // Track when we last generated a column
        this.lastColumnX = 0;
        
        // Track total columns generated (for smooth start)
        this.totalColumnsGenerated = 0;
        
        // Track pattern generation (for same-height columns)
        this.patternColumnsRemaining = 0;
        this.patternHeight = 0;
        
        // Track previous column height for height difference rule
        this.previousColumnHeight = 7;
    }

    /**
     * Load high score from cookie
     */
    loadHighScore() {
        const savedHighScore = getCookie('commitRunnerHighScore');
        if (savedHighScore !== null) {
            this.highScore = parseInt(savedHighScore, 10) || 0;
        } else {
            this.highScore = 0;
        }
    }

    /**
     * Save high score to cookie (expires in ~1 year)
     */
    saveHighScore() {
        setCookie('commitRunnerHighScore', this.highScore.toString(), 365);
    }

    /**
     * Create the player sprite with physics
     */
    createPlayer() {
        // Create a graphics object to draw the player square
        const graphics = this.add.graphics();
        graphics.fillStyle(COLORS.PLAYER, 1);
        graphics.fillRect(0, 0, GRID.TILE_SIZE, GRID.TILE_SIZE);
        graphics.generateTexture('player', GRID.TILE_SIZE, GRID.TILE_SIZE);
        graphics.destroy();
        
        // Create player sprite at starting position
        this.player = this.physics.add.sprite(
            GAME_CONFIG.PLAYER_START_X,
            this.cameras.main.centerY,
            'player'
        );
        
        // Configure player physics
        this.player.setGravityY(GAME_CONFIG.GRAVITY);
        this.player.setCollideWorldBounds(false); // We'll handle boundaries manually
        this.player.setDepth(10);
        this.player.body.setSize(GRID.TILE_SIZE, GRID.TILE_SIZE);
        
        // Track if player is on ground (for single jump)
        this.player.isGrounded = false;
        this.player.canDoubleJump = false; // Whether player can double jump (only before first landing)
        
        // Track rotation state
        this.player.targetRotation = 0; // Target rotation to align with surface
        this.player.isRotating = false; // Whether actively rotating to align
    }

    /**
     * Generate initial columns to fill the screen
     */
    generateInitialColumns() {
        const screenWidth = this.cameras.main.width;
        const numColumns = Math.ceil(screenWidth / GRID.TILE_FULL_SIZE) + 5;
        
        for (let i = 0; i < numColumns; i++) {
            const x = i * GRID.TILE_FULL_SIZE;
            this.generateColumn(x);
            this.lastColumnX = x;
        }
    }

    /**
     * Generate a single column of tiles
     * @param {number} x - X position for the column
     */
    generateColumn(x) {
        // Calculate difficulty based on score (increases every 200 points)
        const difficultyLevel = Math.floor(this.score / 200);
        
        // Max height difference: starts at 2, increases by 1 every 200 points
        const maxHeightDiff = 2 + difficultyLevel;
        
        // Pattern frequency: starts at 10-12, increases by 2 every 200 points
        const patternMinFreq = 10 + (difficultyLevel * 2);
        const patternMaxFreq = 12 + (difficultyLevel * 2);
        
        // Determine column height (0-7 blocks)
        let height;
        
        // First 30 columns are full height for smooth start
        if (this.totalColumnsGenerated < 30) {
            height = 7;
        } else {
            // Check if we're in a pattern (same-height columns)
            if (this.patternColumnsRemaining > 0) {
                height = this.patternHeight;
                this.patternColumnsRemaining--;
            } else {
                // Generate new height with constraints
                let attempts = 0;
                do {
                    height = Phaser.Math.Between(0, 7);
                    attempts++;
                    
                    // If too many attempts, just clamp the height
                    if (attempts > 10) {
                        height = Math.max(0, Math.min(7, 
                            this.previousColumnHeight - maxHeightDiff,
                            this.previousColumnHeight + maxHeightDiff
                        ));
                        break;
                    }
                } while (Math.abs(height - this.previousColumnHeight) > maxHeightDiff);
                
                // Enforce rule: no more than 2 consecutive empty columns
                if (height === 0) {
                    this.consecutiveEmptyColumns++;
                    if (this.consecutiveEmptyColumns > 2) {
                        // Force at least 1 block
                        height = Phaser.Math.Between(1, Math.min(7, this.previousColumnHeight + maxHeightDiff));
                        this.consecutiveEmptyColumns = 0;
                    }
                } else {
                    this.consecutiveEmptyColumns = 0;
                }
                
                // MANDATORY: Always create at least 2 columns of the same height
                // This ensures no standalone single columns
                this.patternHeight = height;
                this.patternColumnsRemaining = 1; // At least 1 more column of same height
                
                // Randomly extend the pattern to 3+ columns
                // Frequency increases with difficulty
                const patternChance = Phaser.Math.Between(1, patternMaxFreq);
                if (patternChance <= 3) {
                    // Extend to 3 columns of same height
                    this.patternColumnsRemaining = 2; // 2 more columns after this one
                } else if (patternChance === patternMaxFreq) {
                    // Extend to 4 columns of same height (rarer)
                    this.patternColumnsRemaining = 3; // 3 more columns after this one
                }
            }
        }
        
        // Store this height for next column's height difference check
        this.previousColumnHeight = height;
        
        // Increment counter
        this.totalColumnsGenerated++;
        
        // Calculate starting Y position (bottom of screen, working upward)
        const screenHeight = this.cameras.main.height;
        const bottomY = screenHeight - GRID.TILE_SIZE;
        
        // Create all 7 rows
        for (let row = 0; row < GRID.ROWS; row++) {
            const y = bottomY - (row * GRID.TILE_FULL_SIZE);
            // Only the first 'height' rows are obstacles (from bottom up)
            const isObstacle = row < height;
            
            this.createTile(x, y, isObstacle);
        }
    }

    /**
     * Create a single tile (either background or obstacle)
     * @param {number} x - X position
     * @param {number} y - Y position
     * @param {boolean} isObstacle - Whether this is a solid obstacle
     */
    createTile(x, y, isObstacle) {
        if (isObstacle === true) {
            // GREEN OBSTACLE TILE - has physics
            // Create a WHITE texture so tinting works properly
            if (!this.textures.exists('greenTile')) {
                const graphics = this.add.graphics();
                graphics.fillStyle(0xffffff, 1); // WHITE
                graphics.fillRect(0, 0, GRID.TILE_SIZE, GRID.TILE_SIZE);
                graphics.generateTexture('greenTile', GRID.TILE_SIZE, GRID.TILE_SIZE);
                graphics.destroy();
            }
            
            // Create the obstacle as a sprite with proper physics body
            const tile = this.obstaclesGroup.create(x, y, 'greenTile');
            tile.setOrigin(0, 0);
            tile.setDisplaySize(GRID.TILE_SIZE, GRID.TILE_SIZE);
            tile.body.setSize(GRID.TILE_SIZE, GRID.TILE_SIZE);
            tile.body.immovable = true; // Make it solid
            tile.body.moves = false; // Ensure it doesn't move
            tile.refreshBody();
            
            // Store reference for color updates and mark as obstacle
            tile.tileX = x;
            tile.tileY = y;
            tile.isObstacle = true;
            tile.tileType = 'GREEN_OBSTACLE';
            
            // Set initial tint color
            const color = this.getOscillatingGreenColor(x, y);
            tile.setTint(color);
            
            // Add to our separate tracking array
            this.greenObstacles.push(tile);
        } else {
            // GRAY BACKGROUND TILE - NO physics whatsoever
            // Generate texture for gray background tile if not already created
            if (!this.textures.exists('grayTile')) {
                const graphics = this.add.graphics();
                graphics.fillStyle(COLORS.BACKGROUND, 1);
                graphics.fillRect(0, 0, GRID.TILE_SIZE, GRID.TILE_SIZE);
                graphics.generateTexture('grayTile', GRID.TILE_SIZE, GRID.TILE_SIZE);
                graphics.destroy();
            }
            
            // Create as a REGULAR sprite - NOT a physics sprite
            const tile = this.add.sprite(x, y, 'grayTile');
            tile.setOrigin(0, 0);
            tile.setDisplaySize(GRID.TILE_SIZE, GRID.TILE_SIZE);
            tile.setDepth(0);
            tile.isObstacle = false;
            tile.tileType = 'GRAY_BACKGROUND';
            
            // Add ONLY to tilesGroup (NOT obstaclesGroup!)
            this.tilesGroup.add(tile);
            
            // CRITICAL: Ensure it has NO physics body
            if (tile.body) {
                console.error('CRITICAL ERROR: Gray tile created with physics body!', {
                    x, y, tile, body: tile.body
                });
                // Force remove physics
                if (this.physics.world) {
                    this.physics.world.disableBody(tile.body);
                }
            }
            
            // CRITICAL: Ensure it's not in obstaclesGroup
            if (this.obstaclesGroup.contains(tile)) {
                console.error('CRITICAL ERROR: Gray tile in obstaclesGroup!', { x, y, tile });
                this.obstaclesGroup.remove(tile, true, false);
            }
        }
    }

    /**
     * Get a random green color from the palette
     * @returns {number} Hex color value
     */
    getRandomGreenColor() {
        const greens = [COLORS.GREEN_1, COLORS.GREEN_2, COLORS.GREEN_3, COLORS.GREEN_4];
        return Phaser.Utils.Array.GetRandom(greens);
    }

    /**
     * Get an oscillating green color based on position and time
     * @param {number} x - X position of the tile
     * @param {number} y - Y position of the tile
     * @returns {number} Hex color value
     */
    getOscillatingGreenColor(x, y) {
        const greens = [COLORS.GREEN_1, COLORS.GREEN_2, COLORS.GREEN_3, COLORS.GREEN_4];
        
        // Create a sine wave that oscillates based on position and time
        // Combine both X and Y for varied colors within columns
        const spatialFrequencyX = 0.02; // Horizontal wave frequency
        const spatialFrequencyY = 0.05; // Vertical wave frequency (variation within column)
        const timeFrequency = 2; // How fast the wave moves over time
        
        // Calculate sine wave value (-1 to 1) using both x and y
        const wave = Math.sin(
            x * spatialFrequencyX + 
            y * spatialFrequencyY + 
            this.colorWaveTime * timeFrequency
        );
        
        // Map sine wave (-1 to 1) to color index (0 to 3)
        const colorIndex = Math.floor(((wave + 1) / 2) * (greens.length - 1) + 0.5);
        const clampedIndex = Math.max(0, Math.min(greens.length - 1, colorIndex));
        
        return greens[clampedIndex];
    }

    /**
     * Update the colors of all obstacle tiles based on the sine wave
     */
    updateObstacleColors() {
        this.obstaclesGroup.getChildren().forEach(obstacle => {
            if (obstacle.tileX !== undefined && obstacle.tileY !== undefined) {
                const color = this.getOscillatingGreenColor(obstacle.tileX, obstacle.tileY);
                obstacle.setTint(color);
            }
        });
    }

    /**
     * Update the jump charge bar display
     */
    updateChargeBar() {
        // Clear and redraw the charge bar
        this.chargeBar.clear();
        
        const chargePercent = this.jumpCharge / GAME_CONFIG.JUMP_CHARGE_MAX;
        const fillWidth = this.chargeBarWidth * chargePercent;
        
        // Color based on charge level
        let color;
        if (chargePercent >= 1.0) {
            color = 0x30a14e; // Full charge - dark green
        } else if (chargePercent >= 0.5) {
            color = 0x40c463; // 50%+ - light green
        } else {
            color = 0xff6b6b; // Below 50% - red
        }
        
        this.chargeBar.fillStyle(color, 1);
        this.chargeBar.fillRect(this.chargeBarX, this.chargeBarY, fillWidth, this.chargeBarHeight);
        
        // Update text
        this.chargeText.setText(`Jump Charge: ${Math.floor(chargePercent * 100)}%`);
    }

    /**
     * Determine if collision should be processed (only for vertical collisions)
     * @param {Phaser.GameObjects.Sprite} player
     * @param {Phaser.GameObjects.GameObject} obstacle
     */
    shouldCollide(player, obstacle) {
        // Never collide with gray tiles
        if (obstacle.isObstacle === false) {
            console.warn('Attempting to collide with gray tile - blocked!', obstacle);
            return false;
        }
        
        // Check if obstacle is even in the obstaclesGroup (it should be)
        if (!obstacle.body) {
            console.warn('Obstacle has no physics body!', obstacle);
            return false;
        }
        
        // Only allow collision if player is falling onto the obstacle (from above)
        const playerBottom = player.y + (GRID.TILE_SIZE / 2);
        const obstacleTop = obstacle.y;
        
        // Allow collision only when landing on top
        return player.body.velocity.y >= 0 && playerBottom <= obstacleTop + 5;
    }

    /**
     * Handle collision between player and obstacle
     * @param {Phaser.GameObjects.Sprite} player
     * @param {Phaser.GameObjects.GameObject} obstacle
     */
    handleCollision(player, obstacle) {
        if (this.isGameOver) return;
        
        // Only push player left if hitting from the side (not landing on top)
        // Check if player is hitting the side by comparing positions
        const playerBottom = player.y + (GRID.TILE_SIZE / 2);
        const playerRight = player.x + (GRID.TILE_SIZE / 2);
        const obstacleTop = obstacle.y;
        const obstacleLeft = obstacle.x;
        
        // If player's bottom is above the obstacle's top (landing on top), don't push
        // Only push if player is hitting the side
        if (playerBottom > obstacleTop + 3 && playerRight > obstacleLeft) { 
            // Push player to the left when hitting from the side
            player.x -= 2;
            
            // Check if player has been pushed off the left boundary
            if (player.x < GAME_CONFIG.GAME_OVER_BOUNDARY) {
                this.triggerGameOver();
            }
        }
    }

    /**
     * Trigger game over state
     */
    triggerGameOver() {
        this.isGameOver = true;
        
        // Check and update high score
        const finalScore = Math.floor(this.score);
        if (finalScore > this.highScore) {
            this.highScore = finalScore;
            this.saveHighScore();
            this.highScoreText.setText(`High Score: ${this.highScore}`);
        }
        
        // Stop player physics
        this.player.setVelocity(0, 0);
        this.player.setAcceleration(0, 0);
        
        // Show game over UI
        this.gameOverText.setVisible(true);
        this.restartText.setVisible(true);
    }

    /**
     * Restart the game
     */
    restartGame() {
        // Clear all tiles and obstacles
        this.tilesGroup.clear(true, true);
        this.obstaclesGroup.clear(true, true);
        this.greenObstacles = []; // Clear green obstacles array
        
        // Reset game state
        this.isGameOver = false;
        this.score = 0;
        this.worldX = 0;
        this.consecutiveEmptyColumns = 0;
        this.lastColumnX = 0;
        this.totalColumnsGenerated = 0;
        this.patternColumnsRemaining = 0;
        this.patternHeight = 0;
        this.previousColumnHeight = 7; // Reset previous height
        this.jumpCharge = GAME_CONFIG.JUMP_CHARGE_MAX;
        this.jumpsUsed = 0;
        this.colorWaveTime = 0; // Reset color wave
        this.isChargingJump = false; // Reset charge jump state
        this.chargeJumpTime = 0;
        this.jumpBufferTime = 0; // Reset jump buffer
        this.isSliding = false; // Reset sliding state
        
        // Reset player position
        this.player.setPosition(GAME_CONFIG.PLAYER_START_X, this.cameras.main.centerY);
        this.player.setVelocity(0, 0);
        this.player.angle = 0; // Reset rotation
        this.player.isRotating = false;
        this.player.setDisplaySize(GRID.TILE_SIZE, GRID.TILE_SIZE); // Reset size
        this.player.setScale(1, 1); // Reset scale
        this.player.targetRotation = 0;
        this.player.canDoubleJump = false;
        
        // Hide game over UI
        this.gameOverText.setVisible(false);
        this.restartText.setVisible(false);
        
        // Regenerate initial columns
        this.generateInitialColumns();
        
        // Update score display
        this.scoreText.setText('Score: 0');
    }

    /**
     * Main update loop
     * @param {number} time - Total elapsed time
     * @param {number} delta - Time since last frame (ms)
     */
    update(time, delta) {
        if (this.isGameOver) {
            // Check for restart input
            if (Phaser.Input.Keyboard.JustDown(this.spaceKey)) {
                this.restartGame();
            }
            return;
        }
        
        // Update color wave time for oscillating colors
        const deltaSeconds = delta / 1000;
        this.colorWaveTime += deltaSeconds;
        
        // Update obstacle colors with sine wave
        this.updateObstacleColors();
        
        // Update charge bar display
        this.updateChargeBar();
        
        // Check if player is on the ground FIRST (before handling jumps)
        this.checkGrounded();
        
        // Handle player jump
        this.handleJump();
        
        // Handle player rotation
        this.handleRotation(deltaSeconds);
        
        // Recharge jump when grounded
        this.handleJumpCharge(deltaSeconds);
        
        // Scroll the world to the left
        this.scrollWorld(deltaSeconds);
        
        // Update score based on distance survived
        this.score += deltaSeconds * 10; // 10 points per second
        this.scoreText.setText(`Score: ${Math.floor(this.score)}`);
        
        // Check if player fell off the bottom
        if (this.player.y > this.cameras.main.height + 50) {
            this.triggerGameOver();
        }
    }

    /**
     * Clean up graphics objects
     * @param {Phaser.GameObjects.Graphics} graphics
     */
    destroyGraphics(graphics) {
        if (graphics && graphics.destroy) {
            graphics.destroy();
        }
    }

    /**
     * Handle player jump input with double jump mechanic
     */
    handleJump() {
        const deltaSeconds = this.game.loop.delta / 1000;
        
        // Check for JustDown once and reuse
        const justDown = Phaser.Input.Keyboard.JustDown(this.spaceKey);
        const justUp = Phaser.Input.Keyboard.JustUp(this.spaceKey);
        
        // Buffer jump input - if they press jump, remember it for a short window
        if (justDown) {
            this.jumpBufferTime = this.time.now;
        }
        
        // Check if we have a buffered jump input (pressed within last 100ms)
        const hasBufferedJump = (this.time.now - this.jumpBufferTime) < this.jumpBufferWindow;
        
        // PREVENT ALL JUMPING WHILE SLIDING
        if (this.isSliding) {
            // Cancel any charge jump
            if (this.isChargingJump) {
                this.isChargingJump = false;
                this.chargeJumpTime = 0;
                this.player.setDisplaySize(GRID.TILE_SIZE, GRID.TILE_SIZE);
            }
            this.jumpHoldStartTime = null;
            return;
        }
        
        // === CHARGE JUMP: SQUASHING PHASE ===
        if (this.isChargingJump && this.spaceKey.isDown && this.player.isGrounded) {
            this.chargeJumpTime += deltaSeconds;
            
            // Cap at max charge time
            if (this.chargeJumpTime > GAME_CONFIG.CHARGE_JUMP_MAX_TIME) {
                this.chargeJumpTime = GAME_CONFIG.CHARGE_JUMP_MAX_TIME;
            }
            
            // Reset rotation to 0 so squash is always vertical
            this.player.angle = 0;
            this.player.isRotating = false;
            
            // Squash vertically - down to 10% height
            const squashProgress = Math.min(this.chargeJumpTime / GAME_CONFIG.CHARGE_JUMP_MAX_TIME, 1);
            const targetHeight = GRID.TILE_SIZE * (1 - squashProgress * (1 - GAME_CONFIG.CHARGE_JUMP_SQUASH_HEIGHT));
            this.player.setDisplaySize(GRID.TILE_SIZE, targetHeight);
            
            return; // Stay on ground while charging
        }
        
        // === CHARGE JUMP: LAUNCH PHASE ===
        if (this.isChargingJump && justUp) {
            const chargeRatio = Math.min(this.chargeJumpTime / GAME_CONFIG.CHARGE_JUMP_MAX_TIME, 1);
            
            // Calculate jump strength based on how long space was held
            const jumpVelocity = GAME_CONFIG.CHARGE_JUMP_MIN_VELOCITY + 
                (GAME_CONFIG.CHARGE_JUMP_MAX_VELOCITY - GAME_CONFIG.CHARGE_JUMP_MIN_VELOCITY) * chargeRatio;
            const horizontalVelocity = GAME_CONFIG.CHARGE_JUMP_HORIZONTAL_VELOCITY * chargeRatio;
            
            // Launch!
            this.player.setVelocityY(jumpVelocity);
            this.player.setVelocityX(horizontalVelocity);
            this.player.isGrounded = false;
            this.player.isRotating = false;
            
            // Use 100% energy ONLY if we actually charged (prevent accidental energy drain)
            if (this.chargeJumpTime > 0) {
                this.jumpCharge = 0;
            }
            
            // Reset charging state
            this.isChargingJump = false;
            this.chargeJumpTime = 0;
            this.jumpHoldStartTime = null;
            
            // Reset size
            this.player.setDisplaySize(GRID.TILE_SIZE, GRID.TILE_SIZE);
            
            return;
        }
        
        // === DOUBLE JUMP (IN AIR) ===
        // Only count as air jump if player has been off ground for more than 100ms (grace period)
        const timeSinceGrounded = this.time.now - this.lastGroundedTime;
        const isActuallyInAir = !this.player.isGrounded && timeSinceGrounded > 100;
        const isMovingUp = this.player.body.velocity.y < 0; // Negative velocity = moving up
        
        if (justDown && isActuallyInAir && isMovingUp &&
            !this.isChargingJump && this.jumpCharge >= GAME_CONFIG.JUMP_CHARGE_COST) {
            // Double jump - costs 50% energy (only works while moving upward)
            this.player.setVelocityY(GAME_CONFIG.JUMP_VELOCITY);
            this.player.setVelocityX(0);
            this.jumpCharge -= GAME_CONFIG.JUMP_CHARGE_COST;
            return;
        }
        
        // === GROUND JUMPS: START TRACKING HOLD OR USE BUFFERED INPUT ===
        // Check if jump was pressed recently (justDown) OR if we have a buffered jump
        const shouldAttemptGroundJump = (justDown || hasBufferedJump) && 
                                        (this.player.isGrounded || timeSinceGrounded <= 100) && 
                                        !this.isChargingJump;
        
        if (shouldAttemptGroundJump) {
            // Clear the buffer since we're using it
            this.jumpBufferTime = 0;
            
            // If we DON'T have 100% charge, jump IMMEDIATELY for responsiveness
            if (this.jumpCharge < GAME_CONFIG.JUMP_CHARGE_MAX) {
                this.player.setVelocityY(GAME_CONFIG.JUMP_VELOCITY);
                this.player.setVelocityX(0);
                this.player.isGrounded = false;
                this.player.isRotating = false;
                return;
            }
            
            // If we have 100% charge, start tracking hold for potential charge jump
            this.jumpHoldStartTime = this.time.now;
            return;
        }
        
        // === CHECK IF HELD PAST THRESHOLD (WITH 100% CHARGE) ===
        const isOnGround = this.player.isGrounded || timeSinceGrounded <= 100;
        if (this.jumpHoldStartTime !== null && isOnGround && this.spaceKey.isDown) {
            const holdDuration = this.time.now - this.jumpHoldStartTime;
            
            // If held past 150ms with 100% charge - start charging
            if (holdDuration >= 150) {
                this.isChargingJump = true;
                this.chargeJumpTime = 0;
                this.jumpHoldStartTime = null;
                return;
            }
        }
        
        // === CHECK IF RELEASED QUICKLY (WITH 100% CHARGE) ===
        if (this.jumpHoldStartTime !== null && justUp) {
            // Released quickly - do regular jump (FREE)
            const isOnGround = this.player.isGrounded || (this.time.now - this.lastGroundedTime) <= 100;
            if (isOnGround) {
                this.player.setVelocityY(GAME_CONFIG.JUMP_VELOCITY);
                this.player.setVelocityX(0);
                this.player.isGrounded = false;
                this.player.isRotating = false;
                // Don't use any energy for regular jump!
            }
            this.jumpHoldStartTime = null;
            return;
        }
    }

    /**
     * Handle jump charge regeneration
     * @param {number} delta - Time since last frame (seconds)
     */
    handleJumpCharge(delta) {
        // Always recharge (even in the air)
        this.jumpCharge = Math.min(
            GAME_CONFIG.JUMP_CHARGE_MAX,
            this.jumpCharge + GAME_CONFIG.JUMP_CHARGE_RATE * delta
        );
        
        // Reset jump counter when grounded
        if (this.player.isGrounded) {
            this.jumpsUsed = 0;
        }
    }

    /**
     * Handle player rotation during jump and landing
     * @param {number} delta - Time since last frame (seconds)
     */
    handleRotation(delta) {
        if (!this.player.isGrounded) {
            // Rotate clockwise while in the air (360 degrees per second)
            this.player.angle += 360 * delta;
        } else if (this.player.isRotating) {
            // When landing, rotate to align with nearest 90-degree angle
            const rotationSpeed = 720; // degrees per second
            
            // Normalize angle to 0-360 range
            let currentAngle = this.player.angle % 360;
            if (currentAngle < 0) currentAngle += 360;
            
            // Find nearest 90-degree increment
            const targetRotation = Math.round(currentAngle / 90) * 90;
            
            // Calculate shortest rotation direction
            let angleDiff = targetRotation - currentAngle;
            if (angleDiff > 180) angleDiff -= 360;
            if (angleDiff < -180) angleDiff += 360;
            
            // Rotate towards target
            if (Math.abs(angleDiff) < 5) {
                // Close enough, snap to target and stop rotating
                this.player.angle = targetRotation;
                this.player.isRotating = false;
            } else {
                // Continue rotating
                const rotationAmount = Math.sign(angleDiff) * rotationSpeed * delta;
                this.player.angle += rotationAmount;
            }
        }
    }

    /**
     * Scroll the world to the left and generate new columns
     * @param {number} delta - Time since last frame (seconds)
     */
    scrollWorld(delta) {
        const scrollAmount = GAME_CONFIG.SCROLL_SPEED * delta;
        
        // Move all tiles left (background tiles are graphics objects)
        this.tilesGroup.getChildren().forEach(tile => {
            if (tile.x !== undefined) {
                tile.x -= scrollAmount;
                
                // Remove tiles that are off the left side of the screen
                if (tile.x < -GRID.TILE_FULL_SIZE * 2) {
                    tile.destroy();
                }
            }
        });
        
        // Move all obstacles left
        this.obstaclesGroup.getChildren().forEach(obstacle => {
            obstacle.x -= scrollAmount;
            obstacle.refreshBody();
            
            // Remove obstacles that are off the left side of the screen
            if (obstacle.x < -GRID.TILE_FULL_SIZE * 2) {
                // Remove from greenObstacles array
                const index = this.greenObstacles.indexOf(obstacle);
                if (index > -1) {
                    this.greenObstacles.splice(index, 1);
                }
                obstacle.destroy();
            }
        });
        
        // Update world position tracking
        this.worldX += scrollAmount;
        
        // Clean up greenObstacles array - remove null or inactive references
        this.greenObstacles = this.greenObstacles.filter(obstacle => obstacle && obstacle.active);
        
        // Generate new columns on the right side
        const rightEdge = this.cameras.main.width;
        const actualLastColumnX = this.lastColumnX - this.worldX;
        
        if (actualLastColumnX < rightEdge + GRID.TILE_FULL_SIZE) {
            const newColumnX = this.lastColumnX + GRID.TILE_FULL_SIZE;
            this.generateColumn(newColumnX - this.worldX);
            this.lastColumnX = newColumnX;
        }
    }

    /**
     * Simple ground detection for the player
     */
    checkGrounded() {
        const screenHeight = this.cameras.main.height;
        const wasGrounded = this.player.isGrounded;
        
        // Player bounds
        const playerBottom = this.player.y + (GRID.TILE_SIZE / 2);
        const playerLeft = this.player.x - (GRID.TILE_SIZE / 2);
        const playerRight = this.player.x + (GRID.TILE_SIZE / 2);
        const playerTop = this.player.y - (GRID.TILE_SIZE / 2);
        
        let standingOnObstacle = false;
        let highestObstacleY = screenHeight;
        
        // Check ONLY green obstacles
        for (let i = 0; i < this.greenObstacles.length; i++) {
            const obstacle = this.greenObstacles[i];
            
            // Skip destroyed or inactive obstacles
            if (!obstacle || !obstacle.active) continue;
            
            const obstacleTop = obstacle.y;
            const obstacleBottom = obstacle.y + GRID.TILE_SIZE;
            const obstacleLeft = obstacle.x;
            const obstacleRight = obstacle.x + GRID.TILE_SIZE;
            
            // Check if player overlaps with obstacle
            const overlapsX = playerRight > obstacleLeft + 1 && playerLeft < obstacleRight - 1;
            const overlapsY = playerBottom > obstacleTop + 1 && playerTop < obstacleBottom - 1;
            
            if (overlapsX && overlapsY) {
                // There's a collision - resolve it
                
                const overlapLeft = playerRight - obstacleLeft;
                const overlapRight = obstacleRight - playerLeft;
                const overlapTop = playerBottom - obstacleTop;
                const overlapBottom = obstacleBottom - playerTop;
                
                const minOverlap = Math.min(overlapLeft, overlapRight, overlapTop, overlapBottom);
                
                // Push out in direction of smallest overlap
                if (minOverlap === overlapTop && this.player.body.velocity.y >= 0) {
                    // Landing on top
                    if (obstacleTop < highestObstacleY) {
                        highestObstacleY = obstacleTop;
                        standingOnObstacle = true;
                    }
                } else if (minOverlap === overlapBottom && this.player.body.velocity.y <= 0) {
                    // Hit bottom (jumping into ceiling)
                    this.player.y = obstacleBottom + (GRID.TILE_SIZE / 2);
                    this.player.setVelocityY(0);
                } else if (minOverlap === overlapLeft) {
                    // Hit from left side
                    this.player.x = obstacleLeft - (GRID.TILE_SIZE / 2);
                    this.player.setVelocityX(0);
                } else if (minOverlap === overlapRight) {
                    // Hit from right side
                    this.player.x = obstacleRight + (GRID.TILE_SIZE / 2);
                    this.player.setVelocityX(0);
                }
            } else if (overlapsX && !overlapsY) {
                // Check if about to land
                const gap = obstacleTop - playerBottom;
                if (gap >= -1 && gap <= 3 && this.player.body.velocity.y >= 0) {
                    if (obstacleTop < highestObstacleY) {
                        highestObstacleY = obstacleTop;
                        standingOnObstacle = true;
                    }
                }
            }
        }
        
        // Apply grounded state
        if (standingOnObstacle) {
            this.player.y = highestObstacleY - (GRID.TILE_SIZE / 2);
            this.player.setVelocityY(0);
            
            if (!wasGrounded) {
                this.player.isGrounded = true;
                this.player.isRotating = true;
                this.lastGroundedTime = this.time.now; // Track landing time
            } else {
                this.player.isGrounded = true;
                this.lastGroundedTime = this.time.now; // Update grounded time
            }
        } else {
            this.player.isGrounded = false;
        }
        
        // Game over if player falls below screen
        if (this.player.y > screenHeight + 50) {
            this.triggerGameOver();
        }
    }
}

// Phaser game configuration
const config = {
    type: Phaser.AUTO,
    width: 800,
    height: 300,
    parent: 'game-container',
    backgroundColor: '#ffffff', // White background to see the light gray tiles
    physics: {
        default: 'arcade',
        arcade: {
            gravity: { y: 0 }, // We'll apply gravity only to the player
            debug: false
        }
    },
    scene: CommitRunnerScene
};

// Initialize the game
const game = new Phaser.Game(config);

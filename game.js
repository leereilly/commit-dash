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
    JUMP_CHARGE_RATE: 25     // Charge recovery per second when grounded
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
        
        // Set up overlap detection for side collisions only (not using collider at all)
        this.physics.add.overlap(
            this.player,
            this.obstaclesGroup,
            this.handleCollision,
            (player, obstacle) => {
                // Only process overlap for obstacles, not gray tiles
                return obstacle.isObstacle === true && obstacle.tileType === 'GREEN_OBSTACLE';
            },
            this
        );
        
        // NO COLLIDER - we handle all physics manually
        
        // Track consecutive empty columns
        this.consecutiveEmptyColumns = 0;
        
        // Track when we last generated a column
        this.lastColumnX = 0;
        
        // Track total columns generated (for smooth start)
        this.totalColumnsGenerated = 0;
        
        // Track pattern generation (for same-height columns)
        this.patternColumnsRemaining = 0;
        this.patternHeight = 0;
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
                // Generate new height
                height = Phaser.Math.Between(0, 7);
                
                // Enforce rule: no more than 2 consecutive empty columns
                if (height === 0) {
                    this.consecutiveEmptyColumns++;
                    if (this.consecutiveEmptyColumns > 2) {
                        // Force at least 1 block
                        height = Phaser.Math.Between(1, 7);
                        this.consecutiveEmptyColumns = 0;
                    }
                } else {
                    this.consecutiveEmptyColumns = 0;
                }
                
                // Randomly create patterns of same-height columns
                const patternChance = Phaser.Math.Between(1, 15);
                if (patternChance <= 5) {
                    // 1 in 3-5: Create 2 columns of same height
                    this.patternHeight = height;
                    this.patternColumnsRemaining = 1; // 1 more column after this one
                } else if (patternChance === 15) {
                    // 1 in 15: Create 3 columns of same height
                    this.patternHeight = height;
                    this.patternColumnsRemaining = 2; // 2 more columns after this one
                }
            }
        }
        
        // Increment counter
        this.totalColumnsGenerated++;
        
        // Calculate starting Y position (bottom of screen, working upward)
        const screenHeight = this.cameras.main.height;
        const bottomY = screenHeight - GRID.TILE_SIZE;
        
        // Create all 7 rows
        for (let row = 0; row < GRID.ROWS; row++) {
            const y = bottomY - (row * GRID.TILE_FULL_SIZE);
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
            const color = this.getOscillatingGreenColor(x, y);
            
            // Create graphics for the tile
            const graphics = this.add.graphics();
            graphics.fillStyle(color, 1);
            graphics.fillRect(0, 0, GRID.TILE_SIZE, GRID.TILE_SIZE);
            graphics.generateTexture(`tile_${x}_${y}`, GRID.TILE_SIZE, GRID.TILE_SIZE);
            graphics.destroy();
            
            // Create the obstacle as a sprite with proper physics body
            const tile = this.obstaclesGroup.create(x, y, `tile_${x}_${y}`);
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
        this.jumpCharge = GAME_CONFIG.JUMP_CHARGE_MAX;
        this.jumpsUsed = 0;
        this.colorWaveTime = 0; // Reset color wave
        
        // Reset player position
        this.player.setPosition(GAME_CONFIG.PLAYER_START_X, this.cameras.main.centerY);
        this.player.setVelocity(0, 0);
        this.player.angle = 0; // Reset rotation
        this.player.isRotating = false;
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
        if (Phaser.Input.Keyboard.JustDown(this.spaceKey)) {
            if (this.player.isGrounded) {
                // First jump from ground (FREE - no charge cost)
                this.player.setVelocityY(GAME_CONFIG.JUMP_VELOCITY);
                this.player.isGrounded = false;
                this.player.isRotating = false;
                this.jumpsUsed = 0; // Reset counter
                this.player.canDoubleJump = true; // Enable double jump for this airtime
            } else if (!this.player.isGrounded && this.player.canDoubleJump && this.jumpCharge >= GAME_CONFIG.JUMP_CHARGE_COST) {
                // Double jump in the air (only before landing) - COSTS 50% CHARGE
                this.player.setVelocityY(GAME_CONFIG.JUMP_VELOCITY);
                this.player.canDoubleJump = false; // Can't triple jump
                
                // Use jump charge (only for double jump)
                this.jumpCharge -= GAME_CONFIG.JUMP_CHARGE_COST;
                this.jumpsUsed = 1;
            }
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
                obstacle.destroy();
            }
        });
        
        // Update world position tracking
        this.worldX += scrollAmount;
        
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
        
        // Manually check if player is standing on a GREEN obstacle tile
        let standingOnObstacle = false;
        let highestObstacleY = screenHeight;
        
        const playerBottom = this.player.y + (GRID.TILE_SIZE / 2);
        const playerLeft = this.player.x - (GRID.TILE_SIZE / 2);
        const playerRight = this.player.x + (GRID.TILE_SIZE / 2);
        
        // Check ONLY green obstacles from our tracking array
        for (let i = 0; i < this.greenObstacles.length; i++) {
            const obstacle = this.greenObstacles[i];
            
            // Skip if tile has been destroyed or is off screen
            if (!obstacle.active) continue;
            
            const obstacleTop = obstacle.y;
            const obstacleBottom = obstacle.y + GRID.TILE_SIZE;
            const obstacleLeft = obstacle.x;
            const obstacleRight = obstacle.x + GRID.TILE_SIZE;
            
            // Check if player is on top of this obstacle
            const isOnTop = playerBottom >= obstacleTop && playerBottom <= obstacleTop + 10;
            const isOverlapping = playerRight > obstacleLeft + 2 && playerLeft < obstacleRight - 2;
            
            if (isOnTop && isOverlapping && obstacleTop < highestObstacleY) {
                standingOnObstacle = true;
                highestObstacleY = obstacleTop;
            }
        }
        
        if (standingOnObstacle && this.player.body.velocity.y >= 0) {
            // Snap player to the top of the obstacle
            this.player.y = highestObstacleY - (GRID.TILE_SIZE / 2);
            this.player.setVelocityY(0);
            
            // Player is standing on top of a green obstacle
            if (!wasGrounded) {
                this.player.isGrounded = true;
                this.player.canDoubleJump = false;
                this.player.isRotating = true;
            } else {
                this.player.isGrounded = true;
            }
        } else if (this.player.body.velocity.y < 0) {
            // Player is moving upward (jumping)
            this.player.isGrounded = false;
        } else {
            // Player is in the air
            this.player.isGrounded = false;
        }
        
        // Game over if player falls below the screen
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

// @deno-types="npm:@types/leaflet"
import leaflet from "leaflet";

// Style sheets
import "leaflet/dist/leaflet.css";
import "./style.css";

// Fix missing marker images
import "./_leafletWorkaround.ts";

// Import our luck function for deterministic spawning
import luck from "./_luck.ts";

// =============================================
// CORE INTERFACES & TYPE DEFINITIONS
// =============================================

interface Token {
  value: number;
}

interface GridCell {
  i: number;
  j: number;
  token: Token | null;
  bounds: leaflet.LatLngBounds;
  element: leaflet.Rectangle | null;
  isVisible: boolean;
}

interface GameState {
  player: {
    inventory: Token | null;
    location: leaflet.LatLng;
    points: number;
  };
  grid: Map<string, GridCell>;
  victoryCondition: number;
  isVictoryAchieved: boolean;
}

// =============================================
// GAME CONSTANTS & CONFIGURATION
// =============================================

// Define cell styles
interface CellStyle {
  color: string;
  weight: number;
  fillOpacity: number;
}

const CONFIG = {
  CLASSROOM_LOCATION: leaflet.latLng(36.997936938057016, -122.05703507501151),
  ZOOM_LEVEL: 19,
  TILE_DEGREES: 1e-4,
  INTERACTION_RANGE: 3,
  VICTORY_THRESHOLD: 2048,
  INITIAL_SPAWN_VALUES: [1, 2, 4],
  GRID_RENDER_RADIUS: 25,

  // Token Spawning
  SPAWN: {
    PROBABILITY: 0.15,
    VALUE_DISTRIBUTION: {
      1: 0.6,
      2: 0.3,
      4: 0.1,
    },
    // Area where tokens can spawn
    SPAWN_RADIUS: 8,
  },

  CELL_STYLES: {
    default: { color: "#3388ff", weight: 1, fillOpacity: 0.1 } as CellStyle,
    withToken: { color: "#ff3388", weight: 2, fillOpacity: 0.3 } as CellStyle,
    interactable: {
      color: "#33ff88",
      weight: 2,
      fillOpacity: 0.2,
    } as CellStyle,
    // New style for when player is holding a token
    holdingToken: {
      color: "#ffaa00",
      weight: 3,
      fillOpacity: 0.4,
    } as CellStyle,
    // Style for cells that can be merged into
    mergeTarget: {
      color: "#aa00ff",
      weight: 4,
      fillOpacity: 0.5,
    } as CellStyle,
  },
  UI: {
    HIGHLIGHT_DURATION_MS: 500,
    TOOLTIP_CLASS: "cell-tooltip",
    INVENTORY_CLASS: "inventory-display",
  },
} as const;

// =============================================
// ERROR HANDLING
// =============================================

class GameError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GameError";
  }
}

function getElementOrThrow(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) {
    throw new GameError(`Required DOM element with id '${id}' not found`);
  }
  return element;
}

function validateCell(cell: GridCell): void {
  if (!cell) {
    throw new GameError("Cell cannot be null or undefined");
  }
  if (cell.bounds === undefined) {
    throw new GameError("Cell bounds are undefined");
  }
  if (typeof cell.i !== "number" || typeof cell.j !== "number") {
    throw new GameError("Cell coordinates must be numbers");
  }
}

function validateMapInitialized(): void {
  if (!map) {
    throw new GameError(
      "Map must be initialized before performing this operation",
    );
  }
}

// =============================================
// INTERACTION RANGE & GAME LOGIC ENHANCEMENTS
// =============================================

function updateInteractionRangeDisplay(): void {
  for (const cell of gameState.grid.values()) {
    if (cell.element) {
      updateCellVisualization(cell);
    }
  }
}

function _getInteractionRangeBounds(): leaflet.LatLngBounds {
  const origin = CONFIG.CLASSROOM_LOCATION;
  return leaflet.latLngBounds([
    [
      origin.lat - CONFIG.INTERACTION_RANGE * CONFIG.TILE_DEGREES,
      origin.lng - CONFIG.INTERACTION_RANGE * CONFIG.TILE_DEGREES,
    ],
    [
      origin.lat + CONFIG.INTERACTION_RANGE * CONFIG.TILE_DEGREES,
      origin.lng + CONFIG.INTERACTION_RANGE * CONFIG.TILE_DEGREES,
    ],
  ]);
}

function showVictoryMessage(): void {
  if (gameState.isVictoryAchieved) {
    // Victory feedback
    const statusPanel = getElementOrThrow("statusPanel");
    statusPanel.innerHTML = `🎉 VICTORY ACHIEVED! 🎉<br>` +
      `Final Score: ${gameState.player.points} points<br>` +
      `You created a token with value ${CONFIG.VICTORY_THRESHOLD}+!`;

    statusPanel.style.color = "green";
    statusPanel.style.fontWeight = "bold";
    statusPanel.style.fontSize = "1.2em";
    statusPanel.style.textAlign = "center";

    console.log("🎊 VICTORY CELEBRATION! 🎊");
  }
}

function getHighestTokenValue(): number {
  let highest = 0;
  for (const cell of gameState.grid.values()) {
    if (cell.token && cell.token.value > highest) {
      highest = cell.token.value;
    }
  }
  if (
    gameState.player.inventory && gameState.player.inventory.value > highest
  ) {
    highest = gameState.player.inventory.value;
  }
  return highest;
}

// =============================================
// CRAFTING & MERGING MECHANICS
// =============================================

function canMergeTokens(heldToken: Token, cellToken: Token): boolean {
  return heldToken.value === cellToken.value;
}

function mergeTokens(heldToken: Token, cellToken: Token): Token {
  const newValue = heldToken.value * 2;
  console.log(
    `Merging tokens: ${heldToken.value} + ${cellToken.value} = ${newValue}`,
  );

  // Award points based on the new token value
  gameState.player.points += newValue;

  return { value: newValue };
}

function attemptMerge(cell: GridCell): boolean {
  if (!gameState.player.inventory || !cell.token) {
    return false;
  }

  if (!canMergeTokens(gameState.player.inventory, cell.token)) {
    return false;
  }

  // Perform the merge
  const newToken = mergeTokens(gameState.player.inventory, cell.token);
  cell.token = newToken;
  gameState.player.inventory = null;

  // Update visuals
  updateCellVisualization(cell);
  updateInventoryDisplay();
  updateUI();

  console.log(`Successfully merged tokens! New token value: ${newToken.value}`);

  // Check for victory condition
  checkVictoryCondition(newToken);

  return true;
}

function checkVictoryCondition(newToken: Token): void {
  if (
    newToken.value >= CONFIG.VICTORY_THRESHOLD && !gameState.isVictoryAchieved
  ) {
    gameState.isVictoryAchieved = true;
    updateUI();
    // Show victory message
    const statusPanel = getElementOrThrow("statusPanel");
    statusPanel.innerHTML += ` 🎉 VICTORY!`;
  }
}

function getMergeTooltipContent(cell: GridCell): string {
  if (!gameState.player.inventory || !cell.token) {
    return createTooltipContent(cell);
  }

  if (canMergeTokens(gameState.player.inventory, cell.token)) {
    const newValue = gameState.player.inventory.value * 2;
    return `Merge: ${gameState.player.inventory.value} + ${cell.token.value} = ${newValue}`;
  } else {
    return `Cannot merge: ${gameState.player.inventory.value} ≠ ${cell.token.value}`;
  }
}

// =============================================
// INVENTORY MANAGEMENT
// =============================================

function canPickupToken(cell: GridCell): boolean {
  return isCellInteractable(cell) &&
    hasToken(cell) &&
    gameState.player.inventory === null;
}

function pickupTokenFromCell(cell: GridCell): void {
  if (!canPickupToken(cell)) {
    console.warn("Cannot pickup token from cell:", cell);
    return;
  }

  // Move token from cell to player inventory
  gameState.player.inventory = cell.token;
  cell.token = null;

  // Update visuals
  updateCellVisualization(cell);
  updateInventoryDisplay();

  console.log(
    `Picked up token (value: ${
      gameState.player.inventory!.value
    }) from cell (${cell.i}, ${cell.j})`,
  );
}

function dropTokenToCell(cell: GridCell): boolean {
  if (!isCellInteractable(cell) || gameState.player.inventory === null) {
    return false;
  }

  // If cell has a token, attempt merge instead of simple drop
  if (cell.token) {
    if (attemptMerge(cell)) {
      return true;
    } else {
      // Cannot merge
      console.log("Cannot merge tokens with different values");
      return false;
    }
  }

  // Simple drop to empty cell
  cell.token = gameState.player.inventory;
  gameState.player.inventory = null;

  // Update visuals
  updateCellVisualization(cell);
  updateInventoryDisplay();

  console.log(
    `Dropped token (value: ${
      cell.token!.value
    }) to cell (${cell.i}, ${cell.j})`,
  );
  return true;
}

function getInventoryDisplayText(): string {
  const inventory = gameState.player.inventory;
  if (!inventory) {
    return "Inventory: Empty";
  }
  return `Inventory: Token (Value: ${inventory.value})`;
}

function updateInventoryDisplay(): void {
  try {
    const inventoryDisplay = getElementOrThrow("inventoryDisplay");
    inventoryDisplay.textContent = getInventoryDisplayText();

    // Add visual feedback when holding a token
    if (gameState.player.inventory) {
      inventoryDisplay.style.fontWeight = "bold";
      inventoryDisplay.style.color = "#ffaa00";
    } else {
      inventoryDisplay.style.fontWeight = "normal";
      inventoryDisplay.style.color = "";
    }
  } catch (error) {
    console.error("Failed to update inventory display:", error);
  }
}

// =============================================
// TOKEN SPAWNING LOGIC
// =============================================

function shouldSpawnToken(i: number, j: number): boolean {
  // Only spawn tokens within the spawn radius
  const withinSpawnRadius = Math.abs(i) <= CONFIG.SPAWN.SPAWN_RADIUS &&
    Math.abs(j) <= CONFIG.SPAWN.SPAWN_RADIUS;
  if (!withinSpawnRadius) return false;

  // Use deterministic luck based on cell coordinates
  const spawnSeed = `${i},${j}`;
  const spawnRoll = luck(spawnSeed);

  return spawnRoll < CONFIG.SPAWN.PROBABILITY;
}

function determineTokenValue(i: number, j: number): number {
  const valueSeed = `${i},${j},value`;
  const valueRoll = luck(valueSeed);

  let cumulativeProbability = 0;
  for (
    const [value, probability] of Object.entries(
      CONFIG.SPAWN.VALUE_DISTRIBUTION,
    )
  ) {
    cumulativeProbability += probability;
    if (valueRoll < cumulativeProbability) {
      return parseInt(value);
    }
  }

  // Fallback to value 1
  return 1;
}

function spawnTokenInCell(i: number, j: number): Token | null {
  if (!shouldSpawnToken(i, j)) {
    return null;
  }

  const value = determineTokenValue(i, j);
  return { value };
}

function initializeTokenSpawning() {
  console.log("Initializing deterministic token spawning...");

  let tokensSpawned = 0;

  for (
    let i = -CONFIG.GRID_RENDER_RADIUS;
    i <= CONFIG.GRID_RENDER_RADIUS;
    i++
  ) {
    for (
      let j = -CONFIG.GRID_RENDER_RADIUS;
      j <= CONFIG.GRID_RENDER_RADIUS;
      j++
    ) {
      const cellKey = generateCellKey(i, j);
      const cell = gameState.grid.get(cellKey);

      if (cell) {
        const token = spawnTokenInCell(i, j);
        if (token) {
          cell.token = token;
          tokensSpawned++;

          updateCellVisualization(cell);
        }
      }
    }
  }

  console.log(`Spawned ${tokensSpawned} tokens across the grid`);
  logTokenDistribution();
}

function logTokenDistribution() {
  const distribution: { [key: number]: number } = {};

  for (const cell of gameState.grid.values()) {
    if (cell.token) {
      const value = cell.token.value;
      distribution[value] = (distribution[value] || 0) + 1;
    }
  }

  console.log("Token value distribution:", distribution);
}

// =============================================
// CONDITION EXTRACTION
// =============================================

function isCellInteractable(cell: GridCell): boolean {
  return isWithinInteractionRange(cell.i, cell.j);
}

function hasToken(cell: GridCell): boolean {
  return cell.token !== null;
}

function isPlayerHoldingToken(): boolean {
  return gameState.player.inventory !== null;
}

function _canCellAcceptDrop(cell: GridCell): boolean {
  return isCellInteractable(cell) && !hasToken(cell);
}

function isMergeTarget(cell: GridCell): boolean {
  return isCellInteractable(cell) &&
    hasToken(cell) &&
    isPlayerHoldingToken() &&
    canMergeTokens(gameState.player.inventory!, cell.token!);
}

function _shouldHighlightCell(cell: GridCell): boolean {
  return isCellInteractable(cell) && (hasToken(cell) || isPlayerHoldingToken());
}

function shouldRenderCell(i: number, j: number): boolean {
  const withinRenderRadius = Math.abs(i) <= CONFIG.GRID_RENDER_RADIUS &&
    Math.abs(j) <= CONFIG.GRID_RENDER_RADIUS;
  return withinRenderRadius;
}

// =============================================
// STYLE MANAGEMENT
// =============================================

function getCellStyle(cell: GridCell): CellStyle {
  const baseStyle = { ...CONFIG.CELL_STYLES.default };

  if (isMergeTarget(cell)) {
    Object.assign(baseStyle, CONFIG.CELL_STYLES.mergeTarget);
  } else if (hasToken(cell)) {
    Object.assign(baseStyle, CONFIG.CELL_STYLES.withToken);
  }

  if (isCellInteractable(cell)) {
    Object.assign(baseStyle, CONFIG.CELL_STYLES.interactable);
  }

  if (
    isPlayerHoldingToken() && isCellInteractable(cell) && !isMergeTarget(cell)
  ) {
    Object.assign(baseStyle, CONFIG.CELL_STYLES.holdingToken);
  }

  return baseStyle;
}

function createTooltipContent(cell: GridCell): string {
  if (isMergeTarget(cell)) {
    return getMergeTooltipContent(cell);
  }

  if (hasToken(cell) && cell.token) {
    return `${cell.token.value}`;
  }

  if (isPlayerHoldingToken() && isCellInteractable(cell)) {
    return ``;
  }

  return `Cell (${cell.i},${cell.j})`;
}

function getTooltipOptions(cell: GridCell): leaflet.TooltipOptions {
  const hasCellToken = hasToken(cell);
  const shouldShowPermanent = hasCellToken ||
    (isPlayerHoldingToken() && isCellInteractable(cell)) ||
    isMergeTarget(cell);

  return {
    permanent: shouldShowPermanent,
    direction: "center",
    className: shouldShowPermanent ? CONFIG.UI.TOOLTIP_CLASS : "",
  };
}

// =============================================
// GLOBAL STATE
// =============================================

const gameState: GameState = {
  player: {
    inventory: null,
    location: CONFIG.CLASSROOM_LOCATION,
    points: 0,
  },
  grid: new Map<string, GridCell>(),
  victoryCondition: CONFIG.VICTORY_THRESHOLD,
  isVictoryAchieved: false,
};

let map: leaflet.Map;

// =============================================
// DOM ELEMENT SETUP
// =============================================

function initializeDOM() {
  document.body.innerHTML = "";

  const controlPanel = document.createElement("div");
  controlPanel.id = "controlPanel";
  controlPanel.innerHTML = `
        <h2>Pokemon Fusion Game</h2>
        <div id="inventoryDisplay" class="${CONFIG.UI.INVENTORY_CLASS}">Inventory: Empty</div>
        <div id="gameInstructions">
            <p>Click cells to collect and merge tokens!</p>
            <p>Goal: Create a token with value ${CONFIG.VICTORY_THRESHOLD}</p>
            <p><strong>How to play:</strong></p>
            <ul>
                <li>Click a token cell to pick it up</li>
                <li>Click an empty cell to drop your token</li>
                <li>Click a token cell while holding a token of equal value to merge them</li>
                <li>Merging creates a new token with doubled value</li>
                <li>Earn points when you merge tokens!</li>
            </ul>
        </div>
    `;
  document.body.appendChild(controlPanel);

  const mapContainer = document.createElement("div");
  mapContainer.id = "map";
  document.body.appendChild(mapContainer);

  const statusPanel = document.createElement("div");
  statusPanel.id = "statusPanel";
  statusPanel.innerHTML = "Points: 0 | Goal: Reach value " +
    CONFIG.VICTORY_THRESHOLD;
  document.body.appendChild(statusPanel);
}

// =============================================
// MAP INITIALIZATION
// =============================================

function initializeMap(): leaflet.Map {
  const mapInstance = leaflet.map("map", {
    center: CONFIG.CLASSROOM_LOCATION,
    zoom: CONFIG.ZOOM_LEVEL,
    minZoom: CONFIG.ZOOM_LEVEL,
    maxZoom: CONFIG.ZOOM_LEVEL,
    zoomControl: false,
    scrollWheelZoom: false,
  });

  leaflet.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(mapInstance);

  const playerMarker = leaflet.marker(CONFIG.CLASSROOM_LOCATION);
  playerMarker.bindTooltip("Your location");
  playerMarker.addTo(mapInstance);

  return mapInstance;
}

// =============================================
// GRID SYSTEM
// =============================================

function generateCellKey(i: number, j: number): string {
  return `${i},${j}`;
}

function calculateCellBounds(i: number, j: number): leaflet.LatLngBounds {
  const origin = CONFIG.CLASSROOM_LOCATION;
  return leaflet.latLngBounds([
    [
      origin.lat + i * CONFIG.TILE_DEGREES,
      origin.lng + j * CONFIG.TILE_DEGREES,
    ],
    [
      origin.lat + (i + 1) * CONFIG.TILE_DEGREES,
      origin.lng + (j + 1) * CONFIG.TILE_DEGREES,
    ],
  ]);
}

function isWithinInteractionRange(cellI: number, cellJ: number): boolean {
  const distance = Math.max(Math.abs(cellI), Math.abs(cellJ));
  return distance <= CONFIG.INTERACTION_RANGE;
}

// =============================================
// CELL VISUALIZATION & RENDERING
// =============================================

function createCellElement(cell: GridCell): leaflet.Rectangle {
  validateMapInitialized();
  validateCell(cell);

  const style = getCellStyle(cell);
  const rectangle = leaflet.rectangle(cell.bounds, style);

  rectangle.addTo(map);
  rectangle.bindTooltip(createTooltipContent(cell), getTooltipOptions(cell));

  rectangle.on("click", () => {
    handleCellClick(cell);
  });

  return rectangle;
}

function updateCellVisualization(cell: GridCell) {
  validateMapInitialized();
  validateCell(cell);

  if (cell.element) {
    map.removeLayer(cell.element);
  }

  cell.element = createCellElement(cell);
}

function initializeGridSystem() {
  console.log("Initializing grid system...");
  validateMapInitialized();

  for (
    let i = -CONFIG.GRID_RENDER_RADIUS;
    i <= CONFIG.GRID_RENDER_RADIUS;
    i++
  ) {
    for (
      let j = -CONFIG.GRID_RENDER_RADIUS;
      j <= CONFIG.GRID_RENDER_RADIUS;
      j++
    ) {
      if (!shouldRenderCell(i, j)) continue;

      const cellKey = generateCellKey(i, j);

      if (!gameState.grid.has(cellKey)) {
        const bounds = calculateCellBounds(i, j);

        const newCell: GridCell = {
          i,
          j,
          token: null,
          bounds,
          element: null,
          isVisible: true,
        };

        newCell.element = createCellElement(newCell);
        gameState.grid.set(cellKey, newCell);
      }
    }
  }

  console.log(`Grid system initialized with ${gameState.grid.size} cells`);
}

// =============================================
// CELL INTERACTION HANDLER
// =============================================

function handleCellClick(cell: GridCell) {
  try {
    validateCell(cell);

    console.log(`Cell clicked: (${cell.i}, ${cell.j})`);
    console.log(`Token in cell:`, cell.token);
    console.log(`Player inventory:`, gameState.player.inventory);
    console.log(`Interactable: ${isCellInteractable(cell)}`);
    console.log(
      `Distance from player: ${Math.max(Math.abs(cell.i), Math.abs(cell.j))}`,
    );

    if (!isCellInteractable(cell)) {
      console.log("Cell is not in interaction range");
      provideVisualFeedback(cell, "outOfRange");

      // Show range information to player
      const statusPanel = getElementOrThrow("statusPanel");
      const originalText = statusPanel.textContent;
      statusPanel.textContent =
        "Too far! You can only interact with cells within 3 tiles.";
      setTimeout(() => {
        statusPanel.textContent = originalText;
      }, 2000);
      return;
    }

    let action: "pickup" | "drop" | "merge" | "invalid" = "invalid";
    let success = false;

    // Pickup: if cell has token and player has empty inventory
    if (hasToken(cell) && !isPlayerHoldingToken()) {
      pickupTokenFromCell(cell);
      action = "pickup";
      success = true;
    } // Merge: if both cell and player have tokens of equal value
    else if (hasToken(cell) && isPlayerHoldingToken()) {
      success = attemptMerge(cell);
      action = success ? "merge" : "invalid";
    } // Drop: if cell is empty and player has token
    else if (!hasToken(cell) && isPlayerHoldingToken()) {
      success = dropTokenToCell(cell);
      action = success ? "drop" : "invalid";
    } // Not a valid action
    else {
      console.log("No valid action for this cell");
      action = "invalid";
    }

    provideVisualFeedback(cell, action);

    // Update interaction range display
    if (success) {
      updateInteractionRangeDisplay();
    }
  } catch (error) {
    console.error("Error handling cell click:", error);
    provideVisualFeedback(cell, "invalid");
  }
}

function provideVisualFeedback(
  cell: GridCell,
  action: "pickup" | "drop" | "merge" | "invalid" | "outOfRange",
) {
  if (!cell.element) return;

  let feedbackColor = "#ffff00"; // Default yellow
  let feedbackWeight = 4;

  switch (action) {
    case "pickup":
      feedbackColor = "#00ff00"; // Green for pickup
      break;
    case "drop":
      feedbackColor = "#00ffff"; // Cyan for drop
      break;
    case "merge":
      feedbackColor = "#aa00ff"; // Purple for merge
      feedbackWeight = 5;
      break;
    case "invalid":
      feedbackColor = "#ff0000"; // Red for invalid
      break;
    case "outOfRange":
      feedbackColor = "#888888"; // Gray for out of range
      break;
  }

  cell.element.setStyle({ color: feedbackColor, weight: feedbackWeight });
  setTimeout(() => {
    updateCellVisualization(cell);
  }, CONFIG.UI.HIGHLIGHT_DURATION_MS);
}

// =============================================
// MAP BOUNDARY MANAGEMENT
// =============================================

function setupMapBoundaryHandling() {
  validateMapInitialized();

  map.on("moveend", () => {
    console.log("Map position updated - ready for dynamic grid loading");
  });

  map.setMaxBounds(leaflet.latLngBounds(
    leaflet.latLng(
      CONFIG.CLASSROOM_LOCATION.lat -
        CONFIG.GRID_RENDER_RADIUS * CONFIG.TILE_DEGREES,
      CONFIG.CLASSROOM_LOCATION.lng -
        CONFIG.GRID_RENDER_RADIUS * CONFIG.TILE_DEGREES,
    ),
    leaflet.latLng(
      CONFIG.CLASSROOM_LOCATION.lat +
        CONFIG.GRID_RENDER_RADIUS * CONFIG.TILE_DEGREES,
      CONFIG.CLASSROOM_LOCATION.lng +
        CONFIG.GRID_RENDER_RADIUS * CONFIG.TILE_DEGREES,
    ),
  ));
}

// =============================================
// UI UPDATE FUNCTIONS
// =============================================

function updateUI() {
  try {
    const statusPanel = getElementOrThrow("statusPanel");

    if (gameState.isVictoryAchieved) {
      showVictoryMessage();
    } else {
      let statusText = `Points: ${gameState.player.points} | ` +
        `Goal: Create a ${CONFIG.VICTORY_THRESHOLD} token | ` +
        `Range: ${CONFIG.INTERACTION_RANGE} cells`;

      const highestToken = getHighestTokenValue();
      if (highestToken > 4) {
        statusText += ` | Highest: ${highestToken}`;
      }

      statusPanel.innerHTML = statusText;
      statusPanel.style.color = "";
      statusPanel.style.fontWeight = "normal";
      statusPanel.style.fontSize = "";
      statusPanel.style.textAlign = "";
    }
  } catch (error) {
    console.error("Failed to update UI:", error);
  }
}

// =============================================
// INITIALIZATION FUNCTION
// =============================================

function initializeGame() {
  initializeDOM();
  map = initializeMap();
  initializeGridSystem();

  initializeTokenSpawning();

  setupMapBoundaryHandling();

  updateInventoryDisplay();

  updateUI();
}

// =============================================
// GAME INITIALIZATION
// =============================================

initializeGame();

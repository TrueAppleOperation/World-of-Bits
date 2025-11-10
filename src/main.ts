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
  GRID_RENDER_RADIUS: 15,

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
  },
  UI: {
    HIGHLIGHT_DURATION_MS: 500,
    TOOLTIP_CLASS: "cell-tooltip",
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
  // Use a different seed for value determination to ensure independence
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

function shouldHighlightCell(cell: GridCell): boolean {
  return isCellInteractable(cell) && hasToken(cell);
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

  if (hasToken(cell)) {
    Object.assign(baseStyle, CONFIG.CELL_STYLES.withToken);
  }

  if (isCellInteractable(cell)) {
    Object.assign(baseStyle, CONFIG.CELL_STYLES.interactable);
  }

  return baseStyle;
}

function createTooltipContent(cell: GridCell): string {
  if (hasToken(cell) && cell.token) {
    return `Value: ${cell.token.value}`;
  }
  return `Cell (${cell.i},${cell.j})`;
}

function getTooltipOptions(cell: GridCell): leaflet.TooltipOptions {
  const hasCellToken = hasToken(cell);

  return {
    permanent: hasCellToken,
    direction: "center",
    className: hasCellToken ? CONFIG.UI.TOOLTIP_CLASS : "",
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
        <div id="inventoryDisplay">Inventory: Empty</div>
        <div id="gameInstructions">
            <p>Click cells to collect and merge tokens!</p>
            <p>Goal: Create a token with value ${CONFIG.VICTORY_THRESHOLD}</p>
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
    console.log(`Token:`, cell.token);
    console.log(`Interactable: ${isCellInteractable(cell)}`);

    if (cell.element && shouldHighlightCell(cell)) {
      cell.element.setStyle({ color: "#ffff00", weight: 3 });
      setTimeout(() => {
        updateCellVisualization(cell);
      }, CONFIG.UI.HIGHLIGHT_DURATION_MS);
    }
  } catch (error) {
    console.error("Error handling cell click:", error);
  }
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
    const inventoryDisplay = getElementOrThrow("inventoryDisplay");
    const statusPanel = getElementOrThrow("statusPanel");

    const inventory = gameState.player.inventory;
    inventoryDisplay.textContent = inventory
      ? `Inventory: Token (Value: ${inventory.value})`
      : "Inventory: Empty";

    statusPanel.textContent =
      `Points: ${gameState.player.points} | Goal: Reach value ${gameState.victoryCondition}`;

    if (gameState.isVictoryAchieved) {
      statusPanel.textContent += " - VICTORY!";
      statusPanel.style.color = "green";
      statusPanel.style.fontWeight = "bold";
    }
  } catch (error) {
    console.error("Failed to update UI:", error);
  }
}

// =============================================
// INITIALIZATION FUNCTION
// =============================================

function initializeGame() {
  console.log("Initializing Pokemon Fusion Game...");

  initializeDOM();
  map = initializeMap();
  initializeGridSystem();

  // Initialize token spawning after grid is set up
  initializeTokenSpawning();

  setupMapBoundaryHandling();

  console.log("Phase 3 Complete: Deterministic token spawning implemented!");
  updateUI();
}

// =============================================
// GAME INITIALIZATION
// =============================================

initializeGame();

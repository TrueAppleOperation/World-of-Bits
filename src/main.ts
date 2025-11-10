// @deno-types="npm:@types/leaflet"
import leaflet from "leaflet";

// Style sheets
import "leaflet/dist/leaflet.css";
import "./style.css";

// Fix missing marker images
import "./_leafletWorkaround.ts";

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
  CELL_STYLES: {
    default: { color: "#3388ff", weight: 1, fillOpacity: 0.1 } as CellStyle,
    withToken: { color: "#ff3388", weight: 2, fillOpacity: 0.3 } as CellStyle,
    interactable: {
      color: "#33ff88",
      weight: 2,
      fillOpacity: 0.2,
    } as CellStyle,
  },
} as const;

// =============================================
// GLOBAL STATE
// =============================================

let gameState: GameState = {
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

function initializeDOM() { // HTML structure
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
// GRID SYSTEM UTILITIES
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
  const isInteractable = isWithinInteractionRange(cell.i, cell.j);
  const hasToken = cell.token !== null;

  const style: CellStyle = { ...CONFIG.CELL_STYLES.default };

  if (hasToken) {
    style.color = CONFIG.CELL_STYLES.withToken.color;
    style.weight = CONFIG.CELL_STYLES.withToken.weight;
    style.fillOpacity = CONFIG.CELL_STYLES.withToken.fillOpacity;
  }

  if (isInteractable) {
    style.color = CONFIG.CELL_STYLES.interactable.color;
    style.weight = CONFIG.CELL_STYLES.interactable.weight;
    style.fillOpacity = CONFIG.CELL_STYLES.interactable.fillOpacity;
  }

  const rectangle = leaflet.rectangle(cell.bounds, style);
  rectangle.addTo(map);

  if (hasToken && cell.token) {
    rectangle.bindTooltip(`Value: ${cell.token.value}`, {
      permanent: true,
      direction: "center",
      className: "cell-tooltip",
    });
  } else {
    rectangle.bindTooltip(`Cell (${cell.i},${cell.j})`, {
      permanent: false,
      direction: "center",
    });
  }

  rectangle.on("click", () => {
    handleCellClick(cell);
  });

  return rectangle;
}

function updateCellVisualization(cell: GridCell) {
  if (cell.element) {
    map.removeLayer(cell.element);
  }

  cell.element = createCellElement(cell);
}

function initializeGridSystem() {
  console.log("Initializing grid system...");

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
// CELL INTERACTION HANDLER (PLACEHOLDER)
// =============================================

function handleCellClick(cell: GridCell) {
  console.log(`Cell clicked: (${cell.i}, ${cell.j})`);
  console.log(`Token:`, cell.token);
  console.log(`Interactable: ${isWithinInteractionRange(cell.i, cell.j)}`);

  if (cell.element) {
    cell.element.setStyle({ color: "#ffff00", weight: 3 });
    setTimeout(() => {
      updateCellVisualization(cell);
    }, 500);
  }
}

// =============================================
// MAP BOUNDARY MANAGEMENT
// =============================================

function setupMapBoundaryHandling() {
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
  const inventoryDisplay = document.getElementById("inventoryDisplay");
  if (inventoryDisplay) {
    const inventory = gameState.player.inventory;
    inventoryDisplay.textContent = inventory
      ? `Inventory: Token (Value: ${inventory.value})`
      : "Inventory: Empty";
  }

  const statusPanel = document.getElementById("statusPanel");
  if (statusPanel) {
    statusPanel.textContent =
      `Points: ${gameState.player.points} | Goal: Reach value ${gameState.victoryCondition}`;

    if (gameState.isVictoryAchieved) {
      statusPanel.textContent += " - VICTORY!";
      statusPanel.style.color = "green";
      statusPanel.style.fontWeight = "bold";
    }
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
  setupMapBoundaryHandling();

  console.log("Grid system ready - awaiting deterministic spawning");
  console.log("Phase 2 Complete: Grid system implemented!");

  updateUI();
}

// =============================================
// GAME INITIALIZATION
// =============================================

initializeGame();

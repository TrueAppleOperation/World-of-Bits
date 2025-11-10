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
  i: number; // Grid coordinate i (latitude offset)
  j: number; // Grid coordinate j (longitude offset)
  token: Token | null;
  bounds: leaflet.LatLngBounds;
  element: leaflet.Rectangle | null;
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

const CONFIG = {
  CLASSROOM_LOCATION: leaflet.latLng(36.997936938057016, -122.05703507501151),
  ZOOM_LEVEL: 19,
  TILE_DEGREES: 1e-4,
  INTERACTION_RANGE: 3,
  VICTORY_THRESHOLD: 2048,
  INITIAL_SPAWN_VALUES: [1, 2, 4],
} as const;

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

gameState;

// =============================================
// DOM ELEMENT SETUP
// =============================================

function initializeDOM() {
  // Clear any existing elements
  document.body.innerHTML = "";

  // Create control panel
  const controlPanel = document.createElement("div");
  controlPanel.id = "controlPanel";
  controlPanel.innerHTML = `
        <h2>Pokemon Fusion Game</h2>
        <div id="inventoryDisplay">Inventory: Empty</div>
    `;
  document.body.appendChild(controlPanel);

  // Create map container
  const mapContainer = document.createElement("div");
  mapContainer.id = "map";
  document.body.appendChild(mapContainer);

  // Create status panel
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
  const map = leaflet.map("map", {
    center: CONFIG.CLASSROOM_LOCATION,
    zoom: CONFIG.ZOOM_LEVEL,
    minZoom: CONFIG.ZOOM_LEVEL,
    maxZoom: CONFIG.ZOOM_LEVEL,
    zoomControl: false,
    scrollWheelZoom: false,
  });

  // Add background tiles
  leaflet.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(map);

  // Add player marker
  const playerMarker = leaflet.marker(CONFIG.CLASSROOM_LOCATION);
  playerMarker.bindTooltip("Your location");
  playerMarker.addTo(map);

  return map;
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
// INITIALIZATION FUNCTION
// =============================================

function initializeGame() {
  initializeDOM();

  const map = initializeMap();
  map;
  updateUI();
}

// =============================================
// UI UPDATE FUNCTIONS
// =============================================

function updateUI() {
  // Update inventory display
  const inventoryDisplay = document.getElementById("inventoryDisplay");
  if (inventoryDisplay) {
    const inventory = gameState.player.inventory;
    inventoryDisplay.textContent = inventory
      ? `Inventory: Token (Value: ${inventory.value})`
      : "Inventory: Empty";
  }

  // Update status panel
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
// GAME INITIALIZATION
// =============================================

initializeGame();

console.log({
  generateCellKey,
  calculateCellBounds,
  isWithinInteractionRange,
});

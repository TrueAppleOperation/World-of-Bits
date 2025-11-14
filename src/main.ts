// @deno-types="npm:@types/leaflet"
import leaflet from "leaflet";
import "leaflet/dist/leaflet.css";
import "./_leafletWorkaround.ts";
import luck from "./_luck.ts";
import "./style.css";

// =============================================
// INTERFACES & TYPES
// =============================================

interface Token {
  value: number;
}

interface WorldCoordinates {
  lat: number;
  lng: number;
}

interface CellCoordinates {
  i: number;
  j: number;
}

type CellKey = string;

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
  visibleCells: Set<CellKey>;
  victoryCondition: number;
  isVictoryAchieved: boolean;
}

// =============================================
// MEMENTO PATTERN IMPLEMENTATION
// =============================================

interface CellMemento {
  cellKey: string;
  token: Token | null;
  timestamp: number;
}

class CellOriginator {
  createMemento(cellKey: string, token: Token | null): CellMemento {
    return {
      cellKey,
      token: token ? { ...token } : null,
      timestamp: Date.now(),
    };
  }

  restoreFromMemento(memento: CellMemento): { token: Token | null } {
    return {
      token: memento.token ? { ...memento.token } : null,
    };
  }
}

class CellCaretaker {
  private mementos = new Map<string, CellMemento>();
  private originator = new CellOriginator();

  saveState(cellKey: string, token: Token | null): void {
    const memento = this.originator.createMemento(cellKey, token);
    this.mementos.set(cellKey, memento);
  }

  restoreState(cellKey: string): Token | null {
    const memento = this.mementos.get(cellKey);
    if (!memento) return null;

    const state = this.originator.restoreFromMemento(memento);
    return state.token;
  }

  hasState(cellKey: string): boolean {
    return this.mementos.has(cellKey);
  }

  clearState(cellKey: string): void {
    this.mementos.delete(cellKey);
  }

  getAllStates(): Map<string, CellMemento> {
    return new Map(this.mementos);
  }
}

// Initialize the caretaker globally
const _cellCaretaker = new CellCaretaker();

// =============================================
// CONFIGURATION
// =============================================

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
  VIEWPORT_BUFFER: 2,
  SPAWN: {
    PROBABILITY: 0.15,
    VALUE_DISTRIBUTION: { 1: 0.6, 2: 0.3, 4: 0.1 },
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
    holdingToken: {
      color: "#ffaa00",
      weight: 3,
      fillOpacity: 0.4,
    } as CellStyle,
    mergeTarget: { color: "#aa00ff", weight: 4, fillOpacity: 0.5 } as CellStyle,
  },
  UI: {
    HIGHLIGHT_DURATION_MS: 500,
    TOOLTIP_CLASS: "cell-tooltip",
    INVENTORY_CLASS: "inventory-display",
  },
} as const;

// =============================================
// COORDINATE CONVERSION
// =============================================

function worldToCell(lat: number, lng: number): CellCoordinates {
  const i = Math.floor(lat / CONFIG.TILE_DEGREES);
  const j = Math.floor(lng / CONFIG.TILE_DEGREES);
  return { i, j };
}

function cellToWorldBounds(i: number, j: number): leaflet.LatLngBounds {
  const southWest = leaflet.latLng(
    i * CONFIG.TILE_DEGREES,
    j * CONFIG.TILE_DEGREES,
  );
  const northEast = leaflet.latLng(
    (i + 1) * CONFIG.TILE_DEGREES,
    (j + 1) * CONFIG.TILE_DEGREES,
  );
  return leaflet.latLngBounds(southWest, northEast);
}

function cellToKey(i: number, j: number): CellKey {
  return `${i},${j}`;
}

function cellDistance(cell1: CellCoordinates, cell2: CellCoordinates): number {
  return Math.max(Math.abs(cell1.i - cell2.i), Math.abs(cell1.j - cell2.j));
}

function _getCellsInRadius(
  center: CellCoordinates,
  radius: number,
): CellCoordinates[] {
  const cells: CellCoordinates[] = [];
  for (let i = center.i - radius; i <= center.i + radius; i++) {
    for (let j = center.j - radius; j <= center.j + radius; j++) {
      if (cellDistance(center, { i, j }) <= radius) {
        cells.push({ i, j });
      }
    }
  }
  return cells;
}

// =============================================
// CELL MANAGEMENT
// =============================================

const activeCells = new Map<CellKey, GridCell>();

function isCellActive(cellKey: CellKey): boolean {
  return activeCells.has(cellKey);
}

function getOrCreateCell(i: number, j: number): GridCell {
  const cellKey = cellToKey(i, j);
  if (activeCells.has(cellKey)) {
    return activeCells.get(cellKey)!;
  }
  return spawnCell(i, j);
}

function spawnCell(i: number, j: number): GridCell {
  const bounds = cellToWorldBounds(i, j);
  const token = spawnTokenInCell(i, j);

  const newCell: GridCell = {
    i,
    j,
    token,
    bounds,
    element: null,
    isVisible: true,
  };

  newCell.element = createCellElement(newCell);
  const cellKey = cellToKey(i, j);
  activeCells.set(cellKey, newCell);
  gameState.visibleCells.add(cellKey);

  return newCell;
}

function despawnCell(cellKey: CellKey): void {
  const cell = activeCells.get(cellKey);
  if (!cell) return;

  if (cell.element) {
    map.removeLayer(cell.element);
  }

  activeCells.delete(cellKey);
  gameState.visibleCells.delete(cellKey);
}

function cleanupAllCells(): void {
  for (const cell of activeCells.values()) {
    if (cell.element) {
      map.removeLayer(cell.element);
    }
  }
  activeCells.clear();
  gameState.visibleCells.clear();
}

// =============================================
// GRID VISIBILITY MANAGEMENT
// =============================================

function getVisibleCellRange(map: leaflet.Map) {
  const bounds = map.getBounds();
  const southWest = bounds.getSouthWest();
  const northEast = bounds.getNorthEast();

  const minCell = worldToCell(southWest.lat, southWest.lng);
  const maxCell = worldToCell(northEast.lat, northEast.lng);
  const buffer = CONFIG.VIEWPORT_BUFFER;

  return {
    minI: minCell.i - buffer,
    maxI: maxCell.i + buffer,
    minJ: minCell.j - buffer,
    maxJ: maxCell.j + buffer,
  };
}

function updateCellVisibility(): void {
  const visibleRange = getVisibleCellRange(map);
  const currentlyVisible = new Set<string>();

  for (let i = visibleRange.minI; i <= visibleRange.maxI; i++) {
    for (let j = visibleRange.minJ; j <= visibleRange.maxJ; j++) {
      const cellKey = cellToKey(i, j);
      currentlyVisible.add(cellKey);

      if (!isCellActive(cellKey)) {
        getOrCreateCell(i, j);
      } else {
        const cell = activeCells.get(cellKey)!;
        cell.isVisible = true;
      }
    }
  }

  for (const cellKey of activeCells.keys()) {
    if (!currentlyVisible.has(cellKey)) {
      despawnCell(cellKey);
    }
  }
}

function handleMapMove(): void {
  updateCellVisibility();
  updateInteractionRangeDisplay();
}

// =============================================
// TOKEN SPAWNING
// =============================================

function shouldSpawnToken(i: number, j: number): boolean {
  const playerCell = worldToCell(
    gameState.player.location.lat,
    gameState.player.location.lng,
  );
  const distance = cellDistance(playerCell, { i, j });
  const withinSpawnRadius = distance <= CONFIG.SPAWN.SPAWN_RADIUS;
  if (!withinSpawnRadius) return false;

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
  return 1;
}

function spawnTokenInCell(i: number, j: number): Token | null {
  if (!shouldSpawnToken(i, j)) {
    return null;
  }
  const value = determineTokenValue(i, j);
  return { value };
}

// =============================================
// GAME LOGIC
// =============================================

function isCellInteractable(cell: GridCell): boolean {
  const playerCell = worldToCell(
    gameState.player.location.lat,
    gameState.player.location.lng,
  );
  const distance = cellDistance(playerCell, { i: cell.i, j: cell.j });
  return distance <= CONFIG.INTERACTION_RANGE;
}

function hasToken(cell: GridCell): boolean {
  return cell.token !== null;
}

function isPlayerHoldingToken(): boolean {
  return gameState.player.inventory !== null;
}

function isMergeTarget(cell: GridCell): boolean {
  return isCellInteractable(cell) &&
    hasToken(cell) &&
    isPlayerHoldingToken() &&
    gameState.player.inventory!.value === cell.token!.value;
}

function canMergeTokens(heldToken: Token, cellToken: Token): boolean {
  return heldToken.value === cellToken.value;
}

function mergeTokens(heldToken: Token, cellToken: Token): Token {
  const newValue = heldToken.value * 2;
  console.log(
    `Merging tokens: ${heldToken.value} + ${cellToken.value} = ${newValue}`,
  );
  gameState.player.points += newValue;
  return { value: newValue };
}

function attemptMerge(cell: GridCell): boolean {
  if (!gameState.player.inventory || !cell.token) return false;
  if (!canMergeTokens(gameState.player.inventory, cell.token)) return false;

  const newToken = mergeTokens(gameState.player.inventory, cell.token);
  cell.token = newToken;
  gameState.player.inventory = null;

  updateCellVisualization(cell);
  updateInventoryDisplay();
  updateUI();

  console.log(`Successful merge. New token value: ${newToken.value}`);
  checkVictoryCondition(newToken);
  return true;
}

function checkVictoryCondition(newToken: Token): void {
  if (
    newToken.value >= CONFIG.VICTORY_THRESHOLD && !gameState.isVictoryAchieved
  ) {
    gameState.isVictoryAchieved = true;
    updateUI();
  }
}

// =============================================
// INVENTORY MANAGEMENT
// =============================================

function canPickupToken(cell: GridCell): boolean {
  return isCellInteractable(cell) && hasToken(cell) && !isPlayerHoldingToken();
}

function pickupTokenFromCell(cell: GridCell): void {
  if (!canPickupToken(cell)) {
    console.warn("Cannot pickup token from cell:", cell);
    return;
  }

  gameState.player.inventory = cell.token;
  cell.token = null;

  updateCellVisualization(cell);
  updateInventoryDisplay();
}

function dropTokenToCell(cell: GridCell): boolean {
  if (!isCellInteractable(cell) || !gameState.player.inventory) return false;

  if (cell.token) {
    return attemptMerge(cell);
  }

  cell.token = gameState.player.inventory;
  gameState.player.inventory = null;

  updateCellVisualization(cell);
  updateInventoryDisplay();

  return true;
}

// =============================================
// VISUALIZATION
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
  if (isMergeTarget(cell) && gameState.player.inventory && cell.token) {
    const newValue = gameState.player.inventory.value * 2;
    return `Merge: ${gameState.player.inventory.value} + ${cell.token.value} = ${newValue}`;
  }

  if (hasToken(cell) && cell.token) {
    return `${cell.token.value}`;
  }

  return ``;
}

function getTooltipOptions(cell: GridCell): leaflet.TooltipOptions {
  const shouldShowPermanent = hasToken(cell) ||
    (isPlayerHoldingToken() && isCellInteractable(cell)) ||
    isMergeTarget(cell);

  return {
    permanent: shouldShowPermanent,
    direction: "center",
    className: shouldShowPermanent ? CONFIG.UI.TOOLTIP_CLASS : "",
  };
}

function createCellElement(cell: GridCell): leaflet.Rectangle {
  if (!map) throw new Error("Map not initialized");
  if (!cell.bounds) throw new Error("Cell bounds undefined");

  const style = getCellStyle(cell);
  const rectangle = leaflet.rectangle(cell.bounds, style);

  rectangle.addTo(map);
  rectangle.bindTooltip(createTooltipContent(cell), getTooltipOptions(cell));
  rectangle.on("click", () => handleCellClick(cell));

  return rectangle;
}

function updateCellVisualization(cell: GridCell) {
  if (!map) throw new Error("Map not initialized");

  if (cell.element) {
    map.removeLayer(cell.element);
  }
  cell.element = createCellElement(cell);
}

function updateInteractionRangeDisplay(): void {
  for (const cell of activeCells.values()) {
    if (cell.element) {
      updateCellVisualization(cell);
    }
  }
}

// =============================================
// PLAYER MOVEMENT
// =============================================

function addMovementControls(): void {
  const movementPanel = document.createElement("div");
  movementPanel.id = "movementPanel";
  movementPanel.innerHTML = `
    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 5px; margin: 10px 0;">
      <div></div>
      <button id="moveNorth">↑ North</button>
      <div></div>
      <button id="moveWest">← West</button>
      <button id="moveCenter">Center</button>
      <button id="moveEast">→ East</button>
      <div></div>
      <button id="moveSouth">↓ South</button>
      <div></div>
    </div>
  `;

  document.getElementById("controlPanel")!.appendChild(movementPanel);
}

function setupMovementControls(): void {
  const get = (id: string) => document.getElementById(id)!;

  get("moveNorth").addEventListener("click", () => movePlayer("north"));
  get("moveSouth").addEventListener("click", () => movePlayer("south"));
  get("moveEast").addEventListener("click", () => movePlayer("east"));
  get("moveWest").addEventListener("click", () => movePlayer("west"));
  get("moveCenter").addEventListener("click", () => movePlayer("center"));
}

function movePlayer(
  direction: "north" | "south" | "east" | "west" | "center",
): void {
  let newLat = gameState.player.location.lat;
  let newLng = gameState.player.location.lng;

  switch (direction) {
    case "north":
      newLat += CONFIG.TILE_DEGREES;
      break;
    case "south":
      newLat -= CONFIG.TILE_DEGREES;
      break;
    case "east":
      newLng += CONFIG.TILE_DEGREES;
      break;
    case "west":
      newLng -= CONFIG.TILE_DEGREES;
      break;
    case "center":
      newLat = CONFIG.CLASSROOM_LOCATION.lat;
      newLng = CONFIG.CLASSROOM_LOCATION.lng;
      break;
  }

  gameState.player.location = leaflet.latLng(newLat, newLng);
  map.setView(gameState.player.location, CONFIG.ZOOM_LEVEL);
  console.log(`Player moved ${direction} to:`, gameState.player.location);
}

// =============================================
// UI MANAGEMENT
// =============================================

function getInventoryDisplayText(): string {
  const inventory = gameState.player.inventory;
  return inventory
    ? `Inventory: Token (Value: ${inventory.value})`
    : "Inventory: Empty";
}

function updateInventoryDisplay(): void {
  const inventoryDisplay = document.getElementById("inventoryDisplay");
  if (!inventoryDisplay) return;

  inventoryDisplay.textContent = getInventoryDisplayText();

  if (gameState.player.inventory) {
    inventoryDisplay.style.fontWeight = "bold";
    inventoryDisplay.style.color = "#ffaa00";
  } else {
    inventoryDisplay.style.fontWeight = "normal";
    inventoryDisplay.style.color = "";
  }
}

function getHighestTokenValue(): number {
  let highest = 0;
  for (const cell of activeCells.values()) {
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

function showVictoryMessage(): void {
  if (!gameState.isVictoryAchieved) return;

  const statusPanel = document.getElementById("statusPanel");
  if (!statusPanel) return;

  statusPanel.innerHTML = `🎉 VICTORY ACHIEVED! 🎉<br>` +
    `Final Score: ${gameState.player.points} points<br>` +
    `You created a token with value ${CONFIG.VICTORY_THRESHOLD}+!`;

  statusPanel.style.color = "green";
  statusPanel.style.fontWeight = "bold";
  statusPanel.style.fontSize = "1.2em";
  statusPanel.style.textAlign = "center";
}

function updateUI() {
  const statusPanel = document.getElementById("statusPanel");
  if (!statusPanel) return;

  if (gameState.isVictoryAchieved) {
    showVictoryMessage();
  } else {
    const highestToken = getHighestTokenValue();
    statusPanel.innerHTML = `Points: ${gameState.player.points} | ` +
      `Goal: Create a ${CONFIG.VICTORY_THRESHOLD} token | ` +
      `Range: ${CONFIG.INTERACTION_RANGE} cells | Highest: ${highestToken}`;
  }
}

// =============================================
// CELL INTERACTION
// =============================================

function handleCellClick(cell: GridCell) {
  console.log(`Cell clicked: (${cell.i}, ${cell.j})`);
  console.log(`Token in cell:`, cell.token);
  console.log(`Player inventory:`, gameState.player.inventory);
  console.log(`Interactable: ${isCellInteractable(cell)}`);

  if (!isCellInteractable(cell)) {
    provideVisualFeedback(cell, "outOfRange");

    const statusPanel = document.getElementById("statusPanel");
    if (statusPanel) {
      const originalText = statusPanel.textContent;
      statusPanel.textContent =
        "Too far! You can only interact with cells within 3 tiles.";
      setTimeout(() => statusPanel.textContent = originalText, 2000);
    }
    return;
  }

  let action: "pickup" | "drop" | "merge" | "invalid" = "invalid";
  let success = false;

  if (hasToken(cell) && !isPlayerHoldingToken()) {
    pickupTokenFromCell(cell);
    action = "pickup";
    success = true;
  } else if (hasToken(cell) && isPlayerHoldingToken()) {
    success = attemptMerge(cell);
    action = success ? "merge" : "invalid";
  } else if (!hasToken(cell) && isPlayerHoldingToken()) {
    success = dropTokenToCell(cell);
    action = success ? "drop" : "invalid";
  }

  provideVisualFeedback(cell, action);
  if (success) updateInteractionRangeDisplay();
}

function provideVisualFeedback(
  cell: GridCell,
  action: "pickup" | "drop" | "merge" | "invalid" | "outOfRange",
) {
  if (!cell.element) return;

  const styles = {
    pickup: { color: "#00ff00", weight: 4 },
    drop: { color: "#00ffff", weight: 4 },
    merge: { color: "#aa00ff", weight: 5 },
    invalid: { color: "#ff0000", weight: 4 },
    outOfRange: { color: "#888888", weight: 4 },
  };

  cell.element.setStyle(styles[action]);
  setTimeout(
    () => updateCellVisualization(cell),
    CONFIG.UI.HIGHLIGHT_DURATION_MS,
  );
}

// =============================================
// INITIALIZATION
// =============================================

const gameState: GameState = {
  player: {
    inventory: null,
    location: CONFIG.CLASSROOM_LOCATION,
    points: 0,
  },
  visibleCells: new Set<CellKey>(),
  victoryCondition: CONFIG.VICTORY_THRESHOLD,
  isVictoryAchieved: false,
};

let map: leaflet.Map;
let playerMarker: leaflet.Marker;

function initializeDOM() {
  document.body.innerHTML = `
    <div id="controlPanel">
      <h2>World of Bits Game</h2>
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
          <li>Use the movement buttons to navigate the map</li>
        </ul>
      </div>
    </div>
    <div id="map"></div>
    <div id="statusPanel">Points: 0 | Goal: Reach value ${CONFIG.VICTORY_THRESHOLD} | Highest: 0</div>
  `;

  addMovementControls();
}

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

  playerMarker = leaflet.marker(CONFIG.CLASSROOM_LOCATION);
  playerMarker.bindTooltip("Your location");
  playerMarker.addTo(mapInstance);

  return mapInstance;
}

function initializeGame() {
  initializeDOM();
  map = initializeMap();

  setupMovementControls();
  cleanupAllCells();
  updateCellVisibility();

  map.on("moveend", handleMapMove);
  updateInventoryDisplay();
  updateUI();
}

initializeGame();

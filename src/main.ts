// @deno-types="npm:@types/leaflet"
import leaflet from "leaflet";
import "leaflet/dist/leaflet.css";
import "./_leafletWorkaround.ts";
import luck from "./_luck.ts";
import "./style.css";

// =============================================
// MOVEMENT CONTROL INTERFACE (FACADE PATTERN)
// =============================================

interface MovementController {
  initialize(): Promise<void>;
  enable(): Promise<void>;
  disable(): Promise<void>;
  getMovementType(): string;
  isActive(): boolean;
  cleanup(): void;
}

class ButtonMovementController implements MovementController {
  private active: boolean = false;
  private movementCallbacks:
    ((direction: "north" | "south" | "east" | "west" | "center") => void)[] =
      [];

  // deno-lint-ignore require-await
  async initialize(): Promise<void> {
    console.log("Button movement controller initialized");
  }

  // deno-lint-ignore require-await
  async enable(): Promise<void> {
    this.active = true;
    this.updateButtonAccessibility();
    console.log("Button movement enabled");
  }

  // deno-lint-ignore require-await
  async disable(): Promise<void> {
    this.active = false;
    this.updateButtonAccessibility();
    console.log("Button movement disabled");
  }

  getMovementType(): string {
    return "buttons";
  }

  isActive(): boolean {
    return this.active;
  }

  cleanup(): void {
    this.active = false;
    this.movementCallbacks = [];
    console.log("Button movement controller cleaned up");
  }

  onMove(
    callback: (
      direction: "north" | "south" | "east" | "west" | "center",
    ) => void,
  ): void {
    this.movementCallbacks.push(callback);
  }

  private updateButtonAccessibility(): void {
    const buttons = [
      "moveNorth",
      "moveSouth",
      "moveEast",
      "moveWest",
      "moveCenter",
    ];

    buttons.forEach((buttonId) => {
      const button = document.getElementById(buttonId);
      if (button) {
        if (this.active) {
          button.style.opacity = "1";
          button.style.cursor = "pointer";
          button.removeAttribute("disabled");
        } else {
          button.style.opacity = "0.6";
          button.style.cursor = "not-allowed";
          button.setAttribute("disabled", "true");
        }
      }
    });
  }

  // Public method to trigger movement
  public triggerMove(
    direction: "north" | "south" | "east" | "west" | "center",
  ): void {
    if (this.active) {
      this.movementCallbacks.forEach((callback) => callback(direction));
    }
  }
}

class GeolocationMovementController implements MovementController {
  private active: boolean = false;
  private watchId: number | null = null;
  private lastPosition: GeolocationPosition | null = null;
  private calibrationOffset: { lat: number; lng: number } | null = null;
  private isCalibrated: boolean = false;
  private movementThreshold: number = 0.00002; // Minimum movement to trigger update

  async initialize(): Promise<void> {
    if (!navigator.geolocation) {
      throw new Error("Geolocation is not supported by this browser");
    }

    // Request permission and get initial position for calibration
    try {
      const position = await new Promise<GeolocationPosition>(
        (resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0,
          });
        },
      );

      this.calibrate(position);
      console.log("Geolocation movement controller initialized and calibrated");
    } catch (error) {
      console.warn("Could not get initial position for calibration:", error);
    }
  }

  // deno-lint-ignore require-await
  async enable(): Promise<void> {
    if (this.active) return;

    this.active = true;

    if (navigator.geolocation) {
      this.watchId = navigator.geolocation.watchPosition(
        (position) => this.handlePositionUpdate(position),
        (error) => this.handleGeolocationError(error),
        {
          enableHighAccuracy: true,
          maximumAge: 1000,
          timeout: 5000,
        },
      );
    }

    console.log("Geolocation movement enabled");
  }

  // deno-lint-ignore require-await
  async disable(): Promise<void> {
    this.active = false;

    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }

    console.log("Geolocation movement disabled");
  }

  getMovementType(): string {
    return "geolocation";
  }

  isActive(): boolean {
    return this.active;
  }

  cleanup(): void {
    this.disable();
    this.lastPosition = null;
    this.calibrationOffset = null;
    this.isCalibrated = false;
    console.log("Geolocation movement controller cleaned up");
  }

  private calibrate(position: GeolocationPosition): void {
    const currentLat = gameState.player.location.lat;
    const currentLng = gameState.player.location.lng;

    this.calibrationOffset = {
      lat: currentLat - position.coords.latitude,
      lng: currentLng - position.coords.longitude,
    };

    this.isCalibrated = true;
    console.log("Geolocation calibrated with offset:", this.calibrationOffset);
  }

  private handlePositionUpdate(position: GeolocationPosition): void {
    this.lastPosition = position;

    if (!this.active) return;

    // Calibrate on first position update if not already calibrated
    if (!this.isCalibrated) {
      this.calibrate(position);
      return;
    }

    // Apply calibration offset to convert real-world coordinates to game coordinates
    const gameLat = position.coords.latitude + this.calibrationOffset!.lat;
    const gameLng = position.coords.longitude + this.calibrationOffset!.lng;

    // Calculate distance from current position
    const distance = this.calculateDistance(
      gameState.player.location.lat,
      gameState.player.location.lng,
      gameLat,
      gameLng,
    );

    if (distance >= this.movementThreshold) {
      this.updatePlayerPosition(gameLat, gameLng);
    }
  }

  private calculateDistance(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number,
  ): number {
    const dLat = lat2 - lat1;
    const dLng = lng2 - lng1;
    return Math.sqrt(dLat * dLat + dLng * dLng);
  }

  private updatePlayerPosition(newLat: number, newLng: number): void {
    const currentLat = gameState.player.location.lat;
    const currentLng = gameState.player.location.lng;
    const smoothLat = currentLat + (newLat - currentLat) * 0.7;
    const smoothLng = currentLng + (newLng - currentLng) * 0.7;

    // Update game state
    gameState.player.location = leaflet.latLng(smoothLat, smoothLng);

    // Update marker position
    playerMarker.setLatLng(gameState.player.location);

    // Update map view to follow player with smooth transition
    map.setView(gameState.player.location, CONFIG.ZOOM_LEVEL, {
      animate: true,
      duration: 0.5,
      easeLinearity: 0.25,
    });

    // Update cell visibility and interaction range
    updateCellVisibility();
    updateInteractionRangeDisplay();

    console.log(
      `Player moved via geolocation to: ${smoothLat.toFixed(6)}, ${
        smoothLng.toFixed(6)
      }`,
    );
  }

  private handleGeolocationError(error: GeolocationPositionError): void {
    console.error("Geolocation error:", error);

    const statusPanel = document.getElementById("statusPanel");
    if (statusPanel) {
      let errorMessage = "Geolocation error: ";
      switch (error.code) {
        case error.PERMISSION_DENIED:
          errorMessage += "Permission denied. Please enable location services.";
          break;
        case error.POSITION_UNAVAILABLE:
          errorMessage +=
            "Position unavailable. Please check your device's location settings.";
          break;
        case error.TIMEOUT:
          errorMessage += "Location request timed out.";
          break;
        default:
          errorMessage += error.message;
      }

      statusPanel.textContent =
        `${errorMessage} Falling back to button controls.`;
      setTimeout(() => updateUI(), 5000);
    }

    // Fall back to button controls
    movementManager.switchToMovementType("buttons");
  }

  // Public method to recalibrate if needed
  public recalibrate(): void {
    if (this.lastPosition) {
      this.calibrate(this.lastPosition);

      const statusPanel = document.getElementById("statusPanel");
      if (statusPanel) {
        statusPanel.textContent =
          "Geolocation recalibrated to current position.";
        setTimeout(() => updateUI(), 3000);
      }
    }
  }
}

class MovementManager {
  private controllers: Map<string, MovementController>;
  private currentController: MovementController | null = null;
  private movementChangeCallbacks: ((type: string) => void)[] = [];

  constructor() {
    this.controllers = new Map();

    this.controllers.set("buttons", new ButtonMovementController());
    this.controllers.set("geolocation", new GeolocationMovementController());
  }

  async initialize(): Promise<void> {
    for (const controller of this.controllers.values()) {
      try {
        await controller.initialize();
      } catch (error) {
        console.warn(`Failed to initialize movement controller:`, error);
      }
    }

    // Enhanced URL parameter handling with validation
    const urlParams = new URLSearchParams(globalThis.location.search);
    const movementParam = urlParams.get("movement");

    let initialMovementType = "buttons";

    // Validate and set initial movement type
    if (movementParam === "geolocation") {
      // Check if geolocation is actually available before defaulting to it
      if (navigator.geolocation) {
        initialMovementType = "geolocation";
      } else {
        console.warn(
          "Geolocation requested via URL but not available in browser",
        );
      }
    } else if (movementParam && movementParam !== "buttons") {
      console.warn(
        `Unknown movement type in URL: ${movementParam}, defaulting to buttons`,
      );
    }

    await this.switchToMovementType(initialMovementType);
  }

  async switchToMovementType(type: string): Promise<boolean> {
    const newController = this.controllers.get(type);

    if (!newController) {
      console.error(`Movement type '${type}' not found`);
      return false;
    }

    if (
      this.currentController === newController &&
      this.currentController.isActive()
    ) {
      console.log(`Already using ${type} movement`);
      return true;
    }

    // Disable current controller
    if (this.currentController) {
      await this.currentController.disable();
    }

    // Enable new controller
    try {
      this.currentController = newController;
      await this.currentController.enable();

      console.log(`Switched to ${type} movement`);

      // Update URL parameter without page reload
      this.updateURLParameter(type);

      // Update UI and notify callbacks
      this.updateMovementUI();
      this.notifyMovementChange(type);

      return true;
    } catch (error) {
      console.error(`Failed to switch to ${type} movement:`, error);

      // Fallback logic
      if (type === "geolocation") {
        console.log(
          "Falling back to button controls due to geolocation failure",
        );
        const statusPanel = document.getElementById("statusPanel");
        if (statusPanel) {
          statusPanel.textContent =
            "Geolocation unavailable. Using button controls.";
          setTimeout(() => updateUI(), 3000);
        }
        return await this.switchToMovementType("buttons");
      }
      return false;
    }
  }

  getCurrentController(): MovementController | null {
    return this.currentController;
  }

  getCurrentMovementType(): string {
    return this.currentController?.getMovementType() || "buttons";
  }

  getAvailableMovementTypes(): string[] {
    return Array.from(this.controllers.keys());
  }

  // Method to recalibrate geolocation
  recalibrateGeolocation(): void {
    const geolocationController = this.controllers.get(
      "geolocation",
    ) as GeolocationMovementController;
    if (geolocationController && geolocationController.isActive()) {
      geolocationController.recalibrate();
    }
  }

  // Add callback for movement changes
  onMovementChange(callback: (type: string) => void): void {
    this.movementChangeCallbacks.push(callback);
  }

  private notifyMovementChange(type: string): void {
    this.movementChangeCallbacks.forEach((callback) => callback(type));
  }

  private updateURLParameter(movementType: string): void {
    const url = new URL(globalThis.location.href);

    if (movementType === "buttons") {
      // Remove parameter if using default
      url.searchParams.delete("movement");
    } else {
      // Set parameter for non-default types
      url.searchParams.set("movement", movementType);
    }

    // Update URL without reloading page
    globalThis.history.replaceState({}, "", url.toString());
  }

  private updateMovementUI(): void {
    const movementType = this.currentController?.getMovementType() || "unknown";

    const toggleButton = document.getElementById("movementToggle");
    if (toggleButton) {
      const isGeolocation = movementType === "geolocation";

      toggleButton.textContent = `Movement: ${movementType} (Click to switch)`;
      toggleButton.title = `Current: ${movementType}. Click to switch to ${
        isGeolocation ? "buttons" : "geolocation"
      }`;

      if (isGeolocation) {
        toggleButton.style.background = "#2196F3";
        toggleButton.style.boxShadow = "0 2px 4px rgba(33, 150, 243, 0.3)";
      } else {
        toggleButton.style.background = "#4CAF50";
        toggleButton.style.boxShadow = "0 2px 4px rgba(76, 175, 80, 0.3)";
      }
    }

    // Update recalibrate button visibility and state
    const recalibrateButton = document.getElementById(
      "recalibrateButton",
    ) as HTMLButtonElement;
    if (recalibrateButton) {
      const isGeolocationActive = movementType === "geolocation";

      if (isGeolocationActive) {
        recalibrateButton.style.display = "inline-block";
        recalibrateButton.disabled = false;
        recalibrateButton.title =
          "Recalibrate your current location as the center point";
      } else {
        recalibrateButton.style.display = "none";
        recalibrateButton.disabled = true;
      }
    }

    // Update movement instructions based on current type
    this.updateMovementInstructions(movementType);

    const statusPanel = document.getElementById("statusPanel");
    if (statusPanel) {
      const baseText = statusPanel.textContent?.split("|")[0] || "";
      statusPanel.textContent = `${baseText} | Movement: ${movementType}`;
    }

    console.log(`Movement UI updated: ${movementType}`);
  }

  private updateMovementInstructions(movementType: string): void {
    const instructionsElement = document.getElementById("movementInstructions");
    if (!instructionsElement) return;

    if (movementType === "geolocation") {
      instructionsElement.innerHTML = `
        <div style="margin: 10px 0; padding: 10px; background: #e3f2fd; border-radius: 4px; border-left: 4px solid #2196F3;">
          <p style="margin: 0; font-size: 0.9em; color: #1565C0;">
            <strong>🎯 Geolocation Active</strong><br>
            Move around in the real world to navigate the map. 
            The game will follow your physical location.
          </p>
        </div>
      `;
    } else {
      instructionsElement.innerHTML = `
        <div style="margin: 10px 0; padding: 10px; background: #e8f5e8; border-radius: 4px; border-left: 4px solid #4CAF50;">
          <p style="margin: 0; font-size: 0.9em; color: #2e7d32;">
            <strong>🎮 Button Controls Active</strong><br>
            Use the directional buttons above to navigate the map.
          </p>
        </div>
      `;
    }
  }

  cleanup(): void {
    if (this.currentController) {
      this.currentController.disable();
    }

    for (const controller of this.controllers.values()) {
      controller.cleanup();
    }

    this.currentController = null;
    this.movementChangeCallbacks = [];
  }
}

const movementManager = new MovementManager();

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
  coordinates: CellCoordinates;
  token: Token | null;
  bounds: leaflet.LatLngBounds;
  element: leaflet.Rectangle | null;
  isVisible: boolean;
  isModified: boolean;
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

const _cellCaretaker = new CellCaretaker();

// =============================================
// FLYWEIGHT PATTERN IMPLEMENTATION
// =============================================

class CellFlyweightFactory {
  private flyweights = new Map<string, CellCoordinates>();

  getFlyweight(i: number, j: number): CellCoordinates {
    const key = cellToKey(i, j);

    if (!this.flyweights.has(key)) {
      this.flyweights.set(key, { i, j });
    }

    return this.flyweights.get(key)!;
  }

  getFlyweightCount(): number {
    return this.flyweights.size;
  }
}

const _cellFlyweightFactory = new CellFlyweightFactory();

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
  const coordinates = _cellFlyweightFactory.getFlyweight(i, j);

  let token: Token | null = null;
  const isModified = _cellCaretaker.hasState(cellToKey(i, j));

  if (isModified) {
    token = _cellCaretaker.restoreState(cellToKey(i, j));
  } else {
    token = spawnTokenInCell(i, j);
  }

  const newCell: GridCell = {
    coordinates,
    token,
    bounds,
    element: null,
    isVisible: true,
    isModified,
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

  if (cell.isModified) {
    _cellCaretaker.saveState(cellKey, cell.token);
  }

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

function markCellAsModified(cell: GridCell): void {
  cell.isModified = true;
  _cellCaretaker.saveState(
    cellToKey(cell.coordinates.i, cell.coordinates.j),
    cell.token,
  );
}

// =============================================
// DEBUG
// =============================================

function addDebugControls(): void {
  const debugPanel = document.createElement("div");
  debugPanel.id = "debugPanel";
  debugPanel.innerHTML = `
    <div style="margin: 10px 0; padding: 10px; background: #f0f0f0; border-radius: 5px;">
      <h4>Debug Info</h4>
      <button id="showCellStates">Show Saved Cell States</button>
      <button id="clearAllStates">Clear All Saved States</button>
      <button id="showMemoryStats">Show Memory Statistics</button>
      <div id="debugInfo" style="margin-top: 10px; font-family: monospace; font-size: 0.9em;"></div>
    </div>
  `;

  document.getElementById("controlPanel")!.appendChild(debugPanel);

  document.getElementById("showCellStates")!.addEventListener(
    "click",
    showCellStates,
  );
  document.getElementById("clearAllStates")!.addEventListener(
    "click",
    clearAllStates,
  );
  document.getElementById("showMemoryStats")!.addEventListener(
    "click",
    showMemoryStats,
  );
}

function showCellStates(): void {
  const debugInfo = document.getElementById("debugInfo")!;
  const states = _cellCaretaker.getAllStates();

  let infoHTML = `<p><strong>Saved Cell States: ${states.size}</strong></p>`;
  infoHTML += `<p>Active Cells: ${activeCells.size}</p>`;
  infoHTML +=
    `<p>Flyweight Objects: ${_cellFlyweightFactory.getFlyweightCount()}</p>`;
  infoHTML += `<ul style="max-height: 200px; overflow-y: auto;">`;

  let modifiedCount = 0;
  let emptyCount = 0;
  let tokenCount = 0;

  states.forEach((memento, key) => {
    const tokenInfo = memento.token
      ? `Token(value: ${memento.token.value})`
      : "Empty";
    infoHTML += `<li>Cell ${key}: ${tokenInfo}</li>`;

    if (memento.token) {
      tokenCount++;
    } else {
      emptyCount++;
    }
    modifiedCount++;
  });

  infoHTML += `</ul>`;
  infoHTML +=
    `<p><strong>Summary:</strong> ${modifiedCount} modified cells (${tokenCount} with tokens, ${emptyCount} empty)</p>`;

  debugInfo.innerHTML = infoHTML;
}

function clearAllStates(): void {
  const states = _cellCaretaker.getAllStates();
  states.forEach((_, key) => {
    _cellCaretaker.clearState(key);
  });

  activeCells.forEach((cell, _key) => {
    if (cell.isModified) {
      cell.isModified = false;
      cell.token = spawnTokenInCell(cell.coordinates.i, cell.coordinates.j);
      updateCellVisualization(cell);
    }
  });

  showCellStates();
  console.log("Cleared all saved cell states");
}

function showMemoryStats(): void {
  const debugInfo = document.getElementById("debugInfo")!;

  const totalCells = activeCells.size;
  const modifiedCells =
    Array.from(activeCells.values()).filter((cell) => cell.isModified).length;
  const cellsWithTokens =
    Array.from(activeCells.values()).filter((cell) => cell.token !== null)
      .length;
  const flyweightObjects = _cellFlyweightFactory.getFlyweightCount();
  const savedStates = _cellCaretaker.getAllStates().size;

  const estimatedMemoryWithoutFlyweight = totalCells * 16;
  const estimatedMemoryWithFlyweight = flyweightObjects * 16;
  const memorySaved = estimatedMemoryWithoutFlyweight -
    estimatedMemoryWithFlyweight;

  let infoHTML = `
    <p><strong>Memory Statistics</strong></p>
    <table style="width: 100%; border-collapse: collapse;">
      <tr><td style="padding: 4px; border-bottom: 1px solid #ccc;">Active Cells:</td><td style="padding: 4px; border-bottom: 1px solid #ccc;">${totalCells}</td></tr>
      <tr><td style="padding: 4px; border-bottom: 1px solid #ccc;">Modified Cells:</td><td style="padding: 4px; border-bottom: 1px solid #ccc;">${modifiedCells}</td></tr>
      <tr><td style="padding: 4px; border-bottom: 1px solid #ccc;">Cells with Tokens:</td><td style="padding: 4px; border-bottom: 1px solid #ccc;">${cellsWithTokens}</td></tr>
      <tr><td style="padding: 4px; border-bottom: 1px solid #ccc;">Flyweight Objects:</td><td style="padding: 4px; border-bottom: 1px solid #ccc;">${flyweightObjects}</td></tr>
      <tr><td style="padding: 4px; border-bottom: 1px solid #ccc;">Saved States:</td><td style="padding: 4px; border-bottom: 1px solid #ccc;">${savedStates}</td></tr>
      <tr><td style="padding: 4px; border-bottom: 1px solid #ccc;">Memory Saved:</td><td style="padding: 4px; border-bottom: 1px solid #ccc;">~${memorySaved} bytes</td></tr>
      <tr><td style="padding: 4px;">Efficiency:</td><td style="padding: 4px;">${
    ((flyweightObjects / totalCells) * 100).toFixed(1)
  }%</td></tr>
    </table>
  `;

  infoHTML += `<p><strong>Flyweight Pattern Benefits:</strong></p>`;
  infoHTML += `<ul>`;
  infoHTML += `<li>Shared coordinate objects reduce memory usage</li>`;
  infoHTML += `<li>Only modified cells require persistent storage</li>`;
  infoHTML += `<li>Unmodified cells remain stateless and lightweight</li>`;
  infoHTML += `<li>Automatic state preservation for modified cells</li>`;
  infoHTML += `</ul>`;

  debugInfo.innerHTML = infoHTML;
}

function logMemoryStats(): void {
  const totalCells = activeCells.size;
  const modifiedCells =
    Array.from(activeCells.values()).filter((cell) => cell.isModified).length;
  const flyweightObjects = _cellFlyweightFactory.getFlyweightCount();

  console.log(`=== Memory Statistics ===`);
  console.log(`Active Cells: ${totalCells}`);
  console.log(`Modified Cells: ${modifiedCells}`);
  console.log(`Flyweight Objects: ${flyweightObjects}`);
  console.log(
    `Memory Efficiency: ${((flyweightObjects / totalCells) * 100).toFixed(1)}%`,
  );
  console.log(`=========================`);
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
  const distance = cellDistance(playerCell, {
    i: cell.coordinates.i,
    j: cell.coordinates.j,
  });
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
  markCellAsModified(cell);

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
  markCellAsModified(cell);

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
  markCellAsModified(cell);

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
// ENHANCED MOVEMENT CONTROLS UI
// =============================================

function addMovementControls(): void {
  const movementPanel = document.createElement("div");
  movementPanel.id = "movementPanel";
  movementPanel.innerHTML = `
    <div style="margin-bottom: 15px;">
      <h3 style="margin: 0 0 10px 0; color: #333;">Movement Controls</h3>
      
      <!-- Movement Type Toggle -->
      <div style="display: flex; gap: 10px; align-items: center; margin-bottom: 10px;">
        <button id="movementToggle" style="padding: 10px 16px; background: #4CAF50; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; transition: all 0.3s ease;">
          Movement: buttons (Click to switch)
        </button>
        <button id="recalibrateButton" style="padding: 10px 16px; background: #FF9800; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; transition: all 0.3s ease; display: none;">
          Recalibrate Location
        </button>
      </div>
      
      <!-- Dynamic Instructions -->
      <div id="movementInstructions"></div>
      
      <!-- Directional Buttons -->
      <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; border: 2px solid #e9ecef;">
        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin: 0 auto; max-width: 200px;">
          <div></div>
          <button id="moveNorth" style="padding: 12px; background: #4285f4; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 16px; transition: all 0.2s ease;">
            ↑ North
          </button>
          <div></div>
          <button id="moveWest" style="padding: 12px; background: #4285f4; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 16px; transition: all 0.2s ease;">
            ← West
          </button>
          <button id="moveCenter" style="padding: 12px; background: #f4b400; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; transition: all 0.2s ease;">
            Center
          </button>
          <button id="moveEast" style="padding: 12px; background: #4285f4; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 16px; transition: all 0.2s ease;">
            → East
          </button>
          <div></div>
          <button id="moveSouth" style="padding: 12px; background: #4285f4; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 16px; transition: all 0.2s ease;">
            ↓ South
          </button>
          <div></div>
        </div>
      </div>
    </div>
  `;

  document.getElementById("controlPanel")!.appendChild(movementPanel);
}

function setupMovementControls(): void {
  const get = (id: string) => document.getElementById(id)!;
  const setupMoveButton = (
    id: string,
    direction: "north" | "south" | "east" | "west" | "center",
  ) => {
    const button = get(id);
    button.addEventListener("click", () => {
      if (movementManager.getCurrentMovementType() === "buttons") {
        // Add click animation
        button.style.transform = "scale(0.95)";
        setTimeout(() => {
          button.style.transform = "scale(1)";
        }, 150);

        movePlayer(direction);
      }
    });

    // Hover effects
    button.addEventListener("mouseenter", () => {
      if (movementManager.getCurrentMovementType() === "buttons") {
        button.style.filter = "brightness(1.1)";
      }
    });

    button.addEventListener("mouseleave", () => {
      button.style.filter = "brightness(1)";
      button.style.transform = "scale(1)";
    });
  };

  setupMoveButton("moveNorth", "north");
  setupMoveButton("moveSouth", "south");
  setupMoveButton("moveEast", "east");
  setupMoveButton("moveWest", "west");

  // Center button special handling
  const centerButton = get("moveCenter");
  centerButton.addEventListener("click", () => {
    if (movementManager.getCurrentMovementType() === "buttons") {
      centerButton.style.transform = "scale(0.95)";
      setTimeout(() => {
        centerButton.style.transform = "scale(1)";
      }, 150);
      movePlayer("center");
    }
  });

  // Movement toggle with enhanced feedback
  const toggleButton = get("movementToggle");
  toggleButton.addEventListener("click", toggleMovementType);

  toggleButton.addEventListener("mouseenter", () => {
    toggleButton.style.filter = "brightness(1.1)";
  });

  toggleButton.addEventListener("mouseleave", () => {
    toggleButton.style.filter = "brightness(1)";
  });

  // Recalibrate button
  const recalibrateButton = get("recalibrateButton");
  recalibrateButton.addEventListener("click", recalibrateGeolocation);

  recalibrateButton.addEventListener("mouseenter", () => {
    recalibrateButton.style.filter = "brightness(1.1)";
  });

  recalibrateButton.addEventListener("mouseleave", () => {
    recalibrateButton.style.filter = "brightness(1)";
  });

  // Listen for movement changes to update button states
  movementManager.onMovementChange((type) => {
    updateButtonStates(type);
  });
}

function updateButtonStates(movementType: string): void {
  const buttons = [
    "moveNorth",
    "moveSouth",
    "moveEast",
    "moveWest",
    "moveCenter",
  ];

  const isButtonControl = movementType === "buttons";

  buttons.forEach((buttonId) => {
    const button = document.getElementById(buttonId) as HTMLButtonElement;
    if (button) {
      if (isButtonControl) {
        button.style.opacity = "1";
        button.style.cursor = "pointer";
        button.style.background = buttonId === "moveCenter"
          ? "#f4b400"
          : "#4285f4";
        button.disabled = false;
      } else {
        button.style.opacity = "0.6";
        button.style.cursor = "not-allowed";
        button.style.background = "#cccccc";
        button.disabled = true;
      }
    }
  });
}

function toggleMovementType(): void {
  const currentType = movementManager.getCurrentMovementType();
  const newType = currentType === "buttons" ? "geolocation" : "buttons";
  const toggleButton = document.getElementById("movementToggle")!;
  toggleButton.style.transform = "scale(0.95)";

  movementManager.switchToMovementType(newType).then((success) => {
    setTimeout(() => {
      toggleButton.style.transform = "scale(1)";
    }, 150);

    if (success) {
      console.log(`Movement switched to: ${newType}`);
    }
  });
}

function recalibrateGeolocation(): void {
  movementManager.recalibrateGeolocation();

  // Visual feedback
  const recalibrateButton = document.getElementById(
    "recalibrateButton",
  )! as HTMLButtonElement;
  const originalText = recalibrateButton.textContent;
  recalibrateButton.textContent = "Recalibrating...";
  recalibrateButton.disabled = true;

  setTimeout(() => {
    recalibrateButton.textContent = originalText;
    recalibrateButton.disabled = false;
  }, 1000);
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
  playerMarker.setLatLng(gameState.player.location);

  // Smooth pan to new location
  map.setView(gameState.player.location, CONFIG.ZOOM_LEVEL, {
    animate: true,
    duration: 0.3,
    easeLinearity: 0.25,
  });

  updateCellVisibility();
  updateInteractionRangeDisplay();

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
    const movementType = movementManager.getCurrentMovementType();
    statusPanel.innerHTML = `Points: ${gameState.player.points} | ` +
      `Goal: Create a ${CONFIG.VICTORY_THRESHOLD} token | ` +
      `Range: ${CONFIG.INTERACTION_RANGE} cells | Highest: ${highestToken} | Movement: ${movementType}`;
  }
}

// =============================================
// CELL INTERACTION
// =============================================

function handleCellClick(cell: GridCell) {
  console.log(`Cell clicked: (${cell.coordinates.i}, ${cell.coordinates.j})`);
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
          <li>Toggle between button and geolocation movement</li>
          <li>With geolocation: Move around in real life to explore the map!</li>
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

async function initializeGame() {
  initializeDOM();
  map = initializeMap();

  await movementManager.initialize();

  setupMovementControls();
  addDebugControls();
  cleanupAllCells();
  updateCellVisibility();

  map.on("moveend", handleMapMove);
  updateInventoryDisplay();
  updateUI();

  setTimeout(logMemoryStats, 1000);
}

initializeGame();

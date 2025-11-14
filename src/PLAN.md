# CMPM 121 D3 Project PLAN

D3a:

1.[X] Set up different cores for easier management:

- GameState - tracks player inventory, points, victory condition
- GridCell - represents individual map cells with token data
- Token - represents collectible items with values

2.[X] Grid System Implementation:

- Create grid rendering system that covers visible map area
- Implement cell coordinate system using TILE_DEGREES (0.0001)
- Design cell visualization showing token values without clicking
- Ensure grid extends to map edges for "infinite world" illusion

3.[X] Token Spawning

- Use the luck() function to create deterministic spawning
- Implement spawn algorithm that uses cell coordinates as seed
- Ensure consistency across page loads using same seeding mechanism
- Configure initial token distribution with appropriate values

4.[X] Player Inventory System

- Create inventory display showing current held token (value and visibility)
- Pickup mechanic - click empty cell with token to collect
- Add inventory constraints - maximum one token at a time
- Update cell state when token is picked up (remove from cell)

5.[X] Token Crafting Mechanics

- Implement placement mechanic - click on cell while holding token
- Add merge detection - when placing token on cell with equal value
- Create new token with doubled value after successful merge
- Handle edge cases - empty cells, unequal values, etc

6.[X] Interaction Range & Game Logic

- Implement proximity system - only interact with cells within 3 tiles
- Add victory condition detection - track high-value tokens
- Create status panel updates for game state feedback

D3b:

7.[X] Define Core/Data Type

- Define the Coordinate System
- Create the coordinate converserion Utilities

8.[X] Set up the Dynamic Grid Management System

- Implement viewport-based cell loading - replace CONFIG.GRID_RENDER_RADIUS
- Create a cell lifecycle management

9.[X] Memoryless Cell Behavior

- Implement stateless cell system
- Mod token spawning for dynamic grid

10.[X] Movement/Scrolling

- Implement map movement detection - Set up moveend
- Add movement controls

D3c:

11.[X] Create Memento Classes

- Define CellMemento interface to capture cell state
- Create CellOriginator class to handle state saving/restoring
- Implement CellCaretaker to manage mementos storage

12.[X] Design State Serialization System

- Create serializable cell state representation
- Implement state preservation for modified cells only
- Add state restoration when cells return to view

13.[ ] Modify Cell Management for Persistence

- Update cell spawning to check for existing state
- Memento system with dynamic grid management
- Stateless behavior for unmodified cells

14.[ ] Implement Flyweight Pattern Optimization

- Separate intrinsic (coordinate) and extrinsic (token) state
- Ensure cells not visible don't consume memory if unmodified
- Maintain cell coordinate system as flyweight objects

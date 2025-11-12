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

8.[] Set up the Dynamic Grid Management System

- Implement viewport-based cell loading - replace CONFIG.GRID_RENDER_RADIUS
- Create a cell lifecycle management

9.[] Memoryless Cell Behavior

- Implement stateless cell system
- Mod token spawning for dynamic grid

10.[] Movement/Scrolling

- Implement map movement detection - Set up moveend
- Add movement controls

# Overlap Layer Feature Walkthrough

I have implemented the "Show Overlap" feature which allows you to visualize the intersection of multiple simulation layers.

## Changes
- **Backend**: Verified `/overlap` endpoint in `app/main.py`.
- **Frontend**:
    - Updated `src/store.ts` to handle overlap state and logic.
    - Implemented `calculateOverlap` action to fetch the overlap image from the backend.
    - Integrated with `LayerManager.vue` controls (Show Overlap toggle, Color, Opacity).

## Verification Steps

1.  **Run Simulations**:
    - Run at least two simulations (or import two GeoTIFF layers).
    - Ensure they have some overlapping area.

2.  **Enable Overlap**:
    - Open the "Layers" panel.
    - Toggle "Show overlap in single color".
    - **Expected**: A new layer should appear showing the intersection of the visible layers.

3.  **Adjust Controls**:
    - Change the **Color** using the color picker. The overlap layer should update to the new color.
    - Adjust the **Opacity** slider. The overlap layer transparency should change instantly.

4.  **Dynamic Updates**:
    - Toggle the visibility of one of the simulation layers (uncheck it).
    - **Expected**: The overlap layer should automatically recalculate based on the remaining visible layers.
    - Add a new layer (run another simulation).
    - **Expected**: The overlap layer should update to include the new layer.

## Notes
- The overlap calculation is performed on the backend using the resolution of the first layer.
- Opacity changes are handled on the frontend for performance, while color changes require a backend recalculation.

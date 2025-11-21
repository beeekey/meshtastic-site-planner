# Walkthrough: Meshtastic Site Planner Improvements

This document summarizes the major improvements made to the Meshtastic Site Planner application.

## 1. Performance Optimization: Migration to ImageOverlay

### Problem
The application was experiencing significant lag when rendering GeoTIFF layers using `georaster-layer-for-leaflet`, especially with multiple layers or when panning/zooming the map.

### Solution
Migrated from client-side GeoTIFF rendering to server-generated PNG images with `L.imageOverlay`:

#### Backend Changes
- **[splat.py](file:///home/bky/DEVBK/meshtastic-site-planner/app/services/splat.py)**: Modified `_create_splat_geotiff` to generate both GeoTIFF and PNG outputs
  - PNG generation uses PIL/Pillow for efficient image creation
  - Both outputs share the same transparency masking logic
  - Returns `(geotiff_bytes, png_bytes, bounds)` tuple

- **[main.py](file:///home/bky/DEVBK/meshtastic-site-planner/app/main.py)**: Updated API endpoints
  - Stores both GeoTIFF and PNG data in Redis
  - Added `/result/{task_id}/png` endpoint for PNG delivery
  - Modified `/status/{task_id}` to include bounds in response

#### Frontend Changes
- **[store.ts](file:///home/bky/DEVBK/meshtastic-site-planner/src/store.ts)**: 
  - `runSimulation`: Fetches PNG URL and bounds from status endpoint
  - `redrawSites`: Uses `L.imageOverlay` for layers with `imageUrl`, falls back to `GeoRasterLayer` for imported GeoTIFFs
  - Added bounds checking to prevent crashes with outdated backend

- **[types.ts](file:///home/bky/DEVBK/meshtastic-site-planner/src/types.ts)**: Extended `Site` interface
  - Added optional `imageUrl` and `bounds` properties
  - Made `raster` and `rawBuffer` optional for PNG-only layers

### Results
- **Dramatic performance improvement**: Map interactions (pan, zoom) are now smooth even with multiple layers
- **Backward compatibility**: Imported GeoTIFF files still work using the original rendering path
- **Reduced client-side processing**: PNG rendering is handled server-side

---

## 2. Metadata Preservation for Save/Import

### Problem
When users downloaded a layer as GeoTIFF and re-imported it, the simulation parameters (transmitter settings, receiver settings, environment parameters, etc.) were lost. The imported layer would display correctly but with default/zero values for all parameters.

### Solution
Implemented metadata embedding in GeoTIFF files using GDAL tags:

#### Backend Changes
- **[splat.py](file:///home/bky/DEVBK/meshtastic-site-planner/app/services/splat.py)**: 
  - Modified `_create_splat_geotiff` to accept optional `metadata` dictionary
  - Uses `rasterio`'s `update_tags()` to write metadata to the GeoTIFF
  - Metadata is stored in the `GDAL_METADATA` tag (tag 42112) as XML
  - In `coverage_prediction`, passes the complete `CoveragePredictionRequest` as JSON in the `MESHTASTIC_PARAMS` tag

#### Frontend Changes
- **[store.ts](file:///home/bky/DEVBK/meshtastic-site-planner/src/store.ts)**:
  - Added `geotiff` library import for reading TIFF metadata
  - Modified `importLayer` to:
    1. Parse the GeoTIFF using `fromArrayBuffer` from `geotiff` library
    2. Read the `GDAL_METADATA` tag from the file directory
    3. Parse the XML to extract the `MESHTASTIC_PARAMS` item
    4. Deserialize the JSON to restore the full `SplatParams` object
    5. Use restored params instead of defaults when available
  - Added console logging for debugging metadata reading

### Technical Details
- **Metadata Format**: The simulation parameters are serialized to JSON and embedded in the GeoTIFF's GDAL_METADATA tag
- **XML Structure**: 
  ```xml
  <GDALMetadata>
    <Item name="MESHTASTIC_PARAMS">{...json...}</Item>
  </GDALMetadata>
  ```
- **Fallback Behavior**: If metadata reading fails or no metadata is found, the import falls back to default parameters

### Results
- **Complete state preservation**: All simulation parameters are now preserved when downloading and re-importing layers
- **Non-breaking**: Old GeoTIFFs without metadata still import correctly with default values
- **Standard compliance**: Uses GDAL's standard metadata mechanism, compatible with other GIS tools

---

## 3. Debug Border Toggle

### Feature
Added optional debug borders to visualize layer bounds:

- **[store.ts](file:///home/bky/DEVBK/meshtastic-site-planner/src/store.ts)**: Added `showBorders` state property
- **[LayerManager.vue](file:///home/bky/DEVBK/meshtastic-site-planner/src/components/LayerManager.vue)**: Added toggle button in UI
- Borders are color-coded (blue for first layer, green for others)
- Helps diagnose bounds/positioning issues

---

## Verification

### Automated Tests
None currently implemented (manual testing performed).

### Manual Verification Steps

1. **Performance Testing**:
   - ✅ Run multiple simulations
   - ✅ Verify smooth map panning/zooming with multiple layers
   - ✅ Confirm PNG images load correctly

2. **Metadata Preservation Testing**:
   - ✅ Run a simulation with custom parameters
   - ✅ Download the layer as GeoTIFF
   - ✅ Import the downloaded GeoTIFF
   - ✅ Verify all parameters are restored correctly (check console logs)
   - ✅ Verify the layer displays correctly

3. **Backward Compatibility**:
   - ✅ Import old GeoTIFF files (without metadata)
   - ✅ Verify they still display correctly with default parameters

### Known Issues
None currently identified.

---

## Files Modified

### Backend
- [app/services/splat.py](file:///home/bky/DEVBK/meshtastic-site-planner/app/services/splat.py)
- [app/main.py](file:///home/bky/DEVBK/meshtastic-site-planner/app/main.py)

### Frontend
- [src/store.ts](file:///home/bky/DEVBK/meshtastic-site-planner/src/store.ts)
- [src/types.ts](file:///home/bky/DEVBK/meshtastic-site-planner/src/types.ts)
- [src/components/LayerManager.vue](file:///home/bky/DEVBK/meshtastic-site-planner/src/components/LayerManager.vue)

### Documentation
- [walkthrough.md](file:///home/bky/DEVBK/meshtastic-site-planner/walkthrough.md) (this file)

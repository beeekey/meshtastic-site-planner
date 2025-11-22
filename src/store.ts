import { defineStore } from 'pinia';
import { randanimalSync } from 'randanimal';
import L from 'leaflet';
import GeoRasterLayer from 'georaster-layer-for-leaflet';
import parseGeoraster from 'georaster';

import { type Site, type SplatParams } from './types.ts';
import { cloneObject } from './utils.ts';
import { redPinMarker } from './layers.ts';

const useStore = defineStore('store', {
  state() {
    return {
      map: undefined as undefined | L.Map,
      siteLayers: [] as any[],
      currentMarker: undefined as undefined | L.Marker,
      localSites: [] as Site[], //useLocalStorage('localSites', ),
      simulationState: 'idle',
      showBorders: false,
      splatParams: <SplatParams>{
        transmitter: {
          name: randanimalSync(),
          tx_lat: 46.8182,
          tx_lon: 8.2275,
          tx_power: 0.1,
          tx_freq: 868.0,
          tx_height: 2.0,
          tx_gain: 2.0
        },
        receiver: {
          rx_sensitivity: -130.0,
          rx_height: 1.0,
          rx_gain: 2.0,
          rx_loss: 2.0
        },
        environment: {
          radio_climate: 'continental_temperate',
          polarization: 'vertical',
          clutter_height: 1.0,
          ground_dielectric: 15.0,
          ground_conductivity: 0.005,
          atmosphere_bending: 301.0
        },
        simulation: {
          situation_fraction: 95.0,
          time_fraction: 95.0,
          simulation_extent: 30.0,
          high_resolution: false,
          clear_previous: false
        },
        display: {
          color_scale: 'plasma',
          min_dbm: -130.0,
          max_dbm: -80.0,
          overlay_transparency: 50
        },
      }
    }
  },
  actions: {
    setTxCoords(lat: number, lon: number) {
      this.splatParams.transmitter.tx_lat = lat
      this.splatParams.transmitter.tx_lon = lon
      console.log('Transmitter coordinates updated:', lat, lon)
      if (this.map) {
        this.map.setView([lat, lon], this.map.getZoom())
      }
    },
    removeSite(index: number) {
      if (!this.map) {
        return
      }
      this.localSites.splice(index, 1)
      this.redrawSites()
    },
    clearAllSites() {
      if (!this.map) return;
      this.localSites = [];
      this.redrawSites();
    },
    redrawSites() {
      if (!this.map) {
        return;
      }

      // Check if map is in a valid state (has CRS)
      if (!this.map.options.crs) {
        console.warn('Map CRS not initialized, skipping redraw');
        return;
      }

      console.log('Redrawing sites. Current localSites:', this.localSites.length);

      // Remove all previously tracked layer groups
      // Remove all previously tracked layers
      this.siteLayers.forEach(layer => {
        try {
          this.map!.removeLayer(layer);
        } catch (e) {
          console.warn('Error removing layer:', e);
        }
      });
      this.siteLayers = [];
      console.log('Removed existing tracked layers');

      // Add GeoRasterLayers back to the map
      // Add GeoRasterLayers back to the map
      this.localSites.forEach((site: Site, index: number) => {
        if (!site.visible) return;

        console.log(`Adding layer ${index} (ID: ${site.id})`);

        let layerBounds: L.LatLngBoundsExpression | undefined;

        if (site.bounds) {
          layerBounds = site.bounds;
        } else if (site.raster) {
          layerBounds = [[site.raster.ymin, site.raster.xmin], [site.raster.ymax, site.raster.xmax]];
        }

        if (!layerBounds) return;

        // DEBUG: Draw a rectangle around the bounds
        if (this.showBorders) {
          const border = L.rectangle(layerBounds, { color: index === 0 ? 'blue' : 'green', weight: 1, fill: false });
          border.addTo(this.map as L.Map);
          this.siteLayers.push(border);
        }

        // Prioritize ImageURL (PNG) for stability, with pixelated rendering for quality
        if (site.imageUrl) {
          const imageOverlay = L.imageOverlay(site.imageUrl, layerBounds, {
            opacity: site.opacity,
            interactive: false,
            className: 'pixelated-overlay' // Add CSS class for pixelated rendering
          });
          imageOverlay.addTo(this.map as L.Map);
          imageOverlay.bringToFront();
          this.siteLayers.push(imageOverlay);
        } else if (site.raster && site.raster.width && site.raster.height) {
          // Fallback to GeoRasterLayer if no PNG (e.g. imported files)
          const rasterLayer = new GeoRasterLayer({
            georaster: site.raster,
            opacity: site.opacity,
            resolution: 256,
            customDrawFunction: (args: any) => {
              const { context, x, y, width, height, values } = args;
              const r = values[0];
              const g = values[1];
              const b = values[2];
              const a = values[3];

              // If pixel is black (0,0,0), it's transparent (based on our backend masking)
              if (r === 0 && g === 0 && b === 0) return;

              // If alpha is present and 0, it's transparent
              if (typeof a !== 'undefined' && a === 0) return;

              const alpha = (typeof a !== 'undefined') ? a / 255 : 1.0;

              // We need to respect the layer opacity
              // Save current globalAlpha
              const prevAlpha = context.globalAlpha;
              context.globalAlpha = site.opacity;

              context.fillStyle = `rgba(${r},${g},${b},${alpha})`;
              context.fillRect(x, y, width, height);

              // Restore globalAlpha
              context.globalAlpha = prevAlpha;
            }
          } as any);
          console.log(`Created GeoRasterLayer for layer ${index}`);
          rasterLayer.addTo(this.map as L.Map);
          rasterLayer.bringToFront();
          this.siteLayers.push(rasterLayer);
        }

        // Render GeoJSON if available
        if (site.geojson) {
          console.log(`Rendering GeoJSON for layer ${index}`);
          const geoJsonLayer = L.geoJSON(site.geojson, {
            pointToLayer: (_feature, latlng) => {
              return L.circleMarker(latlng, {
                radius: 6,
                fillColor: "red",
                color: "#fff",
                weight: 2,
                opacity: 1,
                fillOpacity: 1
              });
            },
            onEachFeature: (feature, layer) => {
              if (feature.properties) {
                let popupContent = `<strong>${feature.properties.name || 'Node'}</strong>`;
                if (feature.properties.height) popupContent += `<br>Height: ${feature.properties.height}m`;
                if (feature.properties.power) popupContent += `<br>Power: ${feature.properties.power}dBm`;
                layer.bindPopup(popupContent);
              }
            }
          });
          geoJsonLayer.addTo(this.map as L.Map);
          geoJsonLayer.bringToFront();
          this.siteLayers.push(geoJsonLayer);
        }
      });
    },
    initMap() {
      // Guard against re-initialization
      if (this.map) {
        console.log('Map already initialized, skipping');
        return;
      }

      this.map = L.map("map", {
        center: [46.8182, 8.2275],
        zoom: 8,
        zoomControl: false,
      });
      const position: [number, number] = [this.splatParams.transmitter.tx_lat, this.splatParams.transmitter.tx_lon];
      this.map.setView(position, 10);

      L.control.zoom({ position: "bottomleft" }).addTo(this.map as L.Map);

      const cartoLight = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '© OpenStreetMap contributors © CARTO',
      });

      const streetLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
      })

      const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles © Esri — Source: Esri, USGS, NOAA',
      });

      const topoLayer = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
        attribution: 'Map data: © OpenStreetMap contributors, SRTM | OpenTopoMap',
      });

      const topPlusGrey = L.tileLayer('https://sgx.geodatenzentrum.de/wmts_topplus_open/tile/1.0.0/web_grau/default/WEBMERCATOR/{z}/{y}/{x}.png', {
        maxZoom: 18,
        attribution: 'Map data: &copy; <a href="http://www.govdata.de/dl-de/by-2-0">dl-de/by-2-0</a>'
      });

      topPlusGrey.addTo(this.map as L.Map);

      // Base Layers
      const baseLayers = {
        "OSM": streetLayer,
        "Carto Light": cartoLight,
        "Satellite": satelliteLayer,
        "Topo Map": topoLayer,
        "TopPlus Grey": topPlusGrey
      };



      L.control.layers(baseLayers, {}, {
        position: "bottomleft",
      }).addTo(this.map as L.Map);

      this.map.on("baselayerchange", () => {
        this.redrawSites(); // Re-apply the GeoRasterLayer on top
      });

      this.map.on("click", (e: L.LeafletMouseEvent) => {
        const { lat, lng } = e.latlng;
        this.setTxCoords(lat, lng);
        if (this.currentMarker) {
          this.currentMarker.setLatLng([lat, lng]);
        }
      });

      this.currentMarker = L.marker(position, { icon: redPinMarker }).addTo(this.map as L.Map).bindPopup("Transmitter site"); // Variable to hold the current marker
      this.redrawSites();
    },
    async runSimulation() {
      console.log('Simulation running...')
      try {
        // Collect input values
        const payload = {
          // Transmitter parameters
          lat: this.splatParams.transmitter.tx_lat,
          lon: this.splatParams.transmitter.tx_lon,
          tx_height: this.splatParams.transmitter.tx_height,
          tx_power: 10 * Math.log10(this.splatParams.transmitter.tx_power) + 30,
          tx_gain: this.splatParams.transmitter.tx_gain,
          frequency_mhz: this.splatParams.transmitter.tx_freq,

          // Receiver parameters
          rx_height: this.splatParams.receiver.rx_height,
          rx_gain: this.splatParams.receiver.rx_gain,
          signal_threshold: this.splatParams.receiver.rx_sensitivity,
          system_loss: this.splatParams.receiver.rx_loss,

          // Environment parameters
          clutter_height: this.splatParams.environment.clutter_height,
          ground_dielectric: this.splatParams.environment.ground_dielectric,
          ground_conductivity: this.splatParams.environment.ground_conductivity,
          atmosphere_bending: this.splatParams.environment.atmosphere_bending,
          radio_climate: this.splatParams.environment.radio_climate,
          polarization: this.splatParams.environment.polarization,

          // Simulation parameters
          radius: this.splatParams.simulation.simulation_extent * 1000,
          situation_fraction: this.splatParams.simulation.situation_fraction,
          time_fraction: this.splatParams.simulation.time_fraction,
          high_resolution: this.splatParams.simulation.high_resolution,

          // Display parameters
          colormap: this.splatParams.display.color_scale,
          min_dbm: this.splatParams.display.min_dbm,
          max_dbm: this.splatParams.display.max_dbm,
        };

        if (this.splatParams.simulation.clear_previous) {
          this.localSites = [];
          this.redrawSites();
        }

        // Force lat/lon to be numbers
        payload.lat = Number(payload.lat);
        payload.lon = Number(payload.lon);

        console.log("Payload:", payload);
        this.simulationState = 'running';

        // Send the request to the backend's /predict endpoint
        const predictResponse = await fetch("/predict", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });

        if (!predictResponse.ok) {
          this.simulationState = 'failed';
          const errorDetails = await predictResponse.text();
          throw new Error(`Failed to start prediction: ${errorDetails}`);
        }

        const predictData = await predictResponse.json();
        const taskId = predictData.task_id;

        console.log(`Prediction started with task ID: ${taskId}`);

        // Poll for task status and result
        const pollInterval = 1000; // 1 seconds
        const pollStatus = async () => {
          const statusResponse = await fetch(
            `/status/${taskId}`,
          );
          if (!statusResponse.ok) {
            throw new Error("Failed to fetch task status.");
          }

          const statusData = await statusResponse.json();
          console.log("Task status:", statusData);

          if (statusData.status === "completed") {
            this.simulationState = 'completed';
            console.log("Simulation completed! Adding result to the map...");

            console.log("Simulation completed! Adding result to the map...");

            // Get bounds from status data
            if (!statusData.bounds) {
              console.warn("Backend did not return bounds. Falling back to legacy GeoTIFF fetch or failing.");
              // Fallback to legacy behavior or throw error. 
              // Since we want to enforce the new way, let's throw a descriptive error for now, 
              // or we could just fetch the result as before if we wanted to support mixed versions.
              // But rebuilding is the right fix.
              throw new Error("Backend outdated: Missing bounds in response. Please rebuild docker container.");
            }
            const bounds = statusData.bounds; // [north, south, east, west]
            const leafletBounds: [[number, number], [number, number]] = [
              [bounds[1], bounds[3]],
              [bounds[0], bounds[2]]
            ];

            console.log('=== SIMULATION COMPLETED BOUNDS DEBUG ===');
            console.log('Backend bounds [north, south, east, west]:', bounds);
            console.log('Final Leaflet bounds [[south, west], [north, east]]:', leafletBounds);
            console.log('Final Leaflet bounds (High Precision):', leafletBounds.map(pair => pair.map(c => c.toFixed(10))));
            console.log('=========================================');

            // Get address
            const addressName = await this.reverseGeocode(this.splatParams.transmitter.tx_lat, this.splatParams.transmitter.tx_lon);
            this.splatParams.transmitter.name = `${this.splatParams.transmitter.tx_height}m AGL - ${addressName}`;

            // Fetch the GeoTIFF buffer immediately to store it
            let geoTiffBuffer: ArrayBuffer | undefined;
            let geojsonData: any | undefined;
            try {
              const response = await fetch(`/result/${taskId}?_t=${Date.now()}`);
              if (response.ok) {
                geoTiffBuffer = await response.arrayBuffer();
                console.log(`Fetched GeoTIFF buffer: ${geoTiffBuffer.byteLength} bytes`);
              } else {
                console.error("Failed to fetch GeoTIFF for storage");
              }

              // Fetch GeoJSON
              const geojsonResponse = await fetch(`/result/${taskId}/geojson?_t=${Date.now()}`);
              if (geojsonResponse.ok) {
                geojsonData = await geojsonResponse.json();
              }
            } catch (e) {
              console.error("Error fetching result data:", e);
            }

            // Parse GeoTIFF for consistent rendering with imported layers
            let geoRaster: any = undefined;
            if (geoTiffBuffer) {
              try {
                console.log(`Parsing GeoTIFF for task ${taskId}, size: ${geoTiffBuffer.byteLength}`);
                // Clone buffer to prevent detachment issues
                const bufferCopy = geoTiffBuffer.slice(0);
                geoRaster = await parseGeoraster(bufferCopy);
                console.log("Parsed GeoTIFF for display:", geoRaster);
              } catch (e) {
                console.error("Failed to parse GeoTIFF:", e);
              }
            } else {
              console.error("geoTiffBuffer is undefined or empty!");
            }

            this.localSites.push({
              id: taskId,
              params: cloneObject(this.splatParams),
              taskId,
              visible: true,
              opacity: this.splatParams.display.overlay_transparency / 100,
              imageUrl: `/result/${taskId}/png`, // Fallback if raster fails
              bounds: leafletBounds,
              rawBuffer: geoTiffBuffer,
              raster: geoRaster,
              geojson: geojsonData
            });
            this.currentMarker!.removeFrom(this.map as L.Map);
            this.redrawSites();
          }
          else if (statusData.status === "failed") {
            this.simulationState = 'failed';
          } else {
            setTimeout(pollStatus, pollInterval); // Retry after interval
          }
        };

        pollStatus(); // Start polling
      } catch (error) {
        console.error("Error:", error);
        alert(`Simulation failed: ${error}`);
      }
    },
    async reverseGeocode(lat: number, lon: number): Promise<string> {
      try {
        // Respect Nominatim usage policy: 1 request per second max.
        // Since this is triggered by user action (simulation/import), it's likely fine,
        // but good to be aware.
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}`, {
          headers: {
            'User-Agent': 'MeshtasticSitePlanner/1.0'
          }
        });
        if (!response.ok) {
          throw new Error('Geocoding failed');
        }
        const data = await response.json();
        return data.display_name || data.name || 'Unknown Location';
      } catch (e) {
        console.error("Reverse geocoding error:", e);
        return `Site ${lat.toFixed(4)}, ${lon.toFixed(4)}`;
      }
    },
    async importLayer(file: File, metadata?: any) {
      try {
        const arrayBuffer = await file.arrayBuffer();
        console.log(`Importing layer: ${file.name}, size: ${arrayBuffer.byteLength}`);
        // Clone the buffer for storage because parseGeoraster might detach it
        const bufferForStorage = arrayBuffer.slice(0);
        const geoRaster = await parseGeoraster(arrayBuffer);
        console.log('Parsed GeoRaster:', {
          width: geoRaster.width,
          height: geoRaster.height,
          xmin: geoRaster.xmin,
          ymin: geoRaster.ymin,
          xmax: geoRaster.xmax,
          ymax: geoRaster.ymax,
          numberOfRasters: geoRaster.numberOfRasters
        });

        // Calculate center for geocoding
        const centerLat = (geoRaster.ymin + geoRaster.ymax) / 2;
        const centerLon = (geoRaster.xmin + geoRaster.xmax) / 2;

        // Use filename as name, removing extension
        const name = file.name.replace(/\.[^/.]+$/, "");

        // Use provided metadata if available, otherwise try to read from TIFF
        let importedParams: SplatParams | null = null;
        let importedBounds: [[number, number], [number, number]] | null = null;

        // Define default params for fallback
        const defaultParams: SplatParams = {
          transmitter: {
            name: name,
            tx_lat: centerLat,
            tx_lon: centerLon,
            tx_power: 0.1,
            tx_freq: 868.0,
            tx_height: 2.0,
            tx_gain: 2.0
          },
          receiver: {
            rx_sensitivity: -130.0,
            rx_height: 1.0,
            rx_gain: 2.0,
            rx_loss: 2.0
          },
          environment: {
            radio_climate: 'continental_temperate',
            polarization: 'vertical',
            clutter_height: 1.0,
            ground_dielectric: 15.0,
            ground_conductivity: 0.005,
            atmosphere_bending: 301.0
          },
          simulation: {
            situation_fraction: 95.0,
            time_fraction: 95.0,
            simulation_extent: 30.0,
            high_resolution: false,
            clear_previous: false,

          },
          display: {
            color_scale: 'plasma',
            min_dbm: -130.0,
            max_dbm: -80.0,
            overlay_transparency: 50
          }
        };

        if (metadata) {
          console.log("Using provided metadata:", metadata);
          importedParams = metadata as SplatParams;
        } else {
          // Try to read metadata from TIFF ImageDescription tag
          // Use the cloned buffer because parseGeoraster detaches the original
          try {
            const exifr = await import('exifr');
            const tags = await exifr.parse(bufferForStorage, { tiff: true });
            console.log("EXIFR tags:", tags);

            let metadataJson: string | null = null;

            // First try ImageDescription
            if (tags && tags.ImageDescription) {
              console.log("Found ImageDescription in TIFF:", tags.ImageDescription);
              metadataJson = tags.ImageDescription;
            }
            // If not found, try GDALMetadata (rasterio stores it here)
            else if (tags && tags.GDALMetadata) {
              console.log("Found GDALMetadata in TIFF, parsing XML...");
              try {
                const parser = new DOMParser();
                const xmlDoc = parser.parseFromString(tags.GDALMetadata, "text/xml");
                const items = xmlDoc.getElementsByTagName("Item");
                for (let i = 0; i < items.length; i++) {
                  if (items[i].getAttribute("name") === "ImageDescription") {
                    metadataJson = items[i].textContent;
                    console.log("Extracted metadata from GDALMetadata (via DOMParser):", metadataJson);
                    break;
                  }
                }
              } catch (e) {
                console.warn("Failed to parse GDALMetadata XML:", e);
                // Fallback to regex if DOMParser fails or not available
                const xmlMatch = tags.GDALMetadata.match(/<Item name="ImageDescription">([^<]+)<\/Item>/);
                if (xmlMatch && xmlMatch[1]) {
                  metadataJson = xmlMatch[1]
                    .replace(/&quot;/g, '"')
                    .replace(/&amp;/g, '&')
                    .replace(/&lt;/g, '<')
                    .replace(/&gt;/g, '>');
                }
              }
            }

            if (metadataJson) {
              // The JSON might still be HTML-escaped (e.g. &quot;) even after DOMParser if it was double-escaped
              // So we try to unescape it once more before parsing
              const unescapedJson = metadataJson
                .replace(/&quot;/g, '"')
                .replace(/&amp;/g, '&')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>');

              let metadataObj: any = null;

              try {
                metadataObj = JSON.parse(unescapedJson);
                console.log("Parsed metadata object:", metadataObj);
              } catch (e) {
                console.error("JSON parse error on unescaped metadata:", e);
                // Fallback: try parsing the original just in case
                try {
                  metadataObj = JSON.parse(metadataJson);
                  console.log("Parsed metadata object (from original):", metadataObj);
                } catch (e2) {
                  console.error("JSON parse error on original metadata:", e2);
                }
              }

              if (metadataObj) {
                if (metadataObj.MESHTASTIC_PARAMS) {
                  // MESHTASTIC_PARAMS might be a JSON string itself
                  if (typeof metadataObj.MESHTASTIC_PARAMS === 'string') {
                    try {
                      importedParams = JSON.parse(metadataObj.MESHTASTIC_PARAMS);
                    } catch (e) {
                      console.warn("Failed to parse MESHTASTIC_PARAMS string:", e);
                    }
                  } else {
                    importedParams = metadataObj.MESHTASTIC_PARAMS;
                  }
                  console.log("Restored params from TIFF metadata:", importedParams);
                }
                // Read bounds from metadata if available
                if (metadataObj.BOUNDS) {
                  // Ensure bounds are parsed as numbers in order [north, south, east, west]
                  const rawBounds = metadataObj.BOUNDS as any[];
                  const [north, south, east, west] = rawBounds.map((v: any) => typeof v === 'string' ? parseFloat(v) : Number(v));
                  if ([north, south, east, west].every(v => Number.isFinite(v))) {
                    importedBounds = [
                      [south, west],  // [south, west]
                      [north, east]   // [north, east]
                    ];
                    console.log("Restored bounds from TIFF metadata (High Precision):",
                      importedBounds.map(pair => pair.map(c => c.toFixed(10)))
                    );
                    console.log("Restored bounds from TIFF metadata (Raw):", importedBounds);
                  } else {
                    console.warn("BOUNDS metadata present but could not be parsed into finite numbers:", rawBounds);
                  }
                } else {
                  console.warn("No BOUNDS found in metadata");
                }
              }
            } else {
              console.warn("No ImageDescription or GDALMetadata tag found in TIFF");
            }
          } catch (e) {
            console.warn("Failed to read metadata from TIFF:", e);
          }
        }

        // Use bounds from metadata if available, otherwise fall back to georaster
        const leafletBounds: [[number, number], [number, number]] = importedBounds || [
          [geoRaster.ymin, geoRaster.xmin],  // [south, west]
          [geoRaster.ymax, geoRaster.xmax]   // [north, east]
        ];

        // Align GeoRaster metadata with the high-precision bounds to prevent Y-axis drift on re-import
        if (importedBounds) {
          console.log('Overwriting GeoRaster bounds with metadata values to fix shift...');
          const south = importedBounds[0][0];
          const west = importedBounds[0][1];
          const north = importedBounds[1][0];
          const east = importedBounds[1][1];

          geoRaster.xmin = west;
          geoRaster.ymin = south;
          geoRaster.xmax = east;
          geoRaster.ymax = north;

          geoRaster.pixelHeight = (north - south) / geoRaster.height;
          geoRaster.pixelWidth = (east - west) / geoRaster.width;
          console.log('New GeoRaster resolution:', {
            pixelHeight: geoRaster.pixelHeight,
            pixelWidth: geoRaster.pixelWidth
          });
        }

        console.log('=== IMPORTED LAYER BOUNDS DEBUG ===');
        console.log('GeoRaster bounds:', {
          ymin: geoRaster.ymin,
          ymax: geoRaster.ymax,
          xmin: geoRaster.xmin,
          xmax: geoRaster.xmax
        });
        console.log('Metadata bounds (if present):', importedBounds);
        console.log('Final Leaflet bounds [[south, west], [north, east]]:', leafletBounds);
        console.log('Final Leaflet bounds (High Precision):', leafletBounds.map(pair => pair.map(c => c.toFixed(10))));
        console.log('Using bounds from:', importedBounds ? 'METADATA' : 'GEORASTER');
        console.log('===================================');

        // Map flat imported params to nested structure if needed
        let finalParams = defaultParams;
        if (importedParams) {
          // Check if importedParams is already nested or flat
          if (importedParams.transmitter) {
            finalParams = {
              ...defaultParams,
              ...importedParams,
              transmitter: {
                ...defaultParams.transmitter,
                ...importedParams.transmitter,
                name: name // Ensure name is set
              }
            };
          } else {
            // It's flat (from older simulations or current backend format)
            // Map flat keys to nested structure
            const flatParams = importedParams as any;
            finalParams = {
              ...defaultParams,
              transmitter: {
                ...defaultParams.transmitter,
                name: name,
                tx_lat: flatParams.lat || defaultParams.transmitter.tx_lat,
                tx_lon: flatParams.lon || defaultParams.transmitter.tx_lon,
                tx_height: flatParams.tx_height || defaultParams.transmitter.tx_height,
                tx_power: flatParams.tx_power || defaultParams.transmitter.tx_power,
                tx_gain: flatParams.tx_gain || defaultParams.transmitter.tx_gain,
                tx_freq: flatParams.frequency_mhz || defaultParams.transmitter.tx_freq,
              },
              receiver: {
                ...defaultParams.receiver,
                rx_height: flatParams.rx_height || defaultParams.receiver.rx_height,
                rx_gain: flatParams.rx_gain || defaultParams.receiver.rx_gain,
                rx_sensitivity: flatParams.signal_threshold || defaultParams.receiver.rx_sensitivity,
              },
              environment: {
                ...defaultParams.environment,
                clutter_height: flatParams.clutter_height || defaultParams.environment.clutter_height,
                ground_dielectric: flatParams.ground_dielectric || defaultParams.environment.ground_dielectric,
                ground_conductivity: flatParams.ground_conductivity || defaultParams.environment.ground_conductivity,
                atmosphere_bending: flatParams.atmosphere_bending || defaultParams.environment.atmosphere_bending,
                radio_climate: flatParams.radio_climate || defaultParams.environment.radio_climate,
              },
              simulation: {
                ...defaultParams.simulation,
                simulation_extent: flatParams.radius || defaultParams.simulation.simulation_extent,
                high_resolution: flatParams.high_resolution || defaultParams.simulation.high_resolution,
              },
              display: {
                ...defaultParams.display,
                max_dbm: flatParams.max_dbm || (defaultParams.display as any).max_dbm || -80,
                min_dbm: flatParams.min_dbm || (defaultParams.display as any).min_dbm || -130,
              }
            };
          }
        }

        // Reconstruct GeoJSON for the transmitter
        let geojsonData: any = undefined;
        if (finalParams && finalParams.transmitter) {
          geojsonData = {
            "type": "FeatureCollection",
            "features": [
              {
                "type": "Feature",
                "geometry": {
                  "type": "Point",
                  "coordinates": [finalParams.transmitter.tx_lon, finalParams.transmitter.tx_lat]
                },
                "properties": {
                  "name": finalParams.transmitter.name || "Transmitter",
                  "type": "transmitter",
                  "height": finalParams.transmitter.tx_height,
                  "power": finalParams.transmitter.tx_power,
                  "gain": finalParams.transmitter.tx_gain
                }
              }
            ]
          };
        }

        const buildPngDataUrl = (raster: any): string | null => {
          try {
            if (!raster.values || raster.values.length < 3) return null;
            const { width, height, values } = raster;
            const r = values[0];
            const g = values[1];
            const b = values[2];
            const a = values[3];

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) return null;

            const imageData = ctx.createImageData(width, height);
            let ptr = 0;
            for (let y = 0; y < height; y++) {
              for (let x = 0; x < width; x++) {
                const base = ptr * 4;
                imageData.data[base] = r[y][x];
                imageData.data[base + 1] = g[y][x];
                imageData.data[base + 2] = b[y][x];
                imageData.data[base + 3] = a ? a[y][x] : 255;
                ptr++;
              }
            }
            ctx.putImageData(imageData, 0, 0);
            return canvas.toDataURL('image/png');
          } catch (err) {
            console.warn('Failed to build PNG data URL from GeoTIFF:', err);
            return null;
          }
        };

        const imageUrl = buildPngDataUrl(geoRaster);
        const opacityFromParams = (finalParams.display?.overlay_transparency ?? 50) / 100;

        const siteId = (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
          ? crypto.randomUUID()
          : `import-${Date.now()}-${Math.random()}`;

        this.localSites.push({
          id: siteId,
          taskId: (metadata as any)?.taskId || siteId,
          raster: geoRaster,
          bounds: leafletBounds,
          visible: true,
          params: finalParams,
          imageUrl: imageUrl || undefined,
          opacity: opacityFromParams,
          rawBuffer: bufferForStorage,
          geojson: geojsonData
        } as any);

        this.redrawSites();
      } catch (error) {
        console.error("Failed to import layer:", error);
        alert("Failed to import layer. Please ensure it is a valid GeoTIFF.");
      }
    },
    updateLayer(index: number, changes: Partial<Site>) {
      if (this.localSites[index]) {
        Object.assign(this.localSites[index], changes);
        this.redrawSites();
      }
    }
  }
});

export { useStore }

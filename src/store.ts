import { defineStore } from 'pinia';
// import { useLocalStorage } from '@vueuse/core';
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
      currentMarker: undefined as undefined | L.Marker,
      localSites: [] as Site[], //useLocalStorage('localSites', ),
      simulationState: 'idle',
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
          high_resolution: false
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
      this.map.eachLayer((layer: L.Layer) => {
        if (layer instanceof GeoRasterLayer) {
          this.map!.removeLayer(layer);
        }
      });
      this.redrawSites()
    },
    redrawSites() {
      if (!this.map) {
        return;
      }

      console.log('Redrawing sites. Current localSites:', this.localSites.length);

      // Remove existing GeoRasterLayers
      let removedCount = 0;
      this.map.eachLayer((layer: L.Layer) => {
        if (layer instanceof GeoRasterLayer) {
          this.map!.removeLayer(layer);
          removedCount++;
        }
      });
      console.log(`Removed ${removedCount} existing GeoRasterLayers`);

      // Add GeoRasterLayers back to the map
      this.localSites.forEach((site: Site, index: number) => {
        if (!site.visible) return;

        console.log(`Adding layer ${index} with bounds:`, site.raster.xmin, site.raster.ymin, site.raster.xmax, site.raster.ymax);

        // DEBUG: Draw a rectangle around the bounds
        const bounds = [[site.raster.ymin, site.raster.xmin], [site.raster.ymax, site.raster.xmax]];
        L.rectangle(bounds as L.LatLngBoundsExpression, { color: index === 0 ? 'blue' : 'green', weight: 1, fill: false }).addTo(this.map as L.Map);

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
        rasterLayer.addTo(this.map as L.Map);
        rasterLayer.bringToFront();
      });
    },
    initMap() {
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

      streetLayer.addTo(this.map as L.Map);

      // Base Layers
      const baseLayers = {
        "OSM": streetLayer,
        "Carto Light": cartoLight,
        "Satellite": satelliteLayer,
        "Topo Map": topoLayer
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

            // Fetch the GeoTIFF data
            const resultResponse = await fetch(
              `/result/${taskId}`,
            );
            if (!resultResponse.ok) {
              throw new Error("Failed to fetch simulation result.");
            }
            else {
              const arrayBuffer = await resultResponse.arrayBuffer();
              // Clone the buffer for storage because parseGeoraster might detach it
              const bufferForStorage = arrayBuffer.slice(0);
              const geoRaster = await parseGeoraster(arrayBuffer);

              // Get address
              const addressName = await this.reverseGeocode(this.splatParams.transmitter.tx_lat, this.splatParams.transmitter.tx_lon);
              this.splatParams.transmitter.name = `${this.splatParams.transmitter.tx_height}m AGL - ${addressName}`;

              console.log('Adding layer with raster data:', {
                taskId,
                width: geoRaster.width,
                height: geoRaster.height,
                bounds: JSON.stringify([geoRaster.xmin, geoRaster.ymin, geoRaster.xmax, geoRaster.ymax]),
                bufferSize: bufferForStorage.byteLength
              });

              this.localSites.push({
                params: cloneObject(this.splatParams),
                taskId,
                raster: geoRaster,
                visible: true,
                opacity: this.splatParams.display.overlay_transparency / 100,
                rawBuffer: bufferForStorage
              });
              this.currentMarker!.removeFrom(this.map as L.Map);
              // Prepare next random name just in case, though we overwrite it on next run usually
              // this.splatParams.transmitter.name = await randanimalSync(); 
              this.redrawSites();
            }
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
    async importLayer(file: File) {
      try {
        const arrayBuffer = await file.arrayBuffer();
        // Clone the buffer for storage because parseGeoraster might detach it
        const bufferForStorage = arrayBuffer.slice(0);
        const geoRaster = await parseGeoraster(arrayBuffer);

        // Calculate center for geocoding
        const centerLat = (geoRaster.ymin + geoRaster.ymax) / 2;
        const centerLon = (geoRaster.xmin + geoRaster.xmax) / 2;

        // Use filename as name, removing extension
        const name = file.name.replace(/\.[^/.]+$/, "");

        // Create a default SplatParams structure for the imported layer
        // We might not have all details, so we fill with defaults or extract what we can if metadata existed
        const defaultParams: SplatParams = {
          transmitter: {
            name: name,
            tx_lat: centerLat,
            tx_lon: centerLon,
            tx_power: 0, tx_freq: 0, tx_height: 0, tx_gain: 0
          },
          receiver: { rx_sensitivity: 0, rx_height: 0, rx_gain: 0, rx_loss: 0 },
          environment: { radio_climate: '', polarization: '', clutter_height: 0, ground_dielectric: 0, ground_conductivity: 0, atmosphere_bending: 0 },
          simulation: { situation_fraction: 0, time_fraction: 0, simulation_extent: 0, high_resolution: false },
          display: { color_scale: 'plasma', min_dbm: -130, max_dbm: -30, overlay_transparency: 50 }
        };

        this.localSites.push({
          params: defaultParams,
          taskId: `imported-${Date.now()}`,
          raster: geoRaster,
          visible: true,
          opacity: 0.7,
          rawBuffer: bufferForStorage
        });

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
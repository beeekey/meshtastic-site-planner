<template>
  <div>
    <div v-if="store.showSingleColorOverlap && store.overlapLoading" class="d-flex justify-content-center align-items-center my-3">
      <div class="spinner-border text-success" role="status">
        <span class="visually-hidden">Calculating overlap...</span>
      </div>
      <span class="ms-2">Calculating overlap layer...</span>
    </div>
    <div>
      <div class="d-flex justify-content-between align-items-center mb-3">
        <h6 class="m-0">Layers</h6>
        <div class="btn-group btn-group-sm">
          <button class="btn btn-outline-danger" @click="store.clearAllSites()" v-if="store.localSites.length > 0" title="Clear All Layers">
            Clear All
          </button>
          <label for="import-layer" class="btn btn-sm btn-outline-light">
            <i class="bi bi-upload"></i> Import Layer
          </label>
          <input type="file" id="import-layer" accept=".tif,.tiff" @change="handleImport" style="display: none;">
          <label for="import-mountain-geojson" class="btn btn-sm btn-outline-warning" title="Import mountain GeoJSON">
            ⛰️ Mountains
          </label>
          <input type="file" id="import-mountain-geojson" accept=".geojson,application/geo+json,application/json" @change="handleMountainGeojsonImport" style="display: none;">
          <label for="import-nodes-geojson" class="btn btn-sm btn-outline-info" title="Import nodes GeoJSON">
            🔵 Nodes
          </label>
          <input type="file" id="import-nodes-geojson" accept=".geojson,application/geo+json,application/json" @change="handleNodesGeojsonImport" style="display: none;">
        </div>
      </div>

      <div class="form-check form-switch mb-2">
        <input
          class="form-check-input"
          type="checkbox"
          id="overlap-toggle"
          :checked="store.showSingleColorOverlap"
          @change="toggleOverlap($event)"
        >
        <label class="form-check-label" for="overlap-toggle">
          Show overlap in single color
        </label>
        <div v-if="store.showSingleColorOverlap" class="mt-2">
          <div class="d-flex gap-3 align-items-center mb-2">
            <label class="form-label mb-0" for="overlap-color">Color</label>
            <input type="color" id="overlap-color" v-model="overlapColor" @input="updateOverlapColor" style="width: 2rem; height: 2rem; border: none; background: none;">
            <label class="form-label mb-0" for="overlap-opacity">Opacity</label>
            <input type="range" id="overlap-opacity" min="0" max="1" step="0.05" v-model.number="overlapOpacity" @input="updateOverlapOpacity" style="width: 100px;">
            <span class="ms-2">{{ Math.round(overlapOpacity * 100) }}%</span>
          </div>
          <div class="d-flex gap-3 align-items-center">
               <label class="form-label mb-0 me-2">Mode:</label>
               <div class="form-check form-check-inline">
                  <input class="form-check-input" type="radio" name="overlapMode" id="mode-any" value="any" :checked="store.overlapMode === 'any'" @change="store.setOverlapMode('any')">
                  <label class="form-check-label" for="mode-any">Any (>=2)</label>
               </div>
               <div class="form-check form-check-inline">
                  <input class="form-check-input" type="radio" name="overlapMode" id="mode-all" value="all" :checked="store.overlapMode === 'all'" @change="store.setOverlapMode('all')">
                  <label class="form-check-label" for="mode-all">All</label>
               </div>
          </div>
        </div>
      </div>

      <ul class="list-group">
        <li class="list-group-item bg-dark text-white border-secondary" v-for="(site, index) in store.localSites" :key="site.id">
          <div class="d-flex justify-content-between align-items-center mb-2">
            <div class="form-check form-switch">
              <input 
                class="form-check-input" 
                type="checkbox" 
                :id="'visible-' + index" 
                :checked="site.visible" 
                @change="toggleVisibility(index, $event)"
              >
              <label class="form-check-label" :for="'visible-' + index" style="max-width: 150px; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;" :title="site.params.transmitter.name">
                {{ site.params.transmitter.name }}
              </label>
            </div>
            <div class="btn-group btn-group-sm">
              <button class="btn btn-outline-secondary" @click="downloadLayer(index)" title="Download GeoTIFF">
                ⬇
              </button>
              <button type="button" @click="store.removeSite(index)" class="btn btn-outline-danger" aria-label="Close">
                ✕
              </button>
            </div>
          </div>
          
          <div class="d-flex align-items-center gap-2">
            <small>Opacity</small>
            <input 
              type="range" 
              class="form-range" 
              min="0" 
              max="1" 
              step="0.05" 
              :value="site.opacity" 
              @input="updateOpacity(index, $event)"
            >
          </div>
        </li>
        <li v-if="store.localSites.length === 0" class="list-group-item bg-dark text-white-50 border-secondary text-center">
          <small>No layers available</small>
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
const toggleOverlap = (event: Event) => {
  const target = event.target as HTMLInputElement;
  store.setShowSingleColorOverlap(target.checked);
};
import { useStore } from '../store.ts';
import { saveAs } from 'file-saver';

const store = useStore();

const overlapColor = ref(store.overlapColor);
const overlapOpacity = ref(store.overlapOpacity);

const updateOverlapColor = () => {
  store.setOverlapColor(overlapColor.value);
};
const updateOverlapOpacity = () => {
  store.setOverlapOpacity(overlapOpacity.value);
};

watch(() => store.overlapColor, (val) => { overlapColor.value = val; });
watch(() => store.overlapOpacity, (val) => { overlapOpacity.value = val; });

const toggleVisibility = (index: number, event: Event) => {
  const target = event.target as HTMLInputElement;
  store.updateLayer(index, { visible: target.checked });
};

const updateOpacity = (index: number, event: Event) => {
  const target = event.target as HTMLInputElement;
  store.updateLayer(index, { opacity: parseFloat(target.value) });
};

const downloadLayer = async (index: number) => {
  const site = store.localSites[index];

  if (!site) {
    alert("Layer not found.");
    return;
  }
  
  let buffer = site.rawBuffer;
  if (!buffer && site.taskId) {
    // If rawBuffer is missing (e.g. PNG mode), fetch it from the server
    try {
        const response = await fetch(`/result/${site.taskId}`);
        if (!response.ok) throw new Error("Failed to fetch GeoTIFF");
        buffer = await response.arrayBuffer();
    } catch (e) {
        console.error("Error downloading layer:", e);
        alert("Failed to download layer.");
        return;
    }
  }

  if (!buffer) {
      alert("No raw data available for this layer and failed to fetch.");
      return;
  }

  console.log(`Downloading layer ${index}, buffer size: ${buffer.byteLength}`);

  // Download the GeoTIFF
  const blob = new Blob([buffer], { type: 'image/tiff' });
  const filename = `${site.params.transmitter.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.tif`;
  saveAs(blob, filename);
};

const handleImport = (event: Event) => {
  const target = event.target as HTMLInputElement;
  if (target.files && target.files.length > 0) {
    const file = target.files[0];
    if (!file.name.endsWith('.tif') && !file.name.endsWith('.tiff')) {
      alert('Please select a GeoTIFF file (.tif or .tiff)');
      return;
    }

    // Metadata is now embedded in the TIFF file, no need for separate JSON
    store.importLayer(file);
    target.value = ''; // Reset input
  }
};

const handleMountainGeojsonImport = (event: Event) => {
  const target = event.target as HTMLInputElement;
  if (target.files && target.files.length > 0) {
    const file = target.files[0];
    const name = file.name.toLowerCase();
    if (!name.endsWith('.geojson') && !name.endsWith('.json')) {
      alert('Please select a GeoJSON file (.geojson or .json)');
      return;
    }
    store.importMountainGeojson(file);
    target.value = '';
  }
};

const handleNodesGeojsonImport = (event: Event) => {
  const target = event.target as HTMLInputElement;
  if (target.files && target.files.length > 0) {
    const file = target.files[0];
    const name = file.name.toLowerCase();
    if (!name.endsWith('.geojson') && !name.endsWith('.json')) {
      alert('Please select a GeoJSON file (.geojson or .json)');
      return;
    }
    store.importNodesGeojson(file);
    target.value = '';
  }
};
</script>

<style scoped>
.form-range {
  height: 1rem;
}
</style>

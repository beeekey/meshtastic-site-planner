<template>
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
</template>

<script setup lang="ts">
import { useStore } from '../store.ts';
import { saveAs } from 'file-saver';

const store = useStore();

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
</script>

<style scoped>
.form-range {
  height: 1rem;
}
</style>

<template>
  <div>
    <div class="d-flex justify-content-between align-items-center mb-3">
      <h6 class="m-0">Layers</h6>
      <label class="btn btn-sm btn-outline-light">
        Import Layer
        <input type="file" accept=".tif,.tiff" @change="handleImport" hidden />
      </label>
    </div>

    <ul class="list-group">
      <li class="list-group-item bg-dark text-white border-secondary" v-for="(site, index) in store.localSites" :key="site.taskId">
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
import { toRaw } from 'vue';
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

const downloadLayer = (index: number) => {
  const site = store.localSites[index];
  if (site && site.rawBuffer) {
    const buffer = toRaw(site.rawBuffer);
    const blob = new Blob([buffer], { type: 'image/tiff' });
    const filename = `${site.params.transmitter.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.tif`;
    saveAs(blob, filename);
  } else {
    alert("No raw data available for this layer.");
  }
};

const handleImport = (event: Event) => {
  const target = event.target as HTMLInputElement;
  if (target.files && target.files.length > 0) {
    store.importLayer(target.files[0]);
    target.value = ''; // Reset input
  }
};
</script>

<style scoped>
.form-range {
  height: 1rem;
}
</style>

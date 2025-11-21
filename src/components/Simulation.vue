<template>
  <form novalidate>
        <div class="row g-2">
            <div class="col-6">
                <label for="situation_fraction" class="form-label">Situation Fraction (%)</label>
                <input v-model="simulation.situation_fraction" type="number" class="form-control form-control-sm" id="situation_fraction" required min="1" max="100" step="0.1" />
                <div class="invalid-feedback">Percentage must be between 1 and 100 (default: 50).</div>
            </div>
            <div class="col-6">
                <label for="time_fraction" class="form-label">Time Fraction (%)</label>
                <input v-model="simulation.time_fraction" type="number" class="form-control form-control-sm" id="time_fraction" required min="1" max="100" step="0.1" />
                <div class="invalid-feedback">Percentage must be between 1 and 100 (default: 90).</div>
            </div>
        </div>
        <div class="row g-2 mt-2">
            <div class="col-6">
                <label for="simulation_extent" class="form-label">Max Range (km)</label>
                <input v-model="simulation.simulation_extent" type="number" class="form-control form-control-sm" id="simulation_extent" required min="1" max="100" step="1" />
                <div class="invalid-feedback">Radius must be a positive number (default: 30 km).</div>
            </div>
        </div>
        <div class="row mt-3">
            <div class="col-12">
                <div class="form-check">
                    <input v-model="simulation.clear_previous" type="checkbox" class="form-check-input" id="clear_previous" />
                    <label class="form-check-label" for="clear_previous">Clear previous layers before running</label>
                </div>
            </div>
        </div>
    </form>
</template>

<script setup lang="ts">
import { useStore } from '../store.ts'
const simulation = useStore().splatParams.simulation
</script>

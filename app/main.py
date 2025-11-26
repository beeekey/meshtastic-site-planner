"""
Signal Coverage Prediction API

Provides endpoints to predict radio signal coverage
using the ITM (Irregular Terrain Model) via SPLAT! (https://github.com/jmcmellen/splat).

Endpoints:
    - /predict: Accepts a signal coverage prediction request and starts a background task.
    - /status/{task_id}: Retrieves the status of a given prediction task.
    - /result/{task_id}: Retrieves the result (GeoTIFF file) of a given prediction task.
"""

import logging
import redis
import json
from fastapi import FastAPI, BackgroundTasks, UploadFile, File
from typing import List
from PIL import Image
import numpy as np
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from uuid import uuid4
from app.services.splat import Splat
from app.models.CoveragePredictionRequest import CoveragePredictionRequest
import logging
import io
import rasterio
from rasterio.warp import reproject, Resampling
# import os



logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize Redis client for binary data
redis_client = redis.StrictRedis(host="redis", port=6379, decode_responses=False)

# Initialize SPLAT service
splat_service = Splat(splat_path="/app/splat")

# Initialize FastAPI app
app = FastAPI()




# Add CORS middleware to allow requests from your frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:*/", "http://site.meshtastic.org"],  # Replace '*' with specific origins like ["http://localhost:3000"] for security
    allow_credentials=True,
    allow_methods=["*"],  # Allow all HTTP methods
    allow_headers=["*"],  # Allow all headers
)

# Overlap endpoint (moved below app definition)
from fastapi import Form

@app.post("/overlap")
async def calculate_overlap(
    images: List[UploadFile] = File(...),
    bounds: List[str] = Form(...),
    color: str = Form('#00ff00'),
    opacity: str = Form('0.7'),
    mode: str = Form('any')
):
    """
    Accepts multiple PNG images with their geographic bounds and returns a PNG showing the overlap.
    The images are reprojected onto a common grid before calculating the overlap.
    mode: 'any' (>= 2 layers) or 'all' (all layers)
    """
    try:
        # 1. Read images and parse bounds
        src_images = []
        src_bounds = []
        for img_file, bound_str in zip(images, bounds):
            img = Image.open(img_file.file).convert("RGBA")
            src_images.append(np.array(img))
            # Bounds from frontend are [[south, west], [north, east]]
            b = json.loads(bound_str)
            # Convert to (west, south, east, north) for rasterio
            src_bounds.append((b[0][1], b[0][0], b[1][1], b[1][0]))

        # 2. Determine output grid (union of all bounds)
        total_west = min(b[0] for b in src_bounds)
        total_south = min(b[1] for b in src_bounds)
        total_east = max(b[2] for b in src_bounds)
        total_north = max(b[3] for b in src_bounds)

        # Use resolution of the first image as a reference
        first_img_arr = src_images[0]
        first_bounds = src_bounds[0]
        src_height, src_width, _ = first_img_arr.shape

        if src_width == 0 or src_height == 0:
            return JSONResponse({"error": "An input image has zero width or height."}, status_code=400)

        res_x = (first_bounds[2] - first_bounds[0]) / src_width
        res_y = (first_bounds[3] - first_bounds[1]) / src_height
        
        if res_x == 0 or res_y == 0:
            # This can happen if bounds are invalid
            logger.error(f"Calculated resolution is zero. res_x: {res_x}, res_y: {res_y}, first_bounds: {first_bounds}, shape: ({src_width}, {src_height})")
            return JSONResponse({"error": "Could not determine a valid resolution from input images."}, status_code=400)

        out_width = int((total_east - total_west) / res_x)
        out_height = int((total_north - total_south) / res_y)
        
        if out_width <= 0 or out_height <= 0:
             logger.error(f"Output image has zero or negative dimensions. out_width: {out_width}, out_height: {out_height}")
             return JSONResponse({"error": "Calculated output dimensions are invalid."}, status_code=400)


        # Destination transform
        dst_transform = rasterio.transform.from_bounds(total_west, total_south, total_east, total_north, out_width, out_height)
        dst_crs = 'EPSG:4326'

        # 3. Reproject each image
        reprojected_arrays = []
        for img_arr, bound in zip(src_images, src_bounds):
            src_h, src_w, _ = img_arr.shape
            src_transform = rasterio.transform.from_bounds(bound[0], bound[1], bound[2], bound[3], width=src_w, height=src_h)
            
            source_raster = img_arr.transpose(2, 0, 1)

            destination = np.zeros((4, out_height, out_width), dtype=np.uint8)

            reproject(
                source=source_raster,
                destination=destination,
                src_transform=src_transform,
                src_crs=dst_crs,
                dst_transform=dst_transform,
                dst_crs=dst_crs,
                resampling=Resampling.nearest
            )
            
            reprojected_arrays.append(destination.transpose(1, 2, 0))

        # 4. Calculate overlap from reprojected images
        # We want to find areas where at least 2 layers overlap
        overlap_count = np.zeros((out_height, out_width), dtype=np.int8)
        if not reprojected_arrays:
            # Handle case with no valid inputs
            return JSONResponse({"error": "No valid image data to process for overlap."}, status_code=400)
            
        for arr in reprojected_arrays:
            # Add 1 where alpha > 0
            overlap_count += (arr[:, :, 3] > 0).astype(np.int8)
            
        # Create mask based on mode
        if mode == 'all':
            overlap_mask = overlap_count == len(reprojected_arrays)
        else: # 'any' or default
            overlap_mask = overlap_count >= 2

        # 5. Create output image
        from matplotlib.colors import to_rgba
        try:
            rgba = to_rgba(color, float(opacity))
            r, g, b, a = [int(round(x * 255)) for x in rgba]
        except Exception:
            r, g, b, a = 0, 255, 0, int(float(opacity) * 255)

        result = np.zeros((out_height, out_width, 4), dtype=np.uint8)
        result[overlap_mask] = [r, g, b, a]

        out_img = Image.fromarray(result, "RGBA")
        buf = io.BytesIO()
        out_img.save(buf, format="PNG")
        buf.seek(0)
        return StreamingResponse(buf, media_type="image/png")
    except Exception as e:
        logger.error(f"Error calculating overlap: {e}", exc_info=True)
        return JSONResponse({"error": str(e)}, status_code=500)
    

def run_splat(task_id: str, request: CoveragePredictionRequest):
    """
    Execute the SPLAT! coverage prediction and store the resulting GeoTIFF data in Redis.

    Args:
        task_id (str): UUID identifier for the task.
        request (CoveragePredictionRequest): The parameters for the SPLAT! prediction.

    Workflow:
        - Runs the SPLAT! coverage prediction.
        - Stores the resulting GeoTIFF data and the task status ("completed") in Redis.
        - On failure, stores the task status as "failed" and logs the error in Redis.

    Raises:
        Exception: If SPLAT! fails during execution.
    """
    try:
        logger.info(f"Starting SPLAT! coverage prediction for task {task_id}.")
        geotiff_data, png_data, bounds, geojson_data = splat_service.coverage_prediction(request)

        # Log before storing in Redis
        logger.info(f"Storing result in Redis for task {task_id}")
        redis_client.setex(task_id, 3600, geotiff_data)
        redis_client.setex(f"{task_id}:png", 3600, png_data)
        redis_client.setex(f"{task_id}:bounds", 3600, json.dumps(bounds))
        redis_client.setex(f"{task_id}:geojson", 3600, geojson_data)
        # Store metadata separately for easy retrieval
        redis_client.setex(f"{task_id}:metadata", 3600, request.model_dump_json())
        
        redis_client.setex(f"{task_id}:status", 3600, "completed")
        logger.info(f"Task {task_id} marked as completed.")
    except Exception as e:
        logger.error(f"Error in SPLAT! task {task_id}: {e}")
        redis_client.setex(f"{task_id}:status", 3600, "failed")
        redis_client.setex(f"{task_id}:error", 3600, str(e))
        raise

@app.post("/predict")
async def predict(payload: CoveragePredictionRequest, background_tasks: BackgroundTasks) -> JSONResponse:
    """
    Predict signal coverage using SPLAT!.
    Accepts a CoveragePredictionRequest and processes it in the background.

    - Generates a unique task ID.
    - Sets the initial task status to "processing" in Redis.
    - Adds the `run_splat` function to the background task queue.

    Args:
        payload (CoveragePredictionRequest): The parameters required for the SPLAT! coverage prediction.
        background_tasks (BackgroundTasks): FastAPI background tasks.

    Returns:
        JSONResponse: A response containing the unique task ID to track the prediction progress.
    """
    task_id = str(uuid4())
    redis_client.setex(f"{task_id}:status", 3600, "processing")
    background_tasks.add_task(run_splat, task_id, payload)
    return JSONResponse({"task_id": task_id})

@app.get("/status/{task_id}")
async def get_status(task_id: str):
    """
    Retrieve the status of a given SPLAT! task.

    - Checks Redis for the task status.
    - Returns "processing", "completed", or "failed" based on the status.
    - Returns a 404 error if the task ID is not found.

    Args:
        task_id (str): The unique identifier for the task.

    Returns:
        JSONResponse: The task status or an error message if the task is not found.
    """
    status = redis_client.get(f"{task_id}:status")
    if not status:
        logger.warning(f"Task {task_id} not found in Redis.")
        return JSONResponse({"error": "Task not found"}, status_code=404)

    response_data = {"task_id": task_id, "status": status.decode("utf-8")}
    
    if response_data["status"] == "completed":
        bounds_str = redis_client.get(f"{task_id}:bounds")
        if bounds_str:
            # Parse bounds from JSON
            bounds = json.loads(bounds_str.decode("utf-8"))
            response_data["bounds"] = bounds

    return JSONResponse(response_data)

@app.get("/result/{task_id}")
async def get_result(task_id: str):
    """
    Retrieve SPLAT! task status or GeoTIFF result.

    - Checks the task status in Redis.
    - If "completed," retrieves the GeoTIFF data and serves it as a downloadable file.
    - If "failed," returns the error message stored in Redis.
    - If "processing", indicate the same in the response.

    Args:
        task_id (str): The unique identifier for the task.

    Returns:
        JSONResponse: Task status if the task is still "processing" or "failed."
        StreamingResponse: A downloadable GeoTIFF file if the task is "completed."
    """
    status = redis_client.get(f"{task_id}:status")
    if not status:
        logger.warning(f"Task {task_id} not found in Redis.")
        return JSONResponse({"error": "Task not found"}, status_code=404)

    status = status.decode("utf-8")
    if status == "completed":
        geotiff_data = redis_client.get(task_id)
        if not geotiff_data:
            logger.error(f"No data found for completed task {task_id}.")
            return JSONResponse({"error": "No result found"}, status_code=500)

        geotiff_file = io.BytesIO(geotiff_data)
        logger.info(f"Serving GeoTIFF for task {task_id}. Size: {len(geotiff_data)} bytes. Header: {geotiff_data[:20]}")
        return StreamingResponse(
            geotiff_file,
            media_type="image/tiff",
            headers={"Content-Disposition": f"attachment; filename={task_id}.tif"}
        )
    elif status == "failed":
        error = redis_client.get(f"{task_id}:error")
        return JSONResponse({"status": "failed", "error": error.decode("utf-8")})

    logger.info(f"Task {task_id} is still processing.")
    return JSONResponse({"status": "processing"})

@app.get("/result/{task_id}/png")
async def get_result_png(task_id: str):
    """
    Retrieve SPLAT! task result as PNG.
    """
    status = redis_client.get(f"{task_id}:status")
    if not status:
        return JSONResponse({"error": "Task not found"}, status_code=404)

    status = status.decode("utf-8")
    if status == "completed":
        png_data = redis_client.get(f"{task_id}:png")
        if not png_data:
            return JSONResponse({"error": "No PNG result found"}, status_code=500)

        png_file = io.BytesIO(png_data)
        return StreamingResponse(
            png_file,
            media_type="image/png"
        )
    elif status == "failed":
        error = redis_client.get(f"{task_id}:error")
        return JSONResponse({"status": "failed", "error": error.decode("utf-8")})

    return JSONResponse({"status": "processing"})

@app.get("/result/{task_id}/geojson")
async def get_result_geojson(task_id: str):
    """
    Retrieve SPLAT! task result as GeoJSON.
    """
    status = redis_client.get(f"{task_id}:status")
    if not status:
        return JSONResponse({"error": "Task not found"}, status_code=404)

    status = status.decode("utf-8")
    if status == "completed":
        geojson_data = redis_client.get(f"{task_id}:geojson")
        if not geojson_data:
            return JSONResponse({"error": "No GeoJSON result found"}, status_code=500)

        return JSONResponse(json.loads(geojson_data.decode("utf-8")))
    elif status == "failed":
        error = redis_client.get(f"{task_id}:error")
        return JSONResponse({"status": "failed", "error": error.decode("utf-8")})

    return JSONResponse({"status": "processing"})

@app.get("/result/{task_id}/metadata")
async def get_result_metadata(task_id: str):
    """
    Retrieve simulation metadata for a task.
    """
    status = redis_client.get(f"{task_id}:status")
    if not status:
        return JSONResponse({"error": "Task not found"}, status_code=404)

    status = status.decode("utf-8")
    if status == "completed":
        metadata = redis_client.get(f"{task_id}:metadata")
        if not metadata:
            return JSONResponse({"error": "No metadata found"}, status_code=404)

        return JSONResponse(json.loads(metadata.decode("utf-8")))
    
    return JSONResponse({"error": "Task not completed"}, status_code=400)


app.mount("/", StaticFiles(directory="app/ui", html=True), name="ui")

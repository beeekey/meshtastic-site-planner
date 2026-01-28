import os
import logging
import time
from app.services.splat import Splat, CoveragePredictionRequest

logging.basicConfig(level=logging.INFO)

def main():
    print("Verifying Original GeoTIFF Logic...")
    
    splat_path = os.path.abspath("splat")
    service = Splat(splat_path=splat_path)
    
    req = CoveragePredictionRequest(
        lat=47.3769, lon=8.5417,
        tx_height=10.0, rx_height=2.0, radius=5000.0,
        frequency_mhz=868.0,
        tx_power=20.0, tx_gain=3.0,
        high_resolution=False
    )
    
    try:
        tiff, png, bounds, geojson = service.coverage_prediction(req)
        print(f"Success! TIFF size: {len(tiff)} bytes")
        print(f"PNG size: {len(png)} bytes")
        print(f"Bounds: {bounds}")
        
        # Verify TIFF header (first few bytes should be II or MM + version)
        print(f"TIFF Header: {tiff[:4]}")
        
    except Exception as e:
        print(f"FAILED: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()

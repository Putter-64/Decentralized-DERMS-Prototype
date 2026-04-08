# Simulator for QEMU ESP32 devices until I figure out editing .yml file
import csv
import random
import time
from datetime import datetime, timedelta
import os

def generate_esp32_csv(filename="esp32_simulation.csv", hours=24):
    # Generate a CSV file with simulated ESP32 data
    
    # Create data directory if it doesn't exist
    os.makedirs("data", exist_ok=True)
    filepath = f"data/{filename}"
    
    # CSV headers
    headers = ["timestamp", "device_id", "data_type", "register", "value", "function"]
    
      # --- Device configurations with different base patterns
    devices = [
        {"id": "esp-device-1", "type": "modbus", "register": 0, "base_value": 1500, "variation_range": 100},
        {"id": "esp-device-2", "type": "modbus", "register": 1, "base_value": 2000, "variation_range": 150},
        {"id": "esp-device-3", "type": "modbus", "register": None, "base_value": 2500, "variation_range": 200}
    ]
    
    # Generate data points
    data_points = []
    start_time = datetime.now() - timedelta(hours=hours)
    
    for device in devices:
        base_value = device["base_value"]
        variation_range = device["variation_range"]
        
        # Add ofset to timestamps so devices don't have exactly same times
        time_offset = random.randint(0, 30)  # 0-30 minute offset
        
        for i in range(hours * 60):  # One point per minute
            timestamp = start_time + timedelta(minutes=i + time_offset)
            
            # More realistic variation for each device
            variation = random.randint(-variation_range, variation_range)
            current_value = max(0, min(4095, base_value + variation))
            
            # Create data point
            point = {
                "timestamp": timestamp.isoformat(),
                "device_id": device["id"],
                "data_type": device["type"],
                "register": device["register"] if device["register"] is not None else "",
                "value": current_value,
                "function": "READ_HOLDING_REGISTER" if device["type"] == "modbus" else "SLIDER_UPDATE"
            }
            
            # Different spike patterns for each device
            spike_chance = 0.1 if device["id"] == "esp-device-1" else 0.15
            if random.random() < spike_chance:
                point["value"] = random.randint(
                    3500 if device["id"] == "esp-device-1" else 3000,
                    4095 if device["id"] == "esp-device-3" else 3800
                )
            
            data_points.append(point)
            
            # Different drift patterns
            drift = random.randint(-8, 8) if device["id"] == "esp-device-1" else random.randint(-5, 10)
            base_value = max(0, min(4095, base_value + drift))
    
    # Write to CSV
    with open(filepath, "w", newline="") as csvfile:
        writer = csv.DictWriter(csvfile, fieldnames=headers)
        writer.writeheader()
        writer.writerows(data_points)
    
    print(f"Generated {len(data_points)} data points in {filepath}")
    return filepath

if __name__ == "__main__":
    generate_esp32_csv("esp32_simulation_24h.csv", hours=24)
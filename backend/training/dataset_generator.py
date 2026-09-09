"""
UrbanTwin AI - Synthetic Demo Dataset Generator
Generates realistic license plate images and vehicle crops under multi-condition
environmental degradations (rain, motion blur, night glare, grime, perspective skew).
"""

import os
import random
import math
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageEnhance
from typing import List, Tuple, Dict

# Character vocabulary for ANPR OCR
CHAR_VOCAB = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"
CHAR2IDX = {c: i + 1 for i, c in enumerate(CHAR_VOCAB)} # 0 reserved for CTC blank
IDX2CHAR = {i + 1: c for i, c in enumerate(CHAR_VOCAB)}
NUM_CLASSES = len(CHAR_VOCAB) + 1

# Standard state codes and series
STATE_CODES = ["DL", "MH", "KA", "HR", "UP", "TN", "WB", "GJ", "TS", "RJ"]
VEHICLE_COLORS = ["white", "black", "silver", "blue", "red", "grey"]
VEHICLE_TYPES = ["Sedan", "SUV", "Hatchback", "Truck", "Motorcycle"]


def generate_random_plate_text() -> str:
    """Generate a realistic standardized license plate string."""
    state = random.choice(STATE_CODES)
    district = f"{random.randint(1, 99):02d}"
    series = "".join(random.choices("ABCDEFGHJKLMNPQRSTUVWXYZ", k=2))
    number = f"{random.randint(1000, 9999):04d}"
    return f"{state}{district}{series}{number}"


def apply_night_glare(image: Image.Image) -> Image.Image:
    """Simulate severe headlight glare / blooming over the license plate."""
    img_arr = np.array(image).astype(np.float32)
    h, w, c = img_arr.shape

    # Glare epicenter
    cx = random.randint(int(w * 0.1), int(w * 0.9))
    cy = random.randint(int(h * 0.1), int(h * 0.9))
    radius = random.randint(int(min(h, w) * 0.4), int(max(h, w) * 0.8))

    y, x = np.ogrid[:h, :w]
    dist_sq = (x - cx) ** 2 + (y - cy) ** 2
    glare = np.exp(-dist_sq / (2.0 * (radius / 2.0) ** 2))
    glare = np.repeat(glare[:, :, np.newaxis], 3, axis=2)

    intensity = random.uniform(120, 200)
    img_arr = np.clip(img_arr + glare * intensity, 0, 255)
    return Image.fromarray(img_arr.astype(np.uint8))


def apply_motion_blur(image: Image.Image, kernel_size: int = 7) -> Image.Image:
    """Simulate horizontal high-speed vehicle motion blur (60-100 km/h)."""
    # Create horizontal motion blur kernel
    kernel = np.zeros((kernel_size, kernel_size))
    kernel[int((kernel_size - 1) / 2), :] = np.ones(kernel_size)
    kernel = kernel / kernel_size

    img_arr = np.array(image)
    blurred = np.zeros_like(img_arr)
    for i in range(3):
        blurred[:, :, i] = np.clip(
            np.convolve(img_arr[:, :, i].ravel(), kernel.ravel(), mode='same').reshape(img_arr.shape[:2]),
            0, 255
        )
    return Image.fromarray(blurred.astype(np.uint8))


def apply_rain_and_noise(image: Image.Image) -> Image.Image:
    """Simulate heavy rain droplets, water streaks, and camera sensor noise."""
    img_arr = np.array(image)
    h, w, _ = img_arr.shape

    # Rain streaks
    num_drops = random.randint(40, 100)
    for _ in range(num_drops):
        x1 = random.randint(0, w - 1)
        y1 = random.randint(0, h - 1)
        length = random.randint(5, 15)
        angle = math.radians(random.uniform(65, 80))
        x2 = int(x1 + length * math.cos(angle))
        y2 = int(y1 + length * math.sin(angle))
        if 0 <= x2 < w and 0 <= y2 < h:
            img_arr[min(y1, y2):max(y1, y2), min(x1, x2):max(x1, x2), :] = np.clip(
                img_arr[min(y1, y2):max(y1, y2), min(x1, x2):max(x1, x2), :] + 45, 0, 255
            )

    # Salt and pepper sensor noise
    noise_mask = np.random.rand(h, w) < 0.015
    img_arr[noise_mask] = np.random.randint(0, 255, size=img_arr[noise_mask].shape)
    return Image.fromarray(img_arr)


def apply_dirt_and_grime(image: Image.Image) -> Image.Image:
    """Simulate mud splatters, dirty license plate grime, and partial occlusion."""
    overlay = Image.new("RGBA", image.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    w, h = image.size

    num_patches = random.randint(3, 8)
    for _ in range(num_patches):
        rx = random.randint(0, w)
        ry = random.randint(0, h)
        rw = random.randint(8, 25)
        rh = random.randint(5, 18)
        alpha = random.randint(80, 190)
        color = (random.randint(60, 90), random.randint(45, 75), random.randint(30, 50), alpha)
        draw.ellipse([rx, ry, rx + rw, ry + rh], fill=color)

    overlay = overlay.filter(ImageFilter.GaussianBlur(radius=2))
    base = image.convert("RGBA")
    combined = Image.alpha_composite(base, overlay)
    return combined.convert("RGB")


def apply_perspective_distortion(image: Image.Image) -> Image.Image:
    """Simulate acute camera mounting angle / perspective distortion."""
    w, h = image.size
    skew_x1 = random.uniform(0, 0.12) * w
    skew_y1 = random.uniform(0, 0.15) * h
    skew_x2 = random.uniform(0.88, 1.0) * w
    skew_y2 = random.uniform(0, 0.15) * h
    skew_x3 = random.uniform(0.88, 1.0) * w
    skew_y3 = random.uniform(0.85, 1.0) * h
    skew_x4 = random.uniform(0, 0.12) * w
    skew_y4 = random.uniform(0.85, 1.0) * h

    # 8-tuple transform coefficients
    return image.transform(
        (w, h),
        Image.Transform.QUAD,
        data=(skew_x1, skew_y1, skew_x4, skew_y4, skew_x3, skew_y3, skew_x2, skew_y2),
        resample=Image.Resampling.BILINEAR,
        fillcolor=(18, 22, 30)
    )


def get_optimal_font(size: int = 28) -> ImageFont.ImageFont:
    """Find and return an available truetype font across Linux/Colab, Windows, and macOS."""
    candidates = [
        "arial.ttf",
        "Arial.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
        "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf",
        "C:\\Windows\\Fonts\\arial.ttf",
        "DejaVuSans.ttf",
        "Helvetica.ttf"
    ]
    for candidate in candidates:
        try:
            return ImageFont.truetype(candidate, size)
        except Exception:
            continue
    try:
        return ImageFont.load_default(size=size)
    except Exception:
        return ImageFont.load_default()


def render_license_plate(
    plate_text: str,
    width: int = 240,
    height: int = 70,
    degradation: str = "clean"
) -> Image.Image:
    """
    Renders a synthetic license plate image with realistic borders, fonts,
    IND identifier badge, and optional environmental degradation.
    """
    # Plate base color (white or commercial yellow)
    bg_color = (245, 246, 248) if random.random() > 0.15 else (240, 215, 60)
    plate = Image.new("RGB", (width, height), bg_color)
    draw = ImageDraw.Draw(plate)

    # Outer border & inner bezel
    border_color = (25, 25, 28)
    draw.rectangle([0, 0, width - 1, height - 1], outline=border_color, width=3)
    draw.rectangle([3, 3, width - 4, height - 4], outline=(180, 185, 190), width=1)

    # Blue IND country emblem strip on the left
    ind_width = int(width * 0.12)
    draw.rectangle([4, 4, ind_width, height - 5], fill=(20, 65, 155))
    try:
        font_sm = ImageFont.load_default()
        draw.text((ind_width // 4, height // 2 - 8), "IND", fill=(255, 255, 255), font=font_sm)
    except Exception:
        pass

    # Render characters
    # Format text: e.g. "DL 01 AB 1234"
    formatted = f"{plate_text[:2]} {plate_text[2:4]} {plate_text[4:6]} {plate_text[6:]}" if len(plate_text) >= 10 else plate_text
    char_start_x = ind_width + 12
    font = get_optimal_font(28)

    # Draw embossed text shadow then foreground text
    draw.text((char_start_x + 1, height // 2 - 14), formatted, fill=(90, 90, 95), font=font)
    draw.text((char_start_x, height // 2 - 15), formatted, fill=(15, 18, 22), font=font)

    # Apply selected environmental degradation
    if degradation == "rain":
        plate = apply_rain_and_noise(plate)
        plate = ImageEnhance.Contrast(plate).enhance(0.85)
    elif degradation == "glare":
        plate = apply_night_glare(plate)
    elif degradation == "blur":
        plate = apply_motion_blur(plate, kernel_size=random.choice([7, 9, 11]))
    elif degradation == "grime":
        plate = apply_dirt_and_grime(plate)
    elif degradation == "skew":
        plate = apply_perspective_distortion(plate)
    elif degradation == "severe_mixed":
        plate = apply_motion_blur(plate, kernel_size=5)
        plate = apply_dirt_and_grime(plate)
        plate = apply_night_glare(plate)
        plate = apply_perspective_distortion(plate)

    return plate


def generate_demo_dataset(
    output_dir: str = "demo_dataset",
    num_train: int = 800,
    num_val: int = 150,
    num_test: int = 100
) -> Dict[str, str]:
    """
    Generates full demo dataset splits on disk with metadata annotations CSV.
    """
    os.makedirs(f"{output_dir}/train", exist_ok=True)
    os.makedirs(f"{output_dir}/val", exist_ok=True)
    os.makedirs(f"{output_dir}/test", exist_ok=True)

    degradations = ["clean", "rain", "glare", "blur", "grime", "skew", "severe_mixed"]
    manifests = {}

    for split_name, count in [("train", num_train), ("val", num_val), ("test", num_test)]:
        csv_path = f"{output_dir}/{split_name}_labels.csv"
        records = ["filename,label,degradation\n"]

        for i in range(count):
            plate_text = generate_random_plate_text()
            deg = random.choice(degradations)
            img = render_license_plate(plate_text, degradation=deg)
            filename = f"{split_name}_{i:05d}_{plate_text}.png"
            img_path = f"{output_dir}/{split_name}/{filename}"
            img.save(img_path)
            records.append(f"{filename},{plate_text},{deg}\n")

        with open(csv_path, "w", encoding="utf-8") as f:
            f.writelines(records)
        manifests[split_name] = csv_path
        print(f"[*] Generated {count} samples for {split_name} split at {output_dir}/{split_name}")

    return manifests


def generate_traffic_telemetry_dataset(
    num_hours: int = 168, # 7 days of hourly records across nodes
    output_path: str = "demo_traffic_telemetry.csv"
):
    """
    Generates realistic spatial-temporal traffic telemetry data across UrbanTwin corridors.
    Includes hourly cycles, morning/evening rush hour peaks, weather impacts, and incident anomalies.
    """
    import pandas as pd
    from datetime import datetime, timedelta

    corridors = [
        {"road_id": "ROAD_01", "name": "MG Road Central Corridor", "speed_limit": 50.0, "base_flow": 800},
        {"road_id": "ROAD_02", "name": "Outer Ring Road Express", "speed_limit": 80.0, "base_flow": 1400},
        {"road_id": "ROAD_03", "name": "Indiranagar 100ft Arterial", "speed_limit": 45.0, "base_flow": 650},
        {"road_id": "ROAD_04", "name": "Koramangala Tech Corridor", "speed_limit": 50.0, "base_flow": 900},
        {"road_id": "ROAD_05", "name": "Electronic City Elevated Tollway", "speed_limit": 80.0, "base_flow": 1200}
    ]

    start_time = datetime(2026, 1, 1, 0, 0, 0)
    records = []

    for h in range(num_hours):
        dt = start_time + timedelta(hours=h)
        hour = dt.hour
        weekday = dt.weekday()
        is_weekend = 1 if weekday >= 5 else 0

        # Rush hour multipliers
        morning_rush = math.exp(-0.5 * ((hour - 9) / 1.5) ** 2)
        evening_rush = math.exp(-0.5 * ((hour - 18) / 2.0) ** 2)
        diurnal_factor = 0.25 + 0.5 * (1 - is_weekend * 0.3) * (morning_rush + evening_rush) + 0.25 * math.sin(hour / 24 * math.pi)

        # Weather variation: Clear, Rain, Fog
        weather = "Clear"
        weather_drag = 1.0
        if random.random() < 0.12:
            weather = "Heavy Rain"
            weather_drag = 0.75
        elif random.random() < 0.08:
            weather = "Dense Fog"
            weather_drag = 0.85

        for corridor in corridors:
            base_flow = corridor["base_flow"]
            flow = int(base_flow * diurnal_factor * random.uniform(0.85, 1.15))
            
            # Anomaly / incident injection (2% probability)
            incident = 1 if random.random() < 0.02 else 0
            
            # Calculate speed based on Green-Shields traffic flow model
            max_speed = corridor["speed_limit"]
            capacity = base_flow * 1.3
            v_ratio = min(1.0, flow / max(1.0, capacity))
            
            if incident:
                speed = round(max(8.0, max_speed * 0.25 * random.uniform(0.7, 1.0)), 1)
                congestion = round(min(100.0, 75.0 + random.uniform(10, 25)), 1)
                queue = round(random.uniform(400, 1200), 1)
            else:
                speed = round(max(12.0, max_speed * (1.0 - 0.7 * (v_ratio ** 1.8)) * weather_drag + random.uniform(-2, 2)), 1)
                congestion = round(max(5.0, min(100.0, (1.0 - (speed / max_speed)) * 100)), 1)
                queue = round(max(0.0, (congestion / 100.0) ** 2 * 650 + random.uniform(-10, 15)), 1)

            # Targets (horizons: 5 min, 15 min, 30 min future)
            trend_noise = random.uniform(0.97, 1.03)
            cong_5m = round(min(100.0, max(0.0, congestion * trend_noise)), 1)
            cong_15m = round(min(100.0, max(0.0, congestion * (trend_noise ** 1.8))), 1)
            cong_30m = round(min(100.0, max(0.0, congestion * (trend_noise ** 2.4))), 1)

            spd_5m = round(max(5.0, speed / (trend_noise ** 0.5)), 1)
            spd_15m = round(max(5.0, speed / (trend_noise ** 0.9)), 1)
            spd_30m = round(max(5.0, speed / (trend_noise ** 1.2)), 1)

            records.append({
                "timestamp": dt.isoformat(),
                "road_id": corridor["road_id"],
                "road_name": corridor["name"],
                "hour_of_day": hour,
                "day_of_week": weekday,
                "is_weekend": is_weekend,
                "weather": weather,
                "has_incident": incident,
                "flow_rate_vph": flow,
                "queue_length_m": queue,
                "current_speed_kmh": speed,
                "current_congestion_pct": congestion,
                "target_congestion_5m": cong_5m,
                "target_congestion_15m": cong_15m,
                "target_congestion_30m": cong_30m,
                "target_speed_5m": spd_5m,
                "target_speed_15m": spd_15m,
                "target_speed_30m": spd_30m
            })

    df = pd.DataFrame(records)
    if output_path:
        df.to_csv(output_path, index=False)
        print(f"[*] Generated traffic telemetry dataset with {len(df)} records saved to {output_path}")
    return df


if __name__ == "__main__":
    generate_demo_dataset("demo_dataset", num_train=50, num_val=10, num_test=10)
    generate_traffic_telemetry_dataset(num_hours=48, output_path="demo_traffic_telemetry.csv")

import fastapi
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import requests
import time
from math import radians, sin, cos, sqrt, atan2
import pandas as pd
import numpy as np

app = fastapi.FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

last_nominatim_request = 0
NOMINATIM_DELAY = 1.0
EMAIL = "ENTER YOUR EMAIL HERE!!!!!!!!!!!" # ENTER YOUR EMAIL HERE!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

def convert_zipcode_to_latlon(zip_code: str):
    global last_nominatim_request
    headers = {f"User-Agent": "EmergencyServicesApp/1.0 ({EMAIL})"}

    # Rate limit Nominatim requests
    elapsed = time.time() - last_nominatim_request
    if elapsed < NOMINATIM_DELAY:
        time.sleep(NOMINATIM_DELAY - elapsed)
    
    geo_res = requests.get(
        f"https://nominatim.openstreetmap.org/search?postalcode={zip_code}&country=USA&format=json",
        headers=headers
    )
    last_nominatim_request = time.time()
    
    try:
        geo_data = geo_res.json()
    except Exception as e:
        return None, None, f"Nominatim returned invalid JSON: {e}"

    if not geo_data:
        return None, None, "ZIP code not found"

    lat = float(geo_data[0]["lat"])
    lon = float(geo_data[0]["lon"])
    return lat, lon, None


def haversine(lat1, lon1, lat2, lon2):

    R = 6371.0  # ts is earth radius in km NOT miles

    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)

    a = sin(dlat / 2)**2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2)**2
    c = 2 * atan2(sqrt(a), sqrt(1 - a))

    distance = R * c
    return distance

def get_wellness_score(zip_code):
    #add stuff in both get fire score and get aqi score
    # 1. Get the home coordinates
    lat, lon, error = convert_zipcode_to_latlon(zip_code)
    if error:
        return {"error": f"Could not locate zip code: {error}"}

    fire_score = get_fire_score(lat, lon)
    aqi_score = get_aqi_score(lat, lon)
    total_score = fire_score + aqi_score
    return total_score

def get_fire_score(lat, lon, csv_path='backend/ca_fire_hazard.csv'):
    """
    Returns a safety score from 0-30 based on proximity to fire hazard centroids in ca_fire_hazard.csv.
    """
    # 2. Load the CSV
    try:
        df = pd.read_csv(csv_path)
    except FileNotFoundError:
        return 30 # Default to safe if data is missing

    min_dist_miles = float('inf')
    nearest_class = 0

    # Threshold: Fire hazard zones are local. 
    # 5 miles accounts for the distance to the center of a zone.
    MAX_DIST_MILES = 5.0

    # 3. Iterate and find the closest hazard centroid
    for _, row in df.iterrows():
        dist_km = haversine(lat, lon, row['lat'], row['lng'])
        dist_miles = dist_km * 0.621371
        
        if dist_miles < min_dist_miles:
            min_dist_miles = dist_miles
            nearest_class = row['HAZ_CLASS']

    # 4. Scoring Logic
    # If the closest centroid is too far away, it's considered Urban/Safe
    if min_dist_miles > MAX_DIST_MILES:
        return 30

    # Points based on the CAL FIRE Severity Classes
    if nearest_class == 3:   # Very High
        return 0
    elif nearest_class == 2: # High
        return 10
    elif nearest_class == 1: # Moderate
        return 20
    else:
        return 30


def get_aqi_score(lat, lon, csv_path='backend/ca_city_avg_aqi.csv'):
    '''
    data is gonna be the variable holding csv file backend/ca_city_avg_aqi.csv 
    extract lat/long of address given and see how far that is from the address given and if its less than 50 miles, use that AQI value to score 
    other approach: use geopy to get the distance between the address given and the city listed in the dataset

    0 – 25	Pristine	30 pts	Best possible air (coastal/rural).
    26 – 50	Good	25 pts	Safe, but has typical urban background levels.
    51 – 100	Moderate	15 pts	Significant drop-off in "safety feel."
    100+	Unhealthy	0 pts	Immediate safety concern.

    return the total points
    '''
    # 2. Load the AQI dataset
    df = pd.read_csv(csv_path)

    # 3. Find the nearest city in the dataset
    min_dist_km = float('inf')
    nearest_data = None

    for _, row in df.iterrows():
        # Note: dataset uses 'lng', haversine expects lon
        dist = haversine(lat, lon, row['lat'], row['lng'])
        
        if dist < min_dist_km:
            min_dist_km = dist
            nearest_data = row

    # 4. Convert distance to miles for the threshold check
    dist_miles = min_dist_km * 0.621371
    aqi_value = nearest_data['avg_aqi']
    
    # 5. Determine data validity based on plan (x = 15 miles)
    if dist_miles <= 15:
        data_confidence = "High (Local)"
    else:
        data_confidence = "Moderate (Regional)"

    # 6. Apply point scoring logic
    # 0-50: 30 pts | 51-100: 25 pts | 101-150: 20 pts | 151-200: 5 pts | 201+: 0 pts
    if aqi_value <= 50:
        aqi_pts = 30
    elif aqi_value <= 100:
        aqi_pts = 25
    elif aqi_value <= 150:
        aqi_pts = 20
    elif aqi_value <= 200:
        aqi_pts = 5
    else:
        aqi_pts = 0

    return aqi_pts


def get_emergency_score(services: list, ogLat: float, ogLon: float) -> float:
    score = 0.0
    for service in services:
        if service["type"] == "hospital":
            distance = haversine(ogLat, ogLon, service["lat"], service["lon"])
            if distance <= 10:
                score += 10.0
            elif distance <= 18:
                score += 5.0
            else:
                score += 2.0
        elif service["type"] == "police":
            distance = haversine(ogLat, ogLon, service["lat"], service["lon"])
            if distance <= 10:
                score += 9.0
            elif distance <= 18:
                score += 4.5
            else:
                score += 1.5
        elif service["type"] == "fire_station":
            distance = haversine(ogLat, ogLon, service["lat"], service["lon"])
            if distance <= 10:
                score += 8.0
            elif distance <= 18:
                score += 4.0
            else:
                score += 1.0
    return score


@app.get("/api/emergency-services/{zip_code}")
def get_emergency_services(zip_code: str):
    # Zip code to longitude and latitude conversion
    lat, lon, error = convert_zipcode_to_latlon(zip_code)

    # Overpass query with 'out center' to get coordinates for ways
    overpass_query = f"""
    [out:json][timeout:25];
    (
      node["amenity"="hospital"](around:10000,{lat},{lon});
      way["amenity"="hospital"](around:10000,{lat},{lon});
      node["amenity"="police"](around:5000,{lat},{lon});
      way["amenity"="police"](around:5000,{lat},{lon});
      node["amenity"="fire_station"](around:5000,{lat},{lon});
      way["amenity"="fire_station"](around:5000,{lat},{lon});
    );
    out body center;
    """

    try:
        overpass_res = requests.post("https://overpass-api.de/api/interpreter", data=overpass_query, timeout=30)
        overpass_res.raise_for_status()
        overpass_data = overpass_res.json()
    except Exception as e:
        return {"services": [], "error": f"Overpass API error: {e}", "emergency_score": -1}

    services = []
    for el in overpass_data.get("elements", []):
        element_lat = el.get("lat") or el.get("center", {}).get("lat")
        element_lon = el.get("lon") or el.get("center", {}).get("lon")
        
        if element_lat and element_lon:
            services.append({
                "id": str(el["id"]),
                "name": el.get("tags", {}).get("name", "Unnamed"),
                "type": el.get("tags", {}).get("amenity", "Unknown"),
                "lat": float(element_lat),
                "lon": float(element_lon),
                "address": el.get("tags", {}).get("addr:full") or 
                          f"{el.get('tags', {}).get('addr:street', '')} {el.get('tags', {}).get('addr:housenumber', '')}".strip() or None
            })
    
    score = get_emergency_score(services, lat, lon)
    
    return JSONResponse(content={
        "services": services,
        "emergency_score": score
    })

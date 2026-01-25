from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import requests
import time
from math import radians, sin, cos, sqrt, atan2
from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeoutError
import pandas as pd
import numpy as np
import re
import asyncio
import concurrent.futures

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

last_nominatim_request = 0
NOMINATIM_DELAY = 1.0
EMAIL = "test@gmail.com" # ENTER YOUR EMAIL HERE!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

EXAMPLE_INPUT= {
    "address": "8276 Traveller St, Chino, CA 91708",
    "listing_price": "$560,0003",
    "sqft": "1,493",
    "crime":"",
    "emprox":"",
    "envwell":"",
    "shop":"",
    "cafe":"",
    "gym":""
}

CRIME_DICT = {}

COUNTER = 1

GRADE_TO_SCORE = {
    "A+": 100.0, "A": 95.0, "A-": 90.0,
    "B+": 87.0, "B": 85.0, "B-": 80.0,
    "C+": 77.0, "C": 75.0, "C-": 70.0,
    "D+": 67.0, "D": 65.0, "D-": 60.0,
    "F": 50.0,
}


def haversine(lat1, lon1, lat2, lon2):
    R = 6371.0
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
    c = 2 * atan2(sqrt(a), sqrt(1 - a))
    return R * c


def convert_address_to_location(address: str):
    """
    Uses the US Census Bureau Geocoder (Free, No API Key).
    This bypasses the OpenStreetMap ban.
    """
    print(f"Geocoding via US Census: {address}")
    url = "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress"

    params = {
        "address": address,
        "benchmark": "Public_AR_Current",
        "format": "json"
    }

    try:
        # The Census API is slightly slower, so give it a longer timeout
        resp = requests.get(url, params=params, timeout=15)
        resp.raise_for_status()
        data = resp.json()
        
        matches = data.get("result", {}).get("addressMatches", [])
        
        if not matches:
            print(f"Census found no match for: {address}")
            # Fallback: Try to extract ZIP manually from string if API fails
            zip_match = re.search(r"\b\d{5}\b", address)
            return (zip_match.group(0) if zip_match else None), None, None

        # Take the first match
        match = matches[0]
        coords = match.get("coordinates", {})
        components = match.get("addressComponents", {})

        # Census returns 'x' (Longitude) and 'y' (Latitude)
        lon = coords.get("x")
        lat = coords.get("y")
        zip_code = components.get("zip")

        print(f"Census success: {lat}, {lon}, {zip_code}")
        return zip_code, float(lat), float(lon)

    except Exception as e:
        print(f"Census Geocoding failed: {e}")
        return None, None, None


# --- FIRE + AQI SCORES ---
def get_fire_score(lat, lon, csv_path='ca_fire_hazard.csv'):
    try:
        df = pd.read_csv(csv_path)
    except FileNotFoundError:
        return 30
    min_dist_miles = float('inf')
    nearest_class = 0
    MAX_DIST_MILES = 5.0
    for _, row in df.iterrows():
        dist_km = haversine(lat, lon, row['lat'], row['lng'])
        dist_miles = dist_km * 0.621371
        if dist_miles < min_dist_miles:
            min_dist_miles = dist_miles
            nearest_class = row['HAZ_CLASS']
    if min_dist_miles > MAX_DIST_MILES:
        return 30
    return {3: 0, 2: 10, 1: 20}.get(nearest_class, 30)


def get_aqi_score(lat, lon, csv_path='ca_city_avg_aqi.csv'):
    df = pd.read_csv(csv_path)
    min_dist_km = float('inf')
    nearest_data = None
    for _, row in df.iterrows():
        dist = haversine(lat, lon, row['lat'], row['lng'])
        if dist < min_dist_km:
            min_dist_km = dist
            nearest_data = row
    aqi_value = nearest_data['avg_aqi']
    if aqi_value <= 50: return 30
    elif aqi_value <= 100: return 25
    elif aqi_value <= 150: return 20
    elif aqi_value <= 200: return 5
    return 0


def get_wellness_score(zip_code, lat, lon):
    if lat is None or lon is None:
        return 0
    return get_fire_score(lat, lon) + get_aqi_score(lat, lon)


# --- EMERGENCY / AMENITIES SCORES ---
def get_emergency_score(services: list, ogLat: float, ogLon: float) -> float:
    score = 0.0
    for service in services:
        distance = haversine(ogLat, ogLon, service["lat"], service["lon"])
        t = service["type"]
        if t == "hospital":
            score += 10 if distance <= 10 else 5 if distance <= 18 else 2
        elif t == "police":
            score += 9 if distance <= 10 else 4.5 if distance <= 18 else 1.5
        elif t == "fire_station":
            score += 8 if distance <= 10 else 4 if distance <= 18 else 1
    return score


def shop_score(shops: list, lat: float, lon: float) -> float:
    score = 0.0
    for s in shops:
        d = haversine(s["lat"], s["lon"], lat, lon)
        score += 10 if d <= 5 else 5 if d <= 15 else 2
    return score


def cafe_score(cafes: list, lat: float, lon: float) -> float:
    score = 0.0
    for c in cafes:
        d = haversine(c["lat"], c["lon"], lat, lon)
        score += 10 if d <= 5 else 5 if d <= 15 else 2
    return score


def gym_score(gyms: list, lat: float, lon: float) -> float:
    score = 0.0
    for g in gyms:
        d = haversine(g["lat"], g["lon"], lat, lon)
        score += 10 if d <= 5 else 5 if d <= 15 else 2
    return score


# --- Unified Overpass API call ---
def get_all_amenities(lat: float, lon: float) -> dict:
    overpass_query = f"""
    [out:json][timeout:25];
    (
      node["amenity"="hospital"](around:10000,{lat},{lon});
      way["amenity"="hospital"](around:10000,{lat},{lon});
      node["amenity"="police"](around:5000,{lat},{lon});
      way["amenity"="police"](around:5000,{lat},{lon});
      node["amenity"="fire_station"](around:5000,{lat},{lon});
      way["amenity"="fire_station"](around:5000,{lat},{lon});
      nwr["shop"="mall"](around:2000,{lat},{lon});
      nwr["shop"="supermarket"](around:2000,{lat},{lon});
      nwr["shop"="convenience"](around:2000,{lat},{lon});
      nwr["shop"="shopping_centre"](around:2000,{lat},{lon});
      nwr["amenity"="cafe"](around:3000,{lat},{lon});
      nwr["amenity"="restaurant"](around:3000,{lat},{lon});
      nwr["amenity"="fast_food"](around:3000,{lat},{lon});
      nwr["leisure"="fitness_centre"](around:4500,{lat},{lon});
      nwr["leisure"="gym"](around:4500,{lat},{lon});
      nwr["sport"="fitness"](around:4500,{lat},{lon});
    );
    out body center;
    """
    try:
        res = requests.post("https://overpass-api.de/api/interpreter", data=overpass_query, timeout=30)
        res.raise_for_status()
        data = res.json()
    except Exception as e:
        print("Overpass API error:", e)
        return {"emergency_services": [], "shops": [], "cafes": [], "gyms": []}

    emergency_services, shops, cafes, gyms = [], [], [], []

    for el in data.get("elements", []):
        lat_el = el.get("lat") or el.get("center", {}).get("lat")
        lon_el = el.get("lon") or el.get("center", {}).get("lon")
        if not lat_el or not lon_el: continue
        tags = el.get("tags", {})
        item = {"id": str(el["id"]), "name": tags.get("name", "Unnamed"), "lat": float(lat_el),
                "lon": float(lon_el)}
        amenity_type = tags.get("amenity")
        shop_type = tags.get("shop")
        leisure_type = tags.get("leisure")
        sport_type = tags.get("sport")

        if amenity_type in ["hospital", "police", "fire_station"]:
            item["type"] = amenity_type
            emergency_services.append(item)
        elif shop_type:
            item["type"] = shop_type
            shops.append(item)
        elif amenity_type in ["cafe", "restaurant", "fast_food"]:
            item["type"] = amenity_type
            cafes.append(item)
        elif leisure_type in ["fitness_centre", "gym"] or sport_type == "fitness":
            item["type"] = leisure_type or sport_type
            gyms.append(item)

    print(f"Found {len(emergency_services)} emergency services, {len(shops)} shops, "
          f"{len(cafes)} cafes, {len(gyms)} gyms near ({lat}, {lon})")

    print("Emergency Services:", emergency_services)
    print("Shops:", shops)
    print("Cafes:", cafes)
    print("Gyms:", gyms)
    print("-----")
    return {"emergency_services": emergency_services, "shops": shops, "cafes": cafes, "gyms": gyms}


def compute_all_scores(amenities: dict, lat: float, lon: float, zip_code: str) -> dict:
    global COUNTER
    print(f"Data for house {COUNTER}: {amenities} at ({lat}, {lon}) with ZIP {zip_code}")
    COUNTER += 1
    return {
        "emprox": get_emergency_score(amenities["emergency_services"], lat, lon),
        "envwell": get_wellness_score(zip_code, lat, lon),
        "shop": shop_score(amenities["shops"], lat, lon),
        "cafe": cafe_score(amenities["cafes"], lat, lon),
        "gym": gym_score(amenities["gyms"], lat, lon)
    }


# --- Playwright: get crime score for multiple ZIPs in one browser session ---
async def get_crime_score(zipcodes: list) -> list:
    # Get unique zipcodes while preserving order for the first occurrence
    unique_zips = []
    seen = set()
    for z in zipcodes:
        if z not in seen:
            unique_zips.append(z)
            seen.add(z)
    
    # Only fetch zipcodes that aren't already in CRIME_DICT
    to_fetch = [z for z in unique_zips if z not in CRIME_DICT]

    if to_fetch:
        try:
            async with async_playwright() as p:
                browser = await p.chromium.launch(headless=False, args=["--disable-blink-features=AutomationControlled"])
                context = await browser.new_context(
                    user_agent=("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36")
                )
                page = await context.new_page()
                await page.goto("https://crimegrade.org/", timeout=60000)

                for zipcode in to_fetch:
                    zip_input = page.get_by_placeholder("Zip code")
                    await zip_input.fill(zipcode)
                    await page.get_by_role("button", name="Explore").click()
                    
                    try:
                        # Try to get the grade with a shorter timeout
                        grade_el = page.locator("text=Overall Crime Grade™").locator("xpath=preceding-sibling::*[1]")
                        await grade_el.wait_for(state="visible", timeout=1000)
                        grade = (await grade_el.inner_text()).strip()
                        CRIME_DICT[zipcode] = grade
                    except:
                        # If it times out or fails, check for error message
                        error_visible = await page.locator("text=Please try another zipcode").is_visible()
                        if error_visible:
                            print(f"Invalid zipcode: {zipcode}")
                        CRIME_DICT[zipcode] = "C+"
                    
                    await page.goto("https://crimegrade.org/", timeout=60000)

                await browser.close()
        except Exception as e:
            print("CrimeGrade fetch error:", e)
            for z in to_fetch:
                CRIME_DICT[z] = "C+"

    # Return results in the same order as input, using cached values for all zipcodes
    results = []
    for z in zipcodes:
        results.append(GRADE_TO_SCORE.get(CRIME_DICT.get(z, "C+"), 0))
    return results


# --- FastAPI endpoint ---
@app.post("/updateAddress")
async def update_address(request: Request):
    data = await request.json()
    addresses = data.get("addresses", [])

    zip_list, lat_list, lon_list = [], [], []

    for address in addresses:
        zip_code, lat, lon = convert_address_to_location(address.get("address", ""))
        zip_list.append(zip_code)
        lat_list.append(lat)
        lon_list.append(lon)

    # --- Crime scores in one Playwright session ---
    crime_scores = await get_crime_score(zip_list)

    # --- Other scores in parallel (single Overpass per address) ---
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
        future_results = [
            executor.submit(lambda lat=lat_list[i], lon=lon_list[i], zipc=zip_list[i]:
                            compute_all_scores(get_all_amenities(lat, lon), lat, lon, zipc))
            for i in range(len(addresses))
        ]
        results = [f.result() for f in future_results]

    # --- Assign all scores ---
    for i, address in enumerate(addresses):
        address["crime"] = crime_scores[i]
        address.update(results[i])

    return JSONResponse({"results": addresses})
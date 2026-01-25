from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import requests
import time
from math import radians, sin, cos, sqrt, atan2
from playwright.sync_api import sync_playwright, TimeoutError
from playwright.async_api import async_playwright
from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeoutError
import pandas as pd
import numpy as np
import re
import asyncio
import threading
import concurrent.futures

# import sys

# # ⚠️ PASTE THIS AT THE VERY TOP OF YOUR FILE
# if sys.platform == 'win32':
#     asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

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
EMAIL = "aqian152@gmail.com" # ENTER YOUR EMAIL HERE!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

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


GRADE_TO_SCORE = {
    "A+": 100.0,
    "A": 95.0,
    "A-": 90.0,

    "B+": 87.0,
    "B": 85.0,
    "B-": 80.0,

    "C+": 77.0,
    "C": 75.0,
    "C-": 70.0,

    "D+": 67.0,
    "D": 65.0,
    "D-": 60.0,

    "F": 50.0,
}


def haversine(lat1, lon1, lat2, lon2):

    R = 6371.0  # ts is earth radius in km NOT miles

    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)

    a = sin(dlat / 2)**2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2)**2
    c = 2 * atan2(sqrt(a), sqrt(1 - a))

    distance = R * c
    return distance


def get_fire_score(lat, lon, csv_path='ca_fire_hazard.csv'):
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

def get_aqi_score(lat, lon, csv_path='ca_city_avg_aqi.csv'):
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


def get_wellness_score(zip_code, lat, lon):
    #add stuff in both get fire score and get aqi score
    # 1. Get the home coordinates
    if lat is None or lon is None:
        return {"error": "Invalid coordinates"}

    fire_score = get_fire_score(lat, lon)
    aqi_score = get_aqi_score(lat, lon)
    total_score = fire_score + aqi_score
    return total_score


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


# async def get_crime_score(zipcode: str) -> float:
#     if zipcode in CRIME_DICT:
#         return GRADE_TO_SCORE.get(CRIME_DICT[zipcode], 0.0)

#     try:
#         async with async_playwright() as p:
#             browser = await p.chromium.launch(
#                 headless=True,
#                 args=["--disable-blink-features=AutomationControlled"]
#             )
#             print(f"BROWSER LAUNCHED FOR {zipcode}")
#             context = await browser.new_context(
#                 user_agent=(
#                     "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
#                     "AppleWebKit/537.36 (KHTML, like Gecko) "
#                     "Chrome/121.0.0.0 Safari/537.36"
#                 )
#             )
#             page = await context.new_page()
#             await page.goto("https://crimegrade.org/", timeout=60000)

#             zip_input = page.get_by_placeholder("Zip code")
#             await zip_input.click()
#             await zip_input.fill(zipcode)

#             await page.get_by_role("button", name="Explore").click()
#             # await page.wait_for_timeout(2000)

#             grade_el = (
#                 page.locator("text=Overall Crime Grade™")
#                 .locator("xpath=preceding-sibling::*[1]")
#             )
#             await grade_el.wait_for(state="visible", timeout=20000)
#             grade = await grade_el.inner_text()
#             grade = grade.strip()

#             await browser.close()
#             CRIME_DICT[zipcode] = grade
#             print(f"Crime for {zipcode}: {grade}")
#             return GRADE_TO_SCORE.get(grade, 0.0)

#     except (PlaywrightTimeoutError, Exception) as e:
#         print(f"Failed to get crime grade for {zipcode}: {e}")
#         fallback_grade = "C+"  # default fallback
#         CRIME_DICT[zipcode] = fallback_grade
#         return GRADE_TO_SCORE.get(fallback_grade, 0.0)


async def get_crime_score(zipcode: str, context) -> float:
    # 1. Check Cache first
    if zipcode in CRIME_DICT:
        return GRADE_TO_SCORE.get(CRIME_DICT[zipcode], 0.0)

    page = None
    try:
        # 2. OPEN A NEW TAB (Lightweight)
        # We use the context passed in, rather than launching a whole new browser
        page = await context.new_page()
        
        # 3. YOUR EXISTING LOGIC
        await page.goto("https://crimegrade.org/", timeout=60000)

        # Optimization: Wait for selector to be ready before clicking
        zip_input = page.get_by_placeholder("Zip code")
        await zip_input.click()
        await zip_input.fill(zipcode)

        await page.get_by_role("button", name="Explore").click()
        
        # Wait for the result to appear
        grade_el = (
            page.locator("text=Overall Crime Grade™")
            .locator("xpath=preceding-sibling::*[1]")
        )
        await grade_el.wait_for(state="visible", timeout=30000)
        
        grade = await grade_el.inner_text()
        grade = grade.strip()

        # 4. CLOSE THE TAB (Free up RAM)
        await page.close()

        CRIME_DICT[zipcode] = grade
        print(f"✅ Crime for {zipcode}: {grade}")
        return GRADE_TO_SCORE.get(grade, 0.0)

    except Exception as e:
        print(f"❌ Failed crime for {zipcode}: {e}")
        # Always close page on error to prevent leaks
        if page: await page.close()
        
        fallback = "C+"
        CRIME_DICT[zipcode] = fallback
        return GRADE_TO_SCORE.get(fallback, 0.0)


def convert_address_to_location(address: str):
    url = "https://nominatim.openstreetmap.org/search"
    headers = {
        "User-Agent": "SafetyMap/1.0 (contact: {EMAIL})"
    }

    # First, try full address geocoding
    params = {
        "q": address + ", USA",
        "format": "json",
        "addressdetails": 1,
        "limit": 3
    }

    resp = requests.get(url, params=params, headers=headers, timeout=10)

    try:
        data = resp.json()
    except Exception:
        data = []

    # if geocoding failed
    if not data:
        # Try to extract ZIP from the address
        zip_match = re.search(r"\b\d{5}(?:-\d{4})?\b", address)
        zip_code = zip_match.group(0) if zip_match else None

        lat = lon = None

        if zip_code:
            # Try geocoding ZIP code itself
            zip_params = {
                "q": zip_code + ", USA",
                "format": "json",
                "limit": 1
            }
            zip_resp = requests.get(url, params=zip_params, headers=headers, timeout=10)
            try:
                zip_data = zip_resp.json()
                if zip_data:
                    lat = float(zip_data[0]["lat"])
                    lon = float(zip_data[0]["lon"])
            except Exception:
                pass

        print(f"No full address match. Using ZIP: {zip_code} -> Lat: {lat}, Lon: {lon}")
        return zip_code, lat, lon

    # Normal successful case
    result = data[0]
    lat = float(result["lat"])
    lon = float(result["lon"])
    zip_code = result.get("address", {}).get("postcode")

    print(f"Geocoded Address: {address} -> ZIP: {zip_code}, Lat: {lat}, Lon: {lon}")
    return zip_code, lat, lon



def get_emergency_services( lat: float, lon: float) -> float:
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
        return -1

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

    return score

def shop_score(shops: list, lat: float, lon: float) -> float:
    score = 0.0
    for shop in shops:
        distance = haversine(shop["lat"], shop["lon"], lat, lon)
        if distance <= 5:
            score += 10.0
        elif distance <= 15:
            score += 5.0
        else:
            score += 2.0
    return score

def get_shops(lat: float, lon: float) -> float:
    overpass_query = f"""
        [out:json][timeout:25];
        (
        nwr["shop"="mall"](around:2000,{lat},{lon});
        nwr["shop"="supermarket"](around:2000,{lat},{lon});
        nwr["shop"="convenience"](around:2000,{lat},{lon});
        nwr["shop"="shopping_centre"](around:2000,{lat},{lon});
        );
    out body center;
    """

    try:
        overpass_res = requests.post("https://overpass-api.de/api/interpreter", data=overpass_query, timeout=30)
        overpass_res.raise_for_status()
        overpass_data = overpass_res.json()
    except Exception as e:
        print("Error fetching shops:", e)
        return -1
    
    shops = []

    for el in overpass_data.get("elements", []):
        element_lat = el.get("lat") or el.get("center", {}).get("lat")
        element_lon = el.get("lon") or el.get("center", {}).get("lon")
        
        if element_lat and element_lon:
            shops.append({
                "id": str(el["id"]),
                "name": el.get("tags", {}).get("name", "Unnamed"),
                "type": el.get("tags", {}).get("shop", "Unknown"),
                "lat": float(element_lat),
                "lon": float(element_lon),
                "address": el.get("tags", {}).get("addr:full") or 
                          f"{el.get('tags', {}).get('addr:street', '')} {el.get('tags', {}).get('addr:housenumber', '')}".strip() or None
            })
    print("Shops found:", shops)
    score = shop_score(shops, lat, lon)
    return score


def cafe_score(cafes: list, lat: float, lon: float) -> float:
    score = 0.0
    for cafe in cafes:
        distance = haversine(cafe["lat"], cafe["lon"], lat, lon)
        if distance <= 5:
            score += 10.0
        elif distance <= 15:
            score += 5.0
        else:
            score += 2.0
    return score

def get_cafes(lat: float, lon: float) -> float:
    overpass_query = f"""
        [out:json][timeout:25];
        (
        nwr["amenity"="cafe"](around:3000,{lat},{lon});
        nwr["amenity"="restaurant"](around:3000,{lat},{lon});
        nwr["amenity"="fast_food"](around:3000,{lat},{lon});

        );
    out body center;
    """

    try:
        overpass_res = requests.post("https://overpass-api.de/api/interpreter", data=overpass_query, timeout=30)
        overpass_res.raise_for_status()
        overpass_data = overpass_res.json()
    except Exception as e:
        print("Error fetching cafes:", e)
        return -1
    
    cafes = []
    for el in overpass_data.get("elements", []):
        element_lat = el.get("lat") or el.get("center", {}).get("lat")
        element_lon = el.get("lon") or el.get("center", {}).get("lon")
        
        if element_lat and element_lon:
            cafes.append({
                "id": str(el["id"]),
                "name": el.get("tags", {}).get("name", "Unnamed"),
                "type": el.get("tags", {}).get("amenity", "Unknown"),
                "lat": float(element_lat),
                "lon": float(element_lon),
                "address": el.get("tags", {}).get("addr:full") or 
                          f"{el.get('tags', {}).get('addr:street', '')} {el.get('tags', {}).get('addr:housenumber', '')}".strip() or None
            })
    print("Cafes found:", cafes)
    score = cafe_score(cafes, lat, lon)
    return score

def gym_score(gyms: list, lat: float, lon: float) -> float:
    score = 0.0
    for gym in gyms:
        distance = haversine(gym["lat"], gym["lon"], lat, lon)
        if distance <= 5:
            score += 10.0
        elif distance <= 15:
            score += 5.0
        else:
            score += 2.0
    return score

def get_gym(lat: float, lon: float) -> float:
    overpass_query = f"""
        [out:json][timeout:25];
        (
        nwr["leisure"="fitness_centre"](around:4500,{lat},{lon});
        nwr["leisure"="gym"](around:4500,{lat},{lon});
        nwr["sport"="fitness"](around:4500,{lat},{lon});
        );
    out body center;
    """

    try:
        overpass_res = requests.post("https://overpass-api.de/api/interpreter", data=overpass_query, timeout=30)
        overpass_res.raise_for_status()
        overpass_data = overpass_res.json()
    except Exception as e:
        print("Error fetching gyms:", e)
        return -1
    
    gyms = []
    for el in overpass_data.get("elements", []):
        element_lat = el.get("lat") or el.get("center", {}).get("lat")
        element_lon = el.get("lon") or el.get("center", {}).get("lon")
        
        if element_lat and element_lon:
            gyms.append({
                "id": str(el["id"]),
                "name": el.get("tags", {}).get("name", "Unnamed"),
                "type": el.get("tags", {}).get("leisure", "Unknown"),
                "lat": float(element_lat),
                "lon": float(element_lon),
                "address": el.get("tags", {}).get("addr:full") or 
                          f"{el.get('tags', {}).get('addr:street', '')} {el.get('tags', {}).get('addr:housenumber', '')}".strip() or None
            })
        
    print("Gyms found:", gyms)
    score = gym_score(gyms, lat, lon)
    return score


# @app.post("/updateAddress")
# async def get_address(request: Request):
#     data =  await request.json()
#     addresses=data.get("addresses")

#     final_results = []
#     for address in addresses:
#         tempDict = address
#         address_str = tempDict.get("address", "")
#         listing_price = tempDict.get("listing_price", "")
#         sqft = tempDict.get("sqft", "")
#         crime = tempDict.get("crime", "")
#         emprox = tempDict.get("emprox", "")
#         envwell = tempDict.get("envwell", "")
#         shop = tempDict.get("shop", "")
#         cafe = tempDict.get("cafe", "")
#         gym = tempDict.get("gym", "")

#         zip_code, lat, lon = convert_address_to_location(address_str)

#         # crime = await get_crime_score(zip_code)
#         crime = await get_crime_score(zip_code)

#         # emprox = get_emergency_services(lat, lon)
#         # envwell = get_wellness_score(zip_code, lat, lon)
#         # shop = get_shops(lat, lon)
#         # cafe = get_cafes(lat, lon)
#         # gym = get_gym(lat, lon)
#         tempDict["crime"] = crime
#         # tempDict["emprox"] = emprox
#         # tempDict["envwell"] = envwell
#         # tempDict["shop"] = shop
#         # tempDict["cafe"] = cafe
#         # tempDict["gym"] = gym
#         final_results.append(tempDict)
#     message = {
#         "results": final_results
#     }
#     return JSONResponse(content=message)

# @app.post("/updateAddress")
# async def get_address(request: Request):
#     # ... (get your data and make lists) ...

#     # --- LAUNCH BROWSER ONCE ---
#     async with async_playwright() as p:
#         browser = await p.chromium.launch(headless=True)
        
#         # Create the Context (Incognito window)
#         context = await browser.new_context(
#             user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64)..."
#         )

#         # --- RUN TASKS IN PARALLEL ---
#         # Notice we pass 'context' to the function now!
#         crime_tasks = [get_crime_score(zip, context) for zip in zip_list]
#         crime_results = await asyncio.gather(*crime_tasks)

#         await browser.close()
    
#     # ... (assign crime_results to your addresses) ...

@app.post("/updateAddress")
async def multithreading(request: Request):
    data =  await request.json()
    addresses=data.get("addresses")

    final_results = []
    
    tempDict = addresses
    
    address_str = []
    
    # listing_price_list = []
    # sqft_list = []
    
    crime_list = []
    # emprox_list = []
    # envwell_list = []
    # shop_list = []
    # cafe_list = []
    # gym_list = []
    zip_list = []
    lat_list = []
    lon_list = []
    
    
    for address in addresses:
        tempDict = address
        # address_str.append(tempDict.get("address", ""))
        # listing_price_list.append(tempDict.get("listing_price", ""))
        # sqft_list.append(tempDict.get("sqft", ""))
        
        # # crime = tempDict.get("crime", "")
        # emprox_list.append(tempDict.get("emprox", ""))
        # envwell_list.append(tempDict.get("envwell", ""))
        # shop_list.append(tempDict.get("shop", ""))
        # cafe_list.append(tempDict.get("cafe", ""))
        # gym_list.append(tempDict.get("gym", ""))
        
        zip_code, lat, lon = convert_address_to_location(tempDict.get("address", ""))
        zip_list.append(zip_code)
        lat_list.append(lat)
        lon_list.append(lon)
        
        # crime = await get_crime_score(zip_code)
        # crime = get_crime_score(zip_code)
        # crime_list.append(crime)
        
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        
        # Create the Context (Incognito window)
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64)..."
        )

        # --- RUN TASKS IN PARALLEL ---
        # Notice we pass 'context' to the function now!
        crime_tasks = [get_crime_score(zip, context) for zip in zip_list]
        crime_list = await asyncio.gather(*crime_tasks)

        await browser.close()
        
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
        # address_results = list(executor.map(get_crime_score, zip_list))
        emprox_results = list(executor.map(get_emergency_services, lat_list, lon_list))
        envwell_results = list(executor.map(get_wellness_score, zip_list, lat_list, lon_list))
        shop_results = list(executor.map(get_shops, lat_list, lon_list))
        cafe_results = list(executor.map(get_cafes, lat_list, lon_list))
        gym_results = list(executor.map(get_gym, lat_list, lon_list))
        
        for i in range(len(emprox_results)):
            # final_results.append({"address": address_str[i], "listing_price": listing_price_list[i], "sqft": sqft_list[i], "crime": crime_list[i], "emprox": emprox_results[i], "envwell": envwell_results[i], "shop": shop_results[i], "cafe": cafe_results[i], "gym": gym_results[i]})
            addresses[i]["crime"] = crime_list[i]
            addresses[i]["emprox"] = emprox_results[i]
            addresses[i]["envwell"] = envwell_results[i]
            addresses[i]["shop"] = shop_results[i]
            addresses[i]["cafe"] = cafe_results[i]
            addresses[i]["gym"] = gym_results[i]
    
    message = {
        "results": addresses
    }
    return JSONResponse(content=message)

if __name__ == '__main__': # For testing onlyyyy
    EXAMPLE_INPUT = {
        "address": "601 Matthew Ct, Braintree, MA 02184",
        "listing_price": "$560,000",
        "sqft": "1,493",
        "crime": "",
        "emprox": "",
        "envwell": "",
        "shop": "",
        "cafe": "",
        "gym": ""
    }
    # 8276 Traveller St, Chino, CA 91708
    #get_address(EXAMPLE_INPUT)
    asyncio.run(get_crime_score("02184"))
    
    
    
    
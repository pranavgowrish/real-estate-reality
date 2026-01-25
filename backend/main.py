import fastapi
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import requests
import time
from math import radians, sin, cos, sqrt, atan2
from playwright.sync_api import sync_playwright, TimeoutError


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


# def get_wellness_score(data):
    # data is gonna be the variable holding csv file US_AQI.csv
    # ONLY EXTRACT CITIES IN CALIFORNIA - THEN SINCE THERE IS MULTIPLE DATES FOR EACH CITY, AVERAGE ALL 
    # extract values per city and based on address given, see how far city listed in dataset is and if its less than 50, use that AQI value
    # other approach: use geopy to get the distance between the address given and the city listed in the dataset

    # 0-50: good  --> 30 pts
    # 51-100: moderate --> 25 pts
    # 101-150: unhealthy for sensitive groups --> 20 pts
    # 151-200: unhealthy --> 5 pts
    # 201-300: very unhealthy --> 0 pts
    # 301-500: hazardous --> 0 pts

    # return the total points as a score out of 100
    


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


def get_crime_score(zipcode: str) -> float:
    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            args=["--disable-blink-features=AutomationControlled"]
        )

        context = browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/121.0.0.0 Safari/537.36"
            )
        )

        page = context.new_page()
        page.goto("https://crimegrade.org/", timeout=60000)

        zip_input = page.get_by_placeholder("Zip code")
        zip_input.click()
        zip_input.type(zipcode, delay=120)

        page.get_by_role("button", name="Explore").click()

        page.wait_for_timeout(2000)

        grade_el = (
            page.locator("text=Overall Crime Grade™")
            .locator("xpath=preceding-sibling::*[1]")
        )

        grade_el.wait_for(state="visible", timeout=20000)
        grade = grade_el.inner_text().strip()

        browser.close()
        print(f"Grade: {grade}")
        return GRADE_TO_SCORE.get(grade, 0.0)

    
if __name__ == '__main__': # For testing onlyyyy
    get_crime_score("92691")


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

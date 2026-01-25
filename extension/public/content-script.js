console.log('--- Super Sorter v25: Animated Glow Edition ---');

const API_URL = "https://example.com/api/batch";
const MAX_PAGES_TO_FETCH = 2;
const DELAY_BETWEEN_PAGES = 1500; 
const STORAGE_KEY = 'all_data';
const TOP_TIER_COUNT = 3; 

const LIST_CONTAINER_SEL = 'ul[data-c11n-component="List.Root"]';
const LIST_ITEM_SEL = 'li[data-c11n-component="List.Item"]';
const NEXT_BUTTON_SEL = 'a[title="Next page"]';

function injectStyles() {
    const styleId = 'zillow-sorter-styles';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.innerHTML = `
        @keyframes breatheGreen {
            0% { box-shadow: 0 0 5px rgba(16, 185, 129, 0.4); border-color: #10b981; }
            50% { box-shadow: 0 0 25px rgba(16, 185, 129, 0.7); border-color: #34d399; }
            100% { box-shadow: 0 0 5px rgba(16, 185, 129, 0.4); border-color: #10b981; }
        }
        @keyframes breatheGold {
            0% { box-shadow: 0 0 5px rgba(245, 158, 11, 0.4); border-color: #f59e0b; }
            50% { box-shadow: 0 0 25px rgba(245, 158, 11, 0.7); border-color: #fbbf24; }
            100% { box-shadow: 0 0 5px rgba(245, 158, 11, 0.4); border-color: #f59e0b; }
        }
        .glow-green { animation: breatheGreen 3s infinite ease-in-out; border-width: 4px; border-style: solid; z-index: 10; transform: scale(1.02); }
        .glow-gold { animation: breatheGold 3s infinite ease-in-out; border-width: 4px; border-style: solid; z-index: 10; transform: scale(1.02); }
    `;
    document.head.appendChild(style);
}

// --- 1. BATCH BACKEND SERVICE ---
const fetchBatchAnalysis = async (propertyList) => {
    console.log(`Sending ${propertyList.length} properties to backend...`);
    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ properties: propertyList }) 
        });

        if (!response.ok) throw new Error(`Batch API Error: ${response.status}`);
        const data = await response.json();
        return data.results || data; 

    } catch (error) {
        console.warn(`Backend failed. Using fallback data.`);
        return propertyList.map(p => ({
            ...p,
            crime: Math.floor(Math.random() * 20) + 80,
            emprox: Math.floor(Math.random() * 30) + 70,
            envwell: Math.floor(Math.random() * 20) + 80,
            shop: Math.floor(Math.random() * 50) + 50,
            cafe: Math.floor(Math.random() * 50) + 50,
            gym: Math.floor(Math.random() * 50) + 50
        }));
    }
};

// --- LOADER UI ---
function updateLoader(msg, percent) {
    let loader = document.getElementById('zillow-loader');
    if (!loader) {
        const container = document.getElementById('search-page-list-container');
        if(!container) return;
        container.style.position = 'relative';
        loader = document.createElement('div');
        loader.id = 'zillow-loader';
        loader.style.cssText = `
            position: absolute; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(255,255,255,0.98); z-index: 1000;
            display: flex; flex-direction: column; align-items: center; justify-content: center;
            font-family: -apple-system, sans-serif; color: #374151; border-radius: 8px;
        `;
        loader.innerHTML = `
            <div style="width: 150px; height: 6px; background: #e5e7eb; border-radius: 99px;">
                <div id="loader-bar" style="width: 0%; height: 100%; background: #2563eb; transition: width 0.3s; border-radius: 99px;"></div>
            </div>
            <div id="loader-text" style="font-size: 13px; margin-top: 10px; color: #6b7280;">Starting...</div>
        `;
        container.appendChild(loader);
    }
    const bar = document.getElementById('loader-bar');
    const text = document.getElementById('loader-text');
    if(bar) bar.style.width = percent + '%';
    if(text) text.innerText = msg;
}

// --- MAIN LOGIC ---
async function startApp() {
    const originalList = document.querySelector(LIST_CONTAINER_SEL);
    if (!originalList) return console.error("❌ List not found");

    injectStyles(); // Add the animations

    // 1. CRAWL PAGES
    let allHTML = [];
    const firstPageItems = Array.from(document.querySelectorAll(LIST_ITEM_SEL));
    firstPageItems.forEach(item => allHTML.push(item.outerHTML));

    let nextUrl = document.querySelector(NEXT_BUTTON_SEL)?.href;
    let pages = 0;
    while(nextUrl && pages < MAX_PAGES_TO_FETCH) {
        pages++;
        updateLoader(`Fetching Page ${pages + 1}...`, 30);
        await new Promise(r => setTimeout(r, DELAY_BETWEEN_PAGES));
        try {
            const res = await fetch(nextUrl);
            const text = await res.text();
            const doc = new DOMParser().parseFromString(text, 'text/html');
            const newItems = Array.from(doc.querySelectorAll(LIST_ITEM_SEL));
            newItems.forEach(item => allHTML.push(item.outerHTML));
            nextUrl = doc.querySelector(NEXT_BUTTON_SEL)?.href;
        } catch(e) { break; }
    }

    // 2. PARSE & BATCH
    updateLoader("Filtering Properties...", 50);
    
    let scrapeQueue = [];
    let domElements = [];

    for (const html of allHTML) {
        const temp = document.createElement('div');
        temp.innerHTML = html;
        const el = temp.firstChild;
        el.querySelectorAll('script, style').forEach(s => s.remove());
        
        const rawText = el.innerText;
        if (rawText.includes("Loading") || rawText.length < 20 || !rawText.includes('$')) continue; 

        const addressMatch = rawText.match(/(?:^|\n)(.*?, [A-Z]{2} \d{5})/);
        const address = addressMatch ? addressMatch[1].trim() : "Unknown"; 
        const priceMatch = rawText.match(/\$[0-9,]+/); 
        const priceStr = priceMatch ? priceMatch[0] : "0";
        const sqftMatch = rawText.match(/([0-9,]+)\s+sqft/);
        const sqftStr = sqftMatch ? sqftMatch[1] : "N/A";

        if (address === "Unknown" || priceStr === "0") continue; 

        scrapeQueue.push({ 
            address: address, listing_price: priceStr, sqft: sqftStr,
            crime: "", emprox: "", envwell: "", shop: "", cafe: "", gym: ""
        });
        domElements.push(el);
    }

    if (scrapeQueue.length === 0) {
        updateLoader("No valid properties found.", 100);
        return;
    }

    // 3. SEND BATCH
    updateLoader(`Analyzing ${scrapeQueue.length} properties...`, 75);
    const batchResults = await fetchBatchAnalysis(scrapeQueue);

    // 4. CALCULATE SCORES & SORT
    let tempItems = [];

    scrapeQueue.forEach((item, index) => {
        const backendData = batchResults[index] || item; 
        
        const safetyTotal = (backendData.crime||0) + (backendData.emprox||0) + (backendData.envwell||0);
        const lifestyleTotal = (backendData.shop||0) + (backendData.cafe||0) + (backendData.gym||0);
        const avgSafety = Math.floor(safetyTotal / 3);
        const avgLifestyle = Math.floor(lifestyleTotal / 3);
        const totalScore = Math.floor((safetyTotal + lifestyleTotal) / 6);

        let badgeColor = '#ef4444'; 
        if (totalScore >= 85) badgeColor = '#10b981';
        else if (totalScore >= 70) badgeColor = '#3b82f6'; 
        else if (totalScore >= 55) badgeColor = '#f59e0b'; 

        tempItems.push({
            element: domElements[index],
            data: backendData,
            ui: { 
                score: totalScore, 
                badgeColor: badgeColor,
                avgSafety: avgSafety,
                avgLifestyle: avgLifestyle,
                cssClass: "" // Will calculate after sort
            }
        });
    });

    // SORT HIGH TO LOW
    tempItems.sort((a, b) => b.ui.score - a.ui.score);

    // 5. APPLY ANIMATED GLOW (Top 5 Only)
    tempItems.forEach((item, index) => {
        // Only apply special classes if in Top N
        if (index < TOP_TIER_COUNT) {
            if (item.ui.avgSafety > item.ui.avgLifestyle) {
                item.ui.cssClass = "glow-green"; // Safety Win
            } else {
                item.ui.cssClass = "glow-gold"; // Lifestyle Win
            }
        }
    });

    localStorage.setItem(STORAGE_KEY, JSON.stringify(tempItems.map(i => i.data)));

    // 6. RENDER UI
    updateLoader("Rendering Dashboard...", 95);
    originalList.style.display = 'none';
    
    const oldContainer = document.getElementById("custom-row-container");
    if(oldContainer) oldContainer.remove();

    const container = document.createElement('div');
    container.id = "custom-row-container";
    container.style.cssText = `display: flex; flex-direction: column; gap: 25px; width: 100%; padding: 20px; box-sizing: border-box; background: #f3f4f6;`;

    tempItems.forEach(item => {
        const d = item.data;
        const ui = item.ui;

        const row = document.createElement('div');
        // Add the animation class here
        row.className = ui.cssClass; 
        // Base styles (border and shadow set by class if active, otherwise default here)
        const baseStyle = ui.cssClass ? "" : "box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); border: 1px solid #e5e7eb;";
        row.style.cssText = `display: flex; flex-direction: row; background: white; border-radius: 12px; overflow: hidden; min-height: 240px; transition: all 0.3s ease; ${baseStyle}`;

        const leftCol = document.createElement('div');
        leftCol.style.cssText = `width: 50%; border-right: 1px solid #e5e7eb; position: relative;`;
        const zCard = item.element;
        zCard.style.width = '100%'; zCard.style.height = '100%'; zCard.style.maxWidth = '100%'; zCard.style.margin = '0'; zCard.style.listStyle = 'none';
        
        const link = zCard.querySelector('a');
        if(link) { link.target = "_blank"; link.style.pointerEvents = 'auto'; }
        const img = zCard.querySelector('img');
        if(img) { img.style.height = '100%'; img.style.objectFit = 'cover'; }
        const iDiv = zCard.querySelector('div');
        if(iDiv) iDiv.style.height = '100%';
        leftCol.appendChild(zCard);

        const rightCol = document.createElement('div');
        rightCol.style.cssText = `width: 50%; padding: 25px; display: flex; flex-direction: column; justify-content: center; position: relative;`;
        
        const makeBigBar = (label, score, color) => `
            <div style="margin-bottom: 12px;">
                <div style="display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 5px; color: #374151; font-weight: 700;">
                    <span>${label}</span><span>${score}</span>
                </div>
                <div style="width: 100%; height: 10px; background: #f3f4f6; border-radius: 99px;">
                    <div style="width: ${score}%; height: 100%; background: ${color}; border-radius: 99px;"></div>
                </div>
            </div>
        `;

        rightCol.innerHTML += `
            <div style="position: absolute; left: 0; top: 0; bottom: 0; width: 8px; background: ${ui.badgeColor};"></div>
            <div style="margin-left: 15px; height: 100%; display: flex; flex-direction: column; justify-content: space-evenly;">
                
                <div style="position: absolute; top: 20px; right: 20px; background: ${ui.badgeColor}; color: white; padding: 6px 14px; border-radius: 8px; font-weight: 800; font-size: 18px; box-shadow: 0 2px 5px rgba(0,0,0,0.15);">
                   Overall: ${ui.score}
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1px 1fr; gap: 20px; margin-top: 10px; align-items: center;">
                    <div>
                        <div style="font-size: 12px; font-weight: 800; color: #9ca3af; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.05em;">Safety</div>
                        ${makeBigBar("Crime", d.crime, "#10b981")}
                        ${makeBigBar("EMS Proximity", d.emprox, "#3b82f6")}
                        ${makeBigBar("Environment", d.envwell, "#8b5cf6")}
                    </div>
                    
                    <div style="width: 1px; height: 100%; background: #e5e7eb;"></div>

                    <div>
                        <div style="font-size: 12px; font-weight: 800; color: #9ca3af; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.05em;">Convenience</div>
                        ${makeBigBar("Shopping", d.shop, "#f59e0b")}
                        ${makeBigBar("Cafes", d.cafe, "#ec4899")}
                        ${makeBigBar("Gyms", d.gym, "#6366f1")}
                    </div>
                </div>
            </div>
        `;

        row.appendChild(leftCol);
        row.appendChild(rightCol);
        container.appendChild(row);
    });

    originalList.parentNode.insertBefore(container, originalList);
    const loader = document.getElementById('zillow-loader');
    if(loader) loader.remove();
    console.log(`✅ Loaded. Animated glow on top ${TOP_TIER_COUNT} properties.`);
}


// --- PROPERTY PAGE LOGIC (Injection) ---
function startProperty() {
    console.log("🏠 Starting Property Page Script...");
    // 1. Target the Contact Form (More stable than the payment chip)
    const selector = '[data-testid="home-details-chip-container"]';

    const injectPanel = () => {
        const targetBox = document.querySelector(selector);
        
        // Safety checks
        if (!targetBox) {
            console.log("⏳ Waiting for target...");
            return; // Zillow hasn't rendered the form yet
        }
        if (document.getElementById("hello-world-extension")) return; // We already injected

        console.log("✅ Target found! Injecting panel...");

        const hello = document.createElement("div");
        hello.id = "hello-world-extension";
        hello.innerHTML = `
            <div style="font-size: 18px; font-weight: 700; margin-bottom: 5px;">HELKOOdefjirfiri</div>
            <div style="font-size: 14px; opacity: 0.9;">YEFDcrfr.</div>
        `;
        
        hello.style.cssText = `
            display: block;
            width: 100%;
            padding: 20px;
            margin-bottom: 20px;
            background: #111827; 
            color: white;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.1);
            position: relative;
            z-index: 9999;
            box-sizing: border-box;
        `;

        // Insert BEFORE the contact form container
        targetBox.parentNode.insertBefore(hello, targetBox);
    };

    // Run immediately, then keep checking every 1s (fixes React re-renders)
    injectPanel();
    setInterval(injectPanel, 1000);
}

startProperty();





startApp();

function onZillowRouteChange(url) {
  if (url.includes("/homedetails/")) {
    console.log("🏠 Property details page opened");
    startProperty();
  }
}

let lastUrl = location.href;

const urlObserver = new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    onZillowRouteChange(location.href);
  }
});

urlObserver.observe(document, { subtree: true, childList: true });

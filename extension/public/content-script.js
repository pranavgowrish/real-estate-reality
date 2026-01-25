console.log('--- Super Sorter v28: Multi-Page Rent Scraper ---');

// --- CONFIGURATION ---
const API_URL = "https://example.com/api/batch"; 
const MAX_PAGES_TO_FETCH = 3; // <--- Set to 3 Pages
const DELAY_BETWEEN_PAGES = 1500; 
const STORAGE_KEY = 'all_data';
const TOP_TIER_COUNT = 3; 

const LIST_CONTAINER_SEL = 'ul[data-c11n-component="List.Root"]';
const LIST_ITEM_SEL = 'li[data-c11n-component="List.Item"]';
const NEXT_BUTTON_SEL = 'a[title="Next page"]';

// --- CSS STYLES ---
function injectStyles() {
    const styleId = 'zillow-sorter-styles';
    if (document.getElementById(styleId)) return;
    const style = document.createElement('style');
    style.id = styleId;
    style.innerHTML = `
        @keyframes breatheGreen { 0% { box-shadow: 0 0 5px rgba(16,185,129,0.4); border-color:#10b981;} 50% { box-shadow: 0 0 25px rgba(16,185,129,0.7); border-color:#34d399;} 100% { box-shadow: 0 0 5px rgba(16,185,129,0.4); border-color:#10b981;} }
        @keyframes breatheGold { 0% { box-shadow: 0 0 5px rgba(245,158,11,0.4); border-color:#f59e0b;} 50% { box-shadow: 0 0 25px rgba(245,158,11,0.7); border-color:#fbbf24;} 100% { box-shadow: 0 0 5px rgba(245,158,11,0.4); border-color:#f59e0b;} }
        .glow-green { animation: breatheGreen 3s infinite ease-in-out; border-width: 4px; border-style: solid; z-index: 10; transform: scale(1.02); }
        .glow-gold { animation: breatheGold 3s infinite ease-in-out; border-width: 4px; border-style: solid; z-index: 10; transform: scale(1.02); }
    `;
    document.head.appendChild(style);
}

// --- HELPER: SLEEP ---
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// --- 1. SCRAPER: RENT ZESTIMATE ---
async function scrapeHiddenPage(url) {
    if (!url) return null;
    try {
        const response = await fetch(url);
        const htmlText = await response.text();
        const regex = /rentZestimate\D+(\d+)/; 
        const match = htmlText.match(regex);
        return match && match[1] ? parseInt(match[1]) : null;
    } catch (err) {
        return null;
    }
}

// --- 2. SCRAPER: BATCH RENT FETCH ---
async function fetchMarketPrices(urls) {
    console.log(`🕵️ Scraper: Fetching ${urls.length} hidden Rent Zestimates...`);
    const promises = urls.map(async (url, index) => {
        // Stagger requests to be gentle
        await sleep(index * 300); 
        const rent = await scrapeHiddenPage(url);
        return rent; 
    });
    return Promise.all(promises);
}

// --- 3. API: BATCH BACKEND ---
const fetchBatchAnalysis = async (propertyList) => {
    console.log(`📡 API: Sending ${propertyList.length} items to backend...`);
    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ properties: propertyList }) 
        });
        if (!response.ok) throw new Error("API Error");
        const data = await response.json();
        return data.results || data; 
    } catch (error) {
        console.warn("Backend failed. Using fallback.");
        return propertyList.map(p => ({ ...p, crime: 90, emprox: 80, envwell: 85, shop: 60, cafe: 60, gym: 60 }));
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
        loader.style.cssText = `position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(255,255,255,0.98); z-index: 1000; display: flex; flex-direction: column; align-items: center; justify-content: center; font-family: sans-serif; color: #374151;`;
        loader.innerHTML = `<div style="width: 150px; height: 6px; background: #e5e7eb; border-radius: 99px;"><div id="loader-bar" style="width: 0%; height: 100%; background: #2563eb; transition: width 0.3s; border-radius: 99px;"></div></div><div id="loader-text" style="font-size: 13px; margin-top: 10px;">Starting...</div>`;
        container.appendChild(loader);
    }
    document.getElementById('loader-bar').style.width = percent + '%';
    document.getElementById('loader-text').innerText = msg;
}


// --- MAIN SEARCH LOGIC ---
async function startApp() {
    const originalList = document.querySelector(LIST_CONTAINER_SEL);
    if (!originalList) return; 

    injectStyles();

    // ============================================================
    // 1. CRAWL MULTIPLE PAGES (The Fix)
    // ============================================================
    let allHTML = [];
    
    // Step A: Get visible items from Page 1
    const firstPageItems = Array.from(document.querySelectorAll(LIST_ITEM_SEL));
    firstPageItems.forEach(item => allHTML.push(item.outerHTML));

    // Step B: Loop to fetch Next Pages
    let nextUrl = document.querySelector(NEXT_BUTTON_SEL)?.href;
    let pages = 0;
    
    while(nextUrl && pages < (MAX_PAGES_TO_FETCH - 1)) {
        pages++;
        updateLoader(`Fetching Page ${pages + 1}...`, 30);
        await new Promise(r => setTimeout(r, DELAY_BETWEEN_PAGES));
        
        try {
            const res = await fetch(nextUrl);
            const text = await res.text();
            const doc = new DOMParser().parseFromString(text, 'text/html');
            
            // Extract items from the hidden page
            const newItems = Array.from(doc.querySelectorAll(LIST_ITEM_SEL));
            newItems.forEach(item => allHTML.push(item.outerHTML));
            
            // Prepare for next loop
            nextUrl = doc.querySelector(NEXT_BUTTON_SEL)?.href;
        } catch(e) { 
            console.warn("Pagination ended or failed");
            break; 
        }
    }

    // ============================================================
    // 2. PARSE ALL COLLECTED HTML
    // ============================================================
    updateLoader(`Parsing ${allHTML.length} Properties...`, 50);
    
    let scrapeQueue = [];   // Data for API
    let scrapeUrls = [];    // URLs for Rent Scraper
    let domElements = [];   // DOM Elements to show

    for (const html of allHTML) {
        const temp = document.createElement('div');
        temp.innerHTML = html;
        const el = temp.firstChild;
        el.querySelectorAll('script, style').forEach(s => s.remove());
        const rawText = el.innerText;
        
        if (rawText.includes("Loading") || rawText.length < 20 || !rawText.includes('$')) continue;

        // Parse Fields
        const address = (rawText.match(/(?:^|\n)(.*?, [A-Z]{2} \d{5})/) || [])[1]?.trim() || "Unknown";
        const priceStr = (rawText.match(/\$[0-9,]+/) || ["0"])[0];
        const sqftStr = (rawText.match(/([0-9,]+)\s+sqft/) || [null, "N/A"])[1];
        
        // Find Link for Rent Scraper
        const linkEl = el.querySelector('a[data-test="property-card-link"]') || el.querySelector('a');
        const url = linkEl ? linkEl.href : null;

        if (address !== "Unknown" && priceStr !== "0") {
            scrapeQueue.push({ address, listing_price: priceStr, sqft: sqftStr });
            scrapeUrls.push(url); // Collect URLs from ALL pages here
            domElements.push(el);
        }
    }

    if (scrapeQueue.length === 0) { updateLoader("No properties found.", 100); return; }

    // ============================================================
    // 3. PARALLEL EXECUTION: API + MULTI-PAGE RENT SCRAPER
    // ============================================================
    updateLoader(`Analyzing ${scrapeQueue.length} items (Rent + AI)...`, 60);
    
    // Now scrapeUrls contains URLs from Page 1, 2, 3...
    const [apiResults, rentResults] = await Promise.all([
        fetchBatchAnalysis(scrapeQueue), 
        fetchMarketPrices(scrapeUrls)    
    ]);

    // ============================================================
    // 4. MERGE & CALCULATE
    // ============================================================
    let finalItems = [];

    scrapeQueue.forEach((item, index) => {
        const backendData = apiResults[index] || item; 
        const rentZestimate = rentResults[index]; 

        backendData.rentZestimate = rentZestimate;

        const safetyTotal = (backendData.crime||0) + (backendData.emprox||0) + (backendData.envwell||0);
        const lifestyleTotal = (backendData.shop||0) + (backendData.cafe||0) + (backendData.gym||0);
        const avgSafety = safetyTotal / 3;
        const avgLife = lifestyleTotal / 3;
        const totalScore = Math.floor((safetyTotal + lifestyleTotal) / 6);

        let badgeColor = totalScore >= 85 ? '#10b981' : (totalScore >= 70 ? '#3b82f6' : '#f59e0b');

        finalItems.push({
            element: domElements[index],
            data: backendData,
            ui: { score: totalScore, badgeColor, avgSafety, avgLife, cssClass: "" }
        });
    });

    finalItems.sort((a, b) => b.ui.score - a.ui.score);

    finalItems.forEach((item, index) => {
        if (index < TOP_TIER_COUNT) {
            item.ui.cssClass = item.ui.avgSafety > item.ui.avgLife ? "glow-green" : "glow-gold";
        }
    });

    // ============================================================
    // 5. RENDER UI
    // ============================================================
    updateLoader("Rendering...", 90);
    originalList.style.display = 'none';
    const existing = document.getElementById("custom-row-container");
    if(existing) existing.remove();

    const container = document.createElement('div');
    container.id = "custom-row-container";
    container.style.cssText = `display: flex; flex-direction: column; gap: 25px; width: 100%; padding: 20px; box-sizing: border-box; background: #f3f4f6;`;

    finalItems.forEach(item => {
        const d = item.data;
        const ui = item.ui;
        const row = document.createElement('div');
        row.className = ui.cssClass; 
        row.style.cssText = `display: flex; flex-direction: row; background: white; border-radius: 12px; overflow: hidden; min-height: 240px; ${!ui.cssClass ? 'border:1px solid #e5e7eb; box-shadow:0 4px 6px -1px rgba(0,0,0,0.1);' : ''}`;

        const leftCol = document.createElement('div');
        leftCol.style.cssText = `width: 50%; border-right: 1px solid #e5e7eb;`;
        const zCard = item.element;
        zCard.style.cssText = "width:100%; height:100%; margin:0; list-style:none;";
        leftCol.appendChild(zCard);

        const rightCol = document.createElement('div');
        rightCol.style.cssText = `width: 50%; padding: 25px; display: flex; flex-direction: column; justify-content: center; position: relative;`;
        
        const makeBigBar = (label, score, color) => `
            <div style="margin-bottom: 12px;">
                <div style="display: flex; justify-content: space-between; font-size: 13px; font-weight: 700; color: #374151;"><span>${label}</span><span>${score}</span></div>
                <div style="width: 100%; height: 10px; background: #f3f4f6; border-radius: 99px;"><div style="width: ${score}%; height: 100%; background: ${color}; border-radius: 99px;"></div></div>
            </div>`;

        rightCol.innerHTML += `
            <div style="position: absolute; left: 0; top: 0; bottom: 0; width: 8px; background: ${ui.badgeColor};"></div>
            <div style="margin-left: 15px; height: 100%; display: flex; flex-direction: column; justify-content: space-evenly;">
                <div style="position: absolute; top: 20px; right: 20px; background: ${ui.badgeColor}; color: white; padding: 6px 14px; border-radius: 8px; font-weight: 800; font-size: 18px; box-shadow: 0 2px 5px rgba(0,0,0,0.15);">
                   Overall: ${ui.score}
                </div>
                
                <div style="font-size: 14px; color: #4b5563; font-weight: 600; margin-bottom: 10px;">
                    Rent Estimate: <span style="color: #2563eb; font-size: 16px;">${d.rentZestimate ? '$'+d.rentZestimate+'/mo' : 'N/A'}</span>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1px 1fr; gap: 20px; align-items: center;">
                    <div>
                        <div style="font-size: 12px; font-weight: 800; color: #9ca3af; margin-bottom: 12px; text-transform: uppercase;">Safety</div>
                        ${makeBigBar("Crime", d.crime, "#10b981")}
                        ${makeBigBar("EMS", d.emprox, "#3b82f6")}
                        ${makeBigBar("Env", d.envwell, "#8b5cf6")}
                    </div>
                    <div style="width: 1px; height: 100%; background: #e5e7eb;"></div>
                    <div>
                        <div style="font-size: 12px; font-weight: 800; color: #9ca3af; margin-bottom: 12px; text-transform: uppercase;">Convenience</div>
                        ${makeBigBar("Shop", d.shop, "#f59e0b")}
                        ${makeBigBar("Cafe", d.cafe, "#ec4899")}
                        ${makeBigBar("Gym", d.gym, "#6366f1")}
                    </div>
                </div>
            </div>`;
        
        row.appendChild(leftCol);
        row.appendChild(rightCol);
        container.appendChild(row);
    });

    originalList.parentNode.insertBefore(container, originalList);
    const loader = document.getElementById('zillow-loader');
    if(loader) loader.remove();
}


// --- PROPERTY PAGE LOGIC ---
function startProperty() {
    const selector = '[data-testid="contact-agent-form"]'; 
    const injectPanel = () => {
        const targetBox = document.querySelector(selector);
        if (!targetBox || document.getElementById("hello-world-extension")) return;
        const hello = document.createElement("div");
        hello.id = "hello-world-extension";
        hello.innerHTML = `<div style="font-size: 18px; font-weight: 700;">AI Analysis</div><div>Ready.</div>`;
        hello.style.cssText = `padding: 20px; margin-bottom: 20px; background: #111827; color: white; border-radius: 8px;`;
        targetBox.parentNode.insertBefore(hello, targetBox);
    };
    injectPanel();
    setInterval(injectPanel, 1000);
}
startApp();

// --- ROUTER ---
function initMasterController() {
    const url = window.location.href;
    if (url.includes("/homedetails/")) startProperty();
}

let lastUrl = location.href;
new MutationObserver(() => {
    if (location.href !== lastUrl) {
        lastUrl = location.href;
        setTimeout(initMasterController, 2000);
    }
}).observe(document, { subtree: true, childList: true });

setTimeout(initMasterController, 1000);
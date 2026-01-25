console.log('--- Super Sorter v30: Capped Scoring Edition ---');

// --- CONFIGURATION ---
const API_URL = "http://127.0.0.1:8000/updateAddress"; 
const MAX_PAGES_TO_FETCH = 1;
const DELAY_BETWEEN_PAGES = 1500; 
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

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// --- SCRAPERS ---
async function scrapeHiddenPage(url) {
    if (!url) return null;
    try {
        const response = await fetch(url);
        const htmlText = await response.text();
        const regex = /rentZestimate\D+(\d+)/; 
        const match = htmlText.match(regex);
        return match && match[1] ? parseInt(match[1]) : null;
    } catch (err) { return null; }
}

async function fetchMarketPrices(urls) {
    console.log(`🕵️ Scraper: Fetching ${urls.length} hidden Rent Zestimates...`);
    const promises = urls.map(async (url, index) => {
        await sleep(index * 300); 
        return await scrapeHiddenPage(url);
    });
    return Promise.all(promises);
}

// --- API ---
const fetchBatchAnalysis = async (propertyList) => {
    console.log(`📡 API: Sending ${propertyList.length} items to backend...`);
    try {
        const payload = { addresses: [propertyList[0]] }; 
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload) 
        });
        if (!response.ok) throw new Error("API Error");
        const data = await response.json();
        console.log("Backend Data:", data);
        return data.results || data; 
    } catch (error) {
        console.warn("Backend failed. Using fallback.");
        return propertyList.map(p => ({ ...p, crime: 90, emprox: 80, envwell: 85, shop: 60, cafe: 60, gym: 60 }));
    }
};

// --- MATH & SCORING HELPERS ---

function getROI(rent, purchase_price) {
    if (!rent || !purchase_price) return 0;
    const annual_income = rent * 12;
    const annual_expenses = (purchase_price * 0.0125) + 2000 + (rent * 0.1 * 12);
    const roi = (annual_income - annual_expenses) / purchase_price;
    console.log(`Calculated ROI: ${(roi * 100).toFixed(2)}% for rent $${rent} and price $${purchase_price}`);
    return roi * 100; 
}

// 1. Cap ROI at 15% so it doesn't break the scale
function normalizeROI(list) {
    return list.map(item => {
        // If ROI is > 15%, treat it as 1.0 (perfect score)
        // If ROI is < 0%, treat it as 0.0
        const capped = Math.min(Math.max(item, 0), 15);
        return capped / 15;
    });
}

// 2. Cap Scores at 100 so raw values don't inflate the average
function normalize(list) {
    return list.map(item => {
        // Cap value at 100 max, 0 min
        const capped = Math.min(Math.max(item, 0), 100); 
        return capped / 100; // Returns 0.0 - 1.0
    });
}

function getInvestmentScore(roi_list, safety_list, convenience_list) {
    const normalized_roi = normalizeROI(roi_list);
    const normalized_safety = normalize(safety_list);
    const normalized_convenience = normalize(convenience_list);
    
    const investment_scores = [];
    for(let i = 0; i < roi_list.length; i++) {
        // Weighted Average: 33% ROI, 33% Safety, 33% Convenience
        // Since inputs are capped 0.0-1.0, the sum cannot exceed 1.0
        const score = (normalized_roi[i] * (1/3)) + 
                      (normalized_safety[i] * (1/3)) + 
                      (normalized_convenience[i] * (1/3));
        investment_scores.push(score);
    }
    return investment_scores;
}

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

    // 1. CRAWL HTML
    let allHTML = [];
    const firstPageItems = Array.from(document.querySelectorAll(LIST_ITEM_SEL));
    firstPageItems.forEach(item => allHTML.push(item.outerHTML));

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
            const newItems = Array.from(doc.querySelectorAll(LIST_ITEM_SEL));
            newItems.forEach(item => allHTML.push(item.outerHTML));
            nextUrl = doc.querySelector(NEXT_BUTTON_SEL)?.href;
        } catch(e) { break; }
    }

    // 2. PARSE HTML
    updateLoader(`Parsing ${allHTML.length} Properties...`, 50);
    let scrapeQueue = [];   
    let scrapeUrls = [];    
    let domElements = [];   

    for (const html of allHTML) {
        const temp = document.createElement('div');
        temp.innerHTML = html;
        const el = temp.firstChild;
        el.querySelectorAll('script, style').forEach(s => s.remove());
        const rawText = el.innerText;
        
        if (rawText.includes("Loading") || rawText.length < 20 || !rawText.includes('$')) continue;

        const address = (rawText.match(/(?:^|\n)(.*?, [A-Z]{2} \d{5})/) || [])[1]?.trim() || "Unknown";
        // Fixed Regex for Price (stops at 3 digits after comma)
        const priceStr = (rawText.match(/\$[0-9]{1,3}(?:,[0-9]{3})*/) || ["0"])[0];
        const sqftStr = (rawText.match(/([0-9,]+)\s+sqft/) || [null, "N/A"])[1];
        
        const linkEl = el.querySelector('a[data-test="property-card-link"]') || el.querySelector('a');
        const url = linkEl ? linkEl.href : null;

        if (address !== "Unknown" && priceStr !== "0") {
            scrapeQueue.push({ address, listing_price: priceStr, sqft: sqftStr });
            scrapeUrls.push(url);
            domElements.push(el);
        }
    }

    if (scrapeQueue.length === 0) { updateLoader("No properties found.", 100); return; }

    // 3. FETCH DATA (API + RENT)
    updateLoader(`Analyzing ${scrapeQueue.length} items...`, 60);
    
    const [apiResults, rentResults] = await Promise.all([
        fetchBatchAnalysis(scrapeQueue), 
        fetchMarketPrices(scrapeUrls)    
    ]);

    // 4. PREPARE LISTS FOR SCORING
    let roiList = [];
    let safetyList = [];
    let convenienceList = [];
    
    let mergedData = scrapeQueue.map((item, index) => {
        const backendData = apiResults[index] || item;
        const rentZestimate = rentResults[index];
        const purchasePrice = parseInt(item.listing_price.replace(/[\$,]/g, '')) || 0;

        // Calculate raw ROI
        const calculatedROI = getROI(rentZestimate, purchasePrice);

        // Calculate Sub-scores
        const safetyTotal = (backendData.crime||0) + (backendData.emprox||0) + (backendData.envwell||0);
        const lifestyleTotal = (backendData.shop||0) + (backendData.cafe||0) + (backendData.gym||0);
        
        const avgSafety = safetyTotal / 3;
        const avgLife = lifestyleTotal / 3;

        // Push to lists for vector normalization
        roiList.push(calculatedROI);
        safetyList.push(avgSafety);
        convenienceList.push(avgLife);

        return {
            element: domElements[index],
            data: { ...backendData, rentZestimate, purchasePrice, calculatedROI },
            rawMetrics: { avgSafety, avgLife }
        };
    });

    // 5. CALCULATE FINAL INVESTMENT SCORE
    const investmentScores = getInvestmentScore(roiList, safetyList, convenienceList);

    // Second Pass: Assign Scores and Build UI Object
    let finalItems = mergedData.map((item, index) => {
        // Final score 0-100
        const finalScore = Math.floor(investmentScores[index] * 100);
        
        let badgeColor = finalScore >= 85 ? '#10b981' : (finalScore >= 70 ? '#3b82f6' : '#f59e0b');

        return {
            ...item,
            ui: { 
                score: finalScore, 
                badgeColor, 
                avgSafety: item.rawMetrics.avgSafety, 
                avgLife: item.rawMetrics.avgLife, 
                cssClass: "" 
            }
        };
    });

    // Sort by Investment Score
    finalItems.sort((a, b) => b.ui.score - a.ui.score);

    // Apply Glow to Top Tier
    finalItems.forEach((item, index) => {
        if (index < TOP_TIER_COUNT) {
            item.ui.cssClass = item.ui.avgSafety > item.ui.avgLife ? "glow-green" : "glow-gold";
        }
    });

    // 6. RENDER UI
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
                <div style="display: flex; justify-content: space-between; font-size: 13px; font-weight: 700; color: #374151;"><span>${label}</span><span>${Math.round(score)}</span></div>
                <div style="width: 100%; height: 10px; background: #f3f4f6; border-radius: 99px;"><div style="width: ${Math.min(score, 100)}%; height: 100%; background: ${color}; border-radius: 99px;"></div></div>
            </div>`;

        rightCol.innerHTML += `
            <div style="position: absolute; left: 0; top: 0; bottom: 0; width: 8px; background: ${ui.badgeColor};"></div>
            <div style="margin-left: 15px; height: 100%; display: flex; flex-direction: column; justify-content: space-evenly;">
                <div style="position: absolute; top: 20px; right: 20px; background: ${ui.badgeColor}; color: white; padding: 6px 14px; border-radius: 8px; font-weight: 800; font-size: 18px; box-shadow: 0 2px 5px rgba(0,0,0,0.15);">
                   Score: ${ui.score}
                </div>
                
                <div style="margin-bottom: 15px;">
                    <div style="font-size: 14px; color: #4b5563; font-weight: 600;">
                        Rent Estimate: <span style="color: #2563eb;">${d.rentZestimate ? '$'+d.rentZestimate+'/mo' : 'N/A'}</span>
                    </div>
                    <div style="font-size: 14px; color: #4b5563; font-weight: 600;">
                        Est. ROI: <span style="color: #10b981;">${d.calculatedROI.toFixed(2)}%</span>
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1px 1fr; gap: 20px; align-items: center;">
                    <div>
                        <div style="font-size: 12px; font-weight: 800; color: #9ca3af; margin-bottom: 12px; text-transform: uppercase;">Safety</div>
                        ${makeBigBar("Crime", Math.min(d.crime,100), "#10b981")}
                        ${makeBigBar("EMS", Math.min(d.emprox,100), "#3b82f6")}
                        ${makeBigBar("Env", Math.min(d.envwell,100), "#8b5cf6")}
                    </div>
                    <div style="width: 1px; height: 100%; background: #e5e7eb;"></div>
                    <div>
                        <div style="font-size: 12px; font-weight: 800; color: #9ca3af; margin-bottom: 12px; text-transform: uppercase;">Convenience</div>
                        ${makeBigBar("Shop", Math.min(d.shop,100), "#f59e0b")}
                        ${makeBigBar("Cafe", Math.min(d.cafe,100), "#ec4899")}
                        ${makeBigBar("Gym", Math.min(d.gym,100), "#6366f1")}
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

// --- PROPERTY PAGE INJECTION ---
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

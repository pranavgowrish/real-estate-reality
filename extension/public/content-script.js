console.log("--- Super Sorter v31: Property Page Data Injection ---");

// --- CONFIGURATION ---
//const API_URL = "https://reelreal-realtor.hf.space/updateAddress"; 
const API_URL = "http://127.0.0.1:8000/updateAddress";
const MAX_PAGES_TO_FETCH = 2;
const DELAY_BETWEEN_PAGES = 1500;
const TOP_TIER_COUNT = 3;
const STORAGE_KEY = "all_data";

const LIST_CONTAINER_SEL = 'ul[data-c11n-component="List.Root"]';
const LIST_ITEM_SEL = 'li[data-c11n-component="List.Item"]';
const NEXT_BUTTON_SEL = 'a[title="Next page"]';

// --- CSS STYLES ---
function injectStyles() {
  const styleId = "zillow-sorter-styles";
  if (document.getElementById(styleId)) return;
  const style = document.createElement("style");
  style.id = styleId;
  style.innerHTML = `
        @keyframes breatheGreen { 0% { box-shadow: 0 0 5px rgba(16,185,129,0.4); border-color:#10b981;} 50% { box-shadow: 0 0 25px rgba(16,185,129,0.7); border-color:#34d399;} 100% { box-shadow: 0 0 5px rgba(16,185,129,0.4); border-color:#10b981;} }
        @keyframes breatheGold { 0% { box-shadow: 0 0 5px rgba(245,158,11,0.4); border-color:#f59e0b;} 50% { box-shadow: 0 0 25px rgba(245,158,11,0.7); border-color:#fbbf24;} 100% { box-shadow: 0 0 5px rgba(245,158,11,0.4); border-color:#f59e0b;} }
        .glow-green { animation: breatheGreen 3s infinite ease-in-out; border-width: 3px; border-style: solid; z-index: 10; transform: scale(1.02); }
        .glow-gold { animation: breatheGold 3s infinite ease-in-out; border-width: 3px; border-style: solid; z-index: 10; transform: scale(1.02); }
    `;
  document.head.appendChild(style);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// --- SCRAPERS ---
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
    const payload = { addresses: propertyList };
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error("API Error");
    const data = await response.json();
    return data.results || data;
  } catch (error) {
    console.warn("Backend failed. Using fallback.");
    return propertyList.map((p) => ({
      ...p,
      crime: 90,
      emprox: 80,
      envwell: 85,
      shop: 60,
      cafe: 60,
      gym: 60,
    }));
  }
};

// --- MATH & SCORING HELPERS ---
function getROI(rent, purchase_price) {
  if (!rent || !purchase_price) return 0;
  const annual_income = rent * 12;
  const annual_expenses = purchase_price * 0.0125 + 2000 + rent * 0.1 * 12;
  const roi = (annual_income - annual_expenses) / purchase_price;
  return roi * 100;
}

function normalizeROI(list) {
  if (list.length === 0) return [];

  percentages = list.map(item => item / 10)
  const min = Math.min(...percentages)
  const max = Math.max(...percentages)

  // Handle division by zero when all values are the same
  if (max === min) return percentages.map(() => 0.5);

  return percentages.map((item) => (item - min) / (max - min));
}

function normalize(list) {
  if (list.length === 0) return [];

  percentages = list.map(item => item / 100)
  const min = Math.min(...percentages)
  const max = Math.max(...percentages)

  // Handle division by zero when all values are the same
  if (max === min) return percentages.map(() => 0.5);

  return percentages.map((item) => (item - min) / (max - min));
}

function getInvestmentScore(roi_list, safety_list, convenience_list) {
  const normalized_roi = normalizeROI(roi_list);
  const normalized_safety = normalize(safety_list);
  const normalized_convenience = normalize(convenience_list);
  const investment_scores = [];
  for (let i = 0; i < roi_list.length; i++) {
    const score =
      normalized_roi[i] * (1 / 3) +
      normalized_safety[i] * (1 / 3) +
      normalized_convenience[i] * (1 / 3);
    investment_scores.push(score);
  }
  return investment_scores;
}

function getSafetyLifestyleScore(safety_list, convenience_list) {
  const normalized_safety = normalize(safety_list);
  const normalized_convenience = normalize(convenience_list);
  const scores = [];
  for (let i = 0; i < safety_list.length; i++) {
    const score = normalized_safety[i] * 0.6 + normalized_convenience[i] * 0.4;
    scores.push(score);
  }
  return scores;
}

function getROIScore(roi_list, safety_list, convenience_list) {
  const normalized_roi = normalizeROI(roi_list);
  const normalized_safety = normalize(safety_list);
  const normalized_convenience = normalize(convenience_list);
  const scores = [];
  for (let i = 0; i < roi_list.length; i++) {
    const score =
      normalized_roi[i] * 0.5 +
      normalized_safety[i] * 0.35 +
      normalized_convenience[i] * 0.15;
    scores.push(score);
  }
  return scores;
}

// Get current scoring mode from storage (default to 'safe')
function getScoringMode() {
  return localStorage.getItem("scoring-mode") || "safe";
}

// Set scoring mode
function setScoringMode(mode) {
  localStorage.setItem("scoring-mode", mode);
}

// --- LOADER UI (SMOOTH + CAPPED) ---
let displayedProgress = 0;
let targetProgress = 0;
let progressInterval = null;

function updateLoader(msg, percent, done = false) {
  let loader = document.getElementById("zillow-loader");

  if (!loader) {
    const container = document.getElementById("search-page-list-container");
    if (!container) return;
    const imageUrl = chrome.runtime.getURL("rer.png");

    container.style.position = "relative";

    loader = document.createElement("div");
    loader.id = "zillow-loader";
    loader.style.cssText = `
      position:absolute; inset:0;
      background:rgba(255,255,255,0.98);
      z-index:1000;
      display:flex;
      flex-direction:column;
      align-items:center;
      justify-content:center;
      font-family: -apple-system, sans-serif;
    `;

    loader.innerHTML = `
      <div style="width:220px;height:10px;background:#e5e7eb;border-radius:999px;overflow:hidden">
        <div id="loader-bar" style="
          height:100%;
          width:0%;
          background:linear-gradient(90deg,#2563eb,#3b82f6,#22c55e);
          border-radius:999px;
          transition:width 0.25s ease;
        "></div>
      </div>
    <img src="${imageUrl}" style="position:absolute; height:80px; top:150px; animation:spin 4s linear infinite;" />

      <div id="loader-text" style="margin-top:14px;font-size:13px;color:#374151">
      <div id="loader-text" style="margin-top:14px;font-size:16px;color:#080808;font-weight:bold; font-family: -apple-system, sans-serif;">
        Starting…
      </div>
    `;

    container.appendChild(loader);
  }

  // UPDATE TARGET EVERY CALL
  targetProgress = done ? 100 : Math.min(percent, 90);

  const bar = document.getElementById("loader-bar");
  const text = document.getElementById("loader-text");
  text.innerText = msg;

  // START INTERVAL ONCE
  if (!progressInterval) {
    progressInterval = setInterval(() => {
      // Smooth easing toward target
      displayedProgress += (targetProgress - displayedProgress) * 0.15;

      // Prevent tiny jitter
      if (Math.abs(targetProgress - displayedProgress) < 0.2) {
        displayedProgress = targetProgress;
      }

      bar.style.width = displayedProgress.toFixed(1) + "%";

      // Finish cleanly
      if (targetProgress === 100 && displayedProgress >= 99.8) {
        bar.style.width = "100%";
        clearInterval(progressInterval);
        progressInterval = null;
      }
    }, 40);
  }
}

async function startApp() {
  const originalList = document.querySelector(LIST_CONTAINER_SEL);
  if (!originalList) return;

  injectStyles();

  const imageUrl = chrome.runtime.getURL("rer.png");
  const headtoadd = document.querySelector('h1[data-c11n-component="Heading"]');

  // Inject combined logo and toggle bar
  if (!document.getElementById("ourlogoo") && headtoadd) {
    const logo = document.createElement("div");
    logo.id = "ourlogoo";
    logo.style.cssText = `
      display: flex; 
      align-items: center; 
      justify-content: space-between;
      padding: 12px 16px;
      margin-bottom: 16px;
      background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
      border-radius: 6px;
    `;
    logo.innerHTML = `
      <div style="display: flex; align-items: center; gap: 12px;">
        <div style="font-size: 15px; font-weight: 700; color: #374151;">Property Score Calculation:</div>
        <select id="roi-strategy-toggle" style="padding: 4px 8px; border-radius: 4px; border: 1px solid #3b82f6; font-size: 13px; cursor: pointer;">
          <option value="safe">Safety and Liveability</option>
          <option value="invest">Return of Investment (ROI)</option>
        </select>
      </div>
      <div style="display: flex; align-items: center; gap: 6px;">
        <span style="font-size: 11px; font-weight: 500; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em;">Powered by Invest For Real</span>
        <img src="${imageUrl}" style="height: 20px;" />
      </div>
    `;
    headtoadd.parentNode.appendChild(logo);

    // Set initial toggle value from storage
    const currentMode = getScoringMode();
    const toggleSelect = document.getElementById("roi-strategy-toggle");
    toggleSelect.value = currentMode;

    // Listener for the math change
    toggleSelect.addEventListener("change", (e) => {
      const newMode = e.target.value;
      console.log(`Switching math to: ${newMode}`);
      setScoringMode(newMode);
      if (window.recalculateAndRender) {
        window.recalculateAndRender();
      }
    });
  }
  let allHTML = [];
  const firstPageItems = Array.from(document.querySelectorAll(LIST_ITEM_SEL));
  firstPageItems.forEach((item) => allHTML.push(item.outerHTML));

  let nextUrl = document.querySelector(NEXT_BUTTON_SEL)?.href;
  let pages = 0;
  while (nextUrl && pages < MAX_PAGES_TO_FETCH - 1) {
    pages++;
    updateLoader(`Fetching Page ${pages + 1}...`, 30);
    await new Promise((r) => setTimeout(r, DELAY_BETWEEN_PAGES));
    try {
      const res = await fetch(nextUrl);
      const text = await res.text();
      const doc = new DOMParser().parseFromString(text, "text/html");
      const newItems = Array.from(doc.querySelectorAll(LIST_ITEM_SEL));
      newItems.forEach((item) => allHTML.push(item.outerHTML));
      nextUrl = doc.querySelector(NEXT_BUTTON_SEL)?.href;
    } catch (e) {
      break;
    }
  }

  updateLoader(`Parsing ${allHTML.length} Properties...`, 50);
  let scrapeQueue = [];
  let scrapeUrls = [];
  let domElements = [];

  for (const html of allHTML) {
    const temp = document.createElement("div");
    temp.innerHTML = html;
    const el = temp.firstChild;
    el.querySelectorAll("script, style").forEach((s) => s.remove());
    const rawText = el.innerText;

    if (
      rawText.includes("Loading") ||
      rawText.length < 20 ||
      !rawText.includes("$")
    )
      continue;

    const address =
      (rawText.match(/(?:^|\n)(.*?, [A-Z]{2} \d{5})/) || [])[1]?.trim() ||
      "Unknown";
    const priceStr = (rawText.match(/\$[0-9]{1,3}(?:,[0-9]{3})*/) || ["0"])[0];
    const sqftStr = (rawText.match(/([0-9,]+)\s+sqft/) || [null, "N/A"])[1];

    const linkEl =
      el.querySelector('a[data-test="property-card-link"]') ||
      el.querySelector("a");
    const url = linkEl ? linkEl.href : null;

    if (address !== "Unknown" && priceStr !== "0") {
      scrapeQueue.push({ address, listing_price: priceStr, sqft: sqftStr });
      scrapeUrls.push(url);
      domElements.push(el);
    }
  }

  if (scrapeQueue.length === 0) {
    updateLoader("No properties found.", 100);
    return;
  }

    updateLoader(`Analyzing all properties...`, 60);

  const [apiResults, rentResults] = await Promise.all([
    fetchBatchAnalysis(scrapeQueue),
    fetchMarketPrices(scrapeUrls),
  ]);

  let roiList = [];
  let safetyList = [];
  let convenienceList = [];

  let mergedData = scrapeQueue.map((item, index) => {
    const backendData = apiResults[index] || item;
    const rentZestimate = rentResults[index];
    const purchasePrice =
      parseInt(item.listing_price.replace(/[\$,]/g, "")) || 0;
    const calculatedROI = getROI(rentZestimate, purchasePrice);

    const safetyTotal =
      (backendData.crime || 0) +
      (backendData.emprox || 0) +
      (backendData.envwell || 0);
    const lifestyleTotal =
      (backendData.shop || 0) +
      (backendData.cafe || 0) +
      (backendData.gym || 0);

    const avgSafety = safetyTotal / 3;
    const avgLife = lifestyleTotal / 3;

    roiList.push(calculatedROI);
    safetyList.push(avgSafety);
    convenienceList.push(avgLife);

    return {
      element: domElements[index],
      data: {
        ...backendData,
        address: item.address,
        rentZestimate,
        purchasePrice,
        calculatedROI,
      }, // Ensure address is saved
      rawMetrics: { avgSafety, avgLife },
    };
  });

  // Store raw data for recalculation
  window.rawScoringData = {
    mergedData,
    roiList,
    safetyList,
    convenienceList,
  };

  // Calculate scores based on current mode
  const scoringMode = getScoringMode();
  let calculatedScores;
  if (scoringMode === "invest") {
    calculatedScores = getROIScore(roiList, safetyList, convenienceList);
  } else {
    calculatedScores = getSafetyLifestyleScore(safetyList, convenienceList);
  }

  let finalItems = mergedData.map((item, index) => {
    const finalScore = Math.floor(calculatedScores[index] * 100);
    let badgeColor =
      finalScore >= 85 ? "#10b981" : finalScore >= 70 ? "#3b82f6" : "#f59e0b";

    // IMPORTANT: We explicitly save the 'finalScore' into the data object so we can read it on the detail page later
    item.data.finalScore = finalScore;
    item.data.scoringMode = scoringMode; // Store mode for property page

    return {
      ...item,
      ui: {
        score: finalScore,
        badgeColor,
        avgSafety: item.rawMetrics.avgSafety,
        avgLife: item.rawMetrics.avgLife,
        cssClass: "",
      },
    };
  });

  finalItems.sort((a, b) => b.ui.score - a.ui.score);

  // Save to Local Storage for use in Property Page
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(finalItems.map((i) => i.data)),
  );

  finalItems.forEach((item, index) => {
    if (index < TOP_TIER_COUNT) {
      item.ui.cssClass =
        item.ui.avgSafety > item.ui.avgLife ? "glow-green" : "glow-gold";
    }
  });

  updateLoader("Rendering...", 90);
  originalList.style.display = "none";
  const existing = document.getElementById("custom-row-container");
  if (existing) existing.remove();

  const container = document.createElement("div");
  container.id = "custom-row-container";
  container.style.cssText = `display: flex; flex-direction: column; gap: 25px; width: 100%; padding: 20px; box-sizing: border-box; background: #f3f4f6;`;

  finalItems.forEach((item) => {
    const d = item.data;
    const ui = item.ui;
    const row = document.createElement("div");
    row.className = ui.cssClass;
    row.style.cssText = `display: flex; flex-direction: row; background: white; border-radius: 12px; overflow: hidden; min-height: 240px; ${!ui.cssClass ? "border:1px solid #e5e7eb; box-shadow:0 4px 6px -1px rgba(0,0,0,0.1);" : ""}`;

    const leftCol = document.createElement("div");
    leftCol.style.cssText = `width: 50%; border-right: 1px solid #e5e7eb;`;
    const zCard = item.element;
    zCard.style.cssText = "width:100%; height:100%; margin:0; list-style:none;";
    leftCol.appendChild(zCard);

    const rightCol = document.createElement("div");
    rightCol.style.cssText = `width: 50%; padding: 25px; display: flex; flex-direction: column; justify-content: center; position: relative;`;

    const makeBigBar = (label, score, color) => `
            <div style="margin-bottom: 12px;">
                <div style="display: flex; justify-content: space-between; font-size: 13px; font-weight: 700; color: #374151;"><span>${label}</span><span>${Math.round(score)}</span></div>
                <div style="width: 100%; height: 10px; background: #f3f4f6; border-radius: 99px;"><div style="width: ${Math.min(score, 100)}%; height: 100%; background: ${color}; border-radius: 99px;"></div></div>
            </div>`;

    rightCol.innerHTML += `
            <div style="position: absolute; left: 0; top: 0; bottom: 0; width: 8px; background: ${ui.badgeColor};"></div>
            <div style="margin-left: 15px; height: 100%; display: flex; flex-direction: column; justify-content: space-evenly;">
                <div style="position: absolute; top: 20px; right: 20px; background: ${ui.badgeColor}; color: white; padding: 6px 14px; border-radius: 8px; font-weight: 700; font-size: 18px; box-shadow: 0 2px 5px rgba(0,0,0,0.15);">
                   Score: ${Math.min(ui.score, 100)}
                </div>
                <div style="margin-bottom: 15px;">
                    <div style="font-size: 14px; color: #4b5563; font-weight: 600;">
                        Rent Estimate: <span style="color: #2563eb;">${d.rentZestimate ? "$" + d.rentZestimate + "/mo" : "N/A"}</span>
                    </div>
                    <div style="font-size: 14px; color: #4b5563; font-weight: 600;">
                        Est. ROI: <span style="color: #10b981;">${d.calculatedROI.toFixed(2)}%</span>
                    </div>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1px 1fr; gap: 20px; align-items: center;">
                    <div>
                        <div style="font-size: 13px; font-weight: 800; color: #9ca3af; margin-bottom: 12px; text-transform: uppercase;">Safety</div>
                        ${makeBigBar("Security", Math.min(d.crime, 100), "#10b981")}
                        ${makeBigBar("EMS", Math.min(d.emprox, 100), "#3b82f6")}
                        ${makeBigBar("Env", Math.min(d.envwell, 100), "#8b5cf6")}
                    </div>
                    <div style="width: 1px; height: 100%; background: #e5e7eb;"></div>
                    <div>
                        <div style="font-size: 13px; font-weight: 800; color: #9ca3af; margin-bottom: 12px; text-transform: uppercase;">Convenience</div>
                        ${makeBigBar("Shop", Math.min(d.shop, 100), "#f59e0b")}
                        ${makeBigBar("Cafe", Math.min(d.cafe, 100), "#ec4899")}
                        ${makeBigBar("Gym", Math.min(d.gym, 100), "#6366f1")}
                    </div>
                </div>
            </div>`;

    rightCol.style.cssText = `
            width: 50%; 
            padding: 30px; 
            display: flex; 
            flex-direction: column; 
            justify-content: center; 
            position: relative;
            font-family: -apple-system, sans-serif;            background: rgba(255, 255, 255, 0.7);
            backdrop-filter: blur(8px);
            -webkit-backdrop-filter: blur(8px);
            
        `;

    row.appendChild(leftCol);
    row.appendChild(rightCol);
    container.appendChild(row);
  });

  originalList.parentNode.insertBefore(container, originalList);

  const loader = document.getElementById("zillow-loader");
  if (loader) loader.remove();
}

// Function to recalculate and re-render based on scoring mode
function recalculateAndRender() {
  if (!window.rawScoringData) {
    console.log("No raw data available for recalculation");
    return;
  }

  const { mergedData, roiList, safetyList, convenienceList } =
    window.rawScoringData;
  const scoringMode = getScoringMode();

  // Recalculate scores
  let calculatedScores;
  if (scoringMode === "invest") {
    calculatedScores = getROIScore(roiList, safetyList, convenienceList);
  } else {
    calculatedScores = getSafetyLifestyleScore(safetyList, convenienceList);
  }

  // Update final items with new scores
  let finalItems = mergedData.map((item, index) => {
    const finalScore = Math.floor(calculatedScores[index] * 100);
    let badgeColor =
      finalScore >= 85 ? "#10b981" : finalScore >= 70 ? "#3b82f6" : "#f59e0b";

    item.data.finalScore = finalScore;
    item.data.scoringMode = scoringMode;

    return {
      ...item,
      ui: {
        score: finalScore,
        badgeColor,
        avgSafety: item.rawMetrics.avgSafety,
        avgLife: item.rawMetrics.avgLife,
        cssClass: "",
      },
    };
  });

  finalItems.sort((a, b) => b.ui.score - a.ui.score);

  // Update localStorage
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(finalItems.map((i) => i.data)),
  );

  // Update glow effects
  finalItems.forEach((item, index) => {
    if (index < TOP_TIER_COUNT) {
      item.ui.cssClass =
        item.ui.avgSafety > item.ui.avgLife ? "glow-green" : "glow-gold";
    }
  });

  // Re-render the container
  const existing = document.getElementById("custom-row-container");
  if (existing) existing.remove();

  const container = document.createElement("div");
  container.id = "custom-row-container";
  container.style.cssText = `display: flex; flex-direction: column; gap: 25px; width: 100%; padding: 20px; box-sizing: border-box; background: #f3f4f6;`;

  finalItems.forEach((item) => {
    const d = item.data;
    const ui = item.ui;
    const row = document.createElement("div");
    row.className = ui.cssClass;
    row.style.cssText = `display: flex; flex-direction: row; background: white; border-radius: 12px; overflow: hidden; min-height: 240px; ${!ui.cssClass ? "border:1px solid #e5e7eb; box-shadow:0 4px 6px -1px rgba(0,0,0,0.1);" : ""}`;

    const leftCol = document.createElement("div");
    leftCol.style.cssText = `width: 50%; border-right: 1px solid #e5e7eb;`;
    const zCard = item.element;
    zCard.style.cssText = "width:100%; height:100%; margin:0; list-style:none;";
    leftCol.appendChild(zCard);

    const rightCol = document.createElement("div");
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
                   Score: ${Math.min(ui.score, 100)}
                </div>
                <div style="margin-bottom: 15px;">
                    <div style="font-size: 14px; color: #4b5563; font-weight: 600;">
                        Rent Estimate: <span style="color: #2563eb;">${d.rentZestimate ? "$" + d.rentZestimate + "/mo" : "N/A"}</span>
                    </div>
                    <div style="font-size: 14px; color: #4b5563; font-weight: 600;">
                        Est. ROI: <span style="color: #10b981;">${d.calculatedROI.toFixed(2)}%</span>
                    </div>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1px 1fr; gap: 20px; align-items: center;">
                    <div>
                        <div style="font-size: 12px; font-weight: 800; color: #9ca3af; margin-bottom: 12px; text-transform: uppercase;">Safety</div>
                        ${makeBigBar("Security", Math.min(d.crime, 100), "#10b981")}
                        ${makeBigBar("EMS", Math.min(d.emprox, 100), "#3b82f6")}
                        ${makeBigBar("Env", Math.min(d.envwell, 100), "#8b5cf6")}
                    </div>
                    <div style="width: 1px; height: 100%; background: #e5e7eb;"></div>
                    <div>
                        <div style="font-size: 12px; font-weight: 800; color: #9ca3af; margin-bottom: 12px; text-transform: uppercase;">Convenience</div>
                        ${makeBigBar("Shop", Math.min(d.shop, 100), "#f59e0b")}
                        ${makeBigBar("Cafe", Math.min(d.cafe, 100), "#ec4899")}
                        ${makeBigBar("Gym", Math.min(d.gym, 100), "#6366f1")}
                    </div>
                </div>
            </div>`;

    rightCol.style.cssText = `
            width: 50%; 
            padding: 30px; 
            display: flex; 
            flex-direction: column; 
            justify-content: center; 
            position: relative;
            font-family: -apple-system, sans-serif;            background: rgba(255, 255, 255, 0.7);
            backdrop-filter: blur(8px);
            -webkit-backdrop-filter: blur(8px);
            
        `;

    row.appendChild(leftCol);
    row.appendChild(rightCol);
    container.appendChild(row);
  });

  const originalList = document.querySelector(LIST_CONTAINER_SEL);
  if (originalList) {
    originalList.parentNode.insertBefore(container, originalList);
  }
}

// Make function globally available
window.recalculateAndRender = recalculateAndRender;

// --- PROPERTY PAGE LOGIC (DATA INJECTION) ---
function startProperty() {
    console.log("🏠 Property Page Detected");
    const selector = '[data-testid="chip-personalize-payment-module"]';

  const injectPanel = () => {
    const targetBox = document.querySelector(selector);
    if (!targetBox) return;

    // Remove existing panel if it exists (for updates)
    const existingPanel = document.getElementById("hello-world-extension");
    if (existingPanel) existingPanel.remove();

    // 1. Get Data & Match Address
    const allData = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    const currentAddress = document.querySelector("h1")?.innerText?.trim();
    const normalizeAddr = (str) =>
      str ? str.replace(/[^a-zA-Z0-9]/g, "").toLowerCase() : "";
    const cleanCurrent = normalizeAddr(currentAddress);

    const match = allData.find((item) => {
      const cleanItem = normalizeAddr(item.address);
      return (
        cleanCurrent.includes(cleanItem) || cleanItem.includes(cleanCurrent)
      );
    });

    const hello = document.createElement("div");
    hello.id = "hello-world-extension";
    hello.style.cssText = `
            display: block; width: 100%; padding: 25px; margin-bottom: 20px; 
            background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; 
            box-shadow: 0 10px 30px rgba(0,0,0,0.08); font-family: -apple-system, sans-serif;
        `;

        // --- HELPER: SVG HALF-CIRCLE GAUGE ---
        const makeGauge = (score, color, label, subtext) => {
            const radius = 35;
            const circumference = 2 * Math.PI * radius;
            const offset = circumference - ((Math.min(score,100) / 100) * (circumference / 2)); // Only show half
            
            return `
            <div style="display:flex; flex-direction:column; align-items:center; width: 100px;">
                <div style="position: relative; width: 80px; height: 45px; overflow: hidden; margin-bottom: 5px;">
                    <svg width="80" height="80" style="transform: rotate(-180deg);">
                        <circle cx="40" cy="40" r="${radius}" fill="none" stroke="#f3f4f6" stroke-width="6" /> <circle cx="40" cy="40" r="${radius}" fill="none" stroke="${color}" stroke-width="6" 
                                stroke-dasharray="${circumference}" stroke-dashoffset="${offset}" 
                                stroke-linecap="round" style="transition: stroke-dashoffset 1s ease-out;" />
                    </svg>
                    <div style="position: absolute; bottom: 0; width: 100%; text-align: center; font-size: 16px; font-weight: 800; color: #1f2937;">
                        ${Math.round(score)}
                    </div>
                </div>
                <div style="font-size: 11px; font-weight: 700; color: #4b5563; text-transform: uppercase;">${label}</div>
                <div style="font-size: 10px; color: #9ca3af; text-align: center; line-height: 1.2; margin-top:2px;">${subtext}</div>
            </div>`;
    };

    // --- HELPER: GENERATE INSIGHTS SENTENCES ---
// --- HELPER: GENERATE INSIGHTS SENTENCES ---
const getVerdict = (d) => {
  let pros = [];
  let cons = [];

  if (d.calculatedROI > 6)
    pros.push(
      `High yield potential with an estimated <span style='color:#10b981; font-weight:bold;'>${d.calculatedROI.toFixed(1)}% ROI</span>.`,
    );
  else if (d.calculatedROI < 3)
    cons.push(
      `Low yield estimated at only ${d.calculatedROI.toFixed(1)}% ROI.`,
    );

  if (d.crime > 80)
    pros.push(
      `Located in a <span style='color:#10b981; font-weight:bold;'>very safe neighborhood</span> with low crime.`,
    );
  else if (d.crime < 50)
    cons.push(
      `Situated in a higher crime area which may impact long-term appreciation.`,
    );

  if (d.shop > 75 && d.cafe > 75)
    pros.push(
      `Excellent <span style='color:#3b82f6; font-weight:bold;'>walkability</span> to shops and cafes.`,
    );
  else if (d.shop < 40)
    cons.push(`Car-dependent area with few nearby amenities.`);

  if (d.rentZestimate > d.purchasePrice * 0.007)
    pros.push("Strong rent-to-price ratio.");

  // Combine into paragraphs
  let html = "";
  if (pros.length > 0)
    html += `<div style="margin-bottom:8px;"><b>Investment Worth:</b> ${pros.join(" ")}</div>`;
  if (cons.length > 0)
    html += `<div><b>Risks to watch:</b> ${cons.join(" ")}</div>`;

  if (!html)
    html =
      "This property shows average metrics across the board. It is a stable but standard investment choice.";

  return html;
}; // <-- Add this closing brace

if (match) {
  const d = match;
  const imageUrl = chrome.runtime.getURL("rer.png");

  // Recalculate score based on current toggle mode
  const scoringMode = getScoringMode();
  let recalculatedScore;
  
      if (scoringMode === "invest") {
        // ROI mode: 70% ROI, 20% safety, 10% convenience
        const normalizedROI =
          Math.min(Math.max(d.calculatedROI || 0, 0), 15) / 15;
        const avgSafety =
          ((d.crime || 0) + (d.emprox || 0) + (d.envwell || 0)) / 3;
        const avgConvenience =
          ((d.shop || 0) + (d.cafe || 0) + (d.gym || 0)) / 3;
        const normalizedSafety = Math.min(Math.max(avgSafety, 0), 100) / 100;
        const normalizedConvenience =
          Math.min(Math.max(avgConvenience, 0), 100) / 100;
        recalculatedScore =
          normalizedROI * 0.55 +
          normalizedSafety * 0.30 +
          normalizedConvenience * 0.15;
      } else {
        // Safety & Lifestyle mode: 60% safety, 40% convenience
        const avgSafety =
          ((d.crime || 0) + (d.emprox || 0) + (d.envwell || 0)) / 3;
        const avgConvenience =
          ((d.shop || 0) + (d.cafe || 0) + (d.gym || 0)) / 3;
        const normalizedSafety = Math.min(Math.max(avgSafety, 0), 100) / 100;
        const normalizedConvenience =
          Math.min(Math.max(avgConvenience, 0), 100) / 100;
        recalculatedScore =
          normalizedSafety * 0.7 + normalizedConvenience * 0.3;
      }

      const finalScore = Math.floor(recalculatedScore * 100);
      const scoreColor =
        finalScore >= 80 ? "#10b981" : finalScore >= 60 ? "#f59e0b" : "#ef4444";

      hello.innerHTML = `
                <div style="border-bottom: 1px solid #f3f4f6; padding-bottom: 15px; margin-bottom: 20px;">
                <img src="${imageUrl}" style="height: 40px; vertical-align: middle; margin-right: 8px;" />
                    <div style="font-size: 20px; font-weight: 800; color: #111827; margin-bottom: 5px;">Real Estate Reality: Investment Report</div>
                    <div style="font-size: 13px; color: #6b7280;">Analysis based on rent, crime, and lifestyle data.</div>
                        </div>
                        <div>
                            <div style="font-size: 12px; font-weight: 700; color: #374151; margin-bottom: 4px;">Score Calculation:</div>
                            <select id="property-page-toggle" style="padding: 2px 6px; border-radius: 4px; border: 3px solid #3b82f6; font-size: 11px; cursor: pointer; font-family: -apple-system, sans-serif;">
                                <option value="safe">Safety and Liveability</option>
                                <option value="invest">Return of Investment (ROI)</option>
                            </select>
                        </div>
                    </div>
                </div>

                <div style="display: flex; justify-content: space-around; align-items: flex-end; margin-bottom: 25px;">
                    ${makeGauge(Math.min(finalScore, 100), scoreColor, scoringMode === "invest" ? "ROI Score" : "Liveability", "Overall Score")}
                    ${makeGauge(Math.min(d.calculatedROI * 10, 100), "#10b981", "Yield", `${d.calculatedROI.toFixed(2)}% ROI`)}
                    ${makeGauge(Math.min((d.crime+d.emprox+d.envwell)/3, 100), "#3b82f6", "Safety", "Peace of Mind")}
                    ${makeGauge(Math.min((Math.min(d.shop,100)+Math.min(d.gym,100)+Math.min(d.cafe,100))/3, 100), "#8b5cf6", "Convenience", "Walkability")}
                </div>

                <div style="background: #f9fafb; padding: 15px; border-radius: 8px; font-size: 13px; line-height: 1.5; color: #374151; border-left: 4px solid ${scoreColor};">
                    ${getVerdict(d)}
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 20px;">
                    <div>
                        <div style="font-size: 11px; font-weight: 800; color: #9ca3af; margin-bottom: 8px; text-transform: uppercase;">Safety</div> 
                        <div style="font-size: 13px; color: #4b5563; display: flex; justify-content: space-between;">
                            <span>Crime rate:</span> <span style="font-weight: 700;">${Math.min(d.crime, 100)}</span>
                        </div>
                        <div style="font-size: 13px; color: #4b5563; display: flex; justify-content: space-between;">
                            <span>Emergency services proximity score:</span> <span style="font-weight: 700;">${Math.min(d.emprox, 100)}</span>
                        </div>
                        <div style="font-size: 13px; color: #4b5563; display: flex; justify-content: space-between;">
                            <span>Wellness score:</span> <span style="font-weight: 700;">${Math.min(d.envwell, 100)}</span>
                        </div>
                        
                    </div>
                    <div>
                        <div style="font-size: 11px; font-weight: 800; color: #9ca3af; text-transform: uppercase; margin-bottom: 8px;">Location</div>
                        <div style="font-size: 13px; color: #4b5563;">• ${d.emprox > 80 ? "Rapid EMS Response" : "Avg EMS Response"}</div>
                        <div style="font-size: 13px; color: #4b5563;">
                        • ${
                          d.envwell >= 80
                            ? "High Air Quality"
                            : d.envwell >= 50
                              ? "Moderate Air Quality"
                              : "Poor Air Quality"
                        }
                        </div>
                        <div style="font-size: 13px; color: #4b5563; margin-bottom: 4px;">
                            • ${
                                (0.9 * (Math.min(d.gym,100) + Math.min(d.cafe,100) + Math.min(100,d.shop))) > 270
                                ? 'Many amenities nearby (gyms, cafes, shops)'
                                : (0.9 * (d.gym + d.cafe + d.shop)) > 180
                                    ? 'Mediocre amount of amenities nearby'
                                    : 'Poor amount of amenities nearby'
                            }
                        </div>
                    </div>
                </div>
            `;
    } else {
      hello.innerHTML = `
                <div style="text-align: center; padding: 20px; color: #6b7280;">
                    <div style="font-size: 24px; margin-bottom: 10px;">📉</div>
                    <div style="font-weight: 600;">Data Not Found</div>
                    <div style="font-size: 12px; margin-top: 5px;">Return to search results to generate a report for this property.</div>
                    <div style="font-size: 10px; margin-top: 10px; opacity: 0.5;">${cleanCurrent}</div>
                </div>
            `;
    }

    targetBox.parentNode.insertBefore(hello, targetBox);

    // Set initial toggle value and add listener
    const propertyToggle = document.getElementById("property-page-toggle");
    if (propertyToggle) {
      propertyToggle.value = getScoringMode();
      // Remove old listener if exists and add new one
      const newToggle = propertyToggle.cloneNode(true);
      propertyToggle.parentNode.replaceChild(newToggle, propertyToggle);
      newToggle.value = getScoringMode();
      newToggle.addEventListener("change", (e) => {
        setScoringMode(e.target.value);
        // Re-inject panel to update scores
        setTimeout(injectPanel, 100);
      });
    }
  };

  injectPanel();
    setInterval(injectPanel, 1000);
  };

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

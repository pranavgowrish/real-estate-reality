// content-script.js

console.log("Content script loaded on Zillow");

const targetElementSelector = '[class="map-container"]';

let targetElement = document.querySelector(targetElementSelector);

console.log("Target element found:", targetElement);

if (targetElement) {
  const newText = document.createElement("div");
  newText.textContent = "CUSTOM HELLOOOO!";

  // Styling to ensure it is visible over the map
  newText.style.color = "white";
  newText.style.backgroundColor = "#006aff"; // Zillow Blue
  newText.style.fontWeight = "bold";
  newText.style.padding = "10px";
  newText.style.margin = "10px";
  newText.style.borderRadius = "5px";
  newText.style.boxShadow = "0 2px 4px rgba(0,0,0,0.2)";
  newText.style.pointerEvents = "auto"; // Ensures you can click it if needed

  // Insert the new text at the top of the controls container
  targetElement.insertBefore(newText, targetElement.firstChild);
  console.log("Custom text injected successfully.");
} else {
  console.log("Target element not found, could not inject text.");
}
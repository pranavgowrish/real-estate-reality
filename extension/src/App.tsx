import "./App.css";

function App() {
  return (
    <div className="app-container">
      <div className="header-section">
        <div className="logo-title-row">
          <img src="/rer.png" alt="RER Logo" className="logo-img" />
          <h1 className="app-title">Real Estate Reality</h1>
          <h2 className="app-description">Safety & livability overview</h2>
        </div>
      </div>

      <div className="legend-section">
        <h2 className="legend-title">Color Guide</h2>
        
        <div className="legend-items-container">
          <div className="legend-item">
            <div className="legend-label">
              <div className="color-bar-indicator" style={{ backgroundColor: "#10b981" }}></div>
              <span className="legend-text">
                <strong>Score Bar Color</strong> (vertical bar between listing and score)
              </span>
            </div>
            <div className="legend-details">
              <div className="legend-row">
                <div className="color-sample" style={{ backgroundColor: "#10b981" }}></div>
                <span>Green: Score 85-100 (Excellent)</span>
              </div>
              <div className="legend-row">
                <div className="color-sample" style={{ backgroundColor: "#3b82f6" }}></div>
                <span>Blue: Score 70-84 (Good)</span>
              </div>
              <div className="legend-row">
                <div className="color-sample" style={{ backgroundColor: "#f59e0b" }}></div>
                <span>Orange: Score below 70 (Fair)</span>
              </div>
            </div>
          </div>

          <div className="legend-item">
            <div className="legend-label">
              <div className="glow-indicator glow-green-preview"></div>
              <span className="legend-text">
                <strong>Glowing Border</strong> (around property listing + score box)
              </span>
            </div>
            <div className="legend-details">
              <div className="legend-row">
                <div className="glow-sample glow-green-preview"></div>
                <span>Green Glow: Top properties with higher safety scores</span>
              </div>
              <div className="legend-row">
                <div className="glow-sample glow-gold-preview"></div>
                <span>Gold Glow: Top properties with higher lifestyle/convenience scores</span>
              </div>
              <div className="legend-row">
                <span>Note: Only the top 3 properties display glowing borders</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;

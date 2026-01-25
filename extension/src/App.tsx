import EmergencyServicesPage from "./emergencyServices/page";
import CrimeRiskPage from "./crimeRisk/page";
import GradeCard from "./GradeCard";
import { FaChevronDown, FaChevronUp } from "react-icons/fa";
import { useState } from "react";

function App() {
  const [isSafetyVisible, setIsSafetyVisible] = useState(false);

  const toggleSafetyVisibility = () => {
    setIsSafetyVisible(!isSafetyVisible);
  };

  return (
    <div className="w-90 bg-[#FFF7FA] p-4 font-sans">
      <div className="flex items-center gap-3 mb-4">
        <img src="/rer.png" alt="RER Logo" className="w-10 h-10" />
        <div>
          <h1 className="text-lg font-semibold">Rental Risk Report</h1>
          <p className="text-xs text-gray-500">Safety & livability overview</p>
        </div>
      </div>

      <div className="space-y-3">
        <div className="w-full">
          <button
            className="cursor-pointer w-full"
            onClick={toggleSafetyVisibility}
          >
            <GradeCard title="Safety Grade: " grade="B" />
            {!isSafetyVisible && (
              <FaChevronDown
                className="inline-block ml-2"
                id="safety-details"
              />
            )}
          </button>
        </div>
        {isSafetyVisible && (
          <div className="space-y-2 w-4/5 pl-20" id="safety-details">
            <div className="">
              <GradeCard title="Crime Risk: " grade={<CrimeRiskPage />} />
            </div>
            <div className="">
              <GradeCard
                title="Emergency Services: "
                grade={<EmergencyServicesPage />}
              />
            </div>
            <div className="">
              <GradeCard title="Environment & Wellness: " grade="A-" />
            </div>
          </div>
        )}
        {isSafetyVisible && (
          <div className="w-full">
            <button
              className="cursor-pointer w-full"
              onClick={toggleSafetyVisibility}
            >
              {isSafetyVisible && (
                <FaChevronUp
                  className="inline-block ml-2"
                  id="safety-details"
                />
              )}
            </button>
          </div>
        )}

        <div>
          <button className="cursor-pointer w-full">
            <GradeCard title="Current Price: " grade="FIX" />
          </button>
        </div>

        <div>
          <button className="cursor-pointer w-full">
            <GradeCard title="Market Price Estimate: " grade="FIX" />
          </button>
        </div>

        <div>
          <button className="cursor-pointer w-full">
            <GradeCard title="Convenience: " grade="FIX" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;

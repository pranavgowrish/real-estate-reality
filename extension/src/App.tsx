import EmergencyServicesPage from "./emergencyServices/page";
import CrimeRiskPage from "./crimeRisk/page";
import GradeCard from "./GradeCard";
import { FaChevronDown, FaChevronUp } from "react-icons/fa";
import { useState } from "react";
import ConvenienceCard from "./ConvenienceCard";
import RestaurantsPage from "./restaurants/page";
import ShoppingPage from "./shopping/page";
import AmenitiesPage from "./amenities/page";

function App() {
  const [isSafetyVisible, setIsSafetyVisible] = useState(false);
  const [isConvenVisible, setIsConvenVisible] = useState(false);

  const toggleSafetyVisibility = () => {
    setIsSafetyVisible(!isSafetyVisible);
  };

  const toggleConvenVisibility = () => {
    setIsConvenVisible(!isConvenVisible);
  };

  return (
    <div className="w-90 p-4">
      <div className="flex items-center gap-3 mb-4">
        <img src="/rer.png" alt="RER Logo" className="w-10 h-10" />
        <div>
          <h1 className="text-2xl shadow-2xl tracking-[-0.02em] font-extrabold">
            Real Estate Reality
          </h1>
          <p className="text-m shadow-2xl font-semibold text-[#006aff]">
            Safety & livability overview
          </p>
        </div>
      </div>

      <div className="space-y-3">
        <div className="w-full">
          <button
            className="cursor-pointer w-full"
            onClick={toggleSafetyVisibility}
          >
            <GradeCard title="Safety Grade: " grade="FIX" />
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
              <GradeCard title="Environment & Wellness: " grade="FIX" />
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
        <div className="w-full">
          <button
            className="cursor-pointer w-full"
            onClick={toggleConvenVisibility}
          >
            <GradeCard title="Convenience Grade: " grade="FIX" />
            {!isConvenVisible && (
              <FaChevronDown
                className="inline-block ml-2"
                id="conven-details"
              />
            )}
          </button>
        </div>
        {isConvenVisible && (
          <div className="space-y-2 w-4/5 pl-20" id="conven-details">
            <div className="">
              <ConvenienceCard
                title="Restaurants: "
                conven={<RestaurantsPage />}
              />
            </div>
            <div className="">
              <ConvenienceCard title="Shopping: " conven={<ShoppingPage />} />
            </div>
            <div className="">
              <ConvenienceCard title="Amenities: " conven={<AmenitiesPage />} />
            </div>
          </div>
        )}
        {isConvenVisible && (
          <div className="w-full">
            <button
              className="cursor-pointer w-full"
              onClick={toggleConvenVisibility}
            >
              {isConvenVisible && (
                <FaChevronUp
                  className="inline-block ml-2"
                  id="conven-details"
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
      </div>
    </div>
  );
}

export default App;

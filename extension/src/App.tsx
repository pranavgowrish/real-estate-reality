import EmergencyServicesPage from "./emergencyServices/page";
import GradeCard from "./GradeCard";

function App() {
  return (
    <div className="w-90 bg-[#FFF7FA] p-4 font-sans">
      <div className="flex items-center gap-3 mb-4">
        <img src="/rer.png" alt="RER Logo" className="w-10 h-10" />
        <div>
          <h1 className="text-lg font-semibold">Rental Risk Report</h1>
          <p className="text-xs text-gray-500">
            Safety & livability overview
          </p>
        </div>
      </div>

      <div className="space-y-3">
        <GradeCard title="Crime Risk: " grade="B+" /> 
        {/* FIXXXXXX */}

        <GradeCard
          title="Emergency Services: "
          grade={<EmergencyServicesPage />}
        />

        <GradeCard title="Environment & Wellness: " grade="A-" />
        {/* FIXXXXXXXX */}

        <GradeCard title="Overall Safety Grade: " grade="B" />
        {/* FIXXXXXX */}
      </div>
    </div>
  );
}

export default App;

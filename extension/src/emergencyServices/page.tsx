import { useEffect, useState } from "react";

const ZIP_CODE = "91708"; // Hardcoded ZIP

// interface Service {
//   id: string;
//   name: string;
//   type: string;
//   lat: number;
//   lon: number;
//   address?: string;
// }

function EmergencyServicesPage() {
  // const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [score, setScore] = useState(-1);

  useEffect(() => {
    const fetchServices = async () => {
      try {
        const res = await fetch(`http://127.0.0.1:8000/api/emergency-services/${ZIP_CODE}`);
        const data = await res.json();

        if (data.error) {
          console.error(data.error);
          // setServices([]);
        } else {
          // setServices(data.services);
          setScore(data.emergency_score);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchServices();
  }, []);

  if (loading) return <p>Loading emergency services...</p>;

  return (
    <div>
      {/* <h1>Emergency Services Near {ZIP_CODE}</h1>
      {services.length === 0 && <p>No emergency services found nearby.</p>}
      <ul>
        {services.map((s) => (
          <li key={s.id}>
            <strong>{s.name}</strong> ({s.type})<br />
            Coordinates: {s.lat.toFixed(5)}, {s.lon.toFixed(5)}
            {s.address && <><br />Address: {s.address}</>}
          </li>
          
        ))}
        <li>
            <strong>Emergency Score:</strong> {score >= 0 ? score.toFixed(2) : "N/A"}
        </li>
      </ul> */}
      {score >= 0 ? score.toFixed(2) : "N/A"}
    </div>
  );
}

export default EmergencyServicesPage;


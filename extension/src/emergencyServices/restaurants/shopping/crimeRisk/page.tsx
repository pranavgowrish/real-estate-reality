import { useEffect, useState } from "react";

const ZIP_CODE = "91708"; // Hardcoded ZIP

function CrimeRiskPage() {
  const [loading, setLoading] = useState(true);
  const [score, setScore] = useState(-1);

  useEffect(() => {
    const fetchServices = async () => {
      try {
        const res = await fetch(
          `http://127.0.0.1:8000/api/crime-score/${ZIP_CODE}`,
        );
        const data = await res.json();

        if (data.error) {
          console.error(data.error);
          // setServices([]);
        } else {
          // setServices(data.services);
          setScore(data.crime_score);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchServices();
  }, []);
  if (loading) return <p>Loading...</p>;

  return <div>{score >= 0 ? score.toFixed(2) : "N/A"}</div>;
}

export default CrimeRiskPage;

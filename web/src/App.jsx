import ResultsList  from "./components/ResultsList.jsx";
import { useEffect, useMemo, useState } from "react";

import { rankSites } from "./lib/scoring.js";
import { DEFAULT_WEIGHTS } from "./lib/constants.js";

export default function App() {
  // App state
  const [sites, setSites] = useState([]);
  const [targetId, setTargetId] = useState("");
  const [selectedResultId, setSelectedResultId] = useState("");

  const [weights, setWeights] = useState({
    ...DEFAULT_WEIGHTS,
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Load the location data
  useEffect(() => {
    let cancelled = false;

    async function loadSites() {
      try {
        const response = await fetch("/sites.json");

        if (!response.ok) {
          throw new Error(
            `Could not load sites.json (${response.status})`
          );
        }

        const data = await response.json();

        if (!Array.isArray(data)) {
          throw new Error("sites.json must contain an array.");
        }

        if (cancelled) return;

        setSites(data);

        const firstMarsSite = data.find(
          site => site.planet === "mars"
        );

        setTargetId(firstMarsSite?.id ?? "");
      } catch (err) {
        if (!cancelled) {
          setError(err.message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadSites();

    return () => {
      cancelled = true;
    };
  }, []);

  // Find the selected Mars target
  const marsSites = sites.filter(
    site => site.planet === "mars"
  );

  const target = marsSites.find(
    site => site.id === targetId
  );

  // Recalculate rankings when data, target, or weights change
  const results = useMemo(() => {
    if (!target) return [];

    const earthSites = sites.filter(
      site => site.planet === "earth"
    );

    return rankSites(target, earthSites, weights);
  }, [sites, target, weights]);

  // Default to the highest-ranked result
  const selectedResult =
    results.find(
      result => result.site.id === selectedResultId
    ) ?? results[0];

  function handleTargetChange(event) {
    setTargetId(event.target.value);
    setSelectedResultId("");
  }

  if (loading) {
    return <p>Loading locations…</p>;
  }

  if (error) {
    return <p role="alert">{error}</p>;
  }

  return (
    <main>
      <h1>Mars Analog Finder</h1>

      <label htmlFor="mars-target">
        Choose a Mars location:
      </label>

      <select
        id="mars-target"
        value={targetId}
        onChange={handleTargetChange}
      >
        <option value="" disabled>
          Select a location
        </option>

        {marsSites.map(site => (
          <option key={site.id} value={site.id}>
            {site.name}
          </option>
        ))}
      </select>

      <button
        type="button"
        onClick={() => setWeights({ ...DEFAULT_WEIGHTS })}
      >
        Reset weights
      </button>

      <h2>Earth matches</h2>

      {!target ? (
        <p>No Mars target available.</p>
      ) : (
        <ResultsList
          results={results}
          selectedId={selectedResult?.site.id}
          onSelect={setSelectedResultId}
        />
      )}

      {selectedResult && (
        <p>
          Selected Earth location: {selectedResult.site.name}
        </p>
      )}
    </main>
  );
}
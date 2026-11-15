import ResultsList  from "./components/ResultsList.jsx";
import { useEffect, useState } from "react";
import Globe from "./components/Globe.jsx";
import ComparisonControls from "./components/ComparisonControls.jsx";

import { rankSites } from "./lib/scoring.js";
import { adaptSites, normalizeWeights, WEIGHT_PRESETS } from "./lib/comparison.js";

export default function App() {
  // App state
  const [sites, setSites] = useState([]);
  const [targetId, setTargetId] = useState("");
  const [selectedResultId, setSelectedResultId] = useState("");

  const [weights, setWeights] = useState(() => normalizeWeights());
  const [presetId, setPresetId] = useState("equal");
  const [elevationLimit, setElevationLimit] = useState(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Load the location data
  useEffect(() => {
    let cancelled = false;

    async function loadSites() {
      try {
        const response = await fetch(`${import.meta.env.BASE_URL}sites.json`, { cache: "no-cache" });

        if (!response.ok) {
          throw new Error(
            `Could not load sites.json (${response.status})`
          );
        }

        const data = await response.json();

        if (!Array.isArray(data) && !Array.isArray(data?.sites)) {
          throw new Error("sites.json must contain an array or a sites array.");
        }

        if (cancelled) return;

        const adapted = adaptSites(data);
        setSites(adapted);

        const firstMarsSite = adapted.find(
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
    site => site.planet === "mars" && (
      elevationLimit === null || (
        Number.isFinite(site.elevation_m) &&
        site.elevation_m <= elevationLimit
      )
    )
  );

  const target = marsSites.find(
    site => site.id === targetId
  );

  // Calculate rankings from the current target and weights
  const earthSites = sites.filter(
    site => site.planet === "earth"
  );

  const results = target
    ? rankSites(target, earthSites, weights)
    : [];

  // Default to the highest-ranked result
   const selectedResult =
    results.find(
      result => result.site.id === selectedResultId
    ) ?? results[0];

   const topEarthIds = results
        .filter(result => result.score !== null)
        .slice(0, 5)
        .map(result => result.site.id);

    function selectMarsTarget(id) {
    setTargetId(id);
    setSelectedResultId("");
  }

  function handleWeightsChange(nextWeights) {
    setWeights(nextWeights);
    setPresetId("custom");
  }

  function handlePresetChange(id) {
    const preset = WEIGHT_PRESETS.find(item => item.id === id);
    if (!preset) return;

    setWeights({ ...preset.weights });
    setPresetId(id);
  }

  function handleElevationChange(limit) {
    setElevationLimit(limit);

    if (target && limit !== null && (
      !Number.isFinite(target.elevation_m) || target.elevation_m > limit
    )) {
      selectMarsTarget("");
    }
  }

  if (loading) {
    return <p>Loading locations…</p>;
  }

  if (error) {
    return <p role="alert">{error}</p>;
  }

    return (
    <main className="min-h-screen bg-slate-950 p-4 text-white">
      <h1 className="mb-6 text-2xl font-bold">
        Space Out
      </h1>

      <div className="grid items-start gap-6 lg:grid-cols-[240px_minmax(0,1fr)_300px]">

        {/* Left: target controls */}
        <section>
          <h2 className="mb-3 text-xl font-semibold">
            Mars target
          </h2>

          <ComparisonControls
            presentation="page"
            mode="mars-to-earth"
            targets={marsSites}
            targetId={targetId}
            onTargetChange={selectMarsTarget}
            weights={weights}
            onWeightsChange={handleWeightsChange}
            presetId={presetId}
            onPresetChange={handlePresetChange}
            elevationLimit={elevationLimit}
            onElevationLimitChange={handleElevationChange}
          />
        </section>

        {/* Centre: the two globes */}
        <section className="min-w-0 space-y-6">
          <div>
            <h2 className="mb-3 text-xl font-semibold">
              Mars
            </h2>

            <Globe
              sites={marsSites}
              planet="mars"
              selectedId={targetId}
              onSelect={selectMarsTarget}
            />
          </div>

          <div>
            <h2 className="mb-3 text-xl font-semibold">
              Earth
            </h2>

            <Globe
              sites={sites}
              planet="earth"
              selectedId={selectedResult?.site.id}
              highlightIds={topEarthIds}
              onSelect={setSelectedResultId}
            />
          </div>
        </section>

        {/* Right: ranking and current selection */}
        <section>
          <h2 className="mb-3 text-xl font-semibold">
            Earth matches
          </h2>

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
            <p className="mt-4">
              Selected Earth location:{" "}
              {selectedResult.site.name}
            </p>
          )}
        </section>

      </div>
    </main>
  );
}

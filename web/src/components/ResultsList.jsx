export default function ResultsList({
  results,
  selectedId,
  onSelect,
}) {
  if (results.length === 0) {
    return <p>No matching locations available.</p>;
  }

  return (
    <ol>
      {results.map(result => (
        <li key={result.site.id}>
          <button
            type="button"
            onClick={() => onSelect(result.site.id)}
            aria-pressed={selectedId === result.site.id}
          >
            {result.site.name}
            {" — "}
            {result.score === null
              ? "Insufficient data"
              : `${result.score.toFixed(1)} / 100`}
          </button>
        </li>
      ))}
    </ol>
  );
}
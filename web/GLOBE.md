# Globe component handoff

`src/components/Globe.jsx` is Programmer B's self-contained planet visualization. The parent owns the active planet, selected site, ranking and data loading.

```jsx
import Globe from './components/Globe.jsx'

<Globe
  sites={sites}
  planet={planet}              // 'mars' or 'earth'
  selectedId={selectedId}    // site.id or null
  highlightIds={topFiveIds}   // array of site.id strings
  onSelect={(id) => setSelectedId(id)}
/>
```

`sites` uses the shared `sites.json` contract (`id`, `name`, `planet`, `lat`, `lon`, optional `benchmark`). Latitudes must be −90 to 90; longitudes must be −180 to 180. Invalid or missing coordinates are excluded, not moved to zero. Markers are filtered to the active planet. A selected marker is warm peach, highlighted results are muted teal, and other Earth benchmarks are lavender. The globe recenters on the selected site; clicking a point or using the keyboard-accessible site list calls `onSelect(id)`. The parent supplies the planet toggle.

The component sizes itself to its container and offers a site list when WebGL is unavailable. It uses Tailwind classes already provided by the project. Images are served locally from `public/textures/earth.jpg` and `mars.jpg` and follow Vite's base path; see `public/textures/CREDITS.md` for source and attribution.

`public/sites.json` currently contains explicitly fake test entries; don't present it as research results. When the data team's real data is available, load it in the parent and pass it in. The current `App.jsx` remains a placeholder owned by Programmer A, so they must wire this component into the main application.

The globe and its 3D dependencies increase the JavaScript bundle substantially; consider `React.lazy` and `Suspense` when integrating if initial page load is a concern.

For an immersive viewport, pass `fill` and give the component's parent an explicit height. The preview uses `showSiteList={false}` because it provides a separate accessible location list; the default remains `true` for other integrations. The `globe-legend-overlay` styling used in this mode is supplied by `src/globe-preview.css` and should be brought into the main app's styles when integrating the immersive layout.

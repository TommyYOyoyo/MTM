# MTM (Map The Mars)

For the NASA Space-Apps Challenge 2026

## Run the globe locally

From the repository root, install the web dependencies once:

```sh
npm --prefix web ci
```

Then start the development server:

```sh
npm run dev
```

Open the local address printed in the terminal. The globe opens at
`/globe-preview.html`; the separate teammate app entry remains available at `/app.html`.
Press Ctrl+C to stop the server.

The comparison interface uses `web/public/sites.json`; replacing its sample rows
with research-reviewed rows connects the real data. See
[web/COMPARISON_DATA.md](web/COMPARISON_DATA.md) for the schema, benchmark pairings,
optional discovery candidates, and analysis files. The production home page now
opens the same comparison interface as the globe preview.

Push test from Thomas Ma :)
Push test from Christoph

Internal NAS setup scripts for macOS and Windows are in
[scripts/nas-connect](scripts/nas-connect/README.md).

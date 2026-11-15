import test from "node:test";
import assert from "node:assert/strict";

import {
    overallScore, 
    rankSites,
} from "./src/lib/scoring.js";

test("identical slope values score 100", () => {
    const target = {
        n: {slope: 0.25},
    };

    const candidate = {
        n: {slope: 0.25},
    };

    const result = overallScore(target, candidate, {
        slope: 1,
    });

    assert.equal(result.score, 100);
});

test("opposite slope values score 0", () => {
  const target = {
    n: { slope: 0 },
  };

  const candidate = {
    n: { slope: 1 },
  };

  const result = overallScore(target, candidate, {
    slope: 1,
  });

  assert.equal(result.score, 0);
});

test("weighted average matches hand calculation", () => {
  const target = {
    n: {
      slope: 0,
      albedo: 0,
    },
  };

  const candidate = {
    n: {
      slope: 0.25,
      albedo: 0.5,
    },
  };

  const result = overallScore(target, candidate, {
    slope: 3,
    albedo: 1,
  });

  assert.equal(result.score, 68.75);
});

test("missing factors are excluded from the average", () => {
  const target = {
    n: {
      slope: 0,
      albedo: 0,
    },
  };

  const candidate = {
    n: {
      slope: 0.25,
      albedo: null,
    },
  };

  const result = overallScore(target, candidate, {
    slope: 1,
    albedo: 9,
  });

  assert.equal(result.score, 75);

  const albedoPart = result.parts.find(
    part => part.factor === "albedo"
  );

  assert.equal(albedoPart.sim, null);
});

test("no usable data returns a null score", () => {
  const result = overallScore(
    { n: { slope: null } },
    { n: { slope: null } },
    { slope: 1 }
  );

  assert.equal(result.score, null);
});

test("all weights disabled returns a null score", () => {
  const result = overallScore(
    { n: { slope: 0.25 } },
    { n: { slope: 0.25 } },
    { slope: 0 }
  );

  assert.equal(result.score, null);
});

test("default weights include thermal and sun", () => {
  const target = {
    n: {
      slope: 0,
      albedo: 0,
      thermal: 0,
      sun: 0,
    },
  };

  const candidate = {
    n: {
      slope: 0,
      albedo: 0,
      thermal: 1,
      sun: 1,
    },
  };

  const result = overallScore(target, candidate);

  assert.equal(result.score, 50);
});

test("different ice categories score 0", () => {
  const result = overallScore(
    { ice: "none" },
    { ice: "glacier" },
    { ice: 1 }
  );

  assert.equal(result.score, 0);
});

test("geology uses shared tags divided by the larger list", () => {
  const result = overallScore(
    { tags: ["basaltic", "volcanic"] },
    { tags: ["basaltic"] },
    { geology: 1 }
  );

  assert.equal(result.score, 50);
});

test("out-of-range measurements throw an error", () => {
  assert.throws(() => {
    overallScore(
      { n: { slope: 0 } },
      { n: { slope: 1.5 } },
      { slope: 1 }
    );
  }, /Invalid normalized value/);
});

test("negative weights throw an error", () => {
  assert.throws(() => {
    overallScore(
      { n: { slope: 0 } },
      { n: { slope: 0 } },
      { slope: -1 }
    );
  }, /Invalid weight/);
});

test("ranking sorts scores, breaks ties, and puts missing last", () => {
  const target = {
    n: { slope: 0 },
  };

  const candidates = [
    { id: "missing", n: { slope: null } },
    { id: "worst", n: { slope: 1 } },
    { id: "best-b", n: { slope: 0 } },
    { id: "best-a", n: { slope: 0 } },
  ];

  const results = rankSites(target, candidates, {
    slope: 1,
  });

  const ids = results.map(result => result.site.id);

  assert.deepEqual(ids, [
    "best-a",
    "best-b",
    "worst",
    "missing",
  ]);
});

test("an empty candidate list returns an empty array", () => {
  const results = rankSites(
    { n: { slope: 0 } },
    []
  );

  assert.deepEqual(results, []);
});
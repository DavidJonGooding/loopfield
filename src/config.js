(function (root) {
  const config = Object.freeze({
    name: "Loopfield",
    slug: "loopfield",
    version: "0.3.0",
    repository: "https://github.com/DavidJonGooding/loopfield",
    support: "https://buymeacoffee.com/davegooding",
    site: "https://davidjongooding.github.io/loopfield/",
  });
  if (typeof module !== "undefined") module.exports = config;
  else root.loopfieldConfig = config;
})(typeof window !== "undefined" ? window : globalThis);

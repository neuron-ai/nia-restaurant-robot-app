
const {
  withAndroidManifest,
  withDangerousMod,
} = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

module.exports = function withCleartextNetwork(config) {
  config = withAndroidManifest(config, (config) => {
    const app = config.modResults.manifest.application?.[0];

    if (app) {
      app.$["android:usesCleartextTraffic"] = "true";
      app.$["android:networkSecurityConfig"] =
        "@xml/network_security_config";
    }

    return config;
  });

  return withDangerousMod(config, [
    "android",
    async (config) => {
      const xmlDir = path.join(
        config.modRequest.platformProjectRoot,
        "app",
        "src",
        "main",
        "res",
        "xml"
      );

      fs.mkdirSync(xmlDir, { recursive: true });

      fs.writeFileSync(
        path.join(xmlDir, "network_security_config.xml"),
        `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <base-config cleartextTrafficPermitted="true" />
</network-security-config>
`
      );

      return config;
    },
  ]);
};

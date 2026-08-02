// background/index.js
//
// Entry point declared in manifest.json's background.service_worker.
// Same no-bundler approach as the content scripts: importScripts() loads
// classic (non-module) files in order into one shared worker global scope
// — db.js's functions are what importDictionaryData.js and
// messageRouter.js call directly, no import/export syntax needed.

importScripts('../utils/base64.js', 'db.js', 'importDictionaryData.js', 'messageRouter.js');

#!/usr/bin/env node
// Thin launcher so the bin shim is linked at install time (when dist/ may not
// exist yet). The real CLI lives in the built dist and runs on import.
import "../dist/cli.js";

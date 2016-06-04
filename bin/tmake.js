#!/usr/bin/env node
var path = require('path');
var fs = require('fs');
var argv = require('minimist')(process.argv.slice(2));
var binDir = path.dirname(fs.realpathSync(__filename))
var libDir = path.join(binDir, '../lib');
var npmDir = path.join(binDir, '../');
require('source-map-support').install()
require(libDir + '/config.js')(argv, binDir, npmDir).run();
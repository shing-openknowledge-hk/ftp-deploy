"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// import 'dotenv/config';
// const { dirname } = require('path');
// import {config} from  'dotenv';
var dotenv = require('dotenv');
// import fs from "fs";
const fsSync = require('fs');
class ENVConfigLoader {
    constructor() {
    }
    load(pathArray) {
        var target = {};
        for (var i = pathArray.length - 1; i >= 0; i--) {
            this.loadPathIntoTarget(target, pathArray[i]);
        }
        return target;
    }
    copyTo(from, to) {
        for (var key in from) {
            var value = from[key];
            to[key] = value;
        }
    }
    loadPathIntoTarget(target, path) {
        var loadedConfig;
        if (path) {
            if (fsSync.existsSync(path)) {
                loadedConfig = dotenv.config({ path: path });
            }
        }
        else {
            loadedConfig = dotenv.config();
        }
        if (loadedConfig)
            this.copyTo(loadedConfig.parsed, target);
    }
}
module.exports = ENVConfigLoader;

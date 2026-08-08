'use strict';

const { contextBridge, webUtils } = require('electron');

contextBridge.exposeInMainWorld('coffeeDesktop', {
  getPathForFile(file) {
    return webUtils.getPathForFile(file);
  },
});
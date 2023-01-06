const { ipcRenderer } = require('electron');

document.addEventListener('DOMContentLoaded', () => {
    ipcRenderer.on('log', (_, arg) => {
        document.querySelector('#logger').innerText += `${arg}\n`;
    });
});
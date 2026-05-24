// index.js (Versión Final Directa)
require('dotenv').config();
const { chromium } = require('playwright');

const ZENROWS_KEY = process.env.ZENROWS_KEY;
const TARGET_URL = 'https://www.idealista.com/venta-viviendas/aguilas-murcia/?ordenado-por=fecha-publicacion-desc';

(async () => {
    console.log('Iniciando extracción mediante ZenRows...');
    
    // ZenRows se encarga de todo el lío de los proxies y Datadome
    const url = `https://api.zenrows.com/v1/?apikey=${ZENROWS_KEY}&url=${encodeURIComponent(TARGET_URL)}&antibot=true&premium_proxy=true&proxy_country=es`;
    
    const response = await fetch(url);
    const html = await response.text();
    
    if (response.ok) {
        console.log('¡HTML recibido con éxito!');
        // Aquí iría tu lógica de parseo con Playwright (como ya teníamos antes)
    } else {
        console.log('Error de ZenRows:', response.status);
    }
})();

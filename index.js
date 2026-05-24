require('dotenv').config();
const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');

// 1. Conexión con la caja fuerte
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const ZENROWS_KEY = process.env.ZENROWS_KEY;

// 2. Base de Datos y Territorio
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const TARGET_URL = 'https://www.idealista.com/venta-viviendas/aguilas-murcia/?ordenado-por=fecha-publicacion-desc';

async function sendTelegramMessage(text) {
  const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: text, parse_mode: 'HTML' })
  });
}

(async () => {
  console.log('Iniciando Radar PropTech (Modo Blindado ZenRows)...');
  
  try {
    // 3. El Ariete: ZenRows con Anti-Bot y Proxy Premium de España
    const zenrowsUrl = `https://api.zenrows.com/v1/?apikey=${ZENROWS_KEY}&url=${encodeURIComponent(TARGET_URL)}&antibot=true&premium_proxy=true&proxy_country=es`;
    
    console.log('Enviando petición a ZenRows para reventar Datadome...');
    const response = await fetch(zenrowsUrl);
    const html = await response.text();
    
    // Si Idealista bloquea excepcionalmente el intento, abortamos en silencio para no generar falsos errores
    if (!response.ok || html.includes('captcha') || html.toLowerCase().includes('datadome')) {
      console.log('ZenRows fue bloqueado en este intento. Nos retiramos para reintentar en el próximo ciclo.');
      return;
    }

    console.log('¡Datadome superado! HTML capturado. Parseando datos en entorno cerrado...');

    // 4. Leer el código en local con Playwright (Sin navegar a internet)
    const browser = await chromium.launch();
    const page = await browser.newPage();
    await page.setContent(html); 
    
    // 5. Extraer anuncios y limpiar agencias
    const anuncios = await page.$$eval('article.item', nodes => {
      return nodes.map(node => {
        const id = node.getAttribute('data-adid');
        const linkEl = node.querySelector('.item-link');
        const priceEl = node.querySelector('.item-price');
        const isAgency = node.querySelector('.item-logo') !== null; 
        
        return {
          id: id,
          title: linkEl ? linkEl.innerText.trim() : 'Sin título',
          url: linkEl ? 'https://www.idealista.com' + linkEl.getAttribute('href') : null,
          price: priceEl ? priceEl.innerText.trim() : 'Precio desconocido',
          isAgency: isAgency
        };
      }).filter(item => item.id && !item.isAgency); 
    });

    console.log(`Particulares reales detectados en Página 1: ${anuncios.length}`);

    // 6. El Motor Delta (Cruce con el CRM)
    for (const piso of anuncios) {
      const { data } = await supabase
        .from('propiedades_rastreadas')
        .select('id')
        .eq('id_anuncio', piso.id);

      if (data && data.length === 0) {
        console.log(`¡NUEVO LEAD FRESCO! ID: ${piso.id}`);
        
        const mensaje = `🚨 <b>¡NUEVO PISO DE PARTICULAR!</b> 🚨\n\n📍 <b>Zona:</b> Águilas, Murcia\n💶 <b>Precio:</b> ${piso.price}\n\n🔗 <a href="${piso.url}">Ver Anuncio</a>`;
        await sendTelegramMessage(mensaje);

        // Guardarlo en Supabase
        await supabase.from('propiedades_rastreadas').insert([
          { id_anuncio: piso.id, estado: 'Enviado_Agente' }
        ]);
        console.log(`Lead guardado en el CRM. (ID: ${piso.id})`);
      }
    }
    
    await browser.close();
    console.log('Misión completada. Desconectando.');
    
  } catch (error) {
    console.error('Error de ejecución en el motor ZenRows:', error);
  }
})();

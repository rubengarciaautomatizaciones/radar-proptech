require('dotenv').config();
const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');

// 1. Conexión con las variables de entorno (Caja fuerte de GitHub)
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const SCRAPERAPI_KEY = process.env.SCRAPERAPI_KEY;

// 2. Inicializar la Base de Datos
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// 3. El Territorio (La URL de tu demo)
const TARGET_URL = 'https://www.idealista.com/venta-viviendas/aguilas-murcia/?ordenado-por=fecha-publicacion-desc';

// Función para disparar la alerta por Telegram
async function sendTelegramMessage(text) {
  const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: text, parse_mode: 'HTML' })
  });
}

(async () => {
  console.log('Iniciando Radar PropTech...');
  
  // 4. Arrancar el navegador camuflado con ScraperAPI
  const browser = await chromium.launch({
    proxy: { server: `http://scraperapi.premium=true.country_code=es:${SCRAPERAPI_KEY}@proxy-server.scraperapi.com:8001` }
  });
  
  const page = await browser.newPage();
  
  try {
    console.log('Accediendo al portal...');
    await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 150000 });
    
    // 5. Extraer anuncios y aplicar el Filtro "Particular"
    const anuncios = await page.$$eval('article.item', nodes => {
      return nodes.map(node => {
        const id = node.getAttribute('data-adid');
        const linkEl = node.querySelector('.item-link');
        const priceEl = node.querySelector('.item-price');
        // Las agencias suelen tener la clase .item-logo. Si existe, es agencia.
        const isAgency = node.querySelector('.item-logo') !== null; 
        
        return {
          id: id,
          title: linkEl ? linkEl.innerText.trim() : 'Sin título',
          url: linkEl ? 'https://www.idealista.com' + linkEl.getAttribute('href') : null,
          price: priceEl ? priceEl.innerText.trim() : 'Precio desconocido',
          isAgency: isAgency
        };
      }).filter(item => item.id && !item.isAgency); // Nos quedamos solo con particulares
    });

    console.log(`Escaneo de Página 1 completado. Particulares detectados: ${anuncios.length}`);

    // 6. El Motor Delta (Cruce con Supabase)
    for (const piso of anuncios) {
      const { data, error } = await supabase
        .from('propiedades_rastreadas')
        .select('id')
        .eq('id_anuncio', piso.id);

      if (data && data.length === 0) {
        // ¡BINGO! Es un piso nuevo que no está en la base de datos
        console.log(`¡NUEVO DELTA DETECTADO! ID: ${piso.id}`);
        
        const mensaje = `🚨 <b>¡NUEVO PISO DE PARTICULAR!</b> 🚨\n\n📍 <b>Zona:</b> Águilas, Murcia\n💶 <b>Precio:</b> ${piso.price}\n\n🔗 <a href="${piso.url}">Ver Anuncio</a>`;
        
        await sendTelegramMessage(mensaje);

        // Guardarlo en Supabase para no repetir la alerta en los próximos 10 minutos
        await supabase.from('propiedades_rastreadas').insert([
          { id_anuncio: piso.id, estado: 'Enviado_Agente' }
        ]);
        
        console.log(`Alerta enviada y guardada en CRM. (ID: ${piso.id})`);
      }
    }
  } catch (error) {
    console.error('Error durante el rastreo (Posible bloqueo o timeout):', error);
  } finally {
    await browser.close();
    console.log('Radar desconectado. Esperando próximo ciclo.');
  }
})();

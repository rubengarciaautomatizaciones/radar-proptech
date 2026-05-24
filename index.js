require('dotenv').config();
const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');

// Configuración de clientes
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const ZENROWS_KEY = process.env.ZENROWS_KEY;

const TARGET_URL = 'https://www.idealista.com/venta-viviendas/aguilas-murcia/?ordenado-por=fecha-publicacion-desc';

async function sendTelegramMessage(text) {
  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: text, parse_mode: 'HTML' })
    });
  } catch (error) {
    console.error('Error enviando a Telegram:', error);
  }
}

(async () => {
  console.log('--- Iniciando Radar PropTech (Modo Todo Incluido) ---');
  
  // 1. Obtener HTML mediante ZenRows
  const zenrowsUrl = `https://api.zenrows.com/v1/?apikey=${ZENROWS_KEY}&url=${encodeURIComponent(TARGET_URL)}&antibot=true&premium_proxy=true&proxy_country=es`;
  const response = await fetch(zenrowsUrl);
  const html = await response.text();
  
  if (!response.ok) {
    console.error('Error al obtener HTML con ZenRows:', response.status);
    return;
  }
  
  // 2. Parsear el HTML
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent(html);
  
  const anuncios = await page.$$eval('article.item', nodes => {
    return nodes.map(node => {
      const linkEl = node.querySelector('.item-link');
      return {
        id: node.getAttribute('data-adid'),
        title: linkEl ? linkEl.innerText.trim() : 'Sin título',
        url: linkEl ? 'https://www.idealista.com' + linkEl.getAttribute('href') : null,
        price: node.querySelector('.item-price') ? node.querySelector('.item-price').innerText.trim() : 'N/A',
        isAgency: node.querySelector('.item-logo') !== null ? 'Agencia' : 'Particular'
      };
    }).filter(piso => piso.id); // Solo filtramos que tenga ID
  });

  console.log(`Anuncios encontrados en total: ${anuncios.length}`);

  // 3. Procesar resultados (Guardar en Supabase y Avisar)
  for (const piso of anuncios) {
    // Verificamos si ya existe en la DB
    const { data: existente } = await supabase
      .from('propiedades_rastreadas')
      .select('id_anuncio')
      .eq('id_anuncio', piso.id)
      .maybeSingle();

    if (!existente) {
      // Guardar en Supabase
      const { error } = await supabase
        .from('propiedades_rastreadas')
        .insert([{ id_anuncio: piso.id, estado: 'Enviado', tipo: piso.isAgency }]);
      
      if (error) {
        console.error(`Error guardando ${piso.id}:`, error.message);
      } else {
        // Enviar a Telegram
        await sendTelegramMessage(`🏠 <b>${piso.isAgency}</b>\n💶 ${piso.price}\n🔗 <a href="${piso.url}">${piso.title}</a>`);
        console.log(`Nuevo anuncio detectado y guardado: ${piso.id}`);
      }
    }
  }

  await browser.close();
  console.log('--- Ciclo finalizado ---');
})();

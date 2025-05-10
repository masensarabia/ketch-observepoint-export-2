// ketchExport.js
(function(){
  console.log('ketchExport.js loaded');

  // immediately install the API onto window.ketch
  window.ketch = {
    exportConsentData: async function() {
      // 1) find the Ketch config.json URL
      const entries = performance.getEntriesByType('resource').map(r=>r.name);
      const configUrl = entries.find(n=>/\/config\/.*\/config\.json/.test(n));
      if (!configUrl) {
        alert('⚠️ Open & save the Ketch consent modal first');
        throw new Error('config.json URL not found');
      }

      // 2) fetch the Ketch config + open‑cookie‑database
      const [cfg, db] = await Promise.all([
        fetch(configUrl).then(r=>r.json()),
        fetch('https://cdn.jsdelivr.net/gh/jkwakman/Open-Cookie-Database@master/open-cookie-database.json').then(r=>r.json())
      ]);

      const flat = Object.values(db).flat();
      const host = location.hostname.replace(/^www\./,'');

      // 3) build cookieRows
      const cookieRows = (cfg.purposes||cfg.categories||[]).flatMap(cat=>{
        const catName = cat.title||cat.name||'';
        return (cat.cookies||[]).map(c=>{
          const name   = c.name||c.code||c.ID||'';
          const vendor = c.serviceProvider||'';
          const raw    = (flat.find(d=>d.cookie===name||(d.wildcardMatch==='1'&&name.indexOf(d.cookie)===0))||{}).domain||'';
          const m      = raw.match(/([a-z0-9\.-]+\.[a-z]{2,})(?=(?:\s|\(|$))/i);
          const dom    = vendor ? (m?m[1]:'') : host;
          return [catName, name, dom, vendor];
        });
      });

      // 4) build tagRows
      const tagMap = new Map();
      (cfg.purposes||cfg.categories||[]).forEach(cat=>{
        const catName = cat.title||cat.name||'';
        (cat.cookies||[]).forEach(c=>{
          const v = c.serviceProvider||'';
          if (v) tagMap.set(catName+'‖'+v, [catName, v]);
        });
      });
      const tagRows = Array.from(tagMap.values());

      // 5) structure into categories
      const categories = Array.from(new Set(cookieRows.map(r=>r[0]))).map(name=>({
        name,
        cookies: cookieRows.filter(r=>r[0]===name),
        tags:    tagRows.filter(r=>r[0]===name)
      }));

      return { categories, cookieRows, tagRows, domain: host };
    },

    downloadCSVs: function({ cookieRows, tagRows, domain }) {
      function dl(rows, fn, headers) {
        const csv = [headers, ...rows]
          .map(r=>r.map(f=>`"${(f||'')}"`).join(','))
          .join('\r\n');
        const blob = new Blob([csv], { type:'text/csv' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = fn;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
      dl(cookieRows, `ketch_cookies_${domain}.csv`, ['Consent Category','Cookie Name','Cookie Domain','Vendor']);
      dl(tagRows,    `ketch_tags_${domain}.csv`,    ['Consent Category','Tag Name']);
    }
  };

  console.log('ketchExport.js ready');
})();

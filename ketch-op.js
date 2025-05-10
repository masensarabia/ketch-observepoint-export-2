// ketch-op.js
(async function(){
  console.log('ketch-op.js loaded');

  // 1) prompt for your ObservePoint API key (or leave blank to only export CSVs)
  const apiKey = prompt('Enter ObservePoint API Key (leave blank to Export only):');

  // 2) grab the consent data from window.ketch
  let data;
  try {
    data = await window.ketch.exportConsentData();
  } catch(e) {
    return; // aborted because modal not open
  }

  // if no key, just download CSVs and exit
  if (!apiKey) {
    return window.ketch.downloadCSVs(data);
  }

  // 3) ask Import vs Update
  const action = prompt('Choose action: Import or Update').toLowerCase();
  if (!['import','update'].includes(action)) {
    return alert('Invalid action – must be Import or Update');
  }

  // 4) helper to call the OP API
  const opFetch = (url, opts={}) =>
    fetch(url, {
      ...opts,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept':        'application/json',
        ...(opts.body?{'Content-Type':'application/json'}:{})
      }
    }).then(r=>r.json());

  if (action === 'import') {
    // --- IMPORT FLOW ---
    const doTags    = confirm('Include tags?');
    const doCookies = confirm('Include cookies?');

    for (const cat of data.categories) {
      // a) create the category
      const created = await opFetch(
        'https://app.observepoint.com/api/v3/consent-categories',
        {
          method: 'POST',
          body: JSON.stringify({
            name:       cat.name,
            notes:      '',
            type:       'approved',
            isDefaultCC:false
          })
        }
      );
      const id = created.id;

      // b) PATCH cookies
      if (doCookies && cat.cookies.length) {
        const ops = cat.cookies.map((c,i)=>({
          op:    'add',
          path:  `/${i}`,
          value:{
            nameType:   'name_exact_match',
            name:       c[1],
            domainType: 'domain_exact_match',
            domain:     c[2]
          }
        }));
        await opFetch(
          `https://app.observepoint.com/api/v3/consent-categories/${id}/cookies`,
          { method:'PATCH', body: JSON.stringify(ops) }
        );
      }

      // c) PATCH tags
      if (doTags && cat.tags.length) {
        const ops = cat.tags.map((t,i)=>({
          op:    'add',
          path:  `/${i}`,
          value:{ tagId:t[1], accounts:[] }
        }));
        await opFetch(
          `https://app.observepoint.com/api/v3/consent-categories/${id}/tags`,
          { method:'PATCH', body: JSON.stringify(ops) }
        );
      }
    }

    alert('Import complete!');

  } else {
    // --- UPDATE FLOW ---
    // a) fetch existing library
    const lib = await opFetch(
      'https://app.observepoint.com/api/v3/consent-categories/library?page=0&pageSize=100&sortBy=updated_at&sortDesc=true'
    );

    // b) let user pick which existing categories to update
    const names = data.categories.map(c=>c.name).join(', ');
    const pick  = prompt(
      `Found ${data.categories.length} categories: [${names}]\n`+
      'Enter the SAME N existing names (comma‑separated) to update:'
    );
    const selected = pick.split(',').map(s=>s.trim());
    if (selected.length !== data.categories.length) {
      return alert(`Must select exactly ${data.categories.length} names`);
    }

    // c) loop & sync each
    for (let i=0; i<data.categories.length; i++) {
      const newCat  = data.categories[i];
      const existing = lib.consentCategories.find(ec=>
        selected[i] && ec.name.includes(selected[i])
      );
      if (!existing) {
        return alert(`Could not match "${selected[i]}"`);
      }
      const id = existing.id;

      // remove old cookies
      const oldC = await opFetch(`https://app.observepoint.com/api/v3/consent-categories/${id}/cookies`);
      const remC = oldC.cookies.map((_,j)=>({ op:'remove', path:'/0' }));
      if (remC.length) {
        await opFetch(
          `https://app.observepoint.com/api/v3/consent-categories/${id}/cookies`,
          { method:'PATCH', body: JSON.stringify(remC) }
        );
      }
      // add new cookies
      const addC = newCat.cookies.map((c,j)=>({
        op:'add',
        path:`/${j}`,
        value:{
          nameType:   'name_exact_match',
          name:       c[1],
          domainType: 'domain_exact_match',
          domain:     c[2]
        }
      }));
      if (addC.length) {
        await opFetch(
          `https://app.observepoint.com/api/v3/consent-categories/${id}/cookies`,
          { method:'PATCH', body: JSON.stringify(addC) }
        );
      }

      // remove old tags
      const oldT = await opFetch(`https://app.observepoint.com/api/v3/consent-categories/${id}/tags`);
      const remT = oldT.tags.map((_,j)=>({ op:'remove', path:'/0' }));
      if (remT.length) {
        await opFetch(
          `https://app.observepoint.com/api/v3/consent-categories/${id}/tags`,
          { method:'PATCH', body: JSON.stringify(remT) }
        );
      }
      // add new tags
      const addT = newCat.tags.map((t,j)=>({
        op:'add',
        path:`/${j}`,
        value:{ tagId:t[1], accounts:[] }
      }));
      if (addT.length) {
        await opFetch(
          `https://app.observepoint.com/api/v3/consent-categories/${id}/tags`,
          { method:'PATCH', body: JSON.stringify(addT) }
        );
      }
    }

    alert('Update complete!');
  }
})();

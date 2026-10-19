// Gedeelde Supabase-client. URL en sleutel staan als data-attributen op <body> (uit content/supabase.yaml).
(function () {
  if (!window.supabase) return;
  const { sbUrl, sbKey } = document.body.dataset;
  window.sb = window.supabase.createClient(sbUrl, sbKey);

  // Is de ingelogde gebruiker beheerder? (false als niet ingelogd)
  window.sbIsAdmin = async function () {
    const { data: { session } } = await window.sb.auth.getSession();
    if (!session) return false;
    const { data, error } = await window.sb.rpc("is_admin");
    return !error && data === true;
  };
})();

/**
 * JEEVIKA ERP v2 — Supabase Realtime Sync Client
 * Helper for listening to real-time database changes on jeevika_erp tables.
 */
(function (global) {
  let _supabaseClient = null;

  function getClient() {
    if (_supabaseClient) return _supabaseClient;
    if (typeof supabase !== 'undefined' && supabase.createClient) {
      const cfg = global.SUPABASE_CONFIG || (global.APP_CONFIG && {
        url: global.APP_CONFIG.SUPABASE_URL,
        anonKey: global.APP_CONFIG.SUPABASE_ANON_KEY
      });
      if (cfg && cfg.url && cfg.anonKey) {
        _supabaseClient = supabase.createClient(cfg.url, cfg.anonKey);
      }
    }
    return _supabaseClient;
  }

  function subscribeTable(tableName, onEvent, schema = 'jeevika_erp') {
    const client = getClient();
    if (!client) {
      console.warn('[Supabase Realtime] Client not initialized. Ensure @supabase/supabase-js is loaded.');
      return null;
    }

    const channelName = `realtime-${schema}-${tableName}`;
    const channel = client
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: schema, table: tableName },
        (payload) => {
          console.log(`[Supabase Realtime] ${schema}.${tableName} event:`, payload.eventType, payload);
          if (typeof onEvent === 'function') {
            onEvent(payload);
          }
        }
      )
      .subscribe((status) => {
        console.log(`[Supabase Realtime] Channel ${channelName} status:`, status);
      });

    return channel;
  }

  global.JeevikaRealtime = {
    getClient: getClient,
    subscribeTable: subscribeTable
  };
})(typeof window !== 'undefined' ? window : this);

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

Deno.serve(() => new Response(
  JSON.stringify({ ok: false, error: 'android build proxy retired; builds use the standard Android toolchain directly' }),
  {
    status: 410,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  },
));

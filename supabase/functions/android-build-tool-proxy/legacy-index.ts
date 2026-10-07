Deno.serve(async (req: Request) => {
  const u = new URL(req.url);
  const file = u.searchParams.get('file') || '';
  const urls: Record<string,string> = {
    r8: 'https://dl.google.com/dl/android/maven2/com/android/tools/r8/8.6.17/r8-8.6.17.jar',
    aapt2: 'https://dl.google.com/dl/android/maven2/com/android/tools/build/aapt2/8.6.1-11315950/aapt2-8.6.1-11315950-linux.jar',
    buildtools35: 'https://dl.google.com/android/repository/build-tools_r35_linux.zip',
    uber: 'https://github.com/patrickfav/uber-apk-signer/releases/download/v1.3.0/uber-apk-signer-1.3.0.jar'
  };
  if (!urls[file]) return new Response('not found',{status:404});
  const r = await fetch(urls[file]);
  if (!r.ok) return new Response('upstream '+r.status,{status:502});
  const h = new Headers();
  h.set('content-type', r.headers.get('content-type') || 'application/octet-stream');
  h.set('content-disposition', `attachment; filename="${file}"`);
  return new Response(r.body,{status:200,headers:h});
});

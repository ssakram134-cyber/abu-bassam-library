import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.58.0';

const statusLabels: Record<string, string> = {
  received: 'تم الاستلام', waiting: 'بانتظار المتابعة', inspection: 'قيد الفحص', awaiting_approval: 'بانتظار موافقة الزبون',
  awaiting_part: 'بانتظار قطعة', waiting_parts: 'بانتظار قطعة', in_progress: 'قيد التنفيذ', completed: 'تم إكمال الصيانة', ready: 'تم الإنجاز وجاهز للتسليم',
  delivered: 'تم التسليم', rejected: 'مرفوض', returned: 'راجع', unrepairable: 'غير قابل للإصلاح', abandoned: 'متروك بالمحل',
};
const statusColors: Record<string, string> = {
  received: '#2563eb', waiting: '#64748b', inspection: '#0284c7', awaiting_approval: '#9333ea', awaiting_part: '#ea580c', waiting_parts: '#ea580c',
  in_progress: '#d97706', completed: '#059669', ready: '#059669', delivered: '#475569', rejected: '#dc2626', returned: '#7c3aed', unrepairable: '#dc2626', abandoned: '#991b1b',
};
const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char] || char));

const page = (repair: Record<string, unknown>) => {
  const status = String(repair.status || 'received');
  const expected = repair.expected_delivery ? new Date(String(repair.expected_delivery)) : null;
  const expectedIso = expected && !Number.isNaN(expected.getTime()) ? expected.toISOString() : '';
  const device = [repair.brand, repair.model].filter(Boolean).join(' ');
  return `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src 'self' data:">
  <title>متابعة حالة الصيانة</title><style>*{box-sizing:border-box}body{margin:0;background:#f0fdfa;color:#172033;font-family:Tahoma,Arial,sans-serif;min-height:100vh;display:grid;place-items:center;padding:18px}.card{width:min(520px,100%);background:#fff;border:1px solid #ccfbf1;border-radius:24px;padding:24px;box-shadow:0 16px 45px #0f766e22}.brand{text-align:center;color:#0f766e;font-weight:800;font-size:22px}.sub{text-align:center;color:#64748b;font-size:13px;margin-top:7px}.status{margin:22px 0;padding:17px;border-radius:16px;text-align:center;background:${statusColors[status] || '#0f766e'}18;border:1px solid ${statusColors[status] || '#0f766e'}66}.status small{display:block;color:#64748b;margin-bottom:6px}.status b{color:${statusColors[status] || '#0f766e'};font-size:21px}.row{display:flex;justify-content:space-between;gap:12px;padding:12px 0;border-bottom:1px dashed #e2e8f0}.row span{color:#64748b}.row b{text-align:left}.count{margin-top:18px;background:#0f172a;color:#fff;border-radius:16px;padding:16px;text-align:center}.count small{display:block;color:#cbd5e1;margin-bottom:7px}.timer{font-size:23px;font-weight:800;direction:ltr}.note{margin-top:15px;color:#64748b;font-size:12px;line-height:1.8;text-align:center}.dot{width:9px;height:9px;border-radius:50%;background:#10b981;display:inline-block;margin-left:5px}.privacy{margin-top:18px;font-size:10px;color:#94a3b8;text-align:center}</style></head><body><main class="card"><div class="brand">مكتبة أبو بسام للتصوير والقرطاسية</div><div class="sub"><span class="dot"></span>حالة محدثة من نظام الورشة</div><section class="status"><small>حالة الجهاز الآن</small><b>${escapeHtml(statusLabels[status] || status)}</b></section><div class="row"><span>رقم الوصل</span><b>${escapeHtml(repair.repair_number || '—')}</b></div><div class="row"><span>الجهاز</span><b>${escapeHtml(device || '—')}</b></div><div class="row"><span>تاريخ الاستلام</span><b>${escapeHtml(new Date(String(repair.received_date || repair.created_at)).toLocaleString('ar-IQ'))}</b></div>${expectedIso ? `<div class="row"><span>التسليم المتوقع</span><b>${escapeHtml(expected?.toLocaleString('ar-IQ'))}</b></div><section class="count"><small>الوقت المتبقي حتى الموعد المتوقع</small><div id="timer" class="timer">—</div></section>` : '<div class="note">لم يُحدد موعد تسليم متوقع بعد. ستظهر الحالة الجديدة هنا عند تحديثها.</div>'}<div class="note">تتغير حالة الجهاز فور تحديثها من الورشة. تُحدّث الصفحة تلقائياً كل دقيقة.</div><div class="privacy">لا تعرض هذه الصفحة رقم الهاتف أو البيانات المالية أو أسعار قطع الغيار.</div></main>${expectedIso ? `<script>const target=new Date(${JSON.stringify(expectedIso)}).getTime();function tick(){const d=target-Date.now(),el=document.getElementById('timer');if(!el)return;if(d<=0){el.textContent='حان موعد التسليم المتوقع';return}const days=Math.floor(d/86400000),hours=Math.floor(d%86400000/3600000),mins=Math.floor(d%3600000/60000);el.textContent=days+' يوم · '+hours+' ساعة · '+mins+' دقيقة'}tick();setInterval(tick,30000);setTimeout(()=>location.reload(),60000)</script>` : '<script>setTimeout(()=>location.reload(),60000)</script>'}</body></html>`;
};

Deno.serve(async (request: Request) => {
  if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 });
  const token = new URL(request.url).searchParams.get('token') || '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token)) {
    return new Response('رمز التتبع غير صالح', { status: 400, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
  }
  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) return new Response('Service unavailable', { status: 503 });
  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data, error } = await supabase.from('repairs')
    .select('repair_number,brand,model,status,expected_delivery,received_date,created_at,updated_at')
    .eq('tracking_token', token).maybeSingle();
  if (error) return new Response('تعذر تحميل حالة الصيانة', { status: 500, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
  if (!data) return new Response('طلب الصيانة غير موجود', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
  return new Response(page(data), { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' } });
});

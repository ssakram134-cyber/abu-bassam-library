import { createClient } from 'npm:@supabase/supabase-js@2.117.2';

const jsonHeaders = { 'Content-Type': 'application/json; charset=utf-8' };
const allowedRoles = new Set(['owner', 'manager', 'technician', 'reception']);

type TriageRequest = { description?: string; brand?: string; model?: string };
type TriageResponse = { summary: string; inspection_questions: string[]; suspected_areas: string[]; safety_notes: string[]; model: string };

function normalizeArray(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((x) => String(x ?? '').trim()).filter(Boolean).slice(0, max);
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405, headers: jsonHeaders });
  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: jsonHeaders });

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const gatewayKey = Deno.env.get('AI_GATEWAY_API_KEY') ?? '';
    const gatewayUrl = Deno.env.get('AI_GATEWAY_URL') ?? 'https://ai-gateway.vercel.sh/v1/chat/completions';
    const gatewayModel = Deno.env.get('AI_GATEWAY_MODEL') ?? 'openai/gpt-5.4-mini';
    if (!supabaseUrl || !anonKey) throw new Error('Supabase runtime configuration is missing');
    if (!gatewayKey) return new Response(JSON.stringify({ error: 'ai_gateway_not_configured' }), { status: 503, headers: jsonHeaders });

    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: jsonHeaders });
    const { data: role, error: roleError } = await supabase.rpc('current_app_role');
    if (roleError || !role || !allowedRoles.has(String(role))) return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: jsonHeaders });

    const body = (await req.json()) as TriageRequest;
    const description = String(body.description ?? '').trim();
    const brand = String(body.brand ?? '').trim();
    const model = String(body.model ?? '').trim();
    if (description.length < 3 || description.length > 3000) return new Response(JSON.stringify({ error: 'invalid_description' }), { status: 400, headers: jsonHeaders });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);
    let gatewayResponse: Response;
    try {
      gatewayResponse = await fetch(gatewayUrl, {
        method: 'POST',
        signal: controller.signal,
        headers: { Authorization: `Bearer ${gatewayKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: gatewayModel,
          temperature: 0.1,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: 'أنت مساعد استقبال لمركز صيانة هواتف. لا تشخّص تشخيصاً نهائياً ولا تدّعي اليقين. حوّل كلام العميل إلى ملخص فني منظم واقترح أسئلة/فحوص آمنة للفني. أخرج JSON فقط بالمفاتيح: summary نص عربي موجز، inspection_questions مصفوفة حتى 8 عناصر، suspected_areas مصفوفة حتى 6 عناصر، safety_notes مصفوفة حتى 4 عناصر. لا تطلب كلمات مرور أو بيانات شخصية ولا تضع أسعاراً.' },
            { role: 'user', content: `الجهاز: ${[brand, model].filter(Boolean).join(' ') || 'غير محدد'}\nوصف العميل للعطل: ${description}` },
          ],
        }),
      });
    } finally { clearTimeout(timeout); }

    if (!gatewayResponse.ok) {
      const detail = (await gatewayResponse.text()).slice(0, 500);
      console.error('AI Gateway error', gatewayResponse.status, detail);
      return new Response(JSON.stringify({ error: 'ai_gateway_failed' }), { status: 502, headers: jsonHeaders });
    }

    const gatewayJson = await gatewayResponse.json();
    const content = gatewayJson?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) throw new Error('AI Gateway returned empty content');
    const parsed = JSON.parse(content);
    const result: TriageResponse = {
      summary: String(parsed?.summary ?? '').trim().slice(0, 1200),
      inspection_questions: normalizeArray(parsed?.inspection_questions, 8),
      suspected_areas: normalizeArray(parsed?.suspected_areas, 6),
      safety_notes: normalizeArray(parsed?.safety_notes, 4),
      model: gatewayModel,
    };
    if (!result.summary) throw new Error('AI Gateway result did not include summary');
    return new Response(JSON.stringify(result), { status: 200, headers: jsonHeaders });
  } catch (error) {
    console.error('repair-triage failed', error);
    return new Response(JSON.stringify({ error: 'triage_failed' }), { status: 500, headers: jsonHeaders });
  }
});

import process from 'process';
import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';

let cachedModels = null;
let cachedAt = 0;

/**
 * Fetches live model availability from Netlify AI Gateway (cached 10 mins)
 * so we never rely on hardcoded stale model IDs.
 */
async function resolveGatewayModel(preferredProvider) {
  const now = Date.now();
  if (cachedModels && now - cachedAt < 10 * 60 * 1000) {
    return cachedModels[preferredProvider] || null;
  }

  try {
    const res = await fetch('https://api.netlify.com/api/v1/ai-gateway/providers/detailed', {
      signal: AbortSignal.timeout(4000)
    });
    if (res.ok) {
      const data = await res.json();
      const map = {};
      const list = Array.isArray(data) ? data : (data.providers || []);
      for (const p of list) {
        const id = (p.id || p.provider || '').toLowerCase();
        const models = (p.models || []).map(m => (typeof m === 'string' ? m : m.id || m.name)).filter(Boolean);
        if (id.includes('google') || id.includes('gemini')) {
          const flash = models.find(m => m.includes('flash') && !m.includes('lite') && !m.includes('image')) || models[0];
          if (flash) map.gemini = flash;
        }
        if (id.includes('openai')) {
          const gpt = models.find(m => !m.includes('image') && !m.includes('audio') && !m.includes('transcribe') && !m.includes('tts')) || models[0];
          if (gpt) map.openai = gpt;
        }
      }
      cachedModels = map;
      cachedAt = now;
      return map[preferredProvider] || null;
    }
  } catch (e) {
    // Non-fatal: fall through
  }
  return null;
}

function buildAgronomistPrompt({ question, activeZone, profile, weather, tapTimer, logs, cvMetrics }) {
  const sectionName = activeZone?.name || 'All Lawn Sections (Entire Property)';
  const grassType = activeZone?.grassType || profile?.grassType || 'Bermuda / Couch';
  const hoc = activeZone?.hoc || profile?.hoc || 15;
  const area = activeZone?.area || profile?.lawnArea || 90;
  const sunExposure = activeZone?.sunExposure || 'Full Sun (6+ hrs)';
  const attentionLevel = activeZone?.attentionLevel || 'showpiece';

  const equipment = [...(profile?.equipment || []), ...(profile?.customEquipment || [])].filter(Boolean);
  const fertilisers = [...(profile?.fertilisers || [])].filter(Boolean);
  const herbicides = [...(profile?.herbicides || []), ...(profile?.specialTreatments || [])].filter(Boolean);
  const customProducts = profile?.customOwnedProducts || [];

  const outlets = tapTimer?.enabled ? (tapTimer.outlets || []).filter(o => o.enabled) : [];
  const timerSummary = outlets.length > 0
    ? outlets.map(o => `Zone ${o.outlet} (${o.name}): ${o.runMinutes}min at ${String(o.startHour ?? 5).padStart(2, '0')}:${String(o.startMin ?? 0).padStart(2, '0')} (${o.mode === '7days' ? (o.days || []).join(',') : o.mode})`).join('; ')
    : 'Manual watering / no active automatic timer';

  const cvLine = cvMetrics
    ? `On-device visual pixel baseline across ${cvMetrics.photoCount || 1} photo(s): Turf Health ~${cvMetrics.healthScore}%, Turf Density ~${cvMetrics.densityScore}%, DGCI Color ${cvMetrics.darkGreenColorIndex}/100, Hotspots: ${(cvMetrics.hotspots || []).map(h => h.label).join('; ') || 'None'}.`
    : 'No photos attached on this message.';

  return `You are Blade AI, an elite golf-course & residential Turf Agronomist writing a practical, pro-grade client prescription.
You are strictly speaking about THIS user's lawn, using their ACTUAL photos AND their exact saved equipment & products from their shed. Do NOT give generic advice when they own specific tools and products!

USER LAWN PROFILE & SECTION:
- Active Section: ${sectionName} (${attentionLevel} standard)
- Grass Variety: ${grassType}
- Target Height of Cut (HOC): ${hoc}mm
- Section Area: ${area}m²
- Sun Exposure: ${sunExposure}
- Equipment Owned: ${equipment.length ? equipment.join(', ') : 'Standard mower'}
- Fertilisers Owned: ${fertilisers.length ? fertilisers.join(', ') : 'Balanced granular / liquid foliar'}
- Herbicides & Regulators Owned: ${herbicides.length ? herbicides.join(', ') : 'Selective broadleaf safe for ' + grassType}
${customProducts.length ? `- Extra Custom Shed Products: ${customProducts.join(', ')}\n` : ''}- Holman BX4 Tap Timer: ${timerSummary}
- Recent History: Last Mow = ${logs?.lastMow || '3-4 days ago'}, Last Water = ${logs?.lastWater || '3-5 days ago'}, Last Feed = ${logs?.lastFeed || '11-14 days ago'}
- Weather Forecast: ${weather ? `Temp ${weather.currentTemp}°C, Rain prob ${weather.maxProb}%, Skip Sprinklers = ${weather.shouldSkipSprinklers}` : '24°C, Clear'}
- ${cvLine}

USER REQUEST:
"${question || 'Inspect my lawn photos thoroughly, diagnose what you see in each photo, and create my exact Week, Fortnight & Month action plan using my owned equipment and products.'}"

INSTRUCTIONS:
1. Carefully visually inspect EVERY uploaded image. Describe specific visual details you actually see (blade color, lush vs thin patches, yellowing tips, concrete/stone borders radiating heat, drain covers, shadows, broadleaf or grassy weeds, cut evenness, or uneven edges).
2. Always match every treatment directly to the user's OWN equipment (e.g. Cylinder/Reel Mower, Battery Backpack Sprayer, Calibrated Rotary Spreader) and exact OWN products (calculating exact mL / g / kg doses for ${area}m²). Never suggest unsafe herbicides on Buffalo/St Augustine!
3. Generate dated calendar tasks across Week (dayOffset 0..6), Fortnight (dayOffset 7..14), and Month (dayOffset 15..29) so the photos directly drive their Calendar Planner.

Return ONLY valid JSON with this exact shape:
{
  "photoObservations": ["Photo 1: concrete/specific observation...", "Photo 2: ..."],
  "healthScore": 84,
  "densityScore": 86,
  "dgci": 78,
  "weedPressure": "Low (<2%)",
  "weedsDetected": ["None detected" or specific weed names],
  "diseaseOrStress": "concise diagnosis string",
  "overallVerdict": "2-sentence agronomist summary",
  "equipmentPlan": ["bullet 1 using their mower/gear + cut height", "bullet 2 using their sprayer/spreader + exact mL/g for ${area}m²"],
  "weekFocus": ["Day-by-day practical focus for next 7 days"],
  "fortnightAndMonthFocus": ["Key actions for next 2–4 weeks"],
  "calendarTasks": [
    {
      "dayOffset": 1,
      "type": "mow|feed|weed|water|photo",
      "icon": "✂️",
      "title": "Short clear task title for calendar",
      "timeLabel": "8:00 – 8:30 am",
      "startHour": 8,
      "subtext": "Exact gear + product dose for ${area}m²",
      "color": "emerald|teal|amber|sky|indigo"
    }
  ]
}`;
}

function stripDataUrlPrefix(dataUrl) {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl || '');
  if (!match) return null;
  return { mimeType: match[1], data: match[2] };
}

export default async (req) => {
  if (req.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  let body;
  try {
    body = await req.json();
  } catch (e) {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const hasGemini = Boolean(process.env.GEMINI_API_KEY && process.env.GOOGLE_GEMINI_BASE_URL);
  const hasOpenAI = Boolean(process.env.OPENAI_API_KEY && process.env.OPENAI_BASE_URL);

  if (!hasGemini && !hasOpenAI) {
    return Response.json({ fallback: true, reason: 'ai_gateway_not_injected' });
  }

  const photos = Array.isArray(body.photos) ? body.photos.slice(0, 4) : [];
  const prompt = buildAgronomistPrompt(body);

  try {
    if (hasGemini) {
      const modelId = await resolveGatewayModel('gemini');
      if (modelId) {
        const genAI = new GoogleGenAI({});
        const parts = [{ text: prompt }];
        for (const src of photos) {
          const parsed = stripDataUrlPrefix(src);
          if (parsed) {
            parts.push({ inlineData: { mimeType: parsed.mimeType, data: parsed.data } });
          }
        }
        const result = await genAI.models.generateContent({
          model: modelId,
          contents: [{ role: 'user', parts }],
          config: { responseMimeType: 'application/json' }
        });
        const text = result.text || '';
        const parsedJson = JSON.parse(text);
        return Response.json({ fallback: false, provider: 'gemini', model: modelId, result: parsedJson });
      }
    }

    if (hasOpenAI) {
      const modelId = await resolveGatewayModel('openai');
      if (modelId) {
        const openai = new OpenAI();
        const userContent = [{ type: 'text', text: prompt }];
        for (const src of photos) {
          if (typeof src === 'string' && src.startsWith('data:image/')) {
            userContent.push({ type: 'image_url', image_url: { url: src } });
          }
        }
        const completion = await openai.chat.completions.create({
          model: modelId,
          messages: [{ role: 'user', content: userContent }],
          response_format: { type: 'json_object' },
          max_tokens: 1400
        });
        const raw = completion.choices?.[0]?.message?.content || '{}';
        const parsedJson = JSON.parse(raw);
        return Response.json({ fallback: false, provider: 'openai', model: modelId, result: parsedJson });
      }
    }

    return Response.json({ fallback: true, reason: 'no_live_gateway_model' });
  } catch (err) {
    console.warn('Blade AI Gateway fallback:', err?.message || err);
    return Response.json({ fallback: true, reason: 'gateway_call_failed' });
  }
};

export const config = {
  path: '/api/blade-ai'
};

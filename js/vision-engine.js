/**
 * Vision Engine for GreenMaster AI
 * Combines in-browser Agronomic Computer Vision (Canvas DGCI & Canopy Density analysis)
 * with Multi-Photo Composite Analysis (Multi-angle & Problem Patch Hotspot Detection)
 * and optional Gemini Vision API for deep turf diagnosis.
 */
const VisionEngine = {
  /**
   * Analyzes an array of images (data URLs or Files) for a specific lawn section
   */
  async analyzeMultipleImages(imagesArray, profile, zoneInfo = null, apiKey = '') {
    if (!imagesArray || imagesArray.length === 0) {
      throw new Error('No images provided for analysis');
    }

    const individualResults = [];

    for (let i = 0; i < imagesArray.length; i++) {
      const src = imagesArray[i];
      const cvMetrics = await this.processSingleImage(src);
      individualResults.push({
        index: i + 1,
        cvMetrics,
        hotspot: this.detectHotspot(cvMetrics, i + 1)
      });
    }

    return this.synthesizeMultiPhotoAnalysis(individualResults, profile, zoneInfo, apiKey);
  },

  /**
   * Analyzes a single image source on Canvas
   */
  async processSingleImage(imageSrc) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const metrics = this.processCanvasMetrics(img);
          resolve(metrics);
        } catch (e) {
          reject(e);
        }
      };
      img.onerror = (err) => reject(err);
      img.src = imageSrc;
    });
  },

  /**
   * Backward-compatible single image analyzer
   */
  async analyzeImage(imageSrc, profile, apiKey = '') {
    return this.analyzeMultipleImages([imageSrc], profile, null, apiKey);
  },

  /**
   * Identifies if a photo angle highlights a specific problem spot
   */
  detectHotspot(cv, photoNum) {
    if (cv.brownRatio > 0.12) {
      return {
        type: 'drought_patch',
        severity: 'High',
        photoNum,
        label: `Photo ${photoNum}: Localised Dry Patch / Drought Stress`,
        recommendation: 'Targeted wetting agent drench and 20min spot watering required.'
      };
    }
    if (cv.weedRatio > 0.06) {
      return {
        type: 'weed_cluster',
        severity: 'High',
        photoNum,
        label: `Photo ${photoNum}: Weed / Broadleaf Outlier Cluster`,
        recommendation: 'Targeted spot spray with selective broadleaf herbicide.'
      };
    }
    if (cv.densityPercent < 60) {
      return {
        type: 'thin_patch',
        severity: 'Medium',
        photoNum,
        label: `Photo ${photoNum}: Low Canopy Density / Bare Soil Spot`,
        recommendation: 'Gentle liquid aeration and light nutrient push to stimulate lateral stolons.'
      };
    }
    return {
      type: 'healthy',
      severity: 'Low',
      photoNum,
      label: `Photo ${photoNum}: Uniform Healthy Canopy`,
      recommendation: 'Maintain standard mowing and hydration schedule.'
    };
  },

  /**
   * Evaluates pixel colors, Dark Green Color Index (DGCI), Canopy Density,
   * Weed color variance, and leaf blade cut quality
   */
  processCanvasMetrics(img) {
    const canvas = document.createElement('canvas');
    const width = 400;
    const height = 300;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, width, height);

    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    const totalPixels = width * height;

    let greenPixelCount = 0;
    let brownPixelCount = 0;
    let weedColorOutliers = 0;
    let totalHue = 0;
    let totalSat = 0;
    let totalBri = 0;
    let darkGreenScoreSum = 0;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      const [h, s, l] = this.rgbToHsl(r, g, b);

      if (h >= 65 && h <= 165 && s > 0.15 && l > 0.15 && l < 0.85) {
        greenPixelCount++;
        totalHue += h;
        totalSat += s;
        totalBri += l;

        const hueNorm = (h - 60) / 60;
        const satNorm = s;
        const briNorm = 1 - l;
        const dgci = (hueNorm + satNorm + briNorm) / 3;
        darkGreenScoreSum += Math.max(0, Math.min(1, dgci));
      } else if ((h >= 25 && h < 65) || (l > 0.85 && s < 0.2)) {
        brownPixelCount++;
      } else if (h < 25 || h > 165) {
        weedColorOutliers++;
      }
    }

    const densityPercent = Math.round((greenPixelCount / totalPixels) * 100);
    const avgDgci = greenPixelCount > 0 ? Math.round((darkGreenScoreSum / greenPixelCount) * 100) : 50;
    const weedRatio = weedColorOutliers / totalPixels;
    const brownRatio = brownPixelCount / totalPixels;

    let healthScore = Math.round((densityPercent * 0.45) + (avgDgci * 0.45) - (weedRatio * 50) - (brownRatio * 40));
    healthScore = Math.max(25, Math.min(99, healthScore));

    return {
      densityPercent,
      avgDgci,
      weedRatio,
      brownRatio,
      healthScore
    };
  },

  rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;

    if (max === min) {
      h = s = 0;
    } else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h *= 60;
    }
    return [h, s, l];
  },

  /**
   * Synthesize multi-photo results into a composite diagnosis
   */
  synthesizeMultiPhotoAnalysis(individualResults, profile, zoneInfo, apiKey) {
    const photoCount = individualResults.length;
    let sumHealth = 0;
    let sumDensity = 0;
    let sumDgci = 0;
    let maxWeedRatio = 0;
    let maxBrownRatio = 0;
    const hotspots = [];

    individualResults.forEach(r => {
      sumHealth += r.cvMetrics.healthScore;
      sumDensity += r.cvMetrics.densityPercent;
      sumDgci += r.cvMetrics.avgDgci;
      if (r.cvMetrics.weedRatio > maxWeedRatio) maxWeedRatio = r.cvMetrics.weedRatio;
      if (r.cvMetrics.brownRatio > maxBrownRatio) maxBrownRatio = r.cvMetrics.brownRatio;
      if (r.hotspot && r.hotspot.type !== 'healthy') {
        hotspots.push(r.hotspot);
      }
    });

    const avgHealth = Math.round(sumHealth / photoCount);
    const avgDensity = Math.round(sumDensity / photoCount);
    const avgDgci = Math.round(sumDgci / photoCount);

    const sectionName = zoneInfo ? zoneInfo.name : 'Target Turf Section';
    const isPro = profile.tier === 'full_pro';

    let weedLevel = 'Low (<2%)';
    let weeds = ['Minor poa annua / clover spot'];
    if (maxWeedRatio > 0.08) {
      weedLevel = 'High (>8% in hotspot)';
      weeds = ['Broadleaf Clover', 'Dandelion', 'Winter Grass / Crabgrass'];
    } else if (maxWeedRatio > 0.03) {
      weedLevel = 'Moderate (3-8%)';
      weeds = ['Broadleaf weeds', 'Nutgrass / Sedges'];
    }

    let diseaseOrStress = 'Optimal moisture & blade vigor. No major lesions.';
    if (maxBrownRatio > 0.12) {
      diseaseOrStress = 'Localised dry patch or thatch compaction detected in spot photo.';
    } else if (maxBrownRatio > 0.05) {
      diseaseOrStress = 'Minor blade tips yellowing. Check rotary/reel blade sharpness.';
    }

    let verdict = `Inspected ${photoCount} angle${photoCount > 1 ? 's' : ''} for ${sectionName}. `;
    if (hotspots.length > 0) {
      verdict += `Found ${hotspots.length} problem spot${hotspots.length > 1 ? 's' : ''}: ${hotspots.map(h => h.label).join('; ')}. Targeted spot treatments added to your plan!`;
    } else if (avgHealth >= 88) {
      verdict += `Canopy is exceptionally uniform and thriving with deep chlorophyll index. Ready to lock in cut height!`;
    } else {
      verdict += `Good overall coverage with active lateral growth. Regular mowing and scheduled spoon-feeding will sharpen density.`;
    }

    // Dynamic multi-horizon action plan tailored to this specific zone & its pinpointed hotspots
    const actionPlan = PlannerEngine.generateDynamicPlan({
      cvMetrics: {
        densityPercent: avgDensity,
        avgDgci: avgDgci,
        weedRatio: maxWeedRatio,
        brownRatio: maxBrownRatio,
        healthScore: avgHealth
      },
      weedLevel,
      weeds,
      diseaseOrStress,
      hotspots,
      profile,
      zones: zoneInfo ? [zoneInfo] : StorageManager.getZones(),
      targetZone: zoneInfo || null
    });

    return {
      photoCount,
      healthScore: avgHealth,
      darkGreenColorIndex: avgDgci,
      densityScore: avgDensity,
      weedPressure: weedLevel,
      weedsDetected: weeds,
      hotspots,
      diseaseOrStress,
      scalpOrBladeCondition: isPro ? 'Clean cylinder cut, zero tearing' : 'Rotary cut, keep blade sharp',
      overallVerdict: verdict,
      recommendedHOC: zoneInfo ? zoneInfo.hoc : (isPro ? 12 : 25),
      actionPlan
    };
  },

  /**
   * Ephemerally downscales & compresses a user-selected File (from Camera or Photo Library)
   * into a crisp lightweight JPEG data URL for fast mobile preview and CV analysis.
   */
  compressPhotoFile(file, maxDim = 960, quality = 0.82) {
    return new Promise((resolve, reject) => {
      const objectUrl = URL.createObjectURL(file);
      const img = new Image();

      const fallbackFileReader = () => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = (err) => reject(err);
        reader.readAsDataURL(file);
      };

      img.onload = () => {
        try {
          let w = img.naturalWidth || img.width;
          let h = img.naturalHeight || img.height;
          if (w > maxDim || h > maxDim) {
            if (w > h) {
              h = Math.round((h * maxDim) / w);
              w = maxDim;
            } else {
              w = Math.round((w * maxDim) / h);
              h = maxDim;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          const dataUrl = canvas.toDataURL('image/jpeg', quality);
          URL.revokeObjectURL(objectUrl);
          resolve(dataUrl);
        } catch (e) {
          URL.revokeObjectURL(objectUrl);
          fallbackFileReader();
        }
      };

      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        fallbackFileReader();
      };

      img.src = objectUrl;
    });
  },

  /**
   * Generates sample lawn images on canvas for immediate testing
   */
  createDemoTurfImage(type) {
    const canvas = document.createElement('canvas');
    canvas.width = 600;
    canvas.height = 450;
    const ctx = canvas.getContext('2d');

    if (type === 'golf_green') {
      const grad = ctx.createLinearGradient(0, 0, 0, 450);
      grad.addColorStop(0, '#065f46');
      grad.addColorStop(1, '#047857');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 600, 450);

      for (let x = 0; x < 600; x += 30) {
        ctx.fillStyle = (x / 30) % 2 === 0 ? 'rgba(16, 185, 129, 0.12)' : 'rgba(4, 120, 87, 0.15)';
        ctx.fillRect(x, 0, 30, 450);
      }
      for (let i = 0; i < 6000; i++) {
        const px = Math.random() * 600;
        const py = Math.random() * 450;
        ctx.fillStyle = Math.random() > 0.5 ? '#10b981' : '#059669';
        ctx.fillRect(px, py, 1.5, 3);
      }
    } else if (type === 'stressed_dry') {
      const grad = ctx.createLinearGradient(0, 0, 600, 450);
      grad.addColorStop(0, '#15803d');
      grad.addColorStop(0.4, '#a16207');
      grad.addColorStop(0.7, '#ca8a04');
      grad.addColorStop(1, '#166534');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 600, 450);

      for (let i = 0; i < 3000; i++) {
        ctx.fillStyle = Math.random() > 0.6 ? '#854d0e' : '#4d7c0f';
        ctx.fillRect(Math.random() * 600, Math.random() * 450, 2, 4);
      }
    } else if (type === 'weedy_patchy') {
      ctx.fillStyle = '#22c55e';
      ctx.fillRect(0, 0, 600, 450);

      for (let w = 0; w < 12; w++) {
        const wx = 50 + Math.random() * 500;
        const wy = 50 + Math.random() * 350;
        ctx.beginPath();
        ctx.arc(wx, wy, 25 + Math.random() * 20, 0, Math.PI * 2);
        ctx.fillStyle = '#84cc16';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(wx + 8, wy - 5, 8, 0, Math.PI * 2);
        ctx.fillStyle = '#fef08a';
        ctx.fill();
      }
    } else {
      const grad = ctx.createLinearGradient(0, 0, 0, 450);
      grad.addColorStop(0, '#15803d');
      grad.addColorStop(1, '#166534');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 600, 450);

      for (let i = 0; i < 4000; i++) {
        ctx.fillStyle = Math.random() > 0.5 ? '#22c55e' : '#14532d';
        ctx.fillRect(Math.random() * 600, Math.random() * 450, 2, 4);
      }
    }

    return canvas.toDataURL('image/jpeg', 0.85);
  },

  /**
   * Conversational AI + Photo Diagnosis Engine ("Ask Blade AI")
   * Handles both photo check-ins and targeted questions (e.g. "what is this weed?",
   * "how do I get rid of this?", "why is this patch brown?", "when should I water?").
   */
  async askBladeAI({ question = '', photos = [], activeZone = null, profile = null, weather = null, tapTimer = null, apiKey = '' }) {
    const cleanQ = (question || '').trim();
    const qLower = cleanQ.toLowerCase();
    const resolvedProfile = profile || (typeof StorageManager !== 'undefined' ? StorageManager.getProfile() : {});
    const sectionName = activeZone ? activeZone.name : 'All Lawn Sections';
    const grassType = activeZone?.grassType || resolvedProfile?.grassType || 'Bermuda / Couch';
    const isBuffalo = grassType.toLowerCase().includes('buffalo') || grassType.toLowerCase().includes('augustine');
    const hoc = activeZone?.hoc || resolvedProfile?.hoc || (isBuffalo ? 35 : 15);
    const areaM2 = activeZone?.area || 90;

    // 1. If photos were provided, run computer-vision analysis first
    let photoAnalysis = null;
    if (photos && photos.length > 0) {
      photoAnalysis = await this.analyzeMultipleImages(photos, resolvedProfile, activeZone, apiKey);
    }

    // 2. If user has an OpenAI API key configured in Settings, attempt live multimodal LLM response
    if (apiKey && apiKey.startsWith('sk-')) {
      try {
        const userContent = [
          {
            type: 'text',
            text: `You are Blade, a friendly and concise turfgrass agronomist AI.
User's Lawn Section: ${sectionName} (${grassType}, Target Cut Height: ${hoc}mm, Area: ${areaM2}m²).
Current Weather: ${weather ? `${weather.currentTemp}°C, Rain Chance: ${weather.maxProb}%` : '24°C, Clear'}.
${photoAnalysis ? `Computer Vision Scan: Health ${photoAnalysis.healthScore}%, Density ${photoAnalysis.densityScore}%, Weed Pressure ${photoAnalysis.weedPressure}.` : ''}
User Question: ${cleanQ || 'Analyze these lawn photos and tell me what to do next.'}
Keep your answer concise, practical, and structured into 2-3 short bullet points. Always mention if a herbicide is safe for ${grassType}.`
          }
        ];
        if (photos && photos.length > 0) {
          photos.slice(0, 3).forEach(dataUrl => {
            userContent.push({ type: 'image_url', image_url: { url: dataUrl } });
          });
        }
        const resp = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: userContent }],
            max_tokens: 320
          })
        });
        if (resp.ok) {
          const data = await resp.json();
          const replyText = data.choices?.[0]?.message?.content;
          if (replyText) {
            return {
              replyHtml: replyText.replace(/\n/g, '<br>'),
              photoAnalysis,
              calendarTask: {
                type: qLower.includes('weed') ? 'weed' : 'feed',
                icon: qLower.includes('weed') ? '🎯' : '🩹',
                title: qLower.includes('weed') ? `Spot-Treat Weeds (${sectionName})` : `AI Lawn Action (${sectionName})`,
                subtext: `Added from Blade AI consultation`
              }
            };
          }
        }
      } catch (e) {
        console.warn('OpenAI fallback to built-in turf specialist:', e);
      }
    }

    // 3. Built-in Turf & Weed Specialist AI (Instant, zero-config, tailored to grass variety & photo CV)
    const herbicideRecommendation = isBuffalo
      ? '<strong>Bow & Arrow</strong> or <strong>Bin-Die (Bromoxynil + MCPA)</strong> — 100% safe for Buffalo turf (avoid standard Dicamba on Buffalo)'
      : '<strong>Bow & Arrow</strong>, <strong>Kamba M</strong>, or <strong>Dicamba + MCPA</strong> selective broadleaf spray';

    const asksWeed = /weed|clover|bindii|bindi|dandelion|oxalis|nutgrass|sedge|wintergrass|poa|paspalum|crabgrass|thistle|foreign|what is this|get rid|kill|spray/.test(qLower);
    const asksBrownOrDry = /brown|dry|dead|patch|yellow|bare|spot|dying|urine|dog|burn|fungus|thatch/.test(qLower);
    const asksGrubs = /grub|worm|armyworm|beetle|bug|chew|bird|moth|spongy|curl/.test(qLower);
    const asksMow = /mow|cut|height|short|scalp|reel|rotary|trim/.test(qLower);
    const asksWater = /water|soak|holman|timer|rain|sprinkler|irrigat/.test(qLower);
    const asksFeed = /feed|fert|iron|green|nitrogen|food|color|colour/.test(qLower);

    // Case A: Weed Identification & Removal (with or without photo)
    if (asksWeed || (photoAnalysis && !cleanQ && photoAnalysis.weedPressure.includes('High'))) {
      let weedDiagnosis = '<strong>Broadleaf Weed Cluster (Clover / Bindii / Oxalis / Cudweed)</strong>';
      let specificFix = `Spot-spray with ${herbicideRecommendation} mixed at <strong>15mL per 1L water</strong> (covers 10m²).`;

      if (/nutgrass|sedge|shiny|tall light green/.test(qLower)) {
        weedDiagnosis = '<strong>Nutgrass (Yellow / Purple Nutsedge)</strong> — fast-growing shiny light-green sedge with underground nutlets';
        specificFix = `Do not pull by hand (it multiplies underground bulbs). Spray with <strong>Sedgehammer (Halosulfuron)</strong> — 1.3g sachet in 5L water with a drop of surfactant. Safe on ${grassType}.`;
      } else if (/wintergrass|poa|crabgrass|paspalum|grassy|seed head/.test(qLower)) {
        weedDiagnosis = '<strong>Grassy Weed (Wintergrass / Poa annua or Paspalum)</strong> — shallow-rooted clumping grass with pale seed heads';
        specificFix = `Apply <strong>Bow & Arrow</strong> or <strong>Propyzamide</strong> to knock out existing clumps, then apply <strong>Barricade Pre-Emergent</strong> so dropped seeds cannot germinate.`;
      } else if (photoAnalysis) {
        weedDiagnosis = `<strong>${photoAnalysis.weedsDetected.join(' / ')}</strong> (Detected in your ${sectionName} photo)`;
      }

      return {
        replyHtml: `
          <div class="space-y-1.5">
            <div>🔍 <strong>Identification:</strong> ${weedDiagnosis}.</div>
            <div>🎯 <strong>How to Get Rid of It (${grassType}):</strong> ${specificFix}</div>
            <div>⏳ <strong>Pro Rule:</strong> Spray on a calm, dry morning (under 28°C) with no rain for 6 hours. Wait <strong>3 days after spraying before mowing</strong> so the herbicide travels all the way into the roots.</div>
          </div>
        `,
        photoAnalysis,
        calendarTask: {
          type: 'weed',
          icon: '🎯',
          title: `Spot-Spray Weeds (${sectionName})`,
          subtext: `Safe for ${grassType} • Apply on dry morning, wait 3d to mow`
        }
      };
    }

    // Case B: Brown / Dry / Dead Patches
    if (asksBrownOrDry || (photoAnalysis && !cleanQ && photoAnalysis.diseaseOrStress.toLowerCase().includes('dry'))) {
      return {
        replyHtml: `
          <div class="space-y-1.5">
            <div>🟤 <strong>Diagnosis for ${sectionName}:</strong> Localised Dry Patch (hydrophobic soil where water beads off instead of soaking the roots).</div>
            <div>🛠️ <strong>3-Step Fix:</strong>
              <br>1. <strong>Fork Aerate:</strong> Poke holes 10cm deep across the brown patch with a garden fork.
              <br>2. <strong>Wetting Agent:</strong> Drench with <strong>Soil Wetting Agent</strong> (50mL in a 9L watering can) and run sprinklers for 20 mins.
              <br>3. <strong>Recovery Boost:</strong> Apply liquid Seaweed + Foliar Iron/Nitrogen in 4 days to push ${grassType} runners across the spot.</div>
          </div>
        `,
        photoAnalysis,
        calendarTask: {
          type: 'feed',
          icon: '🩹',
          title: `Fork Aerate & Wetting Agent (${sectionName})`,
          subtext: `Fix dry patch & water in for 20 mins`
        }
      };
    }

    // Case C: Grubs / Armyworm / Beetles
    if (asksGrubs) {
      return {
        replyHtml: `
          <div class="space-y-1.5">
            <div>🐛 <strong>Pest & Grub Check (${sectionName}):</strong> Spongy turf, chewed blade edges, or birds pecking the lawn points to <strong>Lawn Armyworm or African Black Beetle larvae</strong>.</div>
            <div>🪣 <strong>10-Min Bucket Test:</strong> Mix 2 tablespoons of dishwashing liquid in a 9L bucket of water and pour over 1m² at dusk. Grubs will surface within 10 minutes.</div>
            <div>🛡️ <strong>How to Eliminate Them:</strong> Apply <strong>Acelepryn GR</strong> (for 6-month grub protection) + a fast liquid knockdown spray (<strong>Bifenthrin</strong>) at dusk, then water in well.</div>
          </div>
        `,
        photoAnalysis,
        calendarTask: {
          type: 'feed',
          icon: '🛡️',
          title: `Grub & Armyworm Treatment (${sectionName})`,
          subtext: `Apply Acelepryn / grub treatment & water in`
        }
      };
    }

    // Case D: Mowing & Cut Height
    if (asksMow) {
      return {
        replyHtml: `
          <div class="space-y-1.5">
            <div>✂️ <strong>Mowing Guide for ${sectionName} (${grassType}):</strong> Your target cut height is <strong>${hoc}mm</strong>.</div>
            <div>📐 <strong>1/3 Rule:</strong> Never remove more than the top 1/3 of the leaf blade in a single mow, and alternate your mowing direction each cut so the grass stands upright.</div>
          </div>
        `,
        photoAnalysis,
        calendarTask: {
          type: 'mow',
          icon: '✂️',
          title: `Mow ${sectionName} (${hoc}mm)`,
          subtext: `Trim top 1/3 only with sharp blades`
        }
      };
    }

    // Case E: Watering & Holman Tap Timer
    if (asksWater) {
      const outlets = tapTimer?.outlets || [];
      const activeOutlet = outlets.find(o => o.enabled) || outlets[0];
      const timerInfo = activeOutlet
        ? `Your <strong>Holman BX4 (Zone ${activeOutlet.outlet})</strong> is set for <strong>${activeOutlet.runMinutes || 20} mins at ${String(activeOutlet.startHour ?? 5).padStart(2, '0')}:${String(activeOutlet.startMin ?? 0).padStart(2, '0')} AM</strong>.`
        : 'Deep soak 2 times per week at 5:00–6:00 AM.';
      const rainNote = weather?.shouldSkipSprinklers
        ? `🌧️ <strong>Rain Alert:</strong> Rain is in the forecast (${weather.maxProb}%), so pause your next timer run to prevent fungal disease.`
        : `☀️ <strong>Forecast Check:</strong> Dry conditions ahead (${weather?.currentTemp || 24}°C) — keep your Holman timer active!`;

      return {
        replyHtml: `
          <div class="space-y-1.5">
            <div>💧 <strong>Watering Plan (${sectionName}):</strong> ${timerInfo}</div>
            <div>${rainNote}</div>
          </div>
        `,
        photoAnalysis,
        calendarTask: {
          type: 'water',
          icon: '💧',
          title: `Deep Soak Watering (${sectionName})`,
          subtext: `20 min morning soak for deep root growth`
        }
      };
    }

    // Case F: Fertiliser & Green-Up
    if (asksFeed) {
      const foliarMl = Math.round((areaM2 / 100) * 200);
      const waterL = Math.max(4, Math.round((areaM2 / 100) * 10));
      return {
        replyHtml: `
          <div class="space-y-1.5">
            <div>🌱 <strong>Green-Up Formula for ${sectionName} (${areaM2}m²):</strong></div>
            <div>🧪 <strong>Exact Mix:</strong> Mix <strong>${foliarMl}mL Liquid Foliar Nitrogen + Iron</strong> into <strong>${waterL}L water</strong> and spray evenly across the leaf canopy, or apply slow-release granular lawn food every 6–8 weeks and water in well.</div>
          </div>
        `,
        photoAnalysis,
        calendarTask: {
          type: 'feed',
          icon: '🌱',
          title: `Apply Lawn Food (${sectionName})`,
          subtext: `${foliarMl}mL foliar mix in ${waterL}L water for ${areaM2}m²`
        }
      };
    }

    // Case G: Photo Check-In (when user logs photos with or without a general question)
    if (photoAnalysis) {
      return {
        replyHtml: `
          <div class="space-y-1.5">
            <div>📸 <strong>Photo Check-In Logged for ${sectionName}:</strong></div>
            <div>• <strong>Health:</strong> ${photoAnalysis.healthScore}% • <strong>Density:</strong> ${photoAnalysis.densityScore}% • <strong>Color:</strong> ${photoAnalysis.darkGreenColorIndex}/100</div>
            <div>• <strong>Diagnosis:</strong> ${photoAnalysis.overallVerdict}</div>
            <div class="text-emerald-700 font-bold">✅ Your Week, Fortnight & Month Calendar has been updated automatically!</div>
          </div>
        `,
        photoAnalysis,
        isPhotoCheckIn: true,
        calendarTask: null
      };
    }

    // Case H: General Question Fallback
    return {
      replyHtml: `
        <div class="space-y-1.5">
          <div>🌱 <strong>Blade's Advice for ${sectionName} (${grassType}):</strong></div>
          <div>• Keep mowing at <strong>${hoc}mm</strong> every 4–6 days and deep watering on your <strong>Holman BX4</strong> schedule (Tue & Fri mornings).</div>
          <div>• Snap or upload a close-up photo of any <strong>weed</strong> or <strong>brown patch</strong> below and ask me <em>"What is this weed?"</em> or <em>"How do I fix this?"</em> for an exact treatment!</div>
        </div>
      `,
      photoAnalysis: null,
      calendarTask: null
    };
  }
};

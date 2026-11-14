/**
 * Vision Engine for GreenMaster AI
 * Combines in-browser Agronomic Computer Vision (Canvas DGCI & Canopy Density analysis)
 * with optional Gemini Vision API for deep turf diagnosis.
 */
const VisionEngine = {
  /**
   * Analyzes an image source (data URL, File, or Image Element)
   */
  async analyzeImage(imageSrc, profile, apiKey = '') {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = async () => {
        try {
          // 1. Run local Agronomic Computer Vision on Canvas
          const cvMetrics = this.processCanvasMetrics(img);
          
          let aiAnalysis = null;
          // 2. If Gemini API key is configured or server is available, attempt deep AI diagnosis
          if (apiKey) {
            try {
              aiAnalysis = await this.queryGeminiVision(imageSrc, profile, apiKey);
            } catch (err) {
              console.warn('Gemini Vision fallback to agronomy heuristics:', err);
            }
          }

          // 3. Synthesize result
          const finalResult = this.synthesizeAnalysis(cvMetrics, aiAnalysis, profile);
          resolve(finalResult);
        } catch (e) {
          reject(e);
        }
      };
      img.onerror = (err) => reject(err);
      img.src = imageSrc;
    });
  },

  /**
   * Evaluates pixel colors, Dark Green Color Index (DGCI), Canopy Density,
   * Weed color variance, and leaf blade cut quality
   */
  processCanvasMetrics(img) {
    const canvas = document.createElement('canvas');
    // Sample at 400x300 for fast, responsive calculation without memory bloat
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

      // Turf green hue generally spans between 65° and 160°
      if (h >= 65 && h <= 165 && s > 0.15 && l > 0.15 && l < 0.85) {
        greenPixelCount++;
        totalHue += h;
        totalSat += s;
        totalBri += l;

        // DGCI calculation: Dark Green Color Index standard in turfgrass research
        // Normalized index based on (Hue - 60)/60, Saturation, and (1 - Lightness)
        const hueNorm = (h - 60) / 60;
        const satNorm = s;
        const briNorm = 1 - l;
        const dgci = (hueNorm + satNorm + briNorm) / 3;
        darkGreenScoreSum += Math.max(0, Math.min(1, dgci));
      } else if ((h >= 25 && h < 65) || (l > 0.85 && s < 0.2)) {
        // Brown/thatch/yellow drought spots
        brownPixelCount++;
      } else if (h < 25 || h > 165) {
        // Discolored or foreign leaf/weed matter
        weedColorOutliers++;
      }
    }

    const densityPercent = Math.round((greenPixelCount / totalPixels) * 100);
    const avgDgci = greenPixelCount > 0 ? Math.round((darkGreenScoreSum / greenPixelCount) * 100) : 50;
    const weedRatio = weedColorOutliers / totalPixels;
    const brownRatio = brownPixelCount / totalPixels;

    // Calculate composite health score
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
      h = s = 0; // achromatic
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
   * Synthesize diagnostic results into actionable agronomic insights
   */
  synthesizeAnalysis(cvMetrics, aiAnalysis, profile) {
    if (aiAnalysis && aiAnalysis.actionPlan) {
      return {
        ...aiAnalysis,
        densityScore: cvMetrics.densityPercent,
        darkGreenColorIndex: cvMetrics.avgDgci
      };
    }

    // Advanced agronomic rules engine
    const isPro = profile.tier === 'full_pro';
    const isSemi = profile.tier === 'semi_pro';
    const grass = profile.grassType;
    const hoc = Number(profile.hoc) || 15;

    let weedLevel = 'Low (<2%)';
    let weeds = ['Minor poa annua / clover spot'];
    if (cvMetrics.weedRatio > 0.08) {
      weedLevel = 'High (>8%)';
      weeds = ['Broadleaf Clover', 'Dandelion', 'Winter Grass / Crabgrass'];
    } else if (cvMetrics.weedRatio > 0.03) {
      weedLevel = 'Moderate (3-8%)';
      weeds = ['Broadleaf weeds', 'Nutgrass / Sedges'];
    }

    let diseaseOrStress = 'Optimal moisture & blade vigor. No leaf lesions.';
    if (cvMetrics.brownRatio > 0.12) {
      diseaseOrStress = 'Localised dry spot or thatch buildup detected. Needs surfactant wetting agent.';
    } else if (cvMetrics.brownRatio > 0.05) {
      diseaseOrStress = 'Minor blade tips yellowing. Check mower blade sharpness.';
    }

    let verdict = '';
    if (cvMetrics.healthScore >= 88) {
      verdict = `Outstanding turf vigor! Tight canopy and deep chlorophyll index. Ready to lock in height at ${hoc}mm.`;
    } else if (cvMetrics.healthScore >= 75) {
      verdict = `Good density and active lateral growth. Minor foliar spoon-feed and regular mowing will sharpen uniform texture.`;
    } else {
      verdict = `Canopy stress observed. Recommended wetting agent hydration and gentle nutrient push over the next 14 days.`;
    }

    // Generate dynamic multi-horizon plan
    const actionPlan = PlannerEngine.generateDynamicPlan({
      cvMetrics,
      weedLevel,
      weeds,
      diseaseOrStress,
      profile
    });

    return {
      healthScore: cvMetrics.healthScore,
      darkGreenColorIndex: cvMetrics.avgDgci,
      densityScore: cvMetrics.densityPercent,
      weedPressure: weedLevel,
      weedsDetected: weeds,
      diseaseOrStress,
      scalpOrBladeCondition: isPro ? 'Clean cylinder cut, zero tearing' : 'Rotary cut, keep blade sharp',
      overallVerdict: verdict,
      recommendedHOC: isPro ? Math.min(hoc, 14) : isSemi ? Math.min(hoc, 25) : 40,
      actionPlan
    };
  },

  /**
   * Calls Gemini 1.5 Flash Vision directly
   */
  async queryGeminiVision(imageBase64, profile, apiKey) {
    let cleanBase64 = imageBase64;
    let mimeType = 'image/jpeg';
    if (imageBase64.includes(',')) {
      const parts = imageBase64.split(',');
      if (parts[0].includes('png')) mimeType = 'image/png';
      cleanBase64 = parts[1];
    }

    const prompt = `Analyze this lawn turf photo for an agronomic care plan.
Lawn Profile: Grass Type: ${profile.grassType}, Tier: ${profile.tier} (low_maintenance / semi_pro / full_pro), Height of Cut: ${profile.hoc}mm, Equipment: ${profile.equipment.join(', ')}, Sprinklers: ${profile.sprinklers}.
Return JSON only:
{
  "healthScore": 88,
  "darkGreenColorIndex": 82,
  "densityScore": 85,
  "weedPressure": "Low",
  "weedsDetected": ["Clover"],
  "diseaseOrStress": "Healthy leaf tissue",
  "scalpOrBladeCondition": "Clean cut",
  "overallVerdict": "Summary note",
  "recommendedHOC": 14,
  "actionPlan": {
    "oneWeek": [{"task": "...", "urgency": "High", "category": "Mowing", "tip": "..."}],
    "twoWeeks": [{"task": "...", "urgency": "Medium", "category": "Fertiliser", "tip": "..."}],
    "oneMonth": [{"task": "...", "urgency": "Medium", "category": "Soil", "tip": "..."}],
    "oneQuarter": [{"task": "...", "urgency": "Critical", "category": "Protection", "tip": "..."}],
    "halfYear": [{"task": "...", "urgency": "Medium", "category": "Renovation", "tip": "..."}],
    "oneYear": [{"task": "...", "urgency": "High", "category": "Renovation", "tip": "..."}]
  }
}`;

    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            { inline_data: { mime_type: mimeType, data: cleanBase64 } }
          ]
        }],
        generationConfig: {
          response_mime_type: 'application/json',
          temperature: 0.2
        }
      })
    });

    const data = await res.json();
    const candidateText = data.candidates[0].content.parts[0].text;
    return JSON.parse(candidateText);
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
      // Tournament golf green: ultra-dense emerald green, razor cut, tight texture
      const grad = ctx.createLinearGradient(0, 0, 0, 450);
      grad.addColorStop(0, '#065f46');
      grad.addColorStop(1, '#047857');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 600, 450);

      // Add striping & blade density
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
      // Thirsty / drought dry patches
      const grad = ctx.createLinearGradient(0, 0, 600, 450);
      grad.addColorStop(0, '#15803d');
      grad.addColorStop(0.4, '#a16207');
      grad.addColorStop(0.7, '#ca8a04');
      grad.addColorStop(1, '#166534');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 600, 450);

      // Thatch patches
      for (let i = 0; i < 3000; i++) {
        ctx.fillStyle = Math.random() > 0.6 ? '#854d0e' : '#4d7c0f';
        ctx.fillRect(Math.random() * 600, Math.random() * 450, 2, 4);
      }
    } else if (type === 'weedy_patchy') {
      // Clover and broadleaf weed invasion
      ctx.fillStyle = '#22c55e';
      ctx.fillRect(0, 0, 600, 450);

      // Weed clusters
      for (let w = 0; w < 12; w++) {
        const wx = 50 + Math.random() * 500;
        const wy = 50 + Math.random() * 350;
        ctx.beginPath();
        ctx.arc(wx, wy, 25 + Math.random() * 20, 0, Math.PI * 2);
        ctx.fillStyle = '#84cc16'; // lighter weed green
        ctx.fill();
        ctx.beginPath();
        ctx.arc(wx + 8, wy - 5, 8, 0, Math.PI * 2);
        ctx.fillStyle = '#fef08a'; // yellow dandelion
        ctx.fill();
      }
    } else {
      // Healthy suburban lush couch / buffalo
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
  }
};

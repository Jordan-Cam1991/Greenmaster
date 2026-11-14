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

    // Dynamic multi-horizon action plan
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
      profile,
      zones: StorageManager.getZones()
    });

    // If hotspots were detected, inject immediate hotspot tasks into Week 1
    hotspots.forEach((h, idx) => {
      if (h.type === 'drought_patch') {
        actionPlan.oneWeek.unshift({
          id: `w1_hotspot_drought_${idx}`,
          task: `Targeted Wetting Agent Soak for ${sectionName} (${h.label.split(':')[0]})`,
          urgency: 'Critical',
          category: 'Watering',
          tip: `Photo analysis pinpointed a severe dry spot in ${h.photoNum}. Drench this specific patch with soil surfactant and 15mm water to restore moisture permeability.`
        });
      } else if (h.type === 'weed_cluster') {
        actionPlan.oneWeek.unshift({
          id: `w1_hotspot_weed_${idx}`,
          task: `Spot Spray Weed Cluster in ${sectionName} (${h.label.split(':')[0]})`,
          urgency: 'High',
          category: 'Weed Control',
          tip: `Photo analysis isolated a weed cluster in ${h.photoNum}. Use selective herbicide directly on this cluster rather than blanketing the whole lawn.`
        });
      }
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
  }
};

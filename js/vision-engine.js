/**
 * Vision Engine & Blade AI Agronomist for GreenMaster AI
 * Combines Turf-Focused Computer Vision (Hardscape/Shadow isolation, DGCI Chlorophyll,
 * Chlorosis & Canopy Density) with Netlify AI Gateway multimodal vision and a
 * Shed-Calibrated Pro Turf Agronomist Engine that turns photos into a Week/Fortnight/Month plan.
 */
const VisionEngine = {
  /**
   * Analyzes an array of images (data URLs) for a specific lawn section
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

  async analyzeImage(imageSrc, profile, apiKey = '') {
    return this.analyzeMultipleImages([imageSrc], profile, null, apiKey);
  },

  /**
   * Identifies specific conditions highlighted in an individual photo angle
   */
  detectHotspot(cv, photoNum) {
    if (cv.brownRatio > 0.16) {
      return {
        type: 'drought_patch',
        severity: 'High',
        photoNum,
        label: `Photo ${photoNum}: Localised Dry Patch / Hydrophobic Soil`,
        recommendation: 'Fork-aerate affected area and apply Soil Wetting Agent drench + 20m soak.'
      };
    }
    if (cv.weedRatio > 0.08) {
      return {
        type: 'weed_cluster',
        severity: 'High',
        photoNum,
        label: `Photo ${photoNum}: Foreign Weed / Broadleaf Outlier Cluster`,
        recommendation: 'Spot-spray outlier patches with grass-safe selective herbicide.'
      };
    }
    if (cv.densityPercent < 58) {
      return {
        type: 'thin_patch',
        severity: 'Medium',
        photoNum,
        label: `Photo ${photoNum}: Thin Canopy / Slow Lateral Coverage`,
        recommendation: 'Relieve compaction and spoon-feed Nitrogen + Seaweed tonic to knit runners.'
      };
    }
    if (cv.limeRatio > 0.32) {
      return {
        type: 'mild_chlorosis',
        severity: 'Medium',
        photoNum,
        label: `Photo ${photoNum}: Pale / Lime-Green Leaf Tone (Spoon-Feed Ready)`,
        recommendation: 'Apply Foliar Nitrogen + Chelated Iron to deepen chlorophyll without surge growth.'
      };
    }
    if (cv.hardscapeRatio > 0.10) {
      return {
        type: 'border_heat',
        severity: 'Low',
        photoNum,
        label: `Photo ${photoNum}: Concrete / Stone Border Zone`,
        recommendation: 'Edge borders cleanly and watch radiant heat drying along pavers/drain covers.'
      };
    }
    return {
      type: 'healthy',
      severity: 'Low',
      photoNum,
      label: `Photo ${photoNum}: Dense, Uniform Healthy Canopy`,
      recommendation: 'Lock in regular cut cadence and maintenance spoon-feeding.'
    };
  },

  /**
   * Evaluates pixel colors while isolating actual turf from hardscape (concrete, stone walls,
   * drain lids) and deep cast shadows so lawn edges don't distort grass health scores.
   */
  processCanvasMetrics(img) {
    const canvas = document.createElement('canvas');
    const width = 400;
    const height = 300;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, width, height);

    const data = ctx.getImageData(0, 0, width, height).data;
    const totalPixels = width * height;

    let lushGreenCount = 0;
    let limeChloroticCount = 0;
    let dryBrownCount = 0;
    let weedOutlierCount = 0;
    let hardscapeCount = 0;
    let shadowOrGlareCount = 0;
    let darkGreenScoreSum = 0;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      const [h, s, l] = this.rgbToHsl(r, g, b);

      // 1. Deep shadow or harsh bright white glare (exclude from turf denominator)
      if (l < 0.11 || l > 0.90) {
        shadowOrGlareCount++;
        continue;
      }

      // 2. Neutral grey concrete / drain lids / pavers or warm pale sandstone masonry
      if (s < 0.14 || (h >= 20 && h <= 50 && s < 0.36 && l > 0.45)) {
        hardscapeCount++;
        continue;
      }

      // 3. Rich green chlorophyll turf blades
      if (h >= 66 && h <= 168 && s >= 0.14 && l >= 0.12 && l <= 0.86) {
        lushGreenCount++;
        const hueNorm = Math.min(1, Math.max(0, (h - 60) / 55));
        const satNorm = Math.min(1, s * 1.15);
        const briNorm = Math.min(1, Math.max(0.2, 1 - l));
        darkGreenScoreSum += (hueNorm * 0.4 + satNorm * 0.35 + briNorm * 0.25);
        continue;
      }

      // 4. Sunlit warm green / slightly pale lime-green blades (common in sunlit couch cut low)
      if (h >= 48 && h < 66 && s >= 0.20 && l >= 0.18 && l <= 0.80) {
        limeChloroticCount++;
        const dgciLime = Math.min(1, Math.max(0.35, ((h - 45) / 40) * 0.6 + s * 0.4));
        darkGreenScoreSum += dgciLime;
        continue;
      }

      // 5. Distinct broadleaf flower / red-purple / bright-yellow dandelion weed outliers
      if ((h < 18 || h > 240) && s > 0.34) {
        weedOutlierCount++;
        continue;
      }

      // 6. Genuine dry brown thatch / dormant patches
      dryBrownCount++;
    }

    const turfPixels = Math.max(
      Math.round(totalPixels * 0.25),
      lushGreenCount + limeChloroticCount + dryBrownCount + weedOutlierCount
    );

    const healthyTurfPixels = lushGreenCount + Math.round(limeChloroticCount * 0.72);
    const greenPixelCount = lushGreenCount + limeChloroticCount;

    const densityPercent = Math.max(20, Math.min(99, Math.round((healthyTurfPixels / turfPixels) * 100)));
    const avgDgci = greenPixelCount > 0
      ? Math.max(35, Math.min(98, Math.round((darkGreenScoreSum / greenPixelCount) * 100)))
      : 48;

    const brownRatio = dryBrownCount / turfPixels;
    const weedRatio = weedOutlierCount / turfPixels;
    const limeRatio = limeChloroticCount / turfPixels;
    const hardscapeRatio = hardscapeCount / totalPixels;

    let healthScore = Math.round(
      densityPercent * 0.52 +
      avgDgci * 0.42 -
      weedRatio * 55 -
      brownRatio * 45 -
      Math.max(0, limeRatio - 0.25) * 18
    );
    healthScore = Math.max(28, Math.min(98, healthScore));

    return {
      densityPercent,
      avgDgci,
      weedRatio,
      brownRatio,
      limeRatio,
      hardscapeRatio,
      shadowRatio: shadowOrGlareCount / totalPixels,
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
   * Synthesize multi-photo CV results into a composite diagnosis + per-photo notes
   */
  synthesizeMultiPhotoAnalysis(individualResults, profile, zoneInfo, apiKey) {
    const photoCount = individualResults.length;
    let sumHealth = 0;
    let sumDensity = 0;
    let sumDgci = 0;
    let maxWeedRatio = 0;
    let maxBrownRatio = 0;
    let maxLimeRatio = 0;
    let maxHardscapeRatio = 0;
    const hotspots = [];
    const photoSummaries = [];

    individualResults.forEach(r => {
      const cv = r.cvMetrics;
      sumHealth += cv.healthScore;
      sumDensity += cv.densityPercent;
      sumDgci += cv.avgDgci;
      if (cv.weedRatio > maxWeedRatio) maxWeedRatio = cv.weedRatio;
      if (cv.brownRatio > maxBrownRatio) maxBrownRatio = cv.brownRatio;
      if (cv.limeRatio > maxLimeRatio) maxLimeRatio = cv.limeRatio;
      if (cv.hardscapeRatio > maxHardscapeRatio) maxHardscapeRatio = cv.hardscapeRatio;

      if (r.hotspot && r.hotspot.type !== 'healthy') {
        hotspots.push(r.hotspot);
      }

      const edgeNote = cv.hardscapeRatio > 0.08 ? ' • hardscape/stone border detected' : '';
      const toneNote = cv.brownRatio > 0.14
        ? 'localised dry/thatch stress'
        : cv.limeRatio > 0.28
        ? 'slightly pale lime tone (Nitrogen + Iron opportunity)'
        : 'even emerald blade coverage';
      photoSummaries.push(
        `Photo ${r.index}: ${cv.healthScore}% health, ${cv.densityPercent}% cover — ${toneNote}${edgeNote}`
      );
    });

    const avgHealth = Math.round(sumHealth / photoCount);
    const avgDensity = Math.round(sumDensity / photoCount);
    const avgDgci = Math.round(sumDgci / photoCount);

    const sectionName = zoneInfo ? zoneInfo.name : 'Target Turf Section';
    const isPro = (profile?.tier || 'full_pro') === 'full_pro';

    let weedLevel = 'Low (<2%)';
    let weeds = ['No major weed outbreaks spotted'];
    if (maxWeedRatio > 0.09) {
      weedLevel = 'High (>8% in hotspot)';
      weeds = ['Broadleaf Clover / Oxalis', 'Creeping weeds'];
    } else if (maxWeedRatio > 0.04) {
      weedLevel = 'Moderate (4-8%)';
      weeds = ['Minor broadleaf spot weeds'];
    }

    let diseaseOrStress = 'Strong stolon density & moisture balance.';
    if (maxBrownRatio > 0.15) {
      diseaseOrStress = 'Localised dry patch or hydrophobic soil detected — wetting agent & deep soak recommended.';
    } else if (maxLimeRatio > 0.28) {
      diseaseOrStress = 'Slight nitrogen/iron chlorosis from regular tight mowing — ideal for a foliar spoon-feed.';
    } else if (maxHardscapeRatio > 0.09) {
      diseaseOrStress = 'Healthy main canopy; radiant heat near concrete/sandstone borders can dry edges faster.';
    }

    const activeProblems = hotspots.filter(h => h.type === 'drought_patch' || h.type === 'weed_cluster' || h.type === 'thin_patch');
    let verdict = `Inspected ${photoCount} photo${photoCount > 1 ? 's' : ''} of ${sectionName}. `;
    if (activeProblems.length > 0) {
      verdict += `Flagged ${activeProblems.length} priority issue${activeProblems.length > 1 ? 's' : ''} (${activeProblems.map(h => h.label).join('; ')}). Exact recovery steps calibrated to your shed gear & updated on your calendar.`;
    } else if (maxLimeRatio > 0.28 || maxHardscapeRatio > 0.09) {
      verdict += `Dense turf coverage (${avgDensity}%), ready for a foliar Iron + N colour pop and edge hydration management using your own equipment.`;
    } else {
      verdict += `Uniform dense canopy (${avgHealth}% health) with vibrant chlorophyll — locked into your Week, Fortnight & Month maintenance plan.`;
    }

    const actionPlan = PlannerEngine.generateDynamicPlan({
      cvMetrics: {
        densityPercent: avgDensity,
        avgDgci,
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
      photoSummaries,
      maxLimeRatio,
      maxHardscapeRatio,
      maxBrownRatio,
      maxWeedRatio,
      diseaseOrStress,
      scalpOrBladeCondition: isPro ? 'Clean cylinder cut, minimal fraying' : 'Clean cut, keep blade sharp',
      overallVerdict: verdict,
      recommendedHOC: zoneInfo ? zoneInfo.hoc : (isPro ? 12 : 25),
      actionPlan
    };
  },

  /**
   * Compresses user-selected File into lightweight JPEG data URL for fast preview & upload
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
    } else if (type === 'stressed_dry') {
      const grad = ctx.createLinearGradient(0, 0, 600, 450);
      grad.addColorStop(0, '#15803d');
      grad.addColorStop(0.5, '#a16207');
      grad.addColorStop(1, '#166534');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 600, 450);
    } else {
      ctx.fillStyle = '#15803d';
      ctx.fillRect(0, 0, 600, 450);
    }

    return canvas.toDataURL('image/jpeg', 0.85);
  },

  /**
   * Matches the user's exact shed inventory (Equipment, Fertilisers, Herbicides & Regulators)
   * and calculates exact area dosages + calendar tasks tailored to their gear.
   */
  buildShedPrescription({ profile, activeZone, photoAnalysis, weather, tapTimer }) {
    const sectionName = activeZone ? activeZone.name : 'All Lawn Sections';
    const grassType = activeZone?.grassType || profile?.grassType || 'Bermuda / Couch';
    const isBuffalo = grassType.toLowerCase().includes('buffalo') || grassType.toLowerCase().includes('augustine');
    const hoc = activeZone?.hoc || profile?.hoc || (isBuffalo ? 35 : 15);
    const areaM2 = Number(activeZone?.area || profile?.lawnArea || 90);
    const isShowpiece = (activeZone?.attentionLevel || 'showpiece') === 'showpiece';

    const equipment = [...(profile?.equipment || [])].filter(Boolean);
    const fertilisers = [...(profile?.fertilisers || [])].filter(Boolean);
    const herbicides = [...(profile?.herbicides || []), ...(profile?.specialTreatments || [])].filter(Boolean);
    const customItems = (profile?.customOwnedProducts || []).filter(Boolean);

    const hasReel = equipment.some(e => /cylinder|reel/i.test(e));
    const hasRotary = equipment.some(e => /rotary/i.test(e));
    const hasBackpack = equipment.some(e => /sprayer|backpack/i.test(e));
    const hasSpreader = equipment.some(e => /spreader/i.test(e));
    const hasAerator = equipment.some(e => /aerat/i.test(e));
    const hasScarifier = equipment.some(e => /dethatch|scarif/i.test(e));

    const mowerLabel = hasReel ? 'Cylinder / Reel Mower' : (hasRotary ? 'Rotary Mower' : (equipment[0] || 'Mower'));
    const sprayerLabel = equipment.find(e => /sprayer|backpack/i.test(e)) || 'Pump / Backpack Sprayer';
    const spreaderLabel = equipment.find(e => /spreader/i.test(e)) || 'Rotary Spreader';

    const liquidFert = fertilisers.find(f => /liquid|foliar/i.test(f));
    const granularFert = fertilisers.find(f => /granular|slow/i.test(f));
    const kelpFert = fertilisers.find(f => /seaweed|humic|kelp|bio/i.test(f));
    const pgrProd = herbicides.find(h => /primo|pgr|regulator/i.test(h));
    const wettingProd = herbicides.find(h => /wetting|hydra|soak/i.test(h));
    const preEmergentProd = herbicides.find(h => /prodiamine|barricade|pre-emergent/i.test(h));
    const broadleafProd = herbicides.find(h => /bow|arrow|dicamba|broadleaf|selective/i.test(h));

    // Exact calculations scaled to section m²
    const waterL = Math.max(4, Math.round((areaM2 / 100) * 10)); // 10L per 100m²
    const foliarMl = Math.round((areaM2 / 100) * 200);          // 200mL per 100m²
    const kelpMl = Math.round((areaM2 / 100) * 150);            // 150mL per 100m²
    const pgrMl = Math.round((areaM2 / 100) * 15);              // 15mL per 100m² for Couch/Kikuyu
    const wettingMl = Math.round((areaM2 / 100) * 100);         // 100mL per 100m²
    const granularKg = ((areaM2 * 25) / 1000).toFixed(2);       // 25g/m²
    const preG = Math.round((areaM2 / 100) * 15);               // 15g WDG/WG per 100m²

    const hasDryStress = !!(photoAnalysis && (photoAnalysis.maxBrownRatio > 0.14 || photoAnalysis.maxHardscapeRatio > 0.08));
    const hasWeedStress = !!(photoAnalysis && photoAnalysis.maxWeedRatio > 0.05);
    const needsColorPop = !!(photoAnalysis && (photoAnalysis.maxLimeRatio > 0.22 || photoAnalysis.darkGreenColorIndex < 76));

    // Tap timer schedule text
    const outlets = (tapTimer?.enabled && Array.isArray(tapTimer.outlets)) ? tapTimer.outlets : [];
    const matchedOutlet = outlets.find(o => o.enabled && activeZone && o.linkedZoneId === activeZone.id)
      || outlets.find(o => o.enabled)
      || null;
    const dayMap = { 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat', 0: 'Sun' };
    const timerDays = matchedOutlet && Array.isArray(matchedOutlet.days)
      ? matchedOutlet.days.map(d => dayMap[d]).join(' & ')
      : 'Tue & Fri';
    const timerText = matchedOutlet
      ? `Holman BX4 Zone ${matchedOutlet.outlet} (${timerDays} @ ${String(matchedOutlet.startHour ?? 5).padStart(2, '0')}:${String(matchedOutlet.startMin ?? 0).padStart(2, '0')}am, ${matchedOutlet.runMinutes}m)`
      : 'Deep morning soak 2x/week';

    // Build Tank Mix bullet using ONLY what they actually own
    const tankParts = [];
    if (liquidFert) tankParts.push(`<strong>${foliarMl}mL ${liquidFert}</strong>`);
    if (kelpFert) tankParts.push(`<strong>${kelpMl}mL ${kelpFert}</strong>`);
    if (pgrProd && !isBuffalo) tankParts.push(`<strong>${pgrMl}mL ${pgrProd}</strong>`);
    if (tankParts.length === 0 && customItems.length > 0) tankParts.push(`<strong>${customItems[0]}</strong> (label rate for ${areaM2}m²)`);

    const customExtraMention = customItems.length > 0
      ? ` Plus from your custom shed list: rotate in <strong>${customItems.slice(0, 2).join(', ')}</strong> during fortnightly root/foliar care.`
      : '';

    const equipmentBullets = [
      `<strong>Mower Setup (${mowerLabel}):</strong> Lock blades at <strong>${hoc}mm</strong>. Mow every ${isShowpiece ? '4–5 days' : '6–7 days'} (follow the 1/3 rule${hasReel ? ' — cross-cut 45° next mow to tighten couch lateral density' : ''}).`
    ];

    if (hasBackpack && tankParts.length > 0) {
      equipmentBullets.push(
        `<strong>${sprayerLabel} Tank Mix (${waterL}L water for ${areaM2}m²):</strong> Mix ${tankParts.join(' + ')}. Apply evenly 2 days after mowing.${customExtraMention}`
      );
    } else if (granularFert) {
      equipmentBullets.push(
        `<strong>${spreaderLabel} Feed (${areaM2}m²):</strong> Spread <strong>${granularKg}kg of ${granularFert}</strong> uniformly and water in immediately.`
      );
    }

    if (hasDryStress) {
      equipmentBullets.push(
        `<strong>Edge & Moisture Fix (${wettingProd || 'Wetting Agent'}):</strong> Concrete/stone borders absorb sun heat and dry soil first. Mix <strong>${wettingMl}mL ${wettingProd || 'Soil Wetting Agent'}</strong> in ${waterL}L water${hasAerator ? ' (or spike dry perimeter spots lightly)' : ''}, and sync with your <strong>${timerText}</strong>.`
      );
    } else {
      equipmentBullets.push(
        `<strong>Irrigation Sync:</strong> Keep <strong>${timerText}</strong>${weather?.shouldSkipSprinklers ? ' — pause next run because rain is forecast!' : ' — run dawn cycle cleanly.'}`
      );
    }

    if (hasWeedStress && broadleafProd) {
      const spotSafe = isBuffalo && /dicamba/i.test(broadleafProd)
        ? `Check label for Buffalo safety before spraying; use Bow & Arrow / Bromoxynil on Buffalo`
        : `${broadleafProd} (mix 15mL/L for spot spray — don't mow 3 days before/after)`;
      equipmentBullets.push(`<strong>Weed Spot-Control:</strong> Target visible outliers with <strong>${spotSafe}</strong>.`);
    }

    if (preEmergentProd) {
      equipmentBullets.push(
        `<strong>Pre-Emergent Shield (${preEmergentProd}):</strong> Lock in seasonal barrier at <strong>${preG}g / ${areaM2}m²</strong> watered in with 6mm irrigation within 24h.`
      );
    }

    // Build concrete Calendar Tasks for Week (7d), Fortnight (14d), and Month (30d)
    const calendarTasks = [];

    // Day 1: Mow with owned mower at exact HOC
    calendarTasks.push({
      dayOffset: 1,
      type: 'mow',
      icon: '✂️',
      title: `${mowerLabel}: Mow ${sectionName} @ ${hoc}mm`,
      timeLabel: '8:00 – 8:30 am',
      startHour: 8,
      subtext: `Photo-plan cut (${areaM2}m²) • Alternate pass angle, trim crisp borders`,
      color: 'emerald'
    });

    // Day 2: Wetting Agent / Dry Edge Rescue OR Moisture check
    if (hasDryStress || wettingProd) {
      calendarTasks.push({
        dayOffset: 2,
        type: 'water',
        icon: '🩹',
        title: `${wettingProd ? wettingProd.split('(')[0].trim() : 'Wetting Agent'} Border Drench (${sectionName})`,
        timeLabel: '7:00 – 7:20 am',
        startHour: 7,
        subtext: `${wettingMl}mL in ${waterL}L (${sprayerLabel}) — targets concrete/stone edge dryness for ${areaM2}m²`,
        color: 'amber'
      });
    }

    // Day 3: Weed spot-treat if weed hotspot flagged
    if (hasWeedStress && broadleafProd) {
      calendarTasks.push({
        dayOffset: 3,
        type: 'weed',
        icon: '🎯',
        title: `Spot-Spray Weeds with ${broadleafProd.split('(')[0].trim()}`,
        timeLabel: '9:00 – 9:15 am',
        startHour: 9,
        subtext: `Safe spot mix (15mL/L in ${sprayerLabel}) • No mow for 3 days after`,
        color: 'amber'
      });
    }

    // Day 4: Foliar Spoon-Feed + PGR (Color & Tight Canopy)
    if (liquidFert || kelpFert || pgrProd || needsColorPop) {
      const sprayTitle = [
        liquidFert ? 'Foliar N+Fe' : null,
        pgrProd && !isBuffalo ? 'Primo PGR' : null,
        kelpFert ? 'Seaweed' : null
      ].filter(Boolean).join(' + ') || 'Foliar Feed & Tonic';
      calendarTasks.push({
        dayOffset: 4,
        type: 'feed',
        icon: '🧪',
        title: `${sprayTitle} Tank Mix (${sectionName})`,
        timeLabel: '8:30 – 8:55 am',
        startHour: 8,
        subtext: `${sprayerLabel} (${waterL}L): ${[
          liquidFert ? `${foliarMl}mL ${liquidFert}` : null,
          pgrProd && !isBuffalo ? `${pgrMl}mL ${pgrProd}` : null,
          kelpFert ? `${kelpMl}mL ${kelpFert}` : null
        ].filter(Boolean).join(' + ') || `Area ${areaM2}m²`}`,
        color: 'teal'
      });
    }

    // Day 6: Follow-up Showpiece Mow
    calendarTasks.push({
      dayOffset: 6,
      type: 'mow',
      icon: '✂️',
      title: `Cross-Cut Mow @ ${hoc}mm (${sectionName})`,
      timeLabel: '8:00 – 8:30 am',
      startHour: 8,
      subtext: `Cross-cut 90° with ${mowerLabel} to tighten ${grassType} stolons`,
      color: 'emerald'
    });

    // Day 10 (Fortnight): Seaweed / Custom Shed Tonic or Aerate spot check
    calendarTasks.push({
      dayOffset: 10,
      type: 'feed',
      icon: '🌿',
      title: `${kelpFert ? 'Seaweed & Humic Root Push' : 'Fortnight Turf Boost'} (${sectionName})`,
      timeLabel: '8:30 – 8:50 am',
      startHour: 8,
      subtext: `${kelpMl}mL ${kelpFert || 'root biostimulant'} in ${waterL}L water${hasAerator ? ' • Check high-traffic spots for aeration' : ''}`,
      color: 'teal'
    });

    // Day 14 (Fortnight): Progress Photo Check-in
    calendarTasks.push({
      dayOffset: 14,
      type: 'photo',
      icon: '📸',
      title: `2-Week Photo Check-In (${sectionName})`,
      timeLabel: '5:00 – 5:05 pm',
      startHour: 17,
      subtext: `Re-shoot same 4 angles so Blade compares colour & density gains`,
      color: 'indigo'
    });

    // Day 21 (Month): Slow-Release Granular & Pre-Emergent Barrier
    calendarTasks.push({
      dayOffset: 21,
      type: 'feed',
      icon: '🌱',
      title: `${granularFert ? granularFert.split('(')[0].trim() : 'Granular Feed'}${preEmergentProd ? ' + Pre-Emergent' : ''} (${sectionName})`,
      timeLabel: '8:00 – 8:30 am',
      startHour: 8,
      subtext: `${spreaderLabel}: ${granularKg}kg granular${preEmergentProd ? ` + ${preG}g ${preEmergentProd}` : ''} • Water in 20 mins`,
      color: 'teal'
    });

    // Day 27 (Month): Scarify/Edge/Blade Sharpness Check
    calendarTasks.push({
      dayOffset: 27,
      type: 'mow',
      icon: '🔧',
      title: `Blade Check & Edge Detailing (${sectionName})`,
      timeLabel: '9:00 – 9:30 am',
      startHour: 9,
      subtext: `${hasScarifier ? 'Light groom check on runners • ' : ''}Inspect ${mowerLabel} blade sharpness`,
      color: 'emerald'
    });

    return {
      sectionName,
      grassType,
      hoc,
      areaM2,
      equipmentBullets,
      calendarTasks,
      weekFocus: calendarTasks.filter(t => t.dayOffset <= 6).map(t => `• <strong>Day ${t.dayOffset}:</strong> ${t.title} — ${t.subtext}`),
      fortnightAndMonthFocus: calendarTasks.filter(t => t.dayOffset > 6).map(t => `• <strong>Day ${t.dayOffset}:</strong> ${t.title} — ${t.subtext}`)
    };
  },

  /**
   * Formats live Netlify AI Gateway JSON response into crisp mobile-friendly consultation HTML
   */
  formatGatewayResultHtml(gw, sectionName) {
    const obsHtml = Array.isArray(gw.photoObservations) && gw.photoObservations.length
      ? `<div class="space-y-1">
           <div class="font-extrabold text-slate-900">📸 Photo-by-Photo Assessment (${sectionName}):</div>
           ${gw.photoObservations.map(o => `<div class="text-slate-700">• ${o}</div>`).join('')}
         </div>`
      : '';

    const eqHtml = Array.isArray(gw.equipmentPlan) && gw.equipmentPlan.length
      ? `<div class="space-y-1 pt-1.5 border-t border-slate-200/80">
           <div class="font-extrabold text-slate-900">🧰 Using Your Gear & Shed Products:</div>
           ${gw.equipmentPlan.map(e => `<div class="text-slate-700">• ${e}</div>`).join('')}
         </div>`
      : '';

    const weekHtml = Array.isArray(gw.weekFocus) && gw.weekFocus.length
      ? `<div class="space-y-1 pt-1.5 border-t border-slate-200/80">
           <div class="font-extrabold text-emerald-800">🗓️ This Week's Focus (7 Days):</div>
           ${gw.weekFocus.map(w => `<div class="text-slate-700">• ${w}</div>`).join('')}
         </div>`
      : '';

    const monthHtml = Array.isArray(gw.fortnightAndMonthFocus) && gw.fortnightAndMonthFocus.length
      ? `<div class="space-y-1 pt-1.5 border-t border-slate-200/80">
           <div class="font-extrabold text-slate-800">📆 Fortnight & Month Plan:</div>
           ${gw.fortnightAndMonthFocus.map(m => `<div class="text-slate-700">• ${m}</div>`).join('')}
         </div>`
      : '';

    return `
      <div class="space-y-2">
        <div class="flex flex-wrap items-center gap-1.5">
          <span class="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-extrabold text-[10px]">Health: ${gw.healthScore || 84}%</span>
          <span class="px-2 py-0.5 rounded-full bg-teal-100 text-teal-800 font-extrabold text-[10px]">Density: ${gw.densityScore || 85}%</span>
          <span class="px-2 py-0.5 rounded-full bg-sky-100 text-sky-800 font-extrabold text-[10px]">DGCI: ${gw.dgci || 78}/100</span>
        </div>
        <div class="font-semibold text-slate-900">${gw.overallVerdict || ''}</div>
        ${obsHtml}
        ${eqHtml}
        ${weekHtml}
        ${monthHtml}
        <div class="text-emerald-700 font-extrabold pt-1">✅ Your Week, Fortnight & Month Calendar has been updated from these photos!</div>
      </div>
    `;
  },

  /**
   * Conversational AI + Photo Diagnosis Engine ("Ask Blade AI")
   */
  async askBladeAI({
    question = '',
    photos = [],
    activeZone = null,
    profile = null,
    weather = null,
    tapTimer = null,
    logs = null,
    apiKey = ''
  }) {
    const cleanQ = (question || '').trim();
    const qLower = cleanQ.toLowerCase();
    const resolvedProfile = profile || (typeof StorageManager !== 'undefined' ? StorageManager.getProfile() : {});
    const sectionName = activeZone ? activeZone.name : 'All Lawn Sections';
    const grassType = activeZone?.grassType || resolvedProfile?.grassType || 'Bermuda / Couch';
    const isBuffalo = grassType.toLowerCase().includes('buffalo') || grassType.toLowerCase().includes('augustine');
    const hoc = activeZone?.hoc || resolvedProfile?.hoc || (isBuffalo ? 35 : 15);
    const areaM2 = activeZone?.area || 90;

    // 1. Run accurate Turf Computer Vision on any supplied photos
    let photoAnalysis = null;
    if (photos && photos.length > 0) {
      photoAnalysis = await this.analyzeMultipleImages(photos, resolvedProfile, activeZone, apiKey);
    }

    // 2. Attempt live Multimodal LLM via Netlify AI Gateway (/api/blade-ai)
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 22000);
      const gwResp = await fetch('/api/blade-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          question: cleanQ,
          photos: (photos || []).slice(0, 4),
          activeZone,
          profile: resolvedProfile,
          weather,
          tapTimer,
          logs,
          cvMetrics: photoAnalysis
        })
      });
      clearTimeout(timer);

      if (gwResp.ok) {
        const gwJson = await gwResp.json();
        if (!gwJson.fallback && gwJson.result) {
          const r = gwJson.result;
          const gwAnalysis = {
            photoCount: photos.length || photoAnalysis?.photoCount || 1,
            healthScore: Number(r.healthScore) || photoAnalysis?.healthScore || 84,
            darkGreenColorIndex: Number(r.dgci) || photoAnalysis?.darkGreenColorIndex || 78,
            densityScore: Number(r.densityScore) || photoAnalysis?.densityScore || 85,
            weedPressure: r.weedPressure || photoAnalysis?.weedPressure || 'Low (<2%)',
            weedsDetected: Array.isArray(r.weedsDetected) ? r.weedsDetected : (photoAnalysis?.weedsDetected || ['None']),
            diseaseOrStress: r.diseaseOrStress || photoAnalysis?.diseaseOrStress || 'Assessed visually',
            hotspots: photoAnalysis?.hotspots || [],
            overallVerdict: r.overallVerdict || 'Multimodal visual turf analysis complete.',
            recommendedHOC: hoc,
            actionPlan: photoAnalysis?.actionPlan || null
          };
          return {
            replyHtml: this.formatGatewayResultHtml(r, sectionName),
            photoAnalysis: gwAnalysis,
            calendarTasks: Array.isArray(r.calendarTasks) ? r.calendarTasks : null,
            isPhotoCheckIn: photos.length > 0,
            calendarTask: null
          };
        }
      }
    } catch (e) {
      // Gateway unavailable offline or locally — proceed smoothly with built-in Pro Agronomist
    }

    // 3. Optional client OpenAI API key fallback if user entered sk-... in Settings
    if (apiKey && apiKey.startsWith('sk-')) {
      try {
        const userContent = [
          {
            type: 'text',
            text: `You are Blade, an elite turfgrass agronomist.
Section: ${sectionName} (${grassType}, ${hoc}mm, ${areaM2}m²).
Equipment: ${(resolvedProfile.equipment || []).join(', ')}.
Fertilisers: ${(resolvedProfile.fertilisers || []).join(', ')}.
Herbicides/Regulators: ${(resolvedProfile.herbicides || []).concat(resolvedProfile.specialTreatments || []).join(', ')}.
${photoAnalysis ? `CV Metrics: Health ${photoAnalysis.healthScore}%, Density ${photoAnalysis.densityScore}%, DGCI ${photoAnalysis.darkGreenColorIndex}/100.` : ''}
Request: ${cleanQ || 'Analyze these lawn photos and formulate my exact Week, Fortnight & Month plan.'}`
          }
        ];
        (photos || []).slice(0, 3).forEach(dataUrl => {
          userContent.push({ type: 'image_url', image_url: { url: dataUrl } });
        });
        const resp = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
          body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: userContent }], max_tokens: 550 })
        });
        if (resp.ok) {
          const data = await resp.json();
          const replyText = data.choices?.[0]?.message?.content;
          if (replyText) {
            const shedPlan = this.buildShedPrescription({ profile: resolvedProfile, activeZone, photoAnalysis, weather, tapTimer });
            return {
              replyHtml: replyText.replace(/\n/g, '<br>'),
              photoAnalysis,
              calendarTasks: photoAnalysis ? shedPlan.calendarTasks : null,
              isPhotoCheckIn: !!photoAnalysis
            };
          }
        }
      } catch (e) {
        console.warn('Direct OpenAI fallback to built-in pro specialist:', e);
      }
    }

    // 4. Built-in Shed-Calibrated Pro Turf Agronomist Engine (Zero-config, deep & instant)
    const shedPlan = this.buildShedPrescription({
      profile: resolvedProfile,
      activeZone,
      photoAnalysis,
      weather,
      tapTimer
    });

    const ownsBroadleaf = (resolvedProfile.herbicides || []).find(h => /bow|arrow|dicamba|broadleaf/i.test(h));
    const herbicideRecommendation = isBuffalo
      ? '<strong>Bow & Arrow</strong> or <strong>Bin-Die (Bromoxynil + MCPA)</strong> — safe for Buffalo turf (avoid high-rate Dicamba on Buffalo)'
      : `<strong>${ownsBroadleaf || 'Bow & Arrow / Dicamba Selective Broadleaf'}</strong> (from your shed)`;

    const asksWeed = /weed|clover|bindii|bindi|dandelion|oxalis|nutgrass|sedge|wintergrass|poa|paspalum|crabgrass|thistle|foreign|what is this|get rid|kill|spray/.test(qLower);
    const asksBrownOrDry = /brown|dry|dead|patch|bare|spot|dying|urine|dog|burn|fungus|thatch/.test(qLower);
    const asksGrubs = /grub|worm|armyworm|beetle|bug|chew|bird|moth|spongy|curl/.test(qLower);
    const asksMow = /mow|cut|height|short|scalp|reel|rotary|trim/.test(qLower);
    const asksWater = /water|soak|holman|timer|rain|sprinkler|irrigat/.test(qLower);
    const asksFeed = /feed|fert|iron|green|nitrogen|food|color|colour/.test(qLower);
    const asksFullAnalysis = !!(
      photoAnalysis ||
      /analy|assess|look at|focus|next week|week|fortnight|month|plan|program|report|photo|pic|image|yard/.test(qLower)
    );

    // Case A: Weed ID & Shed-Matched Eradication
    if (asksWeed && !/next week|fortnight|month|analy/.test(qLower)) {
      let weedDiagnosis = '<strong>Broadleaf Weed Cluster (Clover / Bindii / Oxalis / Cudweed)</strong>';
      let specificFix = `Spot-spray with ${herbicideRecommendation} mixed at <strong>15mL per 1L water</strong> in your sprayer (covers 10m²).`;

      if (/nutgrass|sedge|shiny|tall light green/.test(qLower)) {
        weedDiagnosis = '<strong>Nutgrass (Yellow / Purple Nutsedge)</strong> — fast-growing shiny light-green sedge with underground nutlets';
        specificFix = `Do not pull by hand (it multiplies underground bulbs). Spray with <strong>Sedgehammer (Halosulfuron)</strong> — 1.3g sachet in 5L water with surfactant. Safe on ${grassType}.`;
      } else if (/wintergrass|poa|crabgrass|paspalum|grassy|seed head/.test(qLower)) {
        weedDiagnosis = '<strong>Grassy Weed (Wintergrass / Poa annua or Paspalum)</strong> — shallow-rooted clumping grass with pale seed heads';
        specificFix = `Apply <strong>Bow & Arrow / Propyzamide</strong> on active clumps, then lock down bare germination with your <strong>Prodiamine / Barricade Pre-Emergent</strong>.`;
      } else if (photoAnalysis) {
        weedDiagnosis = `<strong>${photoAnalysis.weedsDetected.join(' / ')}</strong> (${sectionName} visual check)`;
      }

      return {
        replyHtml: `
          <div class="space-y-2">
            <div>🔍 <strong>Identification (${sectionName}):</strong> ${weedDiagnosis}.</div>
            <div>🎯 <strong>Shed-Matched Treatment (${grassType}):</strong> ${specificFix}</div>
            <div>⏳ <strong>Pro Rule:</strong> Spray on a calm morning (<28°C) with 6h dry window. Wait <strong>3 days before mowing</strong> so herbicide reaches roots.</div>
          </div>
        `,
        photoAnalysis,
        calendarTasks: photoAnalysis ? shedPlan.calendarTasks : null,
        calendarTask: {
          type: 'weed',
          icon: '🎯',
          title: `Spot-Spray Weeds (${sectionName})`,
          subtext: `Safe for ${grassType} • Wait 3 days after spraying before mowing`
        }
      };
    }

    // Case B: Brown / Dry Patch Diagnosis
    if (asksBrownOrDry && !/next week|fortnight|month|analy/.test(qLower)) {
      const wettingName = (resolvedProfile.specialTreatments || []).find(t => /wetting|hydra/i.test(t)) || 'Soil Wetting Agent';
      const wetMl = Math.round((areaM2 / 100) * 100);
      return {
        replyHtml: `
          <div class="space-y-2">
            <div>🟤 <strong>Diagnosis for ${sectionName} (${areaM2}m²):</strong> Localised Dry Patch (hydrophobic soil — often accelerated near concrete/stone borders).</div>
            <div>🛠️ <strong>Shed Recovery Protocol:</strong>
              <br>1. <strong>Relieve Compaction:</strong> Spike the affected patch 8–10cm deep.
              <br>2. <strong>Wetting Drench:</strong> Apply <strong>${wetMl}mL ${wettingName}</strong> and water in for 20 minutes.
              <br>3. <strong>Runner Recovery:</strong> Follow with Foliar Nitrogen + Iron & Seaweed tonic in 4 days to pull ${grassType} stolons shut.</div>
          </div>
        `,
        photoAnalysis,
        calendarTasks: shedPlan.calendarTasks,
        calendarTask: {
          type: 'feed',
          icon: '🩹',
          title: `Wetting Agent & Patch Recovery (${sectionName})`,
          subtext: `${wetMl}mL ${wettingName} + 20m deep soak`
        }
      };
    }

    // Case C: Grubs & Lawn Pests
    if (asksGrubs) {
      return {
        replyHtml: `
          <div class="space-y-2">
            <div>🐛 <strong>Pest & Grub Check (${sectionName}):</strong> Spongy turf or birds pecking points to <strong>Lawn Armyworm or African Black Beetle larvae</strong>.</div>
            <div>🪣 <strong>10-Min Soap Flush Test:</strong> Mix 2 tbsp dish soap in a 9L bucket and pour over 1m² at dusk — grubs surface within 10 mins.</div>
            <div>🛡️ <strong>Elimination:</strong> Apply <strong>Acelepryn GR</strong> for 6-month shield + fast liquid knockdown at dusk, then water in well.</div>
          </div>
        `,
        photoAnalysis,
        calendarTask: {
          type: 'feed',
          icon: '🛡️',
          title: `Grub Treatment (${sectionName})`,
          subtext: `Apply Acelepryn & water in thoroughly`
        }
      };
    }

    // Case D: Full Pro Agronomist Photo Assessment + Equipment/Shed Plan -> Updates Calendar
    if (asksFullAnalysis) {
      const metricPills = photoAnalysis
        ? `<div class="flex flex-wrap items-center gap-1.5">
             <span class="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-extrabold text-[10px]">Health: ${photoAnalysis.healthScore}%</span>
             <span class="px-2 py-0.5 rounded-full bg-teal-100 text-teal-800 font-extrabold text-[10px]">Density: ${photoAnalysis.densityScore}%</span>
             <span class="px-2 py-0.5 rounded-full bg-sky-100 text-sky-800 font-extrabold text-[10px]">Color DGCI: ${photoAnalysis.darkGreenColorIndex}/100</span>
           </div>`
        : '';

      const photoBreakdown = photoAnalysis?.photoSummaries?.length
        ? `<div class="space-y-1">
             <div class="font-extrabold text-slate-900">📸 Visual Inspection (${photoAnalysis.photoCount} photo${photoAnalysis.photoCount === 1 ? '' : 's'} — ${sectionName}):</div>
             ${photoAnalysis.photoSummaries.map(s => `<div class="text-slate-700">• ${s}</div>`).join('')}
           </div>`
        : `<div class="text-slate-700">📋 <strong>Section Profile Loaded:</strong> ${sectionName} (${grassType} • ${hoc}mm • ${areaM2}m²).</div>`;

      return {
        replyHtml: `
          <div class="space-y-2">
            ${metricPills}
            <div class="font-semibold text-slate-900">${photoAnalysis ? photoAnalysis.overallVerdict : `Formulated a pro maintenance plan for ${sectionName} calibrated to your owned gear & shed products.`}</div>
            ${photoBreakdown}
            <div class="space-y-1 pt-1.5 border-t border-slate-200/80">
              <div class="font-extrabold text-slate-900">🧰 Custom Prescription (Using Your Exact Shed Gear & ${areaM2}m² Area):</div>
              ${shedPlan.equipmentBullets.map(b => `<div class="text-slate-700">• ${b}</div>`).join('')}
            </div>
            <div class="space-y-1 pt-1.5 border-t border-slate-200/80">
              <div class="font-extrabold text-emerald-800">🗓️ Next 7 Days Focus (Synced to Calendar):</div>
              ${shedPlan.weekFocus.map(w => `<div class="text-slate-700">${w}</div>`).join('')}
            </div>
            <div class="space-y-1 pt-1.5 border-t border-slate-200/80">
              <div class="font-extrabold text-slate-800">📆 Fortnight & Month Roadmap:</div>
              ${shedPlan.fortnightAndMonthFocus.map(f => `<div class="text-slate-700">${f}</div>`).join('')}
            </div>
            <div class="text-emerald-700 font-extrabold pt-1">✅ Your Week, Fortnight & Month Calendar has been updated automatically!</div>
          </div>
        `,
        photoAnalysis,
        calendarTasks: shedPlan.calendarTasks,
        isPhotoCheckIn: !!photoAnalysis,
        calendarTask: null
      };
    }

    // Case E: Watering specific query
    if (asksWater) {
      const outlets = tapTimer?.outlets || [];
      const activeOutlet = outlets.find(o => o.enabled) || outlets[0];
      const timerInfo = activeOutlet
        ? `Your <strong>Holman BX4 (Zone ${activeOutlet.outlet})</strong> is set for <strong>${activeOutlet.runMinutes || 20} mins at ${String(activeOutlet.startHour ?? 5).padStart(2, '0')}:${String(activeOutlet.startMin ?? 0).padStart(2, '0')} AM</strong>.`
        : 'Deep soak 2x per week at 5:00–6:00 AM.';
      const rainNote = weather?.shouldSkipSprinklers
        ? `🌧️ <strong>Rain Alert:</strong> Rain forecast (${weather.maxProb}%), pause your next timer run.`
        : `☀️ <strong>Forecast Check:</strong> Dry (${weather?.currentTemp || 24}°C) — keep your Holman BX4 timer active!`;

      return {
        replyHtml: `<div class="space-y-1.5"><div>💧 <strong>Watering (${sectionName}):</strong> ${timerInfo}</div><div>${rainNote}</div></div>`,
        photoAnalysis,
        calendarTask: {
          type: 'water',
          icon: '💧',
          title: `Deep Soak Watering (${sectionName})`,
          subtext: `20 min morning soak for deep root growth`
        }
      };
    }

    // Case F: Mow / Feed fallback
    if (asksMow || asksFeed) {
      return {
        replyHtml: `
          <div class="space-y-2">
            <div class="font-extrabold text-slate-900">🧰 Shed-Matched ${asksMow ? 'Mowing' : 'Feeding'} Guide (${sectionName} • ${areaM2}m²):</div>
            ${shedPlan.equipmentBullets.slice(0, 2).map(b => `<div>• ${b}</div>`).join('')}
          </div>
        `,
        photoAnalysis,
        calendarTasks: shedPlan.calendarTasks
      };
    }

    // Case G: Default
    return {
      replyHtml: `
        <div class="space-y-2">
          <div>🌱 <strong>Blade AI Ready for ${sectionName} (${grassType} • ${hoc}mm • ${areaM2}m²):</strong></div>
          <div>• Upload lawn photos below or tap <strong>Analyse Photos & Build Plan</strong> — I'll inspect every angle, dose your exact shed products for <strong>${areaM2}m²</strong>, and update your <strong>Week, Fortnight & Month Calendar</strong> automatically!</div>
        </div>
      `,
      photoAnalysis
    };
  }
};

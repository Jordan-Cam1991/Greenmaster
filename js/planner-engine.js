/**
 * Agronomic Planner Engine for GreenMaster AI
 * Designed for ultra-clear, bite-sized, visual action cards inspired by top DIY lawn apps
 * (Yard Mastery, LawnSuite AU, Scotts My Lawn, and r/lawncare community tools).
 *
 * Every task includes:
 * - Short, punchy action title (`task`)
 * - Instant visual setting/dosage badge (`settingBadge`) — auto-calculated for the zone's area (m²) or HOC (mm)!
 * - Quick time estimate (`timeEst`)
 * - Plain-English collapsible "How-To" tip (`tip`)
 */
const PlannerEngine = {
  MOW_PATTERNS: [
    { icon: '↕️', name: 'North–South (Up & Down)', short: '↕️ N–S Stripes' },
    { icon: '↗️', name: 'Diagonal (NE–SW)', short: '↗️ Diagonal 45°' },
    { icon: '↔️', name: 'East–West (Across)', short: '↔️ E–W Stripes' },
    { icon: '↖️', name: 'Cross-Diagonal (NW–SE)', short: '↖️ Cross-Diag' }
  ],

  getRecommendedMowPattern(mowCount = 0) {
    return this.MOW_PATTERNS[mowCount % this.MOW_PATTERNS.length];
  },

  /**
   * Calculate exact product dosage for a given area (m²)
   */
  calculateDosage(type, areaM2 = 100) {
    const area = Math.max(10, Number(areaM2) || 100);
    const waterLitres = Math.max(2, Math.round((area / 100) * 8)); // ~8L per 100m² in knapsack
    switch (type) {
      case 'foliar': {
        const ml = Math.round((area / 100) * 100); // 100mL per 100m²
        return {
          badge: `🧪 Mix ${ml}mL in ${waterLitres}L water`,
          detail: `Measure ${ml}mL of liquid foliar/iron into ${waterLitres}L of water to evenly cover ${area}m².`
        };
      }
      case 'granular': {
        const kg = ((area / 100) * 2.0).toFixed(1); // 2kg per 100m²
        return {
          badge: `⚖️ Weigh ${kg}kg total`,
          detail: `Weigh out ${kg}kg of slow-release granules for ${area}m². Apply half North–South and half East–West, then water in.`
        };
      }
      case 'wetting': {
        const ml = Math.round((area / 100) * 150); // 150mL per 100m²
        return {
          badge: `💧 Mix ${ml}mL in ${waterLitres}L water`,
          detail: `Spray ${ml}mL of wetting agent across ${area}m² and immediately water in for 15–20 mins.`
        };
      }
      case 'pre_emergent': {
        const ml = Math.round((area / 100) * 25); // 25mL per 100m²
        return {
          badge: `🛡️ Mix ${ml}mL in ${waterLitres}L water`,
          detail: `Apply ${ml}mL of Prodiamine/Spartan in ${waterLitres}L water across ${area}m², then water in with 12mm to seal the topsoil.`
        };
      }
      case 'kelp': {
        const ml = Math.round((area / 100) * 120); // 120mL per 100m²
        return {
          badge: `🌱 Mix ${ml}mL in ${waterLitres}L water`,
          detail: `Mix ${ml}mL of seaweed/humic biostimulant in ${waterLitres}L water for ${area}m².`
        };
      }
      case 'pgr': {
        const ml = Math.round((area / 100) * 20); // 20mL per 100m²
        return {
          badge: `📐 Mix ${ml}mL in ${waterLitres}L water`,
          detail: `Spray ${ml}mL of PGR on dry leaves across ${area}m² (re-apply every 200 GDD).`
        };
      }
      case 'weed_spot': {
        return {
          badge: `🎯 Spot spray weeds only`,
          detail: `Mix 15mL selective broadleaf herbicide per 2L water and dab/spray only visible weeds on a calm morning.`
        };
      }
      default:
        return { badge: `📐 ${area}m² area`, detail: '' };
    }
  },

  /**
   * Generate a punchy, visual 6-horizon plan for a single yard zone or property
   */
  generateDynamicPlan({ cvMetrics = {}, weedLevel = 'Low (<2%)', weeds = [], diseaseOrStress = '', hotspots = [], profile = {}, zones = [], targetZone = null, mowPatternIdx = 0 }) {
    const activeZone = targetZone || (zones.length === 1 ? zones[0] : null);
    const zoneId = activeZone ? activeZone.id : 'all';
    const zoneName = activeZone ? activeZone.name : 'All Yard Zones';

    const tier = profile.tier || 'semi_pro';
    const grass = activeZone ? (activeZone.grassType || profile.grassType || 'Bermuda / Couch') : (profile.grassType || 'Bermuda / Couch');
    const hoc = Number(activeZone ? activeZone.hoc : profile.hoc) || 15;
    const area = Number(activeZone ? activeZone.area : profile.lawnArea) || 90;
    const sunExposure = activeZone ? (activeZone.sunExposure || 'Full Sun (6+ hrs)') : 'Full Sun (6+ hrs)';
    const attentionLevel = activeZone ? (activeZone.attentionLevel || 'standard') : 'standard';

    const isRecovery = attentionLevel === 'recovery';
    const isShowpiece = attentionLevel === 'showpiece';
    const isLowKey = attentionLevel === 'low';
    const isShaded = sunExposure.toLowerCase().includes('shade') || sunExposure.toLowerCase().includes('partial') || sunExposure.toLowerCase().includes('heavy');

    const zoneSpec = `${grass.split(' /')[0]} • ${hoc}mm • ${area}m²`;

    const history = profile.history || {};
    const equipment = profile.equipment || [];
    const fertilisers = profile.fertilisers || [];
    const herbicides = profile.herbicides || [];
    const customOwned = profile.customOwnedProducts || [];

    const hasReel = equipment.some(e => e.toLowerCase().includes('reel') || e.toLowerCase().includes('cylinder'));
    const hasSprayer = equipment.some(e => e.toLowerCase().includes('sprayer'));
    const hasPgr = profile.specialTreatments?.some(t => t.toLowerCase().includes('pgr') || t.toLowerCase().includes('primo'));
    const hasPreEmergent = herbicides.some(h => h.toLowerCase().includes('prodiamine') || h.toLowerCase().includes('barricade') || h.toLowerCase().includes('pre-emergent') || h.toLowerCase().includes('spartan')) || customOwned.some(c => c.toLowerCase().includes('pre-emergent') || c.toLowerCase().includes('prodiamine') || c.toLowerCase().includes('barricade'));
    const hasWettingAgent = profile.specialTreatments?.some(t => t.toLowerCase().includes('wetting') || t.toLowerCase().includes('surfactant')) || customOwned.some(c => c.toLowerCase().includes('wetting') || c.toLowerCase().includes('hydra'));

    const pattern1 = this.getRecommendedMowPattern(mowPatternIdx);
    const pattern2 = this.getRecommendedMowPattern(mowPatternIdx + 1);

    const prefixId = activeZone ? `${activeZone.id}_` : '';
    const tagTask = (t) => ({
      ...t,
      id: `${prefixId}${t.id}`,
      zoneId,
      zoneName,
      zoneSpec,
      area,
      hoc,
      attentionLevel
    });

    // 1. ONE WEEK (This Week's Gameplan)
    const oneWeek = [];

    // Pinpointed photo hotspots
    if (Array.isArray(hotspots) && hotspots.length > 0) {
      hotspots.forEach((h, idx) => {
        const isWeed = h.type === 'weed_cluster' || (h.label && h.label.toLowerCase().includes('weed'));
        const isDry = h.type === 'drought_patch' || (h.label && h.label.toLowerCase().includes('dry'));
        const dose = this.calculateDosage(isWeed ? 'weed_spot' : 'wetting', Math.max(15, Math.round(area * 0.3)));
        oneWeek.push(tagTask({
          id: `w1_hotspot_${idx}`,
          task: isDry ? `Soak Dry Patch (${h.label.split(':')[0]})` : isWeed ? `Spot-Spray Weeds (${h.label.split(':')[0]})` : h.label,
          settingBadge: dose.badge,
          timeEst: '10 min',
          calcType: isWeed ? 'weed_spot' : 'wetting',
          urgency: 'Critical',
          category: isWeed ? 'Weed Control' : 'Watering',
          tip: h.recommendation || dose.detail
        }));
      });
    }

    // Recovery mode urgent drench
    if (isRecovery && (!hotspots || hotspots.length === 0)) {
      const dose = this.calculateDosage('wetting', area);
      oneWeek.push(tagTask({
        id: 'w1_recovery_soak',
        task: `Recovery Wetting Agent Soak`,
        settingBadge: dose.badge,
        timeEst: '15 min',
        calcType: 'wetting',
        urgency: 'Critical',
        category: 'Soil',
        tip: `${dose.detail} Helps thin or traffic-worn patches absorb water and bounce back fast.`
      }));
    }

    // Mowing task (Short & Visual!)
    const lastMowDays = Number(history.lastMowDays) || 3;
    const mowMins = Math.max(10, Math.round(area / 6));
    if (lastMowDays >= 10) {
      const stepHoc = Math.round(hoc * 1.3);
      oneWeek.push(tagTask({
        id: 'w1_step_down_mow',
        task: `Step-Down Mow (Start High)`,
        settingBadge: `✂️ Deck: ${stepHoc}mm → ${hoc}mm • ${pattern1.short}`,
        timeEst: `${mowMins} min`,
        urgency: 'High',
        category: 'Mowing',
        tip: `Grass hasn't been cut in ${lastMowDays} days. Cut at ${stepHoc}mm today, then drop to ${hoc}mm in 3 days so you don't scalp it (1/3rd rule).`
      }));
    } else if (isShaded) {
      const shadeHoc = Math.max(hoc, 30);
      oneWeek.push(tagTask({
        id: 'w1_shade_mow',
        task: `Shade Cut (Keep Leaves Longer)`,
        settingBadge: `✂️ Deck: ${shadeHoc}mm • ${pattern1.short}`,
        timeEst: `${mowMins} min`,
        urgency: 'High',
        category: 'Mowing',
        tip: `Shaded grass needs longer blades (${shadeHoc}mm) to catch sunlight and stay thick.`
      }));
    } else {
      oneWeek.push(tagTask({
        id: 'w1_mow_1',
        task: hasReel && isShowpiece ? `Reel Mow (${pattern1.short})` : `Mow Lawn (${pattern1.short})`,
        settingBadge: `✂️ Deck: ${hoc}mm • ${pattern1.short}`,
        timeEst: `${mowMins} min`,
        urgency: isShowpiece ? 'Critical' : 'High',
        category: 'Mowing',
        tip: `Mow at ${hoc}mm in a ${pattern1.name} direction once morning dew dries. Never take off more than 1/3rd of the leaf.`
      }));

      if (isShowpiece || (tier === 'full_pro' && !isLowKey)) {
        oneWeek.push(tagTask({
          id: 'w1_mow_2',
          task: `Mid-Week Cross-Cut (${pattern2.short})`,
          settingBadge: `✂️ Deck: ${hoc}mm • ${pattern2.short}`,
          timeEst: `${mowMins} min`,
          urgency: 'Medium',
          category: 'Mowing',
          tip: `Rotate direction to ${pattern2.name} mid-week to prevent grass grain and thicken the carpet.`
        }));
      }
    }

    // Irrigation task
    const waterMins = isShaded ? 15 : 25;
    oneWeek.push(tagTask({
      id: 'w1_water',
      task: isShaded ? `Light Dawn Watering (Shade)` : `Deep Morning Soak`,
      settingBadge: `💧 ${waterMins} mins @ Sunrise (${isShaded ? '9mm' : '12mm'})`,
      timeEst: `${waterMins} min`,
      urgency: isRecovery ? 'High' : 'Medium',
      category: 'Watering',
      tip: isShaded
        ? `Shaded areas evaporate slowly. Run sprinklers for ${waterMins} mins at dawn only, and skip if soil is still damp.`
        : `Water deeply (${waterMins} mins between 5–7 AM, ${profile.wateringFreq || '2x/week'}) to train roots to grow deep.`
    }));

    // Pre-emergent urgent check
    if (history.preEmergentStatus === 'none' || history.preEmergentStatus === 'over_6m') {
      const preDose = this.calculateDosage('pre_emergent', area);
      oneWeek.push(tagTask({
        id: 'w1_urgent_pre_emergent',
        task: hasPreEmergent ? `Apply Weed Barrier (Pre-Emergent)` : `🛒 Get & Apply Pre-Emergent`,
        settingBadge: preDose.badge,
        timeEst: '15 min',
        calcType: 'pre_emergent',
        urgency: 'Critical',
        category: 'Protection',
        tip: `${preDose.detail} Blocks winter/summer weed seeds before they ever sprout (Available at lawntips.com).`
      }));
    }

    // Weed spot check
    if (weedLevel.includes('Moderate') || weedLevel.includes('High')) {
      const weedDose = this.calculateDosage('weed_spot', area);
      oneWeek.push(tagTask({
        id: 'w1_weeds',
        task: `Spot-Spray Visible Weeds`,
        settingBadge: weedDose.badge,
        timeEst: '10 min',
        calcType: 'weed_spot',
        urgency: 'High',
        category: 'Weed Control',
        tip: `${weedDose.detail} Ensure herbicide is safe for ${grass}.`
      }));
    }

    // 2. TWO WEEKS (Next 14 Days)
    const twoWeeks = [];
    const useLiquid = hasSprayer || isShowpiece || tier === 'full_pro';
    const feedDose = this.calculateDosage(useLiquid ? 'foliar' : 'granular', area);
    twoWeeks.push(tagTask({
      id: 'w2_feed',
      task: useLiquid ? `Liquid Iron & Nitrogen Feed` : `Slow-Release Lawn Feed`,
      settingBadge: feedDose.badge,
      timeEst: '15 min',
      calcType: useLiquid ? 'foliar' : 'granular',
      urgency: 'High',
      category: 'Fertiliser',
      tip: `${feedDose.detail} Boosts deep emerald green colour without soft surge growth.`
    }));

    twoWeeks.push(tagTask({
      id: 'w2_edge',
      task: `Crisp Edge Trim`,
      settingBadge: `📐 Vertical 90° Edges`,
      timeEst: '10 min',
      urgency: 'Low',
      category: 'Detailing',
      tip: `Whipper-snip or blade-edge along paths and garden beds to frame ${zoneName}.`
    }));

    if (hasPgr && isShowpiece) {
      const pgrDose = this.calculateDosage('pgr', area);
      twoWeeks.push(tagTask({
        id: 'w2_pgr',
        task: `Apply PGR (Growth Regulator)`,
        settingBadge: pgrDose.badge,
        timeEst: '15 min',
        calcType: 'pgr',
        urgency: 'Medium',
        category: 'Protection',
        tip: pgrDose.detail
      }));
    }

    // 3. ONE MONTH (Monthly Care)
    const oneMonth = [];
    const wetDose = this.calculateDosage('wetting', area);
    oneMonth.push(tagTask({
      id: 'm1_wetting',
      task: hasWettingAgent ? `Monthly Wetting Agent Soak` : `🛒 Apply Soil Wetting Agent`,
      settingBadge: wetDose.badge,
      timeEst: '15 min',
      calcType: 'wetting',
      urgency: 'High',
      category: 'Soil',
      tip: `${wetDose.detail} Stops dry patches and saves 30% water (Available at lawntips.com).`
    }));

    const kelpDose = this.calculateDosage('kelp', area);
    oneMonth.push(tagTask({
      id: 'm1_biostimulant',
      task: `Seaweed & Humic Root Tonic`,
      settingBadge: kelpDose.badge,
      timeEst: '15 min',
      calcType: 'kelp',
      urgency: 'Medium',
      category: 'Soil',
      tip: `${kelpDose.detail} Feeds beneficial soil microbes and thickens roots.`
    }));

    oneMonth.push(tagTask({
      id: 'm1_blade_check',
      task: hasReel ? `Check Reel & Bedknife Cut` : `Sharpen Mower Blades`,
      settingBadge: `🔧 Paper-Cut Sharpness Test`,
      timeEst: '20 min',
      urgency: 'Medium',
      category: 'Equipment',
      tip: `Dull blades rip grass tips, leaving a brown fuzzy haze across the lawn.`
    }));

    // 4. ONE QUARTER (Seasonal / 3 Months)
    const oneQuarter = [];
    const qPreDose = this.calculateDosage('pre_emergent', area);
    oneQuarter.push(tagTask({
      id: 'q1_pre_emergent',
      task: `Seasonal Pre-Emergent Booster`,
      settingBadge: qPreDose.badge,
      timeEst: '15 min',
      calcType: 'pre_emergent',
      urgency: 'Critical',
      category: 'Protection',
      tip: `${qPreDose.detail} Apply when soil temp crosses 13°C (55°F) to block seasonal weeds.`
    }));

    const qGranDose = this.calculateDosage('granular', area);
    oneQuarter.push(tagTask({
      id: 'q1_seasonal_feed',
      task: `Seasonal Granular NPK Boost`,
      settingBadge: qGranDose.badge,
      timeEst: '15 min',
      calcType: 'granular',
      urgency: 'High',
      category: 'Fertiliser',
      tip: qGranDose.detail
    }));

    // 5. HALF YEAR (6-Month Tune-Up)
    const halfYear = [
      tagTask({
        id: 'h1_core_aeration',
        task: `Aerate Soil (Relieve Compaction)`,
        settingBadge: `⚙️ Core or Spike ${area}m²`,
        timeEst: '45 min',
        urgency: 'High',
        category: 'Renovation',
        tip: `Punch holes across high-traffic areas so air, water, and nutrients reach the roots.`
      }),
      tagTask({
        id: 'h1_sprinkler_audit',
        task: `Catch-Cup Sprinkler Check`,
        settingBadge: `💧 Place 4 Cups • Run 15m`,
        timeEst: '20 min',
        urgency: 'Medium',
        category: 'Watering',
        tip: `Place tuna cans or catch-cups on ${zoneName} to verify even sprinkler coverage.`
      })
    ];

    // 6. ONE YEAR (Annual Spring Renovation)
    const oneYear = [
      tagTask({
        id: 'y1_annual_renovation',
        task: `Spring Lawn Renovation & Topdress`,
        settingBadge: `⛳ Scalp, Dethatch & Sand Level`,
        timeEst: 'Half Day',
        urgency: 'Critical',
        category: 'Renovation',
        tip: `Once a year in mid-spring: scalp low, remove dead thatch, aerate, and level with washed sand.`
      }),
      tagTask({
        id: 'y1_lab_soil_test',
        task: `Check Soil pH (Target 6.2–6.8)`,
        settingBadge: `🌱 Test Kit or Lab Sample`,
        timeEst: '15 min',
        urgency: 'High',
        category: 'Soil',
        tip: `Keeping soil pH around 6.5 unlocks 100% of the fertiliser you apply.`
      })
    ];

    return {
      oneWeek,
      twoWeeks,
      oneMonth,
      oneQuarter,
      halfYear,
      oneYear
    };
  },

  /**
   * Builds a clean, punchy "Aligned Together" plan across all yard zones
   */
  generateAlignedPropertyPlan({ profile = {}, zones = [], zoneResultsMap = {}, mowPatternIdx = 0 }) {
    if (!zones || zones.length === 0) {
      return this.generateDynamicPlan({ profile, zones: [], mowPatternIdx });
    }
    if (zones.length === 1) {
      const z = zones[0];
      const zRes = zoneResultsMap[z.id] || {};
      return this.generateDynamicPlan({
        cvMetrics: {
          densityPercent: zRes.densityScore || 82,
          avgDgci: zRes.darkGreenColorIndex || 78,
          weedRatio: 0.02,
          brownRatio: 0.03,
          healthScore: zRes.healthScore || 85
        },
        weedLevel: zRes.weedPressure || 'Low (<2%)',
        weeds: zRes.weedsDetected || [],
        diseaseOrStress: zRes.diseaseOrStress || '',
        hotspots: zRes.hotspots || [],
        profile,
        zones: [z],
        targetZone: z,
        mowPatternIdx
      });
    }

    const totalArea = zones.reduce((sum, z) => sum + (Number(z.area) || 50), 0);
    const areaBreakdown = zones.map(z => `${z.name}: ${z.area || 50}m²`).join(' • ');
    const pattern1 = this.getRecommendedMowPattern(mowPatternIdx);

    const alignedTag = (t) => ({
      ...t,
      zoneId: 'all',
      zoneName: `All ${zones.length} Zones`,
      zoneSpec: `${totalArea}m² Total`,
      area: totalArea,
      attentionLevel: 'aligned'
    });

    const oneWeek = [];

    // 1. Specific photo hotspots per zone
    zones.forEach(z => {
      const zRes = zoneResultsMap[z.id];
      const zHotspots = zRes?.hotspots || [];
      zHotspots.forEach((h, idx) => {
        const isWeed = h.type === 'weed_cluster' || (h.label && h.label.toLowerCase().includes('weed'));
        const dose = this.calculateDosage(isWeed ? 'weed_spot' : 'wetting', Math.max(15, Math.round((z.area || 50) * 0.3)));
        oneWeek.push({
          id: `${z.id}_w1_hotspot_${idx}`,
          zoneId: z.id,
          zoneName: z.name,
          zoneSpec: `${z.hoc}mm • ${z.area || 50}m²`,
          area: z.area || 50,
          attentionLevel: z.attentionLevel,
          task: `${h.label}`,
          settingBadge: dose.badge,
          timeEst: '10 min',
          calcType: isWeed ? 'weed_spot' : 'wetting',
          urgency: 'Critical',
          category: isWeed ? 'Weed Control' : 'Watering',
          tip: h.recommendation || dose.detail
        });
      });
    });

    // 2. Mowing per zone (with clear deck height badge!)
    zones.forEach(z => {
      const zArea = Number(z.area) || 50;
      const mowMins = Math.max(8, Math.round(zArea / 6));
      oneWeek.push({
        id: `${z.id}_aligned_w1_mow`,
        zoneId: z.id,
        zoneName: z.name,
        zoneSpec: `${(z.grassType || 'Turf').split(' /')[0]} • ${zArea}m²`,
        area: zArea,
        hoc: z.hoc,
        attentionLevel: z.attentionLevel,
        task: `Mow ${z.name}`,
        settingBadge: `✂️ Deck: ${z.hoc}mm • ${pattern1.short}`,
        timeEst: `${mowMins} min`,
        urgency: z.attentionLevel === 'showpiece' ? 'Critical' : 'High',
        category: 'Mowing',
        tip: `Set mower deck to ${z.hoc}mm for ${z.name} (${z.sunExposure}). Direction: ${pattern1.name}.`
      });
    });

    // 3. Aligned Watering
    const shadedZones = zones.filter(z => (z.sunExposure || '').toLowerCase().includes('shade'));
    oneWeek.push(alignedTag({
      id: 'aligned_w1_water',
      task: `Morning Sprinkler Soak (All Zones)`,
      settingBadge: `💧 20–25 mins @ Sunrise (12mm)`,
      timeEst: '25 min',
      urgency: 'Medium',
      category: 'Watering',
      tip: `Run dawn soak across all zones (${areaBreakdown}). ${shadedZones.length > 0 ? `Reduce runtime by 25% in shaded areas (${shadedZones.map(s => s.name).join(', ')}).` : ''}`
    }));

    // 4. Aligned Pre-Emergent if needed
    const history = profile.history || {};
    if (history.preEmergentStatus === 'none' || history.preEmergentStatus === 'over_6m') {
      const preDose = this.calculateDosage('pre_emergent', totalArea);
      oneWeek.push(alignedTag({
        id: 'aligned_w1_pre_emergent',
        task: `Apply Pre-Emergent Weed Barrier`,
        settingBadge: preDose.badge,
        timeEst: '20 min',
        calcType: 'pre_emergent',
        urgency: 'Critical',
        category: 'Protection',
        tip: `${preDose.detail} Covers all ${zones.length} zones (${areaBreakdown}) in one tank mix.`
      }));
    }

    // TWO WEEKS
    const foliarDose = this.calculateDosage('foliar', totalArea);
    const twoWeeks = [
      alignedTag({
        id: 'aligned_w2_feed',
        task: `Feed All Zones Together (Iron + N)`,
        settingBadge: foliarDose.badge,
        timeEst: '20 min',
        calcType: 'foliar',
        urgency: 'High',
        category: 'Fertiliser',
        tip: `${foliarDose.detail} Breakdown: ${areaBreakdown}.`
      }),
      alignedTag({
        id: 'aligned_w2_edge',
        task: `Trim All Lawn Edges`,
        settingBadge: `📐 Crisp 90° Borders`,
        timeEst: '15 min',
        urgency: 'Low',
        category: 'Detailing',
        tip: `Edge paths, driveways, and garden beds across all ${zones.length} sections in one pass.`
      })
    ];

    // ONE MONTH
    const wetDose = this.calculateDosage('wetting', totalArea);
    const kelpDose = this.calculateDosage('kelp', totalArea);
    const oneMonth = [
      alignedTag({
        id: 'aligned_m1_wetting',
        task: `Soil Wetting Agent (All Zones)`,
        settingBadge: wetDose.badge,
        timeEst: '20 min',
        calcType: 'wetting',
        urgency: 'High',
        category: 'Soil',
        tip: `${wetDose.detail} Breakdown: ${areaBreakdown}.`
      }),
      alignedTag({
        id: 'aligned_m1_kelp',
        task: `Seaweed & Humic Root Tonic`,
        settingBadge: kelpDose.badge,
        timeEst: '20 min',
        calcType: 'kelp',
        urgency: 'Medium',
        category: 'Soil',
        tip: kelpDose.detail
      }),
      alignedTag({
        id: 'aligned_m1_blades',
        task: `Sharpen Mower Blades`,
        settingBadge: `🔧 Clean Cut Check`,
        timeEst: '20 min',
        urgency: 'Medium',
        category: 'Equipment',
        tip: `Sharp blades prevent frayed yellowing tips across all yard areas.`
      })
    ];

    // ONE QUARTER
    const qPre = this.calculateDosage('pre_emergent', totalArea);
    const qGran = this.calculateDosage('granular', totalArea);
    const oneQuarter = [
      alignedTag({
        id: 'aligned_q1_pre',
        task: `Quarterly Pre-Emergent Barrier`,
        settingBadge: qPre.badge,
        timeEst: '20 min',
        calcType: 'pre_emergent',
        urgency: 'Critical',
        category: 'Protection',
        tip: qPre.detail
      }),
      alignedTag({
        id: 'aligned_q1_feed',
        task: `Seasonal Granular Fertiliser`,
        settingBadge: qGran.badge,
        timeEst: '20 min',
        calcType: 'granular',
        urgency: 'High',
        category: 'Fertiliser',
        tip: `${qGran.detail} Breakdown: ${areaBreakdown}.`
      })
    ];

    // HALF YEAR
    const halfYear = [
      alignedTag({
        id: 'aligned_h1_aerate',
        task: `Core Aerate All Yard Zones`,
        settingBadge: `⚙️ ${totalArea}m² Total Area`,
        timeEst: '1 hr',
        urgency: 'High',
        category: 'Renovation',
        tip: `Relieve soil compaction across ${areaBreakdown} on the same weekend.`
      }),
      alignedTag({
        id: 'aligned_h1_sprinkler',
        task: `Check Sprinkler Coverage`,
        settingBadge: `💧 Catch-Cup Test`,
        timeEst: '20 min',
        urgency: 'Medium',
        category: 'Watering',
        tip: `Verify even watering across front, verge, and back yard sections.`
      })
    ];

    // ONE YEAR
    const oneYear = [
      alignedTag({
        id: 'aligned_y1_reno',
        task: `Annual Spring Renovation`,
        settingBadge: `⛳ Scalp, Aerate & Level (${totalArea}m²)`,
        timeEst: '1 Day',
        urgency: 'Critical',
        category: 'Renovation',
        tip: `Full spring reset across all ${zones.length} sections.`
      }),
      alignedTag({
        id: 'aligned_y1_soil',
        task: `Soil pH Test (Target 6.5)`,
        settingBadge: `🌱 Front & Back Samples`,
        timeEst: '15 min',
        urgency: 'High',
        category: 'Soil',
        tip: `Test soil pH to keep nutrients unlocked all year.`
      })
    ];

    return {
      oneWeek,
      twoWeeks,
      oneMonth,
      oneQuarter,
      halfYear,
      oneYear
    };
  }
};

/**
 * Agronomic Planner Engine for GreenMaster AI
 * Dynamically computes actionable schedules across 6 time horizons:
 * 1. Next Week (7 Days)
 * 2. Two Weeks (14 Days)
 * 3. One Month (30 Days)
 * 4. One Quarter (3 Months)
 * 5. Half Year (6 Months)
 * 6. One Year (12 Months)
 *
 * Supports both:
 * - Zone-Specific Plans (tailored per yard section's HOC, sun exposure, attention level, & hotspots)
 * - Aligned Multi-Zone Plans (unifying shared property treatments while badging zone-specific requirements)
 */
const PlannerEngine = {
  /**
   * Generate a 6-horizon plan for a single yard zone or property profile
   */
  generateDynamicPlan({ cvMetrics = {}, weedLevel = 'Low (<2%)', weeds = [], diseaseOrStress = '', hotspots = [], profile = {}, zones = [], targetZone = null }) {
    const activeZone = targetZone || (zones.length === 1 ? zones[0] : null);
    const zoneId = activeZone ? activeZone.id : 'all';
    const zoneName = activeZone ? activeZone.name : 'All Yard Zones';

    const tier = profile.tier || 'semi_pro';
    const grass = activeZone ? (activeZone.grassType || profile.grassType || 'Bermuda / Couch') : (profile.grassType || 'Bermuda / Couch');
    const hoc = Number(activeZone ? activeZone.hoc : profile.hoc) || 15;
    const area = Number(activeZone ? activeZone.area : profile.lawnArea) || 100;
    const sunExposure = activeZone ? (activeZone.sunExposure || 'Full Sun (6+ hrs)') : 'Full Sun (6+ hrs)';
    const attentionLevel = activeZone ? (activeZone.attentionLevel || 'standard') : 'standard';

    const isRecovery = attentionLevel === 'recovery';
    const isShowpiece = attentionLevel === 'showpiece';
    const isLowKey = attentionLevel === 'low';
    const isShaded = sunExposure.toLowerCase().includes('shade') || sunExposure.toLowerCase().includes('partial') || sunExposure.toLowerCase().includes('heavy');

    const zoneSpec = activeZone
      ? `${grass} • ${hoc}mm • ${sunExposure.split(' (')[0]}`
      : `${grass} • ${hoc}mm Target`;

    const history = profile.history || {};
    const equipment = profile.equipment || [];
    const fertilisers = profile.fertilisers || [];
    const herbicides = profile.herbicides || [];
    const customOwned = profile.customOwnedProducts || [];

    const hasReel = equipment.some(e => e.toLowerCase().includes('reel') || e.toLowerCase().includes('cylinder'));
    const hasSprayer = equipment.some(e => e.toLowerCase().includes('sprayer'));
    const hasDethatcher = equipment.some(e => e.toLowerCase().includes('dethatch') || e.toLowerCase().includes('scarifi'));
    const hasAerator = equipment.some(e => e.toLowerCase().includes('aera'));
    const hasPgr = profile.specialTreatments?.some(t => t.toLowerCase().includes('pgr') || t.toLowerCase().includes('primo'));
    const hasPreEmergent = herbicides.some(h => h.toLowerCase().includes('prodiamine') || h.toLowerCase().includes('barricade') || h.toLowerCase().includes('pre-emergent') || h.toLowerCase().includes('spartan')) || customOwned.some(c => c.toLowerCase().includes('pre-emergent') || c.toLowerCase().includes('prodiamine') || c.toLowerCase().includes('barricade'));
    const hasWettingAgent = profile.specialTreatments?.some(t => t.toLowerCase().includes('wetting') || t.toLowerCase().includes('surfactant')) || customOwned.some(c => c.toLowerCase().includes('wetting') || c.toLowerCase().includes('hydra'));
    const hasFertiliser = fertilisers.length > 0 || customOwned.length > 0;

    const prefixId = activeZone ? `${activeZone.id}_` : '';
    const tagTask = (t) => ({
      ...t,
      id: `${prefixId}${t.id}`,
      zoneId,
      zoneName,
      zoneSpec,
      attentionLevel
    });

    // 1. ONE WEEK (Immediate 7-Day Actions)
    const oneWeek = [];

    // Inject pinpointed photo hotspot tasks first if present
    if (Array.isArray(hotspots) && hotspots.length > 0) {
      hotspots.forEach((h, idx) => {
        if (h.type === 'drought_patch' || (h.label && h.label.toLowerCase().includes('dry'))) {
          oneWeek.push(tagTask({
            id: `w1_hotspot_drought_${idx}`,
            task: `${zoneName}: Targeted Wetting Agent Soak (${h.label.split(':')[0]})`,
            urgency: 'Critical',
            category: 'Watering',
            tip: `${h.recommendation || 'Drench this dry patch with soil surfactant and 15mm water to restore rootzone moisture permeability.'}`
          }));
        } else if (h.type === 'weed_cluster' || (h.label && h.label.toLowerCase().includes('weed'))) {
          oneWeek.push(tagTask({
            id: `w1_hotspot_weed_${idx}`,
            task: `${zoneName}: Spot Spray Weed Cluster (${h.label.split(':')[0]})`,
            urgency: 'High',
            category: 'Weed Control',
            tip: `${h.recommendation || 'Use selective broadleaf herbicide directly on this cluster rather than blanketing the entire section.'}`
          }));
        } else {
          oneWeek.push(tagTask({
            id: `w1_hotspot_custom_${idx}`,
            task: `${zoneName}: ${h.label}`,
            urgency: isRecovery ? 'Critical' : 'High',
            category: 'Soil',
            tip: h.recommendation || 'Targeted zone attention required based on your section scan.'
          }));
        }
      });
    }

    // Recovery mode urgent drench if zone is in recovery
    if (isRecovery && (!hotspots || hotspots.length === 0)) {
      oneWeek.push(tagTask({
        id: 'w1_recovery_soak',
        task: `${zoneName}: Recovery Wetting Agent & Seaweed Root Soak (${area}m²)`,
        urgency: 'Critical',
        category: 'Soil',
        tip: `${zoneName} is marked for Recovery / TLC. Saturate the rootzone with soil wetting agent and liquid seaweed to stimulate stolon repair before lowering cut height.`
      }));
    }

    // Pre-emergent urgent check
    if (history.preEmergentStatus === 'none' || history.preEmergentStatus === 'over_6m') {
      const prodName = customOwned.find(c => c.toLowerCase().includes('barricade') || c.toLowerCase().includes('prodiamine') || c.toLowerCase().includes('spartan')) || 'Prodiamine / Spartan';
      oneWeek.push(tagTask({
        id: 'w1_urgent_pre_emergent',
        task: hasPreEmergent
          ? `Apply Pre-Emergent Barrier (${prodName}) to ${zoneName}`
          : `🛒 Order & Apply Pre-Emergent Barrier (${zoneName})`,
        urgency: 'Critical',
        category: 'Protection',
        tip: hasPreEmergent
          ? `Apply ${prodName} across ${zoneName} (${area}m²) and water in with 12mm to seal the topsoil against germinating weed seeds.`
          : 'Crucial: Get Prodiamine / Barricade (Available at lawntips.com) to lock out weed seeds before germination.'
      }));
    }

    // Nutrition check
    if (!hasFertiliser) {
      oneWeek.push(tagTask({
        id: 'w1_shop_fert',
        task: `🛒 Procure Essential Lawn Nutrition Kit for ${zoneName}`,
        urgency: 'Critical',
        category: 'Fertiliser',
        tip: 'Visit lawntips.com to get a balanced slow-release granular or foliar starter pack (e.g. Lawn Tips Growth / Foliar Duo).'
      }));
    }

    // Mowing plan tailored to this specific zone's HOC, sun exposure, and attention level
    const lastMowDays = Number(history.lastMowDays) || 3;
    if (lastMowDays >= 10) {
      oneWeek.push(tagTask({
        id: 'w1_step_down_mow',
        task: `${zoneName}: Gradual Step-Down Mow toward ${hoc}mm (1/3rd Rule)`,
        urgency: 'High',
        category: 'Mowing',
        tip: `Since the last mow was ${lastMowDays} days ago, cut slightly higher first, wait 3 days, then step down to ${hoc}mm so you don't scalp ${grass}.`
      }));
    } else if (isShaded) {
      const shadeHoc = Math.max(hoc, 30);
      oneWeek.push(tagTask({
        id: 'w1_shade_mow',
        task: `${zoneName}: Shade-Protected Mow at ${shadeHoc}mm (${grass})`,
        urgency: 'High',
        category: 'Mowing',
        tip: `${zoneName} receives ${sunExposure}. Keep leaf canopy at ${shadeHoc}mm so blades have enough surface area for photosynthesis and crowd out moss/weeds.`
      }));
    } else if (isShowpiece || (tier === 'full_pro' && !isLowKey)) {
      oneWeek.push(tagTask({
        id: 'w1_mow_1',
        task: hasReel
          ? `${zoneName}: Precision Cylinder Mow at ${hoc}mm (${grass})`
          : `${zoneName}: Precision Mow at ${hoc}mm with sharp blade`,
        urgency: 'Critical',
        category: 'Mowing',
        tip: `Mow ${zoneName} early morning once dew dries. Empty catcher to maintain uniform ${hoc}mm showpiece density.`
      }));
      oneWeek.push(tagTask({
        id: 'w1_mow_2',
        task: hasReel
          ? `${zoneName}: Double/Cross-Cut Pass at ${hoc}mm (90° Angle)`
          : `${zoneName}: Mid-Week Grooming Mow at ${hoc}mm`,
        urgency: 'High',
        category: 'Mowing',
        tip: `Alternating mowing direction in ${zoneName} prevents grain and forces tight lateral stolon tillering.`
      }));
      if (hasPgr && isShowpiece) {
        oneWeek.push(tagTask({
          id: 'w1_pgr',
          task: `${zoneName}: Primo Maxx (PGR) Application & GDD Check`,
          urgency: 'Medium',
          category: 'Protection',
          tip: `Apply PGR on ${zoneName} (${area}m²) at 200 Growing Degree Days to lock in your ${hoc}mm cut height and double root density.`
        }));
      }
    } else if (tier === 'semi_pro' && !isLowKey) {
      oneWeek.push(tagTask({
        id: 'w1_mow',
        task: `${zoneName}: Mow at ${hoc}mm with Striping Roller (${grass})`,
        urgency: 'High',
        category: 'Mowing',
        tip: `Keep ${zoneName} at a consistent ${hoc}mm. Never remove more than 1/3rd of the leaf blade in a single cut.`
      }));
    } else {
      oneWeek.push(tagTask({
        id: 'w1_mow_low',
        task: `${zoneName}: Maintenance Rotary Mow at ${hoc}mm`,
        urgency: 'Medium',
        category: 'Mowing',
        tip: `Clean cut at ${hoc}mm for ${zoneName}. Ensure mower blades are sharp to avoid frayed tips.`
      }));
    }

    // Shaded zone extra tip when generating for multiple zones without targetZone
    if (!activeZone && zones.length > 1) {
      const shadedZone = zones.find(z => z.sunExposure && z.sunExposure.toLowerCase().includes('shade'));
      if (shadedZone) {
        oneWeek.push(tagTask({
          id: 'w1_multi_shade_mow',
          task: `${shadedZone.name}: Raise Mower Deck to ${shadedZone.hoc}mm`,
          urgency: 'Medium',
          category: 'Mowing',
          tip: `In ${shadedZone.name} (${shadedZone.sunExposure}), keep cut height higher at ${shadedZone.hoc}mm so the grass captures maximum sunlight.`
        }));
      }
    }

    // Irrigation check for week 1
    if ((cvMetrics && cvMetrics.brownRatio > 0.08) || isRecovery) {
      oneWeek.push(tagTask({
        id: 'w1_deep_soak',
        task: `${zoneName}: Deep Dawn Soak (15mm) & Moisture Check`,
        urgency: 'Critical',
        category: 'Watering',
        tip: `Run irrigation on ${zoneName} at sunrise to rehydrate dry spots and drive deep root growth.`
      }));
    } else if (isShaded) {
      oneWeek.push(tagTask({
        id: 'w1_water_shade',
        task: `${zoneName}: Reduced Shade Watering (Dawn Only, Avoid Overwatering)`,
        urgency: 'Low',
        category: 'Watering',
        tip: `${zoneName} has lower evaporation due to ${sunExposure}. Water only at dawn and reduce run-time by 25% to prevent fungal disease.`
      }));
    } else {
      oneWeek.push(tagTask({
        id: 'w1_water',
        task: `${zoneName}: Deep Irrigation Cycle (${profile.wateringFreq || '2 times/week'})`,
        urgency: 'Medium',
        category: 'Watering',
        tip: `Deep dawn soaks on ${zoneName} encourage ${grass} roots to push deep into the subsoil.`
      }));
    }

    // Weeds check for week 1
    if (weedLevel.includes('Moderate') || weedLevel.includes('High')) {
      oneWeek.push(tagTask({
        id: 'w1_weeds',
        task: `${zoneName}: Spot Spray Detected Weeds (${(weeds && weeds.length ? weeds.slice(0, 2).join(', ') : 'Broadleaf / Clover')})`,
        urgency: 'High',
        category: 'Weed Control',
        tip: `Confirm herbicide is safe for ${grass} in ${zoneName} (especially if Buffalo/St Augustine). Spray on a calm morning.`
      }));
    }

    // 2. TWO WEEKS (Short-term 14-Day Horizon)
    const twoWeeks = [];
    const lastFertDays = Number(history.lastFertDays) || 30;
    const customFeed = customOwned.find(c => c.toLowerCase().includes('foliar') || c.toLowerCase().includes('fertiliser') || c.toLowerCase().includes('feed')) || (hasSprayer ? 'Liquid Foliar Iron & Nitrogen' : 'Slow-Release Granular Feed');

    if (lastFertDays < 14 && !isRecovery) {
      twoWeeks.push(tagTask({
        id: 'w2_feed_resting',
        task: `${zoneName}: Soil Hydration & Microbial Soak (Hold Heavy Nitrogen)`,
        urgency: 'Low',
        category: 'Soil',
        tip: `Your last fertiliser on ${zoneName} was ${lastFertDays} days ago and is still releasing. Allow roots to utilize current nutrients.`
      }));
    } else {
      if (isShowpiece || tier === 'full_pro') {
        twoWeeks.push(tagTask({
          id: 'w2_foliar',
          task: `${zoneName}: Liquid Foliar Spoon-Feed (${customFeed} • ${area}m²)`,
          urgency: 'High',
          category: 'Fertiliser',
          tip: `Spoon-feeding ${zoneName} delivers deep emerald chlorophyll pop on ${grass} without soft vertical surge.`
        }));
        twoWeeks.push(tagTask({
          id: 'w2_groom',
          task: `${zoneName}: Light Grooming / Verti-Cut Pass`,
          urgency: 'Medium',
          category: 'Renovation',
          tip: `Lifts flat stolons in ${zoneName} prior to your ${hoc}mm cut for a tight upright canopy.`
        }));
      } else {
        twoWeeks.push(tagTask({
          id: 'w2_feed',
          task: `${zoneName}: Apply ${customFeed} (${area}m²)`,
          urgency: isRecovery ? 'High' : 'Medium',
          category: 'Fertiliser',
          tip: `Feed ${zoneName} evenly to fuel lateral recovery and density. Water in thoroughly within 24 hours.`
        }));
      }
    }

    twoWeeks.push(tagTask({
      id: 'w2_edge',
      task: `${zoneName}: Crisp Perimeter Edging & Trimming`,
      urgency: 'Low',
      category: 'Detailing',
      tip: `Clean vertical edges around ${zoneName} stop runners creeping into garden beds and frame the section.`
    }));

    // 3. ONE MONTH (30-Day Milestone)
    const oneMonth = [];
    const wettingName = customOwned.find(c => c.toLowerCase().includes('wetting') || c.toLowerCase().includes('hydra')) || 'Tournament Soil Wetting Agent';
    oneMonth.push(tagTask({
      id: 'm1_wetting',
      task: hasWettingAgent
        ? `${zoneName}: Apply ${wettingName} (${area}m²)`
        : `🛒 ${zoneName}: Apply Wetting Agent (Hydra-Flo / Tournament)`,
      urgency: isRecovery ? 'Critical' : 'High',
      category: 'Soil',
      tip: `Eliminates hydrophobic dry patches in ${zoneName} so water penetrates evenly across all ${area}m².`
    }));

    oneMonth.push(tagTask({
      id: 'm1_biostimulant',
      task: `${zoneName}: Humic Acid & Kelp Biostimulant Drench`,
      urgency: 'Medium',
      category: 'Soil',
      tip: `Boosts root mass and stress tolerance for ${grass} in ${zoneName} (${sunExposure}).`
    }));

    oneMonth.push(tagTask({
      id: 'm1_blade_check',
      task: hasReel
        ? `Cylinder Mower Backlapping & ${hoc}mm Bedknife Check`
        : `Rotary Blade Sharpening & ${hoc}mm Deck Height Check`,
      urgency: 'Medium',
      category: 'Equipment',
      tip: `Razor-sharp blades prevent bruised yellowing leaf tips on ${zoneName}.`
    }));

    // 4. ONE QUARTER (3 Months / Seasonal Transition)
    const oneQuarter = [];
    oneQuarter.push(tagTask({
      id: 'q1_pre_emergent',
      task: `${zoneName}: Seasonal Pre-Emergent Barrier Booster (${area}m²)`,
      urgency: 'Critical',
      category: 'Protection',
      tip: `Maintains weed seed barrier across ${zoneName} for the next 12 weeks.`
    }));

    if (isShowpiece || tier === 'full_pro') {
      oneQuarter.push(tagTask({
        id: 'q1_sand_dress',
        task: `${zoneName}: Light Washed Sand Topdress & Level Lute (${area}m²)`,
        urgency: 'High',
        category: 'Levelling',
        tip: `Smooths out minor surface ripples in ${zoneName} so your ${hoc}mm cut never scalps high spots.`
      }));
    } else {
      oneQuarter.push(tagTask({
        id: 'q1_seasonal_feed',
        task: `${zoneName}: Seasonal Slow-Release NPK + Potassium Boost`,
        urgency: 'High',
        category: 'Fertiliser',
        tip: `Strengthens ${grass} cell walls in ${zoneName} for heat, shade, and wear tolerance.`
      }));
    }

    // 5. HALF YEAR (6 Months / Mid-Year Renovation & Prep)
    const halfYear = [];
    halfYear.push(tagTask({
      id: 'h1_core_aeration',
      task: hasAerator
        ? `${zoneName}: Core Aeration Pass (${area}m²)`
        : `${zoneName}: Aerate / Spike Compacted Traffic Areas (${area}m²)`,
      urgency: isRecovery ? 'Critical' : 'High',
      category: 'Renovation',
      tip: `Relieves soil compaction in ${zoneName} and channels oxygen and nutrients straight to the roots.`
    }));

    if (!isShaded) {
      halfYear.push(tagTask({
        id: 'h1_dethatch',
        task: hasDethatcher
          ? `${zoneName}: Scarify / Dethatch Organic Layer`
          : `${zoneName}: Thatch Audit & Light Grooming Rake`,
        urgency: 'Medium',
        category: 'Renovation',
        tip: `Keeps thatch under 10mm in ${zoneName} so water and fertiliser reach the soil profile.`
      }));
    }

    // 6. ONE YEAR (12 Months / Annual Master Reset & Budget)
    const oneYear = [];
    oneYear.push(tagTask({
      id: 'y1_annual_renovation',
      task: `${zoneName}: Annual Spring Renovation (${grass} Reset to ${hoc}mm)`,
      urgency: 'Critical',
      category: 'Renovation',
      tip: `Annual reset for ${zoneName}: low scalp, aerate, topdress, and fertilise for fresh emerald stolon growth.`
    }));
    oneYear.push(tagTask({
      id: 'y1_lab_soil_test',
      task: `${zoneName}: Soil pH & Nutrient Check`,
      urgency: 'High',
      category: 'Soil',
      tip: `Target pH 6.2 - 6.8 in ${zoneName} to unlock maximum nutrient uptake.`
    }));

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
   * Builds an "Aligned Together" property-wide plan across all yard zones,
   * combining shared property treatments into unified tasks while keeping
   * distinct zone-specific mowing heights, shade care, and hotspot treatments badged!
   */
  generateAlignedPropertyPlan({ profile = {}, zones = [], zoneResultsMap = {} }) {
    if (!zones || zones.length === 0) {
      return this.generateDynamicPlan({ profile, zones: [] });
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
        targetZone: z
      });
    }

    const totalArea = zones.reduce((sum, z) => sum + (Number(z.area) || 50), 0);
    const zoneNamesSummary = zones.map(z => `${z.name} (${z.hoc}mm)`).join(', ');
    const areaBreakdown = zones.map(z => `${z.name}: ${z.area || 50}m²`).join(' • ');

    const equipment = profile.equipment || [];
    const herbicides = profile.herbicides || [];
    const customOwned = profile.customOwnedProducts || [];
    const hasReel = equipment.some(e => e.toLowerCase().includes('reel') || e.toLowerCase().includes('cylinder'));
    const hasSprayer = equipment.some(e => e.toLowerCase().includes('sprayer'));
    const hasPreEmergent = herbicides.some(h => h.toLowerCase().includes('prodiamine') || h.toLowerCase().includes('barricade') || h.toLowerCase().includes('pre-emergent') || h.toLowerCase().includes('spartan')) || customOwned.some(c => c.toLowerCase().includes('pre-emergent') || c.toLowerCase().includes('prodiamine') || c.toLowerCase().includes('barricade'));
    const hasWettingAgent = profile.specialTreatments?.some(t => t.toLowerCase().includes('wetting') || t.toLowerCase().includes('surfactant')) || customOwned.some(c => c.toLowerCase().includes('wetting') || c.toLowerCase().includes('hydra'));

    const alignedTag = (t) => ({
      ...t,
      zoneId: 'all',
      zoneName: `All ${zones.length} Yard Zones (Aligned)`,
      zoneSpec: `${totalArea}m² Total • ${zoneNamesSummary}`,
      attentionLevel: 'aligned'
    });

    const oneWeek = [];

    // 1. Include any specific photo hotspots or recovery alerts per zone first
    zones.forEach(z => {
      const zRes = zoneResultsMap[z.id];
      const zHotspots = zRes?.hotspots || [];
      zHotspots.forEach((h, idx) => {
        oneWeek.push({
          id: `${z.id}_w1_hotspot_${idx}`,
          zoneId: z.id,
          zoneName: z.name,
          zoneSpec: `${z.grassType} • ${z.hoc}mm • ${z.sunExposure.split(' (')[0]}`,
          attentionLevel: z.attentionLevel,
          task: `${z.name}: ${h.label}`,
          urgency: 'Critical',
          category: h.type === 'weed_cluster' ? 'Weed Control' : 'Watering',
          tip: h.recommendation || `Pinpointed in ${z.name} scan.`
        });
      });
    });

    // 2. Mowing tasks: Group zones by identical HOC or list per-zone HOC requirements so user can mow with clear deck settings
    zones.forEach(z => {
      const isShade = (z.sunExposure || '').toLowerCase().includes('shade');
      const isShow = z.attentionLevel === 'showpiece';
      const isRec = z.attentionLevel === 'recovery';
      oneWeek.push({
        id: `${z.id}_aligned_w1_mow`,
        zoneId: z.id,
        zoneName: z.name,
        zoneSpec: `${z.grassType} • ${z.hoc}mm • ${(z.sunExposure || 'Full Sun').split(' (')[0]}`,
        attentionLevel: z.attentionLevel,
        task: isShow && hasReel
          ? `${z.name}: Precision Cylinder Mow at ${z.hoc}mm`
          : isShade
          ? `${z.name}: Shade Canopy Cut at ${z.hoc}mm`
          : isRec
          ? `${z.name}: Gentle Recovery Trim at ${z.hoc}mm`
          : `${z.name}: Mow at ${z.hoc}mm (${z.grassType})`,
        urgency: isShow ? 'Critical' : 'High',
        category: 'Mowing',
        tip: `Set mower deck to ${z.hoc}mm for ${z.name} (${z.area || 50}m², ${z.sunExposure}). Never remove more than 1/3rd of leaf height.`
      });
    });

    // 3. Aligned Irrigation across zones
    const shadedZones = zones.filter(z => (z.sunExposure || '').toLowerCase().includes('shade'));
    oneWeek.push(alignedTag({
      id: 'aligned_w1_water',
      task: `Aligned Dawn Irrigation Cycle (${profile.wateringFreq || '2 times/week'})`,
      urgency: 'Medium',
      category: 'Watering',
      tip: `Run morning soak across all sections (${areaBreakdown}). ${shadedZones.length > 0 ? `Note: Reduce watering runtime by 25% in ${shadedZones.map(s => s.name).join(', ')} due to shade.` : 'Water between 4:30 AM - 7:00 AM.'}`
    }));

    // 4. Aligned Pre-emergent if needed
    const history = profile.history || {};
    if (history.preEmergentStatus === 'none' || history.preEmergentStatus === 'over_6m') {
      const prodName = customOwned.find(c => c.toLowerCase().includes('barricade') || c.toLowerCase().includes('prodiamine') || c.toLowerCase().includes('spartan')) || 'Prodiamine / Spartan';
      oneWeek.push(alignedTag({
        id: 'aligned_w1_pre_emergent',
        task: hasPreEmergent
          ? `Aligned Pre-Emergent Barrier (${prodName}) Across All Zones`
          : '🛒 Order & Apply Pre-Emergent Barrier Across All Zones',
        urgency: 'Critical',
        category: 'Protection',
        tip: `Mix and spray all ${zones.length} sections (${totalArea}m² total: ${areaBreakdown}) in one session and water in with 12mm.`
      }));
    }

    // TWO WEEKS (Aligned Feeding & Detailing)
    const customFeed = customOwned.find(c => c.toLowerCase().includes('foliar') || c.toLowerCase().includes('fertiliser') || c.toLowerCase().includes('feed')) || (hasSprayer ? 'Liquid Foliar Iron & Nitrogen' : 'Slow-Release Granular Feed');
    const twoWeeks = [
      alignedTag({
        id: 'aligned_w2_feed',
        task: `Aligned Property Feed: ${customFeed} (${totalArea}m² Total)`,
        urgency: 'High',
        category: 'Fertiliser',
        tip: `Synchronize feeding across all ${zones.length} sections on the same day (${areaBreakdown}) for uniform colour and growth.`
      }),
      alignedTag({
        id: 'aligned_w2_edge',
        task: `Full Property Perimeter Edging & Whipper Snipping`,
        urgency: 'Medium',
        category: 'Detailing',
        tip: `Edge all ${zones.length} sections (${zones.map(z => z.name).join(', ')}) in a single pass for crisp curb appeal.`
      })
    ];

    // ONE MONTH (Aligned Soil Conditioning & Blade Care)
    const wettingName = customOwned.find(c => c.toLowerCase().includes('wetting') || c.toLowerCase().includes('hydra')) || 'Tournament Soil Wetting Agent';
    const oneMonth = [
      alignedTag({
        id: 'aligned_m1_wetting',
        task: hasWettingAgent
          ? `Aligned Wetting Agent Application (${wettingName} • ${totalArea}m²)`
          : `🛒 Aligned Wetting Agent Treatment Across All Sections (${totalArea}m²)`,
        urgency: 'High',
        category: 'Soil',
        tip: `Blanket all ${zones.length} sections (${areaBreakdown}) to prevent dry patches and improve irrigation efficiency by 30%.`
      }),
      alignedTag({
        id: 'aligned_m1_kelp',
        task: `Aligned Seaweed & Humic Biostimulant Tank-Mix (${totalArea}m²)`,
        urgency: 'Medium',
        category: 'Soil',
        tip: `Spray all yard sections together to stimulate deep root mass and microbial health.`
      }),
      alignedTag({
        id: 'aligned_m1_blades',
        task: hasReel ? 'Mower Reel Backlapping & Bedknife Inspection' : 'Rotary Mower Blade Sharpening & Balance',
        urgency: 'Medium',
        category: 'Equipment',
        tip: `Keeps cuts surgical across every yard section (${zones.map(z => `${z.name} @ ${z.hoc}mm`).join(', ')}).`
      })
    ];

    // ONE QUARTER
    const oneQuarter = [
      alignedTag({
        id: 'aligned_q1_pre',
        task: `Quarterly Pre-Emergent Booster Across All ${zones.length} Zones (${totalArea}m²)`,
        urgency: 'Critical',
        category: 'Protection',
        tip: `Re-seal the topsoil weed barrier across ${areaBreakdown}.`
      }),
      alignedTag({
        id: 'aligned_q1_feed',
        task: `Seasonal Granular NPK + Potassium Application (${totalArea}m²)`,
        urgency: 'High',
        category: 'Fertiliser',
        tip: `Broadcast across all sections to fortify turf against seasonal heat or cold stress.`
      })
    ];

    // HALF YEAR
    const halfYear = [
      alignedTag({
        id: 'aligned_h1_aerate',
        task: `Property-Wide Core Aeration & Decompaction (${totalArea}m²)`,
        urgency: 'High',
        category: 'Renovation',
        tip: `Aerate all ${zones.length} sections (${areaBreakdown}) on the same weekend to maximize equipment use.`
      }),
      alignedTag({
        id: 'aligned_h1_sprinkler',
        task: `Multi-Zone Catch-Cup Sprinkler Uniformity Audit`,
        urgency: 'Medium',
        category: 'Watering',
        tip: `Check precipitation rates across ${zones.map(z => z.name).join(', ')} and adjust shaded zones down by 25%.`
      })
    ];

    // ONE YEAR
    const oneYear = [
      alignedTag({
        id: 'aligned_y1_reno',
        task: `Annual Spring Renovation & Topdressing (${totalArea}m² Total)`,
        urgency: 'Critical',
        category: 'Renovation',
        tip: `Full property spring reset across ${zones.map(z => `${z.name} (${z.grassType})`).join(', ')}.`
      }),
      alignedTag({
        id: 'aligned_y1_soil',
        task: `Annual Soil pH & Nutrient Audit Per Yard Section`,
        urgency: 'High',
        category: 'Soil',
        tip: `Compare soil pH between front, verge, and back yard sections to dial in your annual nutrition budget.`
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

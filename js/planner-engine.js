/**
 * Agronomic Planner Engine for GreenMaster AI
 * Dynamically computes actionable schedules across 6 time horizons:
 * 1. Next Week (7 Days)
 * 2. Two Weeks (14 Days)
 * 3. One Month (30 Days)
 * 4. One Quarter (3 Months)
 * 5. Half Year (6 Months)
 * 6. One Year (12 Months)
 */
const PlannerEngine = {
  generateDynamicPlan({ cvMetrics, weedLevel, weeds, diseaseOrStress, profile }) {
    const tier = profile.tier || 'semi_pro';
    const grass = profile.grassType || 'Bermuda / Couch';
    const hoc = Number(profile.hoc) || 15;
    const hasReel = profile.equipment.some(e => e.toLowerCase().includes('reel') || e.toLowerCase().includes('cylinder'));
    const hasSprayer = profile.equipment.some(e => e.toLowerCase().includes('sprayer'));
    const hasDethatcher = profile.equipment.some(e => e.toLowerCase().includes('dethatch') || e.toLowerCase().includes('scarifi'));
    const hasAerator = profile.equipment.some(e => e.toLowerCase().includes('aera'));
    const hasPgr = profile.specialTreatments?.some(t => t.toLowerCase().includes('pgr') || t.toLowerCase().includes('primo'));

    // 1. ONE WEEK (Immediate 7-Day Actions)
    const oneWeek = [];
    if (tier === 'full_pro') {
      oneWeek.push({
        id: 'w1_mow_1',
        task: hasReel ? `Cylinder mow at ${hoc}mm (Pattern 1)` : `Mow at ${hoc}mm with sharp blade`,
        urgency: 'Critical',
        category: 'Mowing',
        tip: 'Mow early in the morning once dew dries. Empty catcher to maintain uniform surface roll.'
      });
      oneWeek.push({
        id: 'w1_mow_2',
        task: hasReel ? `Cross-cut cylinder mow at 90° angle` : `Mid-week clean-up mow`,
        urgency: 'High',
        category: 'Mowing',
        tip: 'Promotes tight lateral rhizome/stolon tillering for carpet-like density.'
      });
      if (hasPgr) {
        oneWeek.push({
          id: 'w1_pgr',
          task: 'Primo Maxx (PGR) check & GDD calculation',
          urgency: 'Medium',
          category: 'Chemical',
          tip: 'Apply at 200 Growing Degree Days to suppress vertical surge and double root density.'
        });
      }
    } else if (tier === 'semi_pro') {
      oneWeek.push({
        id: 'w1_mow',
        task: `Mow at ${hoc}mm with rear roller striping`,
        urgency: 'High',
        category: 'Mowing',
        tip: 'Keep cut height consistent. Never cut more than 1/3 of the blade length in one pass.'
      });
    } else {
      oneWeek.push({
        id: 'w1_mow_low',
        task: `Rotary mow at ${hoc}mm`,
        urgency: 'Medium',
        category: 'Mowing',
        tip: 'Check that blade is sharp to prevent frayed brown tips.'
      });
    }

    // Irrigation check for week 1
    if (cvMetrics.brownRatio > 0.08) {
      oneWeek.push({
        id: 'w1_deep_soak',
        task: 'Deep soak watering (15mm) & wetting agent flush',
        urgency: 'Critical',
        category: 'Watering',
        tip: 'Canopy dehydration spotted. Run sprinklers for 35 mins at sunrise.'
      });
    } else {
      oneWeek.push({
        id: 'w1_water',
        task: `Irrigation cycle (${profile.wateringFreq})`,
        urgency: 'Medium',
        category: 'Watering',
        tip: 'Infrequent deep soaks encourage roots to dig deep into the subsoil profile.'
      });
    }

    // Weeds check for week 1
    if (weedLevel.includes('Moderate') || weedLevel.includes('High')) {
      oneWeek.push({
        id: 'w1_weeds',
        task: `Spot spray detected weeds (${weeds.slice(0, 2).join(', ')})`,
        urgency: 'High',
        category: 'Weed Control',
        tip: 'Use selective broadleaf herbicide. Spray in calm wind conditions during mild temperatures.'
      });
    }

    // 2. TWO WEEKS (Short-term 14-Day Horizon)
    const twoWeeks = [];
    if (tier === 'full_pro') {
      twoWeeks.push({
        id: 'w2_foliar',
        task: 'Liquid foliar spoon-feed (N-P-K + Chelated Iron + Kelp)',
        urgency: 'High',
        category: 'Fertiliser',
        tip: 'Spoon feeding prevents growth surges while unlocking an unmistakable tournament dark emerald pop.'
      });
      twoWeeks.push({
        id: 'w2_groom',
        task: 'Verti-cut / light grooming reel pass',
        urgency: 'Medium',
        category: 'Renovation',
        tip: 'Slices horizontal grain and lifts recumbent runners before cylinder cut.'
      });
    } else if (tier === 'semi_pro') {
      twoWeeks.push({
        id: 'w2_feed',
        task: hasSprayer ? 'Foliar liquid feed with Iron & Nitrogen' : 'Light granular fertiliser application',
        urgency: 'Medium',
        category: 'Fertiliser',
        tip: 'Apply evenly. Water in thoroughly within 24 hours to prevent leaf scorch.'
      });
      twoWeeks.push({
        id: 'w2_edge',
        task: 'Edge trimming & trench crisping',
        urgency: 'Low',
        category: 'Detailing',
        tip: 'Crisp 90-degree edge around driveways and garden beds amplifies visual contrast.'
      });
    } else {
      twoWeeks.push({
        id: 'w2_feed_low',
        task: 'Apply slow-release lawn food (1 application per 8 weeks)',
        urgency: 'Low',
        category: 'Fertiliser',
        tip: 'Broadcast granular feed evenly across the yard and water in.'
      });
    }

    // 3. ONE MONTH (30-Day Milestone)
    const oneMonth = [];
    oneMonth.push({
      id: 'm1_wetting',
      task: 'Tournament-grade soil surfactant (Wetting Agent)',
      urgency: 'High',
      category: 'Soil',
      tip: 'Breaks water surface tension, prevents hydrophobic soil dry patches, and cuts water waste by 30%.'
    });
    if (tier === 'full_pro' || tier === 'semi_pro') {
      oneMonth.push({
        id: 'm1_biostimulant',
        task: 'Humic acid & Seaweed biostimulant drench',
        urgency: 'Medium',
        category: 'Soil',
        tip: 'Feeds soil microbes, builds cation exchange capacity (CEC), and drives massive root mass.'
      });
      oneMonth.push({
        id: 'm1_blade_check',
        task: hasReel ? 'Cylinder mower backlapping with 120-grit compound' : 'Rotary blade sharpening & balancing',
        urgency: 'Medium',
        category: 'Equipment',
        tip: 'A clean surgical cut prevents disease pathogens and leaves crisp, glossy leaf tips.'
      });
    } else {
      oneMonth.push({
        id: 'm1_weed_check',
        task: 'General weed audit & hand-pulling escapes',
        urgency: 'Low',
        category: 'Weed Control',
        tip: 'Walk the perimeter and pull any breakthrough weeds before seed heads mature.'
      });
    }

    // 4. ONE QUARTER (3 Months / Seasonal Transition)
    const oneQuarter = [];
    oneQuarter.push({
      id: 'q1_pre_emergent',
      task: 'Pre-Emergent herbicide barrier (Prodiamine / Barricade)',
      urgency: 'Critical',
      category: 'Protection',
      tip: 'The turf nerd secret weapon: stops weed seeds from germinating before they ever break soil.'
    });
    if (tier === 'full_pro') {
      oneQuarter.push({
        id: 'q1_sand_dress',
        task: 'Micro sand topdress (1-2mm) & levelling lute roll',
        urgency: 'High',
        category: 'Levelling',
        tip: 'Use kiln-dried washed USGA golf sand to maintain absolute bowling green flatness.'
      });
      oneQuarter.push({
        id: 'q1_aeration',
        task: 'Solid tine aeration / spiking',
        urgency: 'Medium',
        category: 'Soil',
        tip: 'Relieves surface tension and channels oxygen directly into the root zone.'
      });
    } else {
      oneQuarter.push({
        id: 'q1_seasonal_feed',
        task: 'Seasonal Granular Boost (High Potassium for stress tolerance)',
        urgency: 'High',
        category: 'Fertiliser',
        tip: 'Potassium strengthens cell walls against heat, drought, or winter frost.'
      });
    }

    // 5. HALF YEAR (6 Months / Mid-Year Renovation & Prep)
    const halfYear = [];
    if (tier === 'full_pro' || tier === 'semi_pro') {
      halfYear.push({
        id: 'h1_core_aeration',
        task: hasAerator ? 'Hollow core aeration (pulling 2-inch cores)' : 'Hire or perform deep core aeration',
        urgency: 'High',
        category: 'Renovation',
        tip: 'Extracts soil compaction plugs and creates room for fresh sand and root elongation.'
      });
      halfYear.push({
        id: 'h1_dethatch',
        task: hasDethatcher ? 'Light scarify to clean organic thatch layer' : 'Rake thatch buildup',
        urgency: 'Medium',
        category: 'Renovation',
        tip: 'Keeps organic thatch layer under 10mm so water and air reach soil effortlessly.'
      });
    } else {
      halfYear.push({
        id: 'h1_soil_check',
        task: 'Soil pH and compaction probe test',
        urgency: 'Medium',
        category: 'Soil',
        tip: 'Target pH 6.2 - 6.8 for optimal nutrient bioavailability.'
      });
    }
    halfYear.push({
      id: 'h1_sprinkler_audit',
      task: 'Catch-cup sprinkler audit & uniformity test',
      urgency: 'Medium',
      category: 'Watering',
      tip: 'Place tuna cans or catch-cups to measure exact precipitation rate (mm/inch per hour).'
    });

    // 6. ONE YEAR (12 Months / Annual Master Reset & Budget)
    const oneYear = [];
    oneYear.push({
      id: 'y1_annual_renovation',
      task: 'Spring Reset: Scalp to ground, heavy scarify & core aerate',
      urgency: 'Critical',
      category: 'Renovation',
      tip: 'The annual master reset. Strips old woody stems and forces fresh dense emerald shoots.'
    });
    oneYear.push({
      id: 'y1_lab_soil_test',
      task: 'Comprehensive Lab Soil Test (NPK, pH, Micronutrients, CEC)',
      urgency: 'High',
      category: 'Soil',
      tip: 'Eliminates guesswork. Calibrates your annual Nitrogen budget (lbs/1000 sq ft or g/m²).'
    });
    oneYear.push({
      id: 'y1_full_equipment_service',
      task: 'Mower overhaul, cylinder spin grind, bedknife face & engine service',
      urgency: 'High',
      category: 'Equipment',
      tip: 'Precision cut tolerances require true cylinder geometry and bedknife relief angles.'
    });

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
